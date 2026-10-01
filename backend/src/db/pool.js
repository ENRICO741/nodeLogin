const { Pool } = require('pg');
const config = require('../config');
const logger = require('../lib/logger');

// Banco fora do ar: a requisição falha em 5 s em vez de esperar uma conexão para sempre.
const pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5000 });
// Banco reiniciou/caiu: o pg avisa pelas conexões ociosas. Sem este listener o Node derruba a API.
pool.on('error', (erro) => logger.error('conexão ociosa com o banco caiu', { erro }));

async function transacao(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

// UPDATE parcial. `dados` já passou por um esquema zod, então as chaves são colunas conhecidas.
async function atualizarLinha(executor, tabela, id, dados, retorno) {
  const colunas = Object.keys(dados);
  if (colunas.length === 0) {
    const { rows } = await executor.query(`SELECT ${retorno} FROM ${tabela} WHERE id = $1`, [id]);
    return rows[0];
  }
  const sets = colunas.map((coluna, i) => `${coluna} = $${i + 2}`).join(', ');
  const { rows } = await executor.query(`UPDATE ${tabela} SET ${sets} WHERE id = $1 RETURNING ${retorno}`, [
    id,
    ...Object.values(dados),
  ]);
  return rows[0];
}

module.exports = { pool, query: (sql, params) => pool.query(sql, params), transacao, atualizarLinha };
