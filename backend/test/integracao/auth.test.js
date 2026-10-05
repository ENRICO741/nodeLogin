const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { app, request, pool, prepararBanco, novoUsuario, autenticado, capturarEmail } = require('../ajuda');
const { JWT_SECRET } = require('../env');

before(prepararBanco);
after(() => pool.end());

const post = (url, corpo) => request(app).post(url).send(corpo);
const cadastro = (extra) =>
  post('/api/auth/cadastro', {
    nome: 'Nome Válido',
    apelido: `ok_${Math.random().toString(36).slice(2, 10)}`,
    email: `ok_${Math.random().toString(36).slice(2, 10)}@exemplo.com`,
    senha: 'Senha-forte-123',
    consentiu_pesquisa: true,
    ...extra,
  });
const camposComErro = (res) => res.body.erro.detalhes.map((d) => d.campo);
const SENHA_72_ASCII = 'Ab1!' + 'x'.repeat(68);
const SENHA_72_BYTES = 'Ab1!' + 'é'.repeat(34); // 38 caracteres, 72 bytes

describe('POST /api/auth/cadastro', () => {
  test('cria usuário comum, devolve token e nunca devolve o hash da senha', async () => {
    const res = await cadastro({ nome: '  Ana Souza  ' }).expect(201);
    assert.ok(res.body.token);
    assert.equal(res.body.usuario.nome, 'Ana Souza');
    assert.equal(res.body.usuario.papel, 'usuario');
    assert.equal(res.body.usuario.pontuacao_total, 0);
    for (const campo of ['senha_hash', 'senha_alterada_em', 'ativo']) {
      assert.equal(res.body.usuario[campo], undefined, campo);
    }
    const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [res.body.usuario.id]);
    assert.match(rows[0].senha_hash, /^\$2b\$/);
  });

  test('token do cadastro e do login valem 7 dias (JWT_EXPIRA_EM padrão)', async () => {
    const SETE_DIAS = 7 * 24 * 60 * 60;
    const dados = { apelido: `exp_${Math.random().toString(36).slice(2, 10)}` };
    const cadastrado = (await cadastro(dados).expect(201)).body;
    const login = (
      await post('/api/auth/login', { identificador: dados.apelido, senha: 'Senha-forte-123' }).expect(200)
    ).body;
    for (const { token, usuario } of [cadastrado, login]) {
      const { exp, iat, sub } = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
      assert.equal(exp - iat, SETE_DIAS);
      assert.equal(sub, usuario.id);
    }
  });

  test('recusa nome com quebra de linha ou caractere invisível (phishing no e-mail), sem criar a conta', async () => {
    const email = `phish_${Math.random().toString(36).slice(2, 10)}@exemplo.com`;
    const nomes = [
      'Ana.\n\nSua conta foi bloqueada. Regularize em https://x.example',
      'Ana\r\nBia',
      'Ana\u0000',
      'Ana\u202Eetla',
    ];
    for (const nome of nomes) {
      const res = await cadastro({ nome, email }).expect(400);
      assert.deepEqual(camposComErro(res), ['nome'], JSON.stringify(nome));
    }
    const { rows } = await pool.query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
    assert.equal(rows.length, 0);
    await cadastro({ nome: 'Ana Conceição', email }).expect(201);
  });

  test('aceita apelido com ponto, hífen e sublinhado nos limites de 3 e 30', async () => {
    await cadastro({ apelido: 'a.b' }).expect(201);
    await cadastro({ apelido: 'x'.repeat(28) + '-_' }).expect(201);
  });

  test('recusa apelidos fora do padrão', async () => {
    for (const apelido of ['ab', 'x'.repeat(31), 'com espaço', 'acentuação', 'emoji🙂', 'a/b']) {
      const res = await cadastro({ apelido }).expect(400);
      assert.deepEqual(camposComErro(res), ['apelido'], apelido);
    }
  });

  test('recusa senha com menos de 8 ou mais de 72 caracteres, e aceita 8 exatos', async () => {
    const curta = await cadastro({ senha: 'Abcde1!' }).expect(400);
    assert.deepEqual(curta.body.erro.detalhes, [
      { campo: 'senha', mensagem: 'A senha precisa de pelo menos 8 caracteres' },
    ]);
    const longa = await cadastro({ senha: SENHA_72_ASCII + 'x' }).expect(400);
    assert.match(longa.body.erro.detalhes[0].mensagem, /Senha muito longa/);
    await cadastro({ senha: SENHA_72_ASCII }).expect(201);
    // Limite em bytes (o bcrypt ignora o que passa de 72): com acento, 39 caracteres já são 73 bytes.
    await cadastro({ senha: SENHA_72_BYTES + 'A' }).expect(400);
    await cadastro({ senha: SENHA_72_BYTES }).expect(201);
    await cadastro({ senha: 'Abcdef1!' }).expect(201);
  });

  test('recusa senha sem cada requisito ou com emoji, com a mensagem no campo senha', async () => {
    for (const [senha, mensagem] of [
      ['abcdef1!', 'A senha precisa de uma letra maiúscula'],
      ['ABCDEF1!', 'A senha precisa de uma letra minúscula'],
      ['Abcdefg!', 'A senha precisa de um número'],
      ['Abcdefg1', 'A senha precisa de um caractere especial'],
      ['Abcdef1!🔒', 'A senha não pode ter emoji nem caracteres invisíveis'],
    ]) {
      const res = await cadastro({ senha }).expect(400);
      assert.deepEqual(res.body.erro.detalhes, [{ campo: 'senha', mensagem }], senha);
    }
  });

  test('aceita aspas, aspas simples e barra invertida, e o login com ela funciona', async () => {
    const senha = `Ab1"'\\'; DROP TABLE usuarios; --`;
    const u = await novoUsuario({ senha });
    await post('/api/auth/login', { identificador: u.email, senha }).expect(200);
    await post('/api/auth/login', { identificador: u.email, senha: senha.replaceAll('\\', '') }).expect(401);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM usuarios');
    assert.ok(rows[0].n > 0);
  });

  test('usuário com senha antiga fraca (anterior à regra) ainda faz login', async () => {
    const u = await novoUsuario();
    const fraca = '12345678';
    await pool.query('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [
      u.usuario.id,
      await bcrypt.hash(fraca, 4),
    ]);
    const res = await post('/api/auth/login', { identificador: u.email, senha: fraca }).expect(200);
    assert.ok(res.body.token);
  });

  test('recusa e-mail inválido e nome curto, apontando cada campo', async () => {
    const res = await cadastro({ email: 'nao-e-email', nome: 'A' }).expect(400);
    assert.deepEqual(camposComErro(res).sort(), ['email', 'nome']);
  });

  test('corpo vazio, ausente ou com tipos errados dá 400', async () => {
    await post('/api/auth/cadastro', {}).expect(400);
    await request(app).post('/api/auth/cadastro').expect(400);
    await cadastro({ senha: 12345678 }).expect(400);
  });

  test('e-mail e apelido duplicados (ignorando maiúsculas) dão 409 com mensagem específica', async () => {
    const u = await novoUsuario();
    const email = await cadastro({ email: u.email.toUpperCase() }).expect(409);
    assert.equal(email.body.erro.mensagem, 'Este e-mail já está cadastrado');
    const apelido = await cadastro({ apelido: u.apelido.toUpperCase() }).expect(409);
    assert.equal(apelido.body.erro.mensagem, 'Este apelido já está em uso');
  });

  test('dois cadastros iguais em paralelo: um cria, o outro dá 409', async () => {
    const dados = { apelido: 'corrida', email: 'corrida@exemplo.com' };
    const r = await Promise.all([cadastro(dados), cadastro(dados)]);
    assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
  });

  test('ignora tentativa de se cadastrar como admin ou com pontos', async () => {
    const res = await cadastro({ papel: 'admin', pontuacao_total: 999 }).expect(201);
    assert.equal(res.body.usuario.papel, 'usuario');
    assert.equal(res.body.usuario.pontuacao_total, 0);
  });
});

