const { Pool } = require('pg');
const config = require('../config');
const logger = require('../lib/logger');

// Banco fora do ar: a requisição falha em 5 s em vez de esperar uma conexão para sempre.
// 20 conexões (o padrão do pg é 10): no teste de carga com 100 usuários, 10 esgotaram no pico de
// cadastros e duas requisições estouraram os 5 s. O Postgres aceita 100.
const pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5000, max: 20 });
// Banco reiniciou/caiu: o pg avisa pelas conexões ociosas. Sem este listener o Node derruba a API.
pool.on('error', (erro) => logger.error('conexão ociosa com o banco caiu', { erro }));

// Conexão emprestada não tem o listener do pool: se o banco cair no meio da transação, o 'error'
// sem listener derrubaria o processo. O erro chega também pela query, que rejeita.
const aoErroNaTransacao = (erro) => logger.error('conexão com o banco caiu durante uma transação', { erro });

async function transacao(fn) {
  const cliente = await pool.connect();
  cliente.on('error', aoErroNaTransacao);
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    // Na conexão morta o ROLLBACK também falha: loga e segue com o erro original, que explica a causa.
    try {
      await cliente.query('ROLLBACK');
    } catch (erroRollback) {
      logger.error('falha no ROLLBACK', { erro: erroRollback });
    }
    throw erro;
  } finally {
    cliente.off('error', aoErroNaTransacao);
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
