const db = require('../database');
const logger = require('../lib/logger');

function iniciarSessao(usuarioId) {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO sessoes_app (usuario_id) VALUES (?)`;
    db.run(query, [usuarioId], function callback(err) {
      if (err) {
        logger.error('DB error iniciarSessao:', err);
        return reject(err);
      }
      resolve({ id: this.lastID, usuarioId });
    });
  });
}

function finalizarSessao(sessaoId) {
  return new Promise((resolve, reject) => {
    const query = `UPDATE sessoes_app SET finalizada_em = CURRENT_TIMESTAMP WHERE id = ? AND finalizada_em IS NULL`;
    db.run(query, [sessaoId], (err) => {
      if (err) {
        logger.error('DB error finalizarSessao:', err);
        return reject(err);
      }
      resolve();
    });
  });
}

function registrarEvento({ usuarioId, sessaoId, tipoEvento, tela, elemento, duracaoMs, metadata }) {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO eventos (usuario_id, sessao_id, tipo_evento, tela, elemento, duracao_ms, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;
    db.run(
      query,
      [usuarioId, sessaoId, tipoEvento, tela || null, elemento || null, duracaoMs || null, JSON.stringify(metadata || {})],
      function callback(err) {
        if (err) {
          logger.error('DB error registrarEvento:', err);
          return reject(err);
        }
        resolve({ id: this.lastID });
      }
    );
  });
}

module.exports = {
  iniciarSessao,
  finalizarSessao,
  registrarEvento,
};