describe('POST /api/auth/login', () => {
  test('entra com e-mail ou apelido, sem diferenciar maiúsculas', async () => {
    const u = await novoUsuario();
    for (const identificador of [u.email, u.email.toUpperCase(), u.apelido, u.apelido.toUpperCase()]) {
      const res = await post('/api/auth/login', { identificador, senha: u.senha }).expect(200);
      assert.equal(res.body.usuario.id, u.usuario.id);
      assert.equal(jwt.verify(res.body.token, JWT_SECRET).sub, u.usuario.id);
    }
  });

  test('senha errada e usuário inexistente dão a mesma resposta 401', async () => {
    const u = await novoUsuario();
    const errada = await post('/api/auth/login', { identificador: u.email, senha: 'errada!!' }).expect(401);
    const inexistente = await post('/api/auth/login', { identificador: 'ninguem', senha: 'x' }).expect(401);
    assert.deepEqual(errada.body, inexistente.body);
    assert.equal(errada.body.erro.codigo, 'CREDENCIAIS_INVALIDAS');
  });

  test('senha diferencia maiúsculas', async () => {
    const u = await novoUsuario({ senha: 'SenhaForte123!' });
    await post('/api/auth/login', { identificador: u.email, senha: 'senhaforte123!' }).expect(401);
  });

  test('usuário desativado não entra', async () => {
    const u = await novoUsuario();
    await pool.query('UPDATE usuarios SET ativo = false WHERE id = $1', [u.usuario.id]);
    await post('/api/auth/login', { identificador: u.email, senha: u.senha }).expect(401);
  });

  test('campos vazios ou ausentes dão 400', async () => {
    await post('/api/auth/login', { identificador: '', senha: '' }).expect(400);
    await post('/api/auth/login', { identificador: 'x' }).expect(400);
  });

  test('hash gravado com outro custo do bcrypt continua entrando (baixar BCRYPT_CUSTO não invalida senhas)', async () => {
    const u = await novoUsuario();
    await pool.query('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [
      u.usuario.id,
      await bcrypt.hash(u.senha, 6),
    ]);
    await post('/api/auth/login', { identificador: u.email, senha: u.senha }).expect(200);
    await post('/api/auth/login', { identificador: u.email, senha: 'Outra-senha-123' }).expect(401);
  });

  test('tentativa de injeção SQL no identificador só falha o login', async () => {
    await post('/api/auth/login', { identificador: "' OR '1'='1", senha: "' OR '1'='1" }).expect(401);
  });
});

