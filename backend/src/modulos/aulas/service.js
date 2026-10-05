const { query, transacao } = require('../../db/pool');
const { HttpError, naoEncontrado, conflito } = require('../../lib/erros');
const { ehAdmin, travarUsuario, creditarPontos, pontuacaoAtual, concederBadges } = require('../pontuacao');
const { triviaLiberada } = require('../trivia/service');

// Trilha em sequência: a aula só abre depois de concluída a anterior (aula ativa de ordem imediatamente menor).
// Conclusão é permanente: aula que o aluno já concluiu continua aberta para ele. Admin não fica preso à trilha.
async function exigirLiberada(aulaId, usuarioId) {
  const { rows } = await query(
    `SELECT ant.ordem AS ordem_anterior,
       ant.concluida OR ${ehAdmin('$2')} OR EXISTS (
         SELECT 1 FROM aula_visitas v WHERE v.aula_id = a.id AND v.usuario_id = $2 AND v.concluida
       ) AS liberada
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
  const { ordem_anterior, liberada } = rows[0];
  if (ordem_anterior !== null && !liberada) {
    throw new HttpError(403, 'AULA_BLOQUEADA', `Conclua a aula ${ordem_anterior} para continuar`);
  }
}

async function listar(usuarioId) {
  const { rows } = await query(
    `SELECT *,
       NOT (concluida OR COALESCE(lag(concluida) OVER (ORDER BY ordem), true) OR ${ehAdmin('$1')}) AS bloqueada
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
// Não recusa a visita finalizada: o reenvio de uma resposta ou da finalização ainda é atendido.
// Aula desativada pelo admin com a visita aberta: 404, como em toda rota de aula (não pontua nem paga bônus).
async function travarVisita(c, visitaId, usuarioId) {
  await travarUsuario(c, usuarioId);
  const { rows } = await c.query(
    `SELECT v.id, v.aula_id, v.finalizada_em, v.pontos_conclusao_ganhos
     FROM aula_visitas v JOIN aulas a ON a.id = v.aula_id AND a.ativo
     WHERE v.id = $1 AND v.usuario_id = $2 FOR UPDATE OF v`,
    [visitaId, usuarioId],
  );
  if (!rows[0]) throw naoEncontrado('Visita não encontrada');
  return rows[0];
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
      'SELECT alternativa, correta, pontuou FROM aula_respostas WHERE visita_id = $1 AND questao_id = $2',
      [visitaId, questao_id],
    );
    if (anterior) {
      if (anterior.alternativa !== alternativa) {
        throw conflito('JA_RESPONDIDA', 'Questão já respondida nesta visita');
      }
      return resultado(anterior.correta, anterior.pontuou, await pontuacaoAtual(c, usuarioId));
    }
    if (visita.finalizada_em) throw conflito('VISITA_FINALIZADA', 'Esta visita já foi finalizada');

    const correta = questao.resposta_correta === alternativa;
    // Pontua só no primeiro acerto do usuário nesta questão (garantido também por índice único parcial).
    const {
      rows: [{ pontuou }],
    } = await c.query(
      `INSERT INTO aula_respostas (visita_id, questao_id, usuario_id, alternativa, correta, pontuou)
       VALUES ($1, $2, $3, $4, $5, $5 AND NOT EXISTS (
         SELECT 1 FROM aula_respostas WHERE usuario_id = $3 AND questao_id = $2 AND pontuou) AND NOT ${ehAdmin('$3')})
       RETURNING pontuou`,
      [visitaId, questao_id, usuarioId, alternativa, correta],
    );
    return resultado(
      correta,
      pontuou,
      pontuou
        ? await creditarPontos(c, usuarioId, questao.pontos, 'aula_questao', questao_id)
        : await pontuacaoAtual(c, usuarioId),
    );
  });
}

async function finalizar(visitaId, usuarioId) {
  return transacao(async (c) => {
    const visita = await travarVisita(c, visitaId, usuarioId);
    // Reenvio (o retorno da primeira finalização se perdeu): devolve o mesmo resumo, sem pagar de novo.
    const reenvio = Boolean(visita.finalizada_em);

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
    if (!reenvio && resumo.respondidas < resumo.total_questoes) {
      throw conflito('QUESTOES_PENDENTES', 'Responda todas as questões antes de concluir a aula');
    }

    let ganhouBonus = visita.pontos_conclusao_ganhos;
    if (!reenvio) {
      // O bônus só é pago na primeira conclusão (índice único parcial aula_visitas_bonus_uk).
      const { rows } = await c.query(
        `UPDATE aula_visitas SET finalizada_em = now(), concluida = true,
           pontos_conclusao_ganhos = NOT EXISTS (
             SELECT 1 FROM aula_visitas WHERE usuario_id = $2 AND aula_id = $3 AND pontos_conclusao_ganhos)
             AND NOT ${ehAdmin('$2')}
         WHERE id = $1 RETURNING pontos_conclusao_ganhos`,
        [visitaId, usuarioId, visita.aula_id],
      );
      ganhouBonus = rows[0].pontos_conclusao_ganhos;
    }

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
      pontuacao_total:
        bonus && !reenvio
          ? await creditarPontos(c, usuarioId, bonus, 'aula_conclusao', visita.aula_id)
          : await pontuacaoAtual(c, usuarioId),
      novos_badges: await concederBadges(c, usuarioId),
      trivia_liberada: await triviaLiberada(c, usuarioId),
    };
  });
}

module.exports = { listar, obter, iniciarVisita, responder, finalizar };
