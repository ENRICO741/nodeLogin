const db = require('../database');
const logger = require('../lib/logger');

function listAulasAtivas(usuarioId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT a.id, a.titulo, a.ordem, a.pontos_conclusao,
                     EXISTS (
                       SELECT 1 FROM aula_visitas v WHERE v.aula_id = a.id AND v.usuario_id = ? AND v.concluida = 1
                     ) AS concluida
                   FROM aulas a WHERE a.ativo = 1 ORDER BY a.ordem`;
    db.all(query, [usuarioId || null], (err, rows) => {
      if (err) {
        logger.error('DB error listAulasAtivas:', err);
        return reject(err);
      }
      resolve(rows.map((row) => ({ ...row, concluida: !!row.concluida })));
    });
  });
}

function getAulaById(aulaId, usuarioId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT a.id, a.titulo, a.ordem, a.conteudo_html, a.pontos_conclusao, a.ativo,
                     EXISTS (
                       SELECT 1 FROM aula_visitas v WHERE v.aula_id = a.id AND v.usuario_id = ? AND v.concluida = 1
                     ) AS concluida
                   FROM aulas a WHERE a.id = ? AND a.ativo = 1`;
    db.get(query, [usuarioId || null, aulaId], (err, aula) => {
      if (err) {
        logger.error('DB error getAulaById:', err);
        return reject(err);
      }
      resolve(aula ? { ...aula, concluida: !!aula.concluida } : aula);
    });
  });
}

function listQuestoesParaAluno(aulaId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT id, enunciado, imagem_url, alternativa_a, alternativa_b, alternativa_c, alternativa_d, pontos
                   FROM questoes_aula WHERE aula_id = ? AND ativo = 1`;
    db.all(query, [aulaId], (err, rows) => {
      if (err) {
        logger.error('DB error listQuestoesParaAluno:', err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function getQuestaoAulaById(questaoId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM questoes_aula WHERE id = ? AND ativo = 1`;
    db.get(query, [questaoId], (err, questao) => {
      if (err) {
        logger.error('DB error getQuestaoAulaById:', err);
        return reject(err);
      }
      resolve(questao);
    });
  });
}

function createAulaVisita(usuarioId, aulaId) {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO aula_visitas (usuario_id, aula_id) VALUES (?, ?)`;
    db.run(query, [usuarioId, aulaId], function callback(err) {
      if (err) {
        logger.error('DB error createAulaVisita:', err);
        return reject(err);
      }
      resolve({ id: this.lastID, usuarioId, aulaId });
    });
  });
}

function getAulaVisitaById(visitaId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM aula_visitas WHERE id = ?`;
    db.get(query, [visitaId], (err, visita) => {
      if (err) {
        logger.error('DB error getAulaVisitaById:', err);
        return reject(err);
      }
      resolve(visita);
    });
  });
}

function registrarAulaResposta({ visitaId, questaoId, usuarioId, correta }) {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO aula_respostas (visita_id, questao_id, usuario_id, correta, pontuou) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [visitaId, questaoId, usuarioId, correta ? 1 : 0, correta ? 1 : 0], function callback(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          const duplicateErr = new Error('Questão já respondida nesta visita');
          duplicateErr.code = 'DUPLICATE';
          return reject(duplicateErr);
        }
        logger.error('DB error registrarAulaResposta:', err);
        return reject(err);
      }
      resolve({ id: this.lastID });
    });
  });
}

function finalizarAulaVisita(visitaId) {
  return new Promise((resolve, reject) => {
    const updateQuery = `UPDATE aula_visitas SET finalizada_em = CURRENT_TIMESTAMP, concluida = 1
                          WHERE id = ? AND finalizada_em IS NULL`;
    db.run(updateQuery, [visitaId], function callback(err) {
      if (err) {
        logger.error('DB error finalizarAulaVisita (update):', err);
        return reject(err);
      }

      if (this.changes === 0) {
        return getAulaVisitaById(visitaId)
          .then((visita) => resolve({ visita, pontosConclusaoGanhos: false }))
          .catch(reject);
      }

      getAulaVisitaById(visitaId)
        .then((visita) => {
          const jaGanhouQuery = `SELECT 1 FROM aula_visitas
                                  WHERE usuario_id = ? AND aula_id = ? AND pontos_conclusao_ganhos = 1 AND id != ?`;
          db.get(jaGanhouQuery, [visita.usuario_id, visita.aula_id, visitaId], (jaGanhouErr, jaGanhouRow) => {
            if (jaGanhouErr) {
              logger.error('DB error finalizarAulaVisita (check bonus):', jaGanhouErr);
              return reject(jaGanhouErr);
            }

            if (jaGanhouRow) {
              return resolve({ visita, pontosConclusaoGanhos: false });
            }

            db.run(
              `UPDATE aula_visitas SET pontos_conclusao_ganhos = 1 WHERE id = ?`,
              [visitaId],
              (bonusErr) => {
                if (bonusErr) {
                  logger.error('DB error finalizarAulaVisita (award bonus):', bonusErr);
                  return reject(bonusErr);
                }
                resolve({ visita: { ...visita, pontos_conclusao_ganhos: 1 }, pontosConclusaoGanhos: true });
              }
            );
          });
        })
        .catch(reject);
    });
  });
}

function listQuestoesAdmin() {
  return new Promise((resolve, reject) => {
    const query = `SELECT q.id, q.enunciado, q.imagem_url, a.titulo AS aula_titulo
                   FROM questoes_aula q JOIN aulas a ON a.id = q.aula_id
                   ORDER BY a.ordem, q.id`;
    db.all(query, [], (err, rows) => {
      if (err) {
        logger.error('DB error listQuestoesAdmin (aula):', err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function atualizarImagemQuestao(questaoId, imagemUrl) {
  return new Promise((resolve, reject) => {
    const query = `UPDATE questoes_aula SET imagem_url = ? WHERE id = ?`;
    db.run(query, [imagemUrl, questaoId], (err) => {
      if (err) {
        logger.error('DB error atualizarImagemQuestao (aula):', err);
        return reject(err);
      }
      resolve({ id: Number(questaoId), imagemUrl });
    });
  });
}

module.exports = {
  listAulasAtivas,
  getAulaById,
  listQuestoesParaAluno,
  getQuestaoAulaById,
  createAulaVisita,
  getAulaVisitaById,
  registrarAulaResposta,
  finalizarAulaVisita,
  listQuestoesAdmin,
  atualizarImagemQuestao,
};
