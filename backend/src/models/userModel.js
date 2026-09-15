const db = require('../database');
const bcrypt = require('bcrypt');
const logger = require('../lib/logger');

function createUser(username, password) {
  return new Promise((resolve, reject) => {
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) return reject(err);

      const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
      db.run(query, [username, hash], function (dbErr) {
        if (dbErr) {
            logger.error('DB error creating user:', dbErr);
            return reject(dbErr);
          }
          resolve({ id: this.lastID, username });
      });
    });
  });
}

function findByUsername(username) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT id, username FROM users WHERE username = ?';
    db.get(query, [username], (err, user) => {
      if (err) {
        logger.error('DB error findByUsername:', err);
        return reject(err);
      }
      resolve(user);
    });
  });
}

function findByUsernameAndPassword(username, password) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT id, username, password FROM users WHERE username = ?';
    db.get(query, [username], (err, row) => {
      if (err) {
        logger.error('DB error findByUsernameAndPassword:', err);
        return reject(err);
      }
      if (!row) return resolve(null);

      bcrypt.compare(password, row.password, (cmpErr, same) => {
        if (cmpErr) {
          logger.error('bcrypt compare error:', cmpErr);
          return reject(cmpErr);
        }
        if (!same) return resolve(null);

        resolve({ id: row.id, username: row.username });
      });
    });
  });
}

function getProfileById(userId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT id, username, fullName, email, bio, avatar, nivel, ritmo, areaInteresse, badges, createdAt FROM users WHERE id = ?`;
    db.get(query, [userId], (err, user) => {
      if (err) {
          logger.error('DB error getProfileById:', err);
          return reject(err);
        }
        if (user && user.badges) {
        try {
          user.badges = JSON.parse(user.badges);
        } catch (e) {
          user.badges = [];
        }
      }
      resolve(user);
    });
  });
}

function updateProfile(userId, profileData) {
  return new Promise((resolve, reject) => {
    const { fullName, email, bio, avatar, nivel, ritmo, areaInteresse, badges } = profileData;
    const badgesJson = JSON.stringify(badges || []);
    const query = `UPDATE users SET fullName = ?, email = ?, bio = ?, avatar = ?, nivel = ?, ritmo = ?, areaInteresse = ?, badges = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`;

    db.run(
      query,
      [fullName, email, bio, avatar, nivel, ritmo, areaInteresse, badgesJson, userId],
      function (err) {
        if (err) {
              logger.error('DB error updateProfile:', err);
              return reject(err);
            }
            resolve({ id: userId, ...profileData });
      }
    );
  });
}

function getPontuacaoTotal(userId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT pontuacao_total FROM users WHERE id = ?`, [userId], (err, row) => {
      if (err) {
        logger.error('DB error getPontuacaoTotal:', err);
        return reject(err);
      }
      resolve(row ? row.pontuacao_total : null);
    });
  });
}

function incrementarPontuacao(userId, delta) {
  return new Promise((resolve, reject) => {
    const query = `UPDATE users SET pontuacao_total = pontuacao_total + ?, pontuacao_atualizada_em = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(query, [delta, userId], (err) => {
      if (err) {
        logger.error('DB error incrementarPontuacao:', err);
        return reject(err);
      }

      db.get(`SELECT pontuacao_total FROM users WHERE id = ?`, [userId], (selectErr, row) => {
        if (selectErr) {
          logger.error('DB error incrementarPontuacao (select):', selectErr);
          return reject(selectErr);
        }
        resolve(row ? row.pontuacao_total : null);
      });
    });
  });
}

module.exports = {
  createUser,
  findByUsername,
  findByUsernameAndPassword,
  getProfileById,
  updateProfile,
  getPontuacaoTotal,
  incrementarPontuacao,
};
