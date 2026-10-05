const { transacao } = require('../../db/pool');
const { HttpError, naoEncontrado, conflito } = require('../../lib/erros');
const { ehAdmin, travarUsuario, creditarPontos, pontuacaoAtual, concederBadges } = require('../pontuacao');

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

// A trivia só abre depois da trilha inteira de aulas (admin já entra liberado).
async function triviaLiberada(c, usuarioId) {
  const { rows } = await c.query(
    `SELECT ${ehAdmin('$1')} OR NOT EXISTS (
       SELECT 1 FROM aulas a WHERE a.ativo AND NOT EXISTS (
         SELECT 1 FROM aula_visitas v WHERE v.aula_id = a.id AND v.usuario_id = $1 AND v.concluida)) AS liberada`,
    [usuarioId],
  );
  return rows[0].liberada;
}

async function criarRodada(usuarioId, { dificuldade, limite }) {
  return transacao(async (c) => {
    if (!(await triviaLiberada(c, usuarioId))) {
      throw new HttpError(403, 'TRIVIA_BLOQUEADA', 'Conclua todas as aulas para liberar a trivia');
    }
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

// Não recusa a rodada finalizada: o reenvio de uma resposta ou da finalização ainda é atendido.
async function travarRodada(c, rodadaId, usuarioId) {
  await travarUsuario(c, usuarioId);
  const { rows } = await c.query(
    'SELECT id, finalizada_em FROM trivia_rodadas WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
    [rodadaId, usuarioId],
  );
  if (!rows[0]) throw naoEncontrado('Rodada não encontrada');
  return rows[0];
}

async function responder(rodadaId, usuarioId, { questao_id, alternativa }) {
  return transacao(async (c) => {
    const rodada = await travarRodada(c, rodadaId, usuarioId);

    const { rows: questoes } = await c.query(
      `SELECT q.resposta_correta, q.explicacao, q.pontos
       FROM trivia_rodada_questoes rq JOIN questoes_trivia q ON q.id = rq.questao_id
       WHERE rq.rodada_id = $1 AND rq.questao_id = $2`,
      [rodadaId, questao_id],
    );
    const questao = questoes[0];
    if (!questao) throw naoEncontrado('Questão não pertence a esta rodada');
    const resultado = (correta, pontuou, pontuacao_total) => ({
      correta,
      resposta_correta: questao.resposta_correta,
      explicacao: questao.explicacao,
      pontos_ganhos: pontuou ? questao.pontos : 0,
      pontuacao_total,
    });

    // Reenvio (a resposta foi gravada mas o retorno se perdeu): a mesma alternativa devolve o resultado
    // gravado, sem pontuar de novo. Outra alternativa não troca a resposta.
    const {
      rows: [anterior],
    } = await c.query(
      'SELECT alternativa, correta, pontuou FROM trivia_respostas WHERE rodada_id = $1 AND questao_id = $2',
      [rodadaId, questao_id],
    );
    if (anterior) {
      if (anterior.alternativa !== alternativa) {
        throw conflito('JA_RESPONDIDA', 'Questão já respondida nesta rodada');
      }
      return resultado(anterior.correta, anterior.pontuou, await pontuacaoAtual(c, usuarioId));
    }
    if (rodada.finalizada_em) throw conflito('RODADA_FINALIZADA', 'Esta rodada já foi finalizada');

    const correta = questao.resposta_correta === alternativa;
    // Anti-farm: cada questão pontua só no primeiro acerto do usuário, em qualquer rodada.
    const {
      rows: [{ pontuou }],
    } = await c.query(
      `INSERT INTO trivia_respostas (rodada_id, questao_id, usuario_id, alternativa, correta, pontuou)
       VALUES ($1, $2, $3, $4, $5, $5 AND NOT EXISTS (
         SELECT 1 FROM trivia_respostas WHERE usuario_id = $3 AND questao_id = $2 AND pontuou) AND NOT ${ehAdmin('$3')})
       RETURNING pontuou`,
      [rodadaId, questao_id, usuarioId, alternativa, correta],
    );
    if (pontuou) {
      await c.query('UPDATE trivia_rodadas SET pontos_ganhos = pontos_ganhos + $2 WHERE id = $1', [
        rodadaId,
        questao.pontos,
      ]);
    }
    return resultado(
      correta,
      pontuou,
      pontuou
        ? await creditarPontos(c, usuarioId, questao.pontos, 'trivia_questao', questao_id)
        : await pontuacaoAtual(c, usuarioId),
    );
  });
}

async function finalizar(rodadaId, usuarioId) {
  return transacao(async (c) => {
    const rodada = await travarRodada(c, rodadaId, usuarioId);
    // Reenvio (o retorno da primeira finalização se perdeu): devolve o mesmo resumo, sem mudar a data de fim.
    if (!rodada.finalizada_em) {
      await c.query('UPDATE trivia_rodadas SET finalizada_em = now() WHERE id = $1', [rodadaId]);
    }
    const {
      rows: [resumo],
    } = await c.query(
      `SELECT r.pontos_ganhos,
         (SELECT count(*)::int FROM trivia_rodada_questoes WHERE rodada_id = $1) AS total_questoes,
         (SELECT count(*) FILTER (WHERE correta)::int FROM trivia_respostas WHERE rodada_id = $1) AS acertos
       FROM trivia_rodadas r WHERE r.id = $1`,
      [rodadaId],
    );
    return {
      ...resumo,
      pontuacao_total: await pontuacaoAtual(c, usuarioId),
      novos_badges: await concederBadges(c, usuarioId),
    };
  });
}

module.exports = { obterRodada, criarRodada, responder, finalizar, triviaLiberada };
