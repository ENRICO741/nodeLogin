const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, pool, prepararBanco, novoUsuario } = require('./ajuda');
const mailer = require('../src/lib/mailer');

before(prepararBanco);
after(() => pool.end());

test('cadastro devolve token e login aceita email ou apelido', async () => {
  const u = await novoUsuario();
  assert.ok(u.token);
  assert.equal(u.usuario.papel, 'usuario');
  assert.equal(u.usuario.senha_hash, undefined);

  for (const identificador of [u.email, u.apelido.toUpperCase()]) {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identificador, senha: u.senha })
      .expect(200);
    assert.equal(res.body.usuario.id, u.usuario.id);
  }
});

test('login com senha errada ou usuário inexistente dá a mesma resposta', async () => {
  const u = await novoUsuario();
  const errada = await request(app).post('/api/auth/login').send({ identificador: u.email, senha: 'x' });
  const inexistente = await request(app)
    .post('/api/auth/login')
    .send({ identificador: 'ninguem', senha: 'x' });
  assert.equal(errada.status, 401);
  assert.deepEqual(errada.body, inexistente.body);
});

test('cadastro duplicado dá 409 e dados inválidos dão 400 com detalhes', async () => {
  const u = await novoUsuario();
  await request(app)
    .post('/api/auth/cadastro')
    .send({ nome: 'Outra', apelido: 'outra', email: u.email.toUpperCase(), senha: 'senha-forte-123' })
    .expect(409);
  const res = await request(app).post('/api/auth/cadastro').send({ nome: 'A', email: 'x' }).expect(400);
  assert.equal(res.body.erro.codigo, 'VALIDACAO');
  assert.ok(res.body.erro.detalhes.some((d) => d.campo === 'senha'));
});

test('rotas protegidas exigem token válido', async () => {
  await request(app).get('/api/aulas').expect(401);
  await request(app).get('/api/aulas').set('Authorization', 'Bearer invalido').expect(401);
});

test('redefinição de senha: token de uso único e JWT antigo invalidado', async () => {
  const u = await novoUsuario();
  let email;
  mailer.enviarEmail = async (mensagem) => {
    email = mensagem;
  };

  const neutra = await request(app)
    .post('/api/auth/esqueci-senha')
    .send({ email: 'nao@existe.com' })
    .expect(200);
  const real = await request(app).post('/api/auth/esqueci-senha').send({ email: u.email }).expect(200);
  assert.deepEqual(neutra.body, real.body);

  await new Promise((r) => setImmediate(r));
  const token = new URL(email.texto.match(/https?:\S+/)[0]).searchParams.get('token');

  await request(app).post('/api/auth/redefinir-senha').send({ token, senha: 'nova-senha-456' }).expect(204);
  await request(app).post('/api/auth/redefinir-senha').send({ token, senha: 'outra-senha-789' }).expect(400);

  await u.api('get', '/api/auth/me').expect(401);
  await request(app).post('/api/auth/login').send({ identificador: u.email, senha: u.senha }).expect(401);
  await request(app)
    .post('/api/auth/login')
    .send({ identificador: u.email, senha: 'nova-senha-456' })
    .expect(200);
});

test('token de redefinição expirado é recusado', async () => {
  const u = await novoUsuario();
  let email;
  mailer.enviarEmail = async (mensagem) => {
    email = mensagem;
  };
  await request(app).post('/api/auth/esqueci-senha').send({ email: u.email }).expect(200);
  await new Promise((r) => setImmediate(r));
  const token = new URL(email.texto.match(/https?:\S+/)[0]).searchParams.get('token');

  await pool.query("UPDATE tokens_recuperacao_senha SET expira_em = now() - interval '1 minute'");
  await request(app).post('/api/auth/redefinir-senha').send({ token, senha: 'nova-senha-456' }).expect(400);
});