describe('GET /api/auth/me e o middleware autenticar', () => {
  test('devolve o próprio usuário', async () => {
    const u = await novoUsuario();
    const res = await u.api('get', '/api/auth/me').expect(200);
    assert.equal(res.body.id, u.usuario.id);
    assert.equal(res.body.ativo, undefined);
  });

  test('sem header, com esquema errado ou token vazio dá 401', async () => {
    await request(app).get('/api/auth/me').expect(401);
    await request(app).get('/api/auth/me').set('Authorization', 'Basic abc').expect(401);
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer').expect(401);
  });

  test('token com assinatura errada, expirado ou com algoritmo none dá 401', async () => {
    const u = await novoUsuario();
    const payload = jwt.decode(u.token);
    const tokens = [
      jwt.sign({ sv: payload.sv }, 'outro-segredo-com-mais-de-32-caracteres!!', { subject: payload.sub }),
      jwt.sign({ sv: payload.sv }, JWT_SECRET, { subject: payload.sub, expiresIn: -10 }),
      jwt.sign({ sv: payload.sv, sub: payload.sub }, null, { algorithm: 'none' }),
    ];
    for (const token of tokens) {
      const res = await autenticado(token)('get', '/api/auth/me').expect(401);
      assert.equal(res.body.erro.mensagem, 'Sessão expirada. Faça login novamente');
    }
  });

  test('token de usuário apagado ou desativado dá 401', async () => {
    const apagado = await novoUsuario();
    await pool.query('DELETE FROM usuarios WHERE id = $1', [apagado.usuario.id]);
    await apagado.api('get', '/api/auth/me').expect(401);

    const desativado = await novoUsuario();
    await pool.query('UPDATE usuarios SET ativo = false WHERE id = $1', [desativado.usuario.id]);
    await desativado.api('get', '/api/auth/me').expect(401);
  });

  test('token assinado com sub que não é uuid ou sem sub dá 401 (não 500)', async () => {
    await autenticado(jwt.sign({ sv: 0 }, JWT_SECRET, { subject: 'nao-e-uuid' }))(
      'get',
      '/api/auth/me',
    ).expect(401);
    await autenticado(jwt.sign({ sv: 0 }, JWT_SECRET))('get', '/api/auth/me').expect(401);
  });

  test('token com versão de senha diferente dá 401', async () => {
    const u = await novoUsuario();
    const { sub } = jwt.decode(u.token);
    await autenticado(jwt.sign({ sv: 1 }, JWT_SECRET, { subject: sub }))('get', '/api/auth/me').expect(401);
  });

  test('mudança de papel vale na hora, sem novo login', async () => {
    const u = await novoUsuario();
    await u.api('get', '/api/admin/estatisticas').expect(403);
    await pool.query("UPDATE usuarios SET papel = 'admin' WHERE id = $1", [u.usuario.id]);
    await u.api('get', '/api/admin/estatisticas').expect(200);
  });
});

