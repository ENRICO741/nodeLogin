require('./env');

const path = require('node:path');
const { spawn } = require('node:child_process');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');
const { migrar } = require('../src/db/migrar');
const { semear } = require('../src/db/seed');
const mailer = require('../src/lib/mailer');

const RAIZ_BACKEND = path.join(__dirname, '..');

async function prepararBanco() {
  await migrar();
  const { rows } = await pool.query(
    "SELECT string_agg(quote_ident(tablename), ', ') AS tabelas FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migracoes'",
  );
  await pool.query(`TRUNCATE ${rows[0].tabelas} CASCADE`);
  await semear();
}

let contador = 0;
const autenticado = (token) => (metodo, url) =>
  request(app)[metodo](url).set('Authorization', `Bearer ${token}`);

async function novoUsuario(extra = {}) {
  contador += 1;
  const sufixo = `${process.pid}_${contador}`;
  const dados = {
    nome: 'Pessoa Teste',
    apelido: `pessoa${sufixo}`,
    email: `pessoa${sufixo}@exemplo.com`,
    senha: 'senha-forte-123',
    ...extra,
  };
  const res = await request(app).post('/api/auth/cadastro').send(dados).expect(201);
  return { ...dados, token: res.body.token, usuario: res.body.usuario, api: autenticado(res.body.token) };
}

async function tornarAdmin(email) {
  await pool.query("UPDATE usuarios SET papel = 'admin' WHERE email = $1", [email]);
}

async function novoAdmin() {
  const admin = await novoUsuario();
  await tornarAdmin(admin.email);
  return admin;
}

// Gabarito lido direto do banco (a API nunca o entrega antes da resposta).
async function gabarito(tabela, ids) {
  const { rows } = await pool.query(`SELECT id, resposta_correta FROM ${tabela} WHERE id = ANY($1)`, [ids]);
  return Object.fromEntries(rows.map((r) => [r.id, r.resposta_correta]));
}

const errada = (certa) => ({ a: 'b', b: 'c', c: 'd', d: 'a' })[certa];

// Captura o próximo e-mail "enviado" e devolve o token do link de redefinição.
function capturarEmail() {
  let resolver;
  const recebido = new Promise((r) => (resolver = r));
  mailer.enviarEmail = async (mensagem) => resolver(mensagem);
  return recebido.then((mensagem) => ({
    mensagem,
    token: new URL(mensagem.texto.match(/https?:\S+/)[0]).searchParams.get('token'),
  }));
}

// Roda um script do backend num processo separado (config.js é lido uma vez por processo).
function rodarNode(args, env = {}, { timeoutMs = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    const filho = spawn(process.execPath, args, {
      cwd: RAIZ_BACKEND,
      env: { ...process.env, ...env },
    });
    let saida = '';
    filho.stdout.on('data', (d) => (saida += d));
    filho.stderr.on('data', (d) => (saida += d));
    const limite = setTimeout(() => {
      filho.kill();
      reject(new Error(`timeout: ${args.join(' ')}\n${saida}`));
    }, timeoutMs);
    filho.on('close', (codigo) => {
      clearTimeout(limite);
      resolve({ codigo, saida });
    });
  });
}

module.exports = {
  app,
  request,
  pool,
  prepararBanco,
  novoUsuario,
  novoAdmin,
  tornarAdmin,
  autenticado,
  gabarito,
  errada,
  capturarEmail,
  rodarNode,
  RAIZ_BACKEND,
};
