const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({ connectionString: config.DATABASE_URL });

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
