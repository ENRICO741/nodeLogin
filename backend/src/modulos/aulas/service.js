const { query, transacao } = require('../../db/pool');
const { HttpError, naoEncontrado, conflito } = require('../../lib/erros');
const { ehAdmin, creditarPontos, pontuacaoAtual, concederBadges } = require('../pontuacao');
const { triviaLiberada } = require('../trivia/service');

// Trilha em sequência: a aula só abre depois de concluída a anterior (aula ativa de ordem imediatamente menor).
// Admin não fica preso à trilha.
async function exigirLiberada(aulaId, usuarioId) {
  const { rows } = await query(
    `SELECT ant.ordem AS ordem_anterior, ant.concluida OR ${ehAdmin('$2')} AS anterior_concluida
     FROM aulas a
     LEFT JOIN LATERAL (
       SELECT p.ordem, EXISTS (
         SELECT 1 FROM aula_visitas v WHERE v.aula_id = p.id AND v.usuario_id = $2 AND v.concluida) AS concluida
       FROM aulas p WHERE p.ativo AND p.ordem < a.ordem ORDER BY p.ordem DESC LIMIT 1
     ) ant ON true
     WHERE a.id = $1 AND a.ativo`,
    [aulaId, usuarioId],
  );
  if (!rows[0]) throw naoEncontrado('Aula não encontrada');
  const { ordem_anterior, anterior_concluida } = rows[0];
  if (ordem_anterior !== null && !anterior_concluida) {
    throw new HttpError(403, 'AULA_BLOQUEADA', `Conclua a aula ${ordem_anterior} para continuar`);
  }
}

async function listar(usuarioId) {
  const { rows } = await query(
    `SELECT *, NOT (COALESCE(lag(concluida) OVER (ORDER BY ordem), true) OR ${ehAdmin('$1')}) AS bloqueada
     FROM (
       SELECT a.id, a.titulo, a.ordem, a.pontos_conclusao,
         (SELECT count(*)::int FROM questoes_aula q WHERE q.aula_id = a.id AND q.ativo) AS total_questoes,
         EXISTS (SELECT 1 FROM aula_visitas v WHERE v.aula_id = a.id AND v.usuario_id = $1 AND v.concluida) AS concluida
       FROM aulas a WHERE a.ativo
     ) lista ORDER BY ordem`,
    [usuarioId],
  );
  return rows;
}

// Nunca devolve `resposta_correta` nem `explicacao`: elas só aparecem depois da resposta.
async function obter(aulaId, usuarioId) {
  await exigirLiberada(aulaId, usuarioId);
  const { rows } = await query(
    `SELECT a.id, a.titulo, a.ordem, a.conteudo_html, a.pontos_conclusao,
       EXISTS (SELECT 1 FROM aula_visitas v WHERE v.aula_id = a.id AND v.usuario_id = $2 AND v.concluida) AS concluida,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', q.id, 'enunciado', q.enunciado, 'imagem_url', q.imagem_url, 'pontos', q.pontos,
           'alternativa_a', q.alternativa_a, 'alternativa_b', q.alternativa_b,
           'alternativa_c', q.alternativa_c, 'alternativa_d', q.alternativa_d
         ) ORDER BY q.ordem NULLS LAST, q.criado_em)
         FROM questoes_aula q WHERE q.aula_id = a.id AND q.ativo
       ), '[]') AS questoes
     FROM aulas a WHERE a.id = $1 AND a.ativo`,
    [aulaId, usuarioId],
  );
  if (!rows[0]) throw naoEncontrado('Aula não encontrada');
  return rows[0];
}

async function iniciarVisita(aulaId, usuarioId) {
  await exigirLiberada(aulaId, usuarioId);
  const { rows } = await query(
    `INSERT INTO aula_visitas (usuario_id, aula_id)
     SELECT $2, id FROM aulas WHERE id = $1 AND ativo
     RETURNING id, aula_id, iniciada_em`,
    [aulaId, usuarioId],
  );
  if (!rows[0]) throw naoEncontrado('Aula não encontrada');
  return rows[0];
}

// Trava a visita (FOR UPDATE): respostas e finalização da mesma visita não correm em paralelo.
async function travarVisita(c, visitaId, usuarioId) {
  const { rows } = await c.query(
    'SELECT id, aula_id, finalizada_em FROM aula_visitas WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
    [visitaId, usuarioId],
  );
  const visita = rows[0];
  if (!visita) throw naoEncontrado('Visita não encontrada');
  if (visita.finalizada_em) throw conflito('VISITA_FINALIZADA', 'Esta visita já foi finalizada');
  return visita;
}