describe('recuperação de senha', () => {
  test('resposta é igual para e-mail cadastrado e não cadastrado', async () => {
    const u = await novoUsuario();
    capturarEmail();
    const inexistente = await post('/api/auth/esqueci-senha', { email: 'nao@existe.com' }).expect(200);
    const real = await post('/api/auth/esqueci-senha', { email: u.email }).expect(200);
    assert.deepEqual(inexistente.body, real.body);
    assert.equal(
      real.body.mensagem,
      'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha. Não encontrou? Verifique a caixa de spam',
    );
  });

  test('e-mail inválido dá 400', async () => {
    await post('/api/auth/esqueci-senha', { email: 'x' }).expect(400);
    await post('/api/auth/esqueci-senha', {}).expect(400);
  });

  test('usuário desativado não recebe e-mail', async () => {
    const u = await novoUsuario();
    await pool.query('UPDATE usuarios SET ativo = false WHERE id = $1', [u.usuario.id]);
    let enviado = false;
    require('../../src/lib/mailer').enviarEmail = async () => (enviado = true);
    await post('/api/auth/esqueci-senha', { email: u.email }).expect(200);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(enviado, false);
  });

  test('e-mail tem link com token e só o hash vai para o banco', async () => {
    const u = await novoUsuario();
    const email = capturarEmail();
    await post('/api/auth/esqueci-senha', { email: u.email.toUpperCase() }).expect(200);
    const { mensagem, token } = await email;
    assert.equal(mensagem.para, u.email);
    assert.match(mensagem.texto, /redefinir-senha\?token=/);
    assert.match(mensagem.texto, /^Olá\.\n/);
    assert.ok(!mensagem.texto.includes(u.nome), 'o nome (texto livre do usuário) não vai no e-mail');
    const { rows } = await pool.query(
      'SELECT token_hash FROM tokens_recuperacao_senha WHERE usuario_id = $1',
      [u.usuario.id],
    );
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].token_hash, token);
    assert.equal(rows[0].token_hash.length, 64);
  });

  test('fluxo completo: troca a senha, token é de uso único e JWT antigo cai', async () => {
    const u = await novoUsuario();
    const email = capturarEmail();
    await post('/api/auth/esqueci-senha', { email: u.email }).expect(200);
    const { token } = await email;

    await post('/api/auth/redefinir-senha', { token, senha: 'Nova-senha-456' }).expect(204);
    const reuso = await post('/api/auth/redefinir-senha', { token, senha: 'Outra-senha-789' }).expect(400);
    assert.equal(reuso.body.erro.codigo, 'TOKEN_INVALIDO');

    await u.api('get', '/api/auth/me').expect(401);
    await post('/api/auth/login', { identificador: u.email, senha: u.senha }).expect(401);
    await post('/api/auth/login', { identificador: u.email, senha: 'Nova-senha-456' }).expect(200);
  });

  test('senha nova sem maiúscula ou com emoji dá 400 no campo senha sem gastar o token; aspas e barra entram', async () => {
    const u = await novoUsuario();
    const email = capturarEmail();
    await post('/api/auth/esqueci-senha', { email: u.email }).expect(200);
    const { token } = await email;

    for (const [senha, mensagem] of [
      ['nova-senha-456', 'A senha precisa de uma letra maiúscula'],
      ['Nova-senha-456👍🏽', 'A senha não pode ter emoji nem caracteres invisíveis'],
    ]) {
      const res = await post('/api/auth/redefinir-senha', { token, senha }).expect(400);
      assert.equal(res.body.erro.codigo, 'VALIDACAO');
      assert.deepEqual(res.body.erro.detalhes, [{ campo: 'senha', mensagem }], senha);
    }
    await u.api('get', '/api/auth/me').expect(200);

    const senha = `Nova"senha'\\456`;
    await post('/api/auth/redefinir-senha', { token, senha }).expect(204);
    await post('/api/auth/login', { identificador: u.email, senha }).expect(200);
    await post('/api/auth/login', { identificador: u.email, senha: u.senha }).expect(401);
  });

  test('pedir de novo invalida o link anterior', async () => {
    const u = await novoUsuario();
    let email = capturarEmail();
    await post('/api/auth/esqueci-senha', { email: u.email });
    const primeiro = (await email).token;
    email = capturarEmail();
    await post('/api/auth/esqueci-senha', { email: u.email });
    const segundo = (await email).token;

    await post('/api/auth/redefinir-senha', { token: primeiro, senha: 'Nova-senha-456' }).expect(400);
    await post('/api/auth/redefinir-senha', { token: segundo, senha: 'Nova-senha-456' }).expect(204);
  });

  test('token expirado é recusado', async () => {
    const u = await novoUsuario();
    const email = capturarEmail();
    await post('/api/auth/esqueci-senha', { email: u.email });
    const { token } = await email;
    await pool.query(
      "UPDATE tokens_recuperacao_senha SET expira_em = now() - interval '1 second' WHERE usuario_id = $1",
      [u.usuario.id],
    );
    await post('/api/auth/redefinir-senha', { token, senha: 'Nova-senha-456' }).expect(400);
  });

  test('token inventado, curto demais ou senha fraca dão erro', async () => {
    await post('/api/auth/redefinir-senha', { token: 'x'.repeat(43), senha: 'Nova-senha-456' }).expect(400);
    const curto = await post('/api/auth/redefinir-senha', { token: 'abc', senha: 'Nova-senha-456' }).expect(
      400,
    );
    assert.equal(curto.body.erro.codigo, 'VALIDACAO');
    await post('/api/auth/redefinir-senha', { token: 'x'.repeat(43), senha: '123' }).expect(400);
    const longa = await post('/api/auth/redefinir-senha', {
      token: 'x'.repeat(43),
      senha: SENHA_72_BYTES + 'A',
    }).expect(400);
    assert.equal(longa.body.erro.codigo, 'VALIDACAO');
  });

  test('falha no envio do e-mail não quebra a resposta', async () => {
    const u = await novoUsuario();
    const mailer = require('../../src/lib/mailer');
    const { mock } = require('node:test');
    const erroLog = mock.method(console, 'error', () => {});
    let chamado;
    const chamou = new Promise((r) => (chamado = r));
    mailer.enviarEmail = async () => {
      chamado();
      throw new Error('SMTP fora do ar');
    };
    await post('/api/auth/esqueci-senha', { email: u.email }).expect(200);
    await chamou;
    await new Promise((r) => setImmediate(r));
    assert.ok(erroLog.mock.calls.some((c) => c.arguments[0].includes('falha ao enviar e-mail')));
    erroLog.mock.restore();
  });
});
