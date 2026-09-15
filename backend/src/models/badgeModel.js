const db = require('../database');
const logger = require('../lib/logger');

function listBadgesAtivos() {
  return new Promise((resolve, reject) => {
    const query = `SELECT id, nome, descricao, imagem_url, tipo_criterio FROM badges WHERE ativo = 1`;
    db.all(query, [], (err, rows) => {
      if (err) {
        logger.error('DB error listBadgesAtivos:', err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function listBadgesDoUsuario(usuarioId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT b.id, b.nome, b.descricao, b.imagem_url, ub.obtida_em
                   FROM usuario_badges ub JOIN badges b ON b.id = ub.badge_id
                   WHERE ub.usuario_id = ? ORDER BY ub.obtida_em DESC`;
    db.all(query, [usuarioId], (err, rows) => {
      if (err) {
        logger.error('DB error listBadgesDoUsuario:', err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function awardBadge(usuarioId, badgeId) {
  return new Promise((resolve, reject) => {
    const query = `INSERT OR IGNORE INTO usuario_badges (usuario_id, badge_id) VALUES (?, ?)`;
    db.run(query, [usuarioId, badgeId], function callback(err) {
      if (err) {
        logger.error('DB error awardBadge:', err);
        return reject(err);
      }
      resolve(this.changes > 0);
    });
  });
}

function checkAndAwardAulaBadges(usuarioId, aulaId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT id, nome, descricao, imagem_url FROM badges
                   WHERE ativo = 1 AND tipo_criterio = 'aula_concluida' AND aula_id = ?`;
    db.all(query, [aulaId], async (err, badges) => {
      if (err) {
        logger.error('DB error checkAndAwardAulaBadges:', err);
        return reject(err);
      }

      try {
        const novosBadges = [];
        for (const badge of badges) {
          const foiConcedida = await awardBadge(usuarioId, badge.id);
          if (foiConcedida) novosBadges.push(badge);
        }
        resolve(novosBadges);
      } catch (awardErr) {
        reject(awardErr);
      }
    });
  });
}

module.exports = {
  listBadgesAtivos,
  listBadgesDoUsuario,
  awardBadge,
  checkAndAwardAulaBadges,
};