async function responder(visitaId, usuarioId, { questao_id, alternativa }) {
  return transacao(async (c) => {
    const visita = await travarVisita(c, visitaId, usuarioId);

    const { rows: questoes } = await c.query(
      'SELECT resposta_correta, explicacao, pontos FROM questoes_aula WHERE id = $1 AND aula_id = $2 AND ativo',
      [questao_id, visita.aula_id],
    );
    const questao = questoes[0];
    if (!questao) throw naoEncontrado('Questão não encontrada nesta aula');

    const correta = questao.resposta_correta === alternativa;
    // Pontua só no primeiro acerto do usuário nesta questão (garantido também por índice único parcial).
    const { rows: respostas } = await c.query(
      `INSERT INTO aula_respostas (visita_id, questao_id, usuario_id, correta, pontuou)
       VALUES ($1, $2, $3, $4, $4 AND NOT EXISTS (
         SELECT 1 FROM aula_respostas WHERE usuario_id = $3 AND questao_id = $2 AND pontuou) AND NOT ${ehAdmin('$3')})
       ON CONFLICT (visita_id, questao_id) DO NOTHING
       RETURNING pontuou`,
      [visitaId, questao_id, usuarioId, correta],
    );
    if (!respostas[0]) throw conflito('JA_RESPONDIDA', 'Questão já respondida nesta visita');

    const pontuou = respostas[0].pontuou;
    return {
      correta,
      resposta_correta: questao.resposta_correta,
      explicacao: questao.explicacao,
      pontos_ganhos: pontuou ? questao.pontos : 0,
      pontuacao_total: pontuou
        ? await creditarPontos(c, usuarioId, questao.pontos, 'aula_questao', questao_id)
        : await pontuacaoAtual(c, usuarioId),
    };
  });
}

async function finalizar(visitaId, usuarioId) {
  return transacao(async (c) => {
    const visita = await travarVisita(c, visitaId, usuarioId);

    const {
      rows: [resumo],
    } = await c.query(
      `SELECT
         count(*)::int AS total_questoes,
         count(r.id)::int AS respondidas,
         count(*) FILTER (WHERE r.correta)::int AS acertos,
         COALESCE(sum(q.pontos) FILTER (WHERE r.pontuou), 0)::int AS pontos_questoes
       FROM questoes_aula q
       LEFT JOIN aula_respostas r ON r.questao_id = q.id AND r.visita_id = $2
       WHERE q.aula_id = $1 AND q.ativo`,
      [visita.aula_id, visitaId],
    );
    if (resumo.respondidas < resumo.total_questoes) {
      throw conflito('QUESTOES_PENDENTES', 'Responda todas as questões antes de concluir a aula');
    }

    // O bônus só é pago na primeira conclusão (índice único parcial aula_visitas_bonus_uk).
    const {
      rows: [{ pontos_conclusao_ganhos: ganhouBonus }],
    } = await c.query(
      `UPDATE aula_visitas SET finalizada_em = now(), concluida = true,
         pontos_conclusao_ganhos = NOT EXISTS (
           SELECT 1 FROM aula_visitas WHERE usuario_id = $2 AND aula_id = $3 AND pontos_conclusao_ganhos)
           AND NOT ${ehAdmin('$2')}
       WHERE id = $1 RETURNING pontos_conclusao_ganhos`,
      [visitaId, usuarioId, visita.aula_id],
    );

    let bonus = 0;
    if (ganhouBonus) {
      const { rows } = await c.query('SELECT pontos_conclusao FROM aulas WHERE id = $1', [visita.aula_id]);
      bonus = rows[0].pontos_conclusao;
    }

    return {
      acertos: resumo.acertos,
      total_questoes: resumo.total_questoes,
      pontos_questoes: resumo.pontos_questoes,
      bonus_conclusao: bonus,
      pontuacao_total: bonus
        ? await creditarPontos(c, usuarioId, bonus, 'aula_conclusao', visita.aula_id)
        : await pontuacaoAtual(c, usuarioId),
      novos_badges: await concederBadges(c, usuarioId),
      trivia_liberada: await triviaLiberada(c, usuarioId),
    };
  });
}

module.exports = { listar, obter, iniciarVisita, responder, finalizar };
