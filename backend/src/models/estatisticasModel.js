const db = require('../database');
const logger = require('../lib/logger');

function all(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function getEstatisticasPorAula() {
  try {
    const visitas = await all(`
      SELECT a.id AS aulaId, a.titulo,
        COUNT(v.id) AS totalTentativas,
        SUM(CASE WHEN v.finalizada_em IS NOT NULL THEN 1 ELSE 0 END) AS totalConcluidas,
        AVG(CASE WHEN v.finalizada_em IS NOT NULL
              THEN CAST((julianday(v.finalizada_em) - julianday(v.iniciada_em)) * 86400000 AS INTEGER)
            END) AS duracaoMediaMs
      FROM aulas a LEFT JOIN aula_visitas v ON v.aula_id = a.id
      GROUP BY a.id ORDER BY a.ordem
    `);

    const respostas = await all(`
      SELECT v.aula_id AS aulaId, COUNT(*) AS totalRespostas, SUM(r.correta) AS totalAcertos
      FROM aula_respostas r JOIN aula_visitas v ON v.id = r.visita_id
      GROUP BY v.aula_id
    `);

    const respostasPorAula = new Map(respostas.map((r) => [r.aulaId, r]));

    return visitas.map((v) => {
      const r = respostasPorAula.get(v.aulaId);
      return {
        aulaId: v.aulaId,
        titulo: v.titulo,
        totalTentativas: v.totalTentativas || 0,
        totalConcluidas: v.totalConcluidas || 0,
        duracaoMediaMs: v.duracaoMediaMs ?? null,
        totalRespostas: r ? r.totalRespostas : 0,
        totalAcertos: r ? r.totalAcertos : 0,
      };
    });
  } catch (err) {
    logger.error('DB error getEstatisticasPorAula:', err);
    throw err;
  }
}

function getEstatisticasQuestoesAula() {
  return all(`
    SELECT q.id AS questaoId, q.enunciado, a.titulo AS aulaTitulo,
      COUNT(r.id) AS totalRespostas, SUM(r.correta) AS totalAcertos
    FROM questoes_aula q
    JOIN aulas a ON a.id = q.aula_id
    LEFT JOIN aula_respostas r ON r.questao_id = q.id
    GROUP BY q.id ORDER BY a.ordem, q.id
  `).catch((err) => {
    logger.error('DB error getEstatisticasQuestoesAula:', err);
    throw err;
  });
}

async function getEstatisticasUsuariosAula() {
  try {
    const visitas = await all(`
      SELECT u.id AS usuarioId, u.username, a.id AS aulaId, a.titulo AS aulaTitulo,
        COUNT(v.id) AS totalTentativas,
        AVG(CASE WHEN v.finalizada_em IS NOT NULL
              THEN CAST((julianday(v.finalizada_em) - julianday(v.iniciada_em)) * 86400000 AS INTEGER)
            END) AS duracaoMediaMs
      FROM aula_visitas v
      JOIN users u ON u.id = v.usuario_id
      JOIN aulas a ON a.id = v.aula_id
      GROUP BY v.usuario_id, v.aula_id
      ORDER BY u.username, a.ordem
    `);

    const respostas = await all(`
      SELECT v.usuario_id AS usuarioId, v.aula_id AS aulaId, COUNT(*) AS totalRespostas, SUM(r.correta) AS totalAcertos
      FROM aula_respostas r JOIN aula_visitas v ON v.id = r.visita_id
      GROUP BY v.usuario_id, v.aula_id
    `);

    const chave = (u, a) => `${u}:${a}`;
    const respostasPorChave = new Map(respostas.map((r) => [chave(r.usuarioId, r.aulaId), r]));

    return visitas.map((v) => {
      const r = respostasPorChave.get(chave(v.usuarioId, v.aulaId));
      return {
        usuarioId: v.usuarioId,
        username: v.username,
        aulaId: v.aulaId,
        aulaTitulo: v.aulaTitulo,
        totalTentativas: v.totalTentativas || 0,
        duracaoMediaMs: v.duracaoMediaMs ?? null,
        totalRespostas: r ? r.totalRespostas : 0,
        totalAcertos: r ? r.totalAcertos : 0,
      };
    });
  } catch (err) {
    logger.error('DB error getEstatisticasUsuariosAula:', err);
    throw err;
  }
}

async function getEstatisticasPorTrivia() {
  try {
    const rodadas = await all(`
      SELECT dificuldade,
        COUNT(id) AS totalTentativas,
        SUM(CASE WHEN finalizada_em IS NOT NULL THEN 1 ELSE 0 END) AS totalConcluidas,
        AVG(CASE WHEN finalizada_em IS NOT NULL
              THEN CAST((julianday(finalizada_em) - julianday(iniciada_em)) * 86400000 AS INTEGER)
            END) AS duracaoMediaMs
      FROM trivia_rodadas
      GROUP BY dificuldade ORDER BY dificuldade
    `);

    const respostas = await all(`
      SELECT rd.dificuldade, COUNT(*) AS totalRespostas, SUM(r.correta) AS totalAcertos
      FROM trivia_respostas r JOIN trivia_rodadas rd ON rd.id = r.rodada_id
      GROUP BY rd.dificuldade
    `);

    const respostasPorDificuldade = new Map(respostas.map((r) => [r.dificuldade, r]));

    return rodadas.map((rd) => {
      const r = respostasPorDificuldade.get(rd.dificuldade);
      return {
        dificuldade: rd.dificuldade,
        totalTentativas: rd.totalTentativas || 0,
        totalConcluidas: rd.totalConcluidas || 0,
        duracaoMediaMs: rd.duracaoMediaMs ?? null,
        totalRespostas: r ? r.totalRespostas : 0,
        totalAcertos: r ? r.totalAcertos : 0,
      };
    });
  } catch (err) {
    logger.error('DB error getEstatisticasPorTrivia:', err);
    throw err;
  }
}

function getEstatisticasQuestoesTrivia() {
  return all(`
    SELECT q.id AS questaoId, q.enunciado, q.dificuldade,
      COUNT(r.id) AS totalRespostas, SUM(r.correta) AS totalAcertos
    FROM questoes_trivia q
    LEFT JOIN trivia_respostas r ON r.questao_id = q.id
    GROUP BY q.id ORDER BY q.dificuldade, q.id
  `).catch((err) => {
    logger.error('DB error getEstatisticasQuestoesTrivia:', err);
    throw err;
  });
}

async function getEstatisticasUsuariosTrivia() {
  try {
    const rodadas = await all(`
      SELECT u.id AS usuarioId, u.username, tr.dificuldade,
        COUNT(tr.id) AS totalTentativas,
        AVG(CASE WHEN tr.finalizada_em IS NOT NULL
              THEN CAST((julianday(tr.finalizada_em) - julianday(tr.iniciada_em)) * 86400000 AS INTEGER)
            END) AS duracaoMediaMs
      FROM trivia_rodadas tr JOIN users u ON u.id = tr.usuario_id
      GROUP BY tr.usuario_id, tr.dificuldade
      ORDER BY u.username, tr.dificuldade
    `);

    const respostas = await all(`
      SELECT rd.usuario_id AS usuarioId, rd.dificuldade, COUNT(*) AS totalRespostas, SUM(r.correta) AS totalAcertos
      FROM trivia_respostas r JOIN trivia_rodadas rd ON rd.id = r.rodada_id
      GROUP BY rd.usuario_id, rd.dificuldade
    `);

    const chave = (u, d) => `${u}:${d}`;
    const respostasPorChave = new Map(respostas.map((r) => [chave(r.usuarioId, r.dificuldade), r]));

    return rodadas.map((rd) => {
      const r = respostasPorChave.get(chave(rd.usuarioId, rd.dificuldade));
      return {
        usuarioId: rd.usuarioId,
        username: rd.username,
        dificuldade: rd.dificuldade,
        totalTentativas: rd.totalTentativas || 0,
        duracaoMediaMs: rd.duracaoMediaMs ?? null,
        totalRespostas: r ? r.totalRespostas : 0,
        totalAcertos: r ? r.totalAcertos : 0,
      };
    });
  } catch (err) {
    logger.error('DB error getEstatisticasUsuariosTrivia:', err);
    throw err;
  }
}

module.exports = {
  getEstatisticasPorAula,
  getEstatisticasQuestoesAula,
  getEstatisticasUsuariosAula,
  getEstatisticasPorTrivia,
  getEstatisticasQuestoesTrivia,
  getEstatisticasUsuariosTrivia,
};
