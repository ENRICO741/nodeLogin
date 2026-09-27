const { transacao } = require('../../db/pool');
const { naoEncontrado, conflito } = require('../../lib/erros');
const { creditarPontos, pontuacaoAtual, concederBadges } = require('../pontuacao');

async function obterRodada(c, rodadaId, usuarioId) {
  const { rows } = await c.query(
    `SELECT r.id, r.dificuldade, r.iniciada_em, r.finalizada_em, r.pontos_ganhos,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', q.id, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'pontos', q.pontos,
           'alternativa_a', q.alternativa_a, 'alternativa_b', q.alternativa_b,
           'alternativa_c', q.alternativa_c, 'alternativa_d', q.alternativa_d,
           'respondida', tr.id IS NOT NULL, 'correta', tr.correta
         ) ORDER BY rq.ordem)
         FROM trivia_rodada_questoes rq
         JOIN questoes_trivia q ON q.id = rq.questao_id
         LEFT JOIN trivia_respostas tr ON tr.rodada_id = rq.rodada_id AND tr.questao_id = rq.questao_id
         WHERE rq.rodada_id = r.id
       ), '[]') AS questoes
     FROM trivia_rodadas r WHERE r.id = $1 AND r.usuario_id = $2`,
    [rodadaId, usuarioId],
  );
  if (!rows[0]) throw naoEncontrado('Rodada não encontrada');
  return rows[0];
}

async function criarRodada(usuarioId, { dificuldade, limite }) {
  return transacao(async (c) => {
    const {
      rows: [rodada],
    } = await c.query('INSERT INTO trivia_rodadas (usuario_id, dificuldade) VALUES ($1, $2) RETURNING id', [
      usuarioId,
      dificuldade,
    ]);
    const { rowCount } = await c.query(
      `INSERT INTO trivia_rodada_questoes (rodada_id, questao_id, ordem)
       SELECT $1, id, row_number() OVER () FROM (
         SELECT id FROM questoes_trivia WHERE dificuldade = $2 AND ativo ORDER BY random() LIMIT $3
       ) sorteadas`,
      [rodada.id, dificuldade, limite],
    );
    if (rowCount === 0) throw conflito('SEM_QUESTOES', 'Ainda não há questões para esta dificuldade');
    return obterRodada(c, rodada.id, usuarioId);
  });
}

async function travarRodada(c, rodadaId, usuarioId) {
  const { rows } = await c.query(
    'SELECT id, finalizada_em FROM trivia_rodadas WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
    [rodadaId, usuarioId],
  );
  if (!rows[0]) throw naoEncontrado('Rodada não encontrada');
  if (rows[0].finalizada_em) throw conflito('RODADA_FINALIZADA', 'Esta rodada já foi finalizada');
}

async function responder(rodadaId, usuarioId, { questao_id, alternativa }) {
  return transacao(async (c) => {
    await travarRodada(c, rodadaId, usuarioId);

    const { rows: questoes } = await c.query(
      `SELECT q.resposta_correta, q.explicacao, q.pontos
       FROM trivia_rodada_questoes rq JOIN questoes_trivia q ON q.id = rq.questao_id
       WHERE rq.rodada_id = $1 AND rq.questao_id = $2`,
      [rodadaId, questao_id],
    );
    const questao = questoes[0];
    if (!questao) throw naoEncontrado('Questão não pertence a esta rodada');

    const correta = questao.resposta_correta === alternativa;
    // Anti-farm: cada questão pontua só no primeiro acerto do usuário, em qualquer rodada.
    const { rows: respostas } = await c.query(
      `INSERT INTO trivia_respostas (rodada_id, questao_id, usuario_id, correta, pontuou)
       VALUES ($1, $2, $3, $4, $4 AND NOT EXISTS (
         SELECT 1 FROM trivia_respostas WHERE usuario_id = $3 AND questao_id = $2 AND pontuou))
       ON CONFLICT (rodada_id, questao_id) DO NOTHING
       RETURNING pontuou`,
      [rodadaId, questao_id, usuarioId, correta],
    );
    if (!respostas[0]) throw conflito('JA_RESPONDIDA', 'Questão já respondida nesta rodada');

    const pontuou = respostas[0].pontuou;
    if (pontuou) {
      await c.query('UPDATE trivia_rodadas SET pontos_ganhos = pontos_ganhos + $2 WHERE id = $1', [
        rodadaId,
        questao.pontos,
      ]);
    }
    return {
      correta,
      resposta_correta: questao.resposta_correta,
      explicacao: questao.explicacao,
      pontos_ganhos: pontuou ? questao.pontos : 0,
      pontuacao_total: pontuou
        ? await creditarPontos(c, usuarioId, questao.pontos, 'trivia_questao', questao_id)
        : await pontuacaoAtual(c, usuarioId),
    };
  });
}

async function finalizar(rodadaId, usuarioId) {
  return transacao(async (c) => {
    await travarRodada(c, rodadaId, usuarioId);
    const {
      rows: [resumo],
    } = await c.query(
      `UPDATE trivia_rodadas r SET finalizada_em = now() WHERE r.id = $1
       RETURNING r.pontos_ganhos,
         (SELECT count(*)::int FROM trivia_rodada_questoes WHERE rodada_id = $1) AS total_questoes,
         (SELECT count(*) FILTER (WHERE correta)::int FROM trivia_respostas WHERE rodada_id = $1) AS acertos`,
      [rodadaId],
    );
    return {
      ...resumo,
      pontuacao_total: await pontuacaoAtual(c, usuarioId),
      novos_badges: await concederBadges(c, usuarioId),
    };
  });
}

module.exports = { obterRodada, criarRodada, responder, finalizar };
