const fs = require('node:fs');
const path = require('node:path');
const { pool, transacao } = require('./pool');
const logger = require('../lib/logger');

const PASTA = path.join(__dirname, 'migrations');

// Aplica em ordem os arquivos .sql ainda não registrados em `migracoes`, cada um na sua transação.
async function migrar() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS migracoes (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())',
  );
  const { rows } = await pool.query('SELECT nome FROM migracoes');
  const aplicadas = new Set(rows.map((r) => r.nome));

  const pendentes = fs
    .readdirSync(PASTA)
    .filter((f) => f.endsWith('.sql') && !aplicadas.has(f))
    .sort();

  for (const nome of pendentes) {
    await transacao(async (c) => {
      await c.query(fs.readFileSync(path.join(PASTA, nome), 'utf8'));
      await c.query('INSERT INTO migracoes (nome) VALUES ($1)', [nome]);
    });
    logger.info('migração aplicada', { nome });
  }
}

module.exports = { migrar };

if (require.main === module) {
  migrar()
    .then(() => pool.end())
    .catch((erro) => {
      logger.error('falha na migração', { erro });
      process.exit(1);
    });
}
