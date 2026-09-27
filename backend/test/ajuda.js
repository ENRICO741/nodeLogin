// Ambiente de teste: banco próprio (criado por deploy/dev-init.sql) e bcrypt barato.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/security_awareness_teste';
process.env.JWT_SECRET ??= 'segredo-de-teste-com-pelo-menos-32-caracteres';
process.env.BCRYPT_CUSTO = '4';

const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');
const { migrar } = require('../src/db/migrar');
const { semear } = require('../src/db/seed');

async function prepararBanco() {
  await migrar();
  const { rows } = await pool.query(
    "SELECT string_agg(quote_ident(tablename), ', ') AS tabelas FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migracoes'",
  );
  await pool.query(`TRUNCATE ${rows[0].tabelas} CASCADE`);
  await semear();
}

let contador = 0;
async function novoUsuario(extra = {}) {
  contador += 1;
  const dados = {
    nome: 'Pessoa Teste',
    apelido: `pessoa${contador}`,
    email: `pessoa${contador}@exemplo.com`,
    senha: 'senha-forte-123',
    ...extra,
  };
  const res = await request(app).post('/api/auth/cadastro').send(dados).expect(201);
  const api = (metodo, url) => request(app)[metodo](url).set('Authorization', `Bearer ${res.body.token}`);
  return { ...dados, token: res.body.token, usuario: res.body.usuario, api };
}

async function tornarAdmin(email) {
  await pool.query("UPDATE usuarios SET papel = 'admin' WHERE email = $1", [email]);
}

module.exports = { app, request, pool, prepararBanco, novoUsuario, tornarAdmin };
