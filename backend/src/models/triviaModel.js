const db = require('../database');
const logger = require('../lib/logger');

function listQuestoesPorDificuldade(dificuldade, limite = 10) {
  return new Promise((resolve, reject) => {
    const query = `SELECT id, enunciado, imagem_url, alternativa_a, alternativa_b, alternativa_c, alternativa_d, pontos
                   FROM questoes_trivia WHERE dificuldade = ? AND ativo = 1
                   ORDER BY RANDOM() LIMIT ?`;
    db.all(query, [dificuldade, limite], (err, rows) => {
      if (err) {
        logger.error('DB error listQuestoesPorDificuldade:', err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function getQuestaoTriviaById(questaoId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM questoes_trivia WHERE id = ? AND ativo = 1`;
    db.get(query, [questaoId], (err, questao) => {
      if (err) {
        logger.error('DB error getQuestaoTriviaById:', err);
        return reject(err);
      }
      resolve(questao);
    });
  });
}

function createTriviaRodada(usuarioId, dificuldade) {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO trivia_rodadas (usuario_id, dificuldade) VALUES (?, ?)`;
    db.run(query, [usuarioId, dificuldade], function callback(err) {
      if (err) {
        logger.error('DB error createTriviaRodada:', err);
        return reject(err);
      }
      resolve({ id: this.lastID, usuarioId, dificuldade });
    });
  });
}

function getTriviaRodadaById(rodadaId) {
  return new Promise((resolve, reject) => {
    const query = `SELECT * FROM trivia_rodadas WHERE id = ?`;
    db.get(query, [rodadaId], (err, rodada) => {
      if (err) {
        logger.error('DB error getTriviaRodadaById:', err);
        return reject(err);
      }
      resolve(rodada);
    });
  });
}

function registrarTriviaResposta({ rodadaId, questaoId, usuarioId, correta }) {
  return new Promise((resolve, reject) => {
    const query = `INSERT INTO trivia_respostas (rodada_id, questao_id, usuario_id, correta, pontuou) VALUES (?, ?, ?, ?, ?)`;
    db.run(query, [rodadaId, questaoId, usuarioId, correta ? 1 : 0, correta ? 1 : 0], function callback(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          const duplicateErr = new Error('Questão já respondida nesta rodada');
          duplicateErr.code = 'DUPLICATE';
          return reject(duplicateErr);
        }
        logger.error('DB error registrarTriviaResposta:', err);
        return reject(err);
      }
      resolve({ id: this.lastID });
    });
  });
}

function finalizarTriviaRodada(rodadaId) {
  return new Promise((resolve, reject) => {
    const somaQuery = `SELECT COALESCE(SUM(tr.pontuou * qt.pontos), 0) AS total
                        FROM trivia_respostas tr JOIN questoes_trivia qt ON qt.id = tr.questao_id
                        WHERE tr.rodada_id = ?`;
    db.get(somaQuery, [rodadaId], (somaErr, somaRow) => {
      if (somaErr) {
        logger.error('DB error finalizarTriviaRodada (soma):', somaErr);
        return reject(somaErr);
      }

      const pontosGanhos = somaRow ? somaRow.total : 0;
      const updateQuery = `UPDATE trivia_rodadas SET finalizada_em = CURRENT_TIMESTAMP, pontos_ganhos = ?
                            WHERE id = ? AND finalizada_em IS NULL`;
      db.run(updateQuery, [pontosGanhos, rodadaId], function callback(err) {
        if (err) {
          logger.error('DB error finalizarTriviaRodada (update):', err);
          return reject(err);
        }

        getTriviaRodadaById(rodadaId)
          .then((rodada) => resolve({ rodada, pontosGanhos: this.changes > 0 ? pontosGanhos : rodada.pontos_ganhos }))
          .catch(reject);
      });
    });
  });
}

function listQuestoesAdmin() {
  return new Promise((resolve, reject) => {
    const query = `SELECT id, enunciado, imagem_url, dificuldade FROM questoes_trivia ORDER BY dificuldade, id`;
    db.all(query, [], (err, rows) => {
      if (err) {
        logger.error('DB error listQuestoesAdmin (trivia):', err);
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function atualizarImagemQuestao(questaoId, imagemUrl) {
  return new Promise((resolve, reject) => {
    const query = `UPDATE questoes_trivia SET imagem_url = ? WHERE id = ?`;
    db.run(query, [imagemUrl, questaoId], (err) => {
      if (err) {
        logger.error('DB error atualizarImagemQuestao (trivia):', err);
        return reject(err);
      }
      resolve({ id: Number(questaoId), imagemUrl });
    });
  });
}

module.exports = {
  listQuestoesPorDificuldade,
  getQuestaoTriviaById,
  createTriviaRodada,
  getTriviaRodadaById,
  registrarTriviaResposta,
  finalizarTriviaRodada,
  listQuestoesAdmin,
  atualizarImagemQuestao,
};
