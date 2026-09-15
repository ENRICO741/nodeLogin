const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('./lib/logger');
const seedAtividades = require('./seeds/seedAtividades');

const databasePath = path.resolve(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(databasePath, (err) => {
  if (err) {
    logger.error('Erro ao conectar no banco de dados SQLite:', err);
    return;
  }
  logger.info('Conectado ao banco de dados SQLite em', databasePath);
  db.run('PRAGMA foreign_keys = ON');
});

const ensureColumn = (table, column, definition) => {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (err, columns) => {
      if (err) return reject(err);
      const exists = columns.some((col) => col.name === column);
      if (exists) return resolve();

      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (alterErr) => {
        if (alterErr) return reject(alterErr);
        resolve();
      });
    });
  });
};

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )`
  );

  ensureColumn('users', 'fullName', "TEXT DEFAULT ''")
    .then(() => ensureColumn('users', 'email', "TEXT DEFAULT ''"))
    .then(() => ensureColumn('users', 'bio', "TEXT DEFAULT ''"))
    .then(() => ensureColumn('users', 'avatar', "TEXT DEFAULT 'https://via.placeholder.com/150'"))
    .then(() => ensureColumn('users', 'nivel', "TEXT DEFAULT 'iniciante'"))
    .then(() => ensureColumn('users', 'ritmo', "TEXT DEFAULT 'moderado'"))
    .then(() => ensureColumn('users', 'areaInteresse', "TEXT DEFAULT ''"))
    .then(() => ensureColumn('users', 'badges', "TEXT DEFAULT '[]'"))
    .then(() => ensureColumn('users', 'createdAt', "DATETIME DEFAULT CURRENT_TIMESTAMP"))
    .then(() => ensureColumn('users', 'updatedAt', "DATETIME DEFAULT CURRENT_TIMESTAMP"))
    .then(() => ensureColumn('users', 'pontuacao_total', 'INTEGER DEFAULT 0'))
    .then(() => ensureColumn('users', 'pontuacao_atualizada_em', 'DATETIME'))
    .then(() => {
      db.run(`CREATE TABLE IF NOT EXISTS aulas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        ordem INTEGER UNIQUE NOT NULL,
        conteudo_html TEXT NOT NULL DEFAULT '',
        pontos_conclusao INTEGER NOT NULL DEFAULT 0,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS questoes_aula (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aula_id INTEGER NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
        enunciado TEXT NOT NULL,
        imagem_url TEXT,
        alternativa_a TEXT NOT NULL,
        alternativa_b TEXT NOT NULL,
        alternativa_c TEXT NOT NULL,
        alternativa_d TEXT NOT NULL,
        resposta_correta TEXT NOT NULL CHECK (resposta_correta IN ('a','b','c','d')),
        explicacao TEXT,
        pontos INTEGER NOT NULL DEFAULT 0,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS aula_visitas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        aula_id INTEGER NOT NULL REFERENCES aulas(id) ON DELETE CASCADE,
        iniciada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        finalizada_em DATETIME,
        concluida INTEGER NOT NULL DEFAULT 0,
        pontos_conclusao_ganhos INTEGER NOT NULL DEFAULT 0
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS aula_respostas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visita_id INTEGER NOT NULL REFERENCES aula_visitas(id) ON DELETE CASCADE,
        questao_id INTEGER NOT NULL REFERENCES questoes_aula(id) ON DELETE CASCADE,
        usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        correta INTEGER NOT NULL DEFAULT 0,
        pontuou INTEGER NOT NULL DEFAULT 0,
        respondido_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (visita_id, questao_id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS questoes_trivia (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dificuldade TEXT NOT NULL,
        enunciado TEXT NOT NULL,
        imagem_url TEXT,
        alternativa_a TEXT NOT NULL,
        alternativa_b TEXT NOT NULL,
        alternativa_c TEXT NOT NULL,
        alternativa_d TEXT NOT NULL,
        resposta_correta TEXT NOT NULL CHECK (resposta_correta IN ('a','b','c','d')),
        explicacao TEXT,
        aula_referencia_id INTEGER REFERENCES aulas(id) ON DELETE SET NULL,
        pontos INTEGER NOT NULL DEFAULT 0,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS trivia_rodadas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        dificuldade TEXT NOT NULL,
        iniciada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        finalizada_em DATETIME,
        pontos_ganhos INTEGER NOT NULL DEFAULT 0
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS trivia_respostas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rodada_id INTEGER NOT NULL REFERENCES trivia_rodadas(id) ON DELETE CASCADE,
        questao_id INTEGER NOT NULL REFERENCES questoes_trivia(id) ON DELETE CASCADE,
        usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        correta INTEGER NOT NULL DEFAULT 0,
        pontuou INTEGER NOT NULL DEFAULT 0,
        respondido_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (rodada_id, questao_id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT,
        imagem_url TEXT,
        tipo_criterio TEXT NOT NULL,
        aula_id INTEGER REFERENCES aulas(id) ON DELETE SET NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS usuario_badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
        obtida_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (usuario_id, badge_id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS sessoes_app (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        iniciada_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        finalizada_em DATETIME
      )`);

      db.run(
        `CREATE TABLE IF NOT EXISTS eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sessao_id INTEGER NOT NULL REFERENCES sessoes_app(id) ON DELETE CASCADE,
        tipo_evento TEXT NOT NULL,
        tela TEXT,
        elemento TEXT,
        duracao_ms INTEGER,
        metadata TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
        (createErr) => {
          if (createErr) {
            logger.error('Erro ao criar tabelas de atividades:', createErr);
            return;
          }
          seedAtividades(db);
        }
      );
    })
    .catch((migrationErr) => {
      logger.error('Erro ao atualizar esquema do banco de dados:', migrationErr);
    });
});

module.exports = db;
