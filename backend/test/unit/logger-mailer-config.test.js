const { DATABASE_URL, JWT_SECRET } = require('../env');
const { describe, test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { rodarNode } = require('../ajuda');

const SRC = path.join(__dirname, '..', '..', 'src');
afterEach(() => mock.restoreAll());

describe('logger', () => {
  const logger = require('../../src/lib/logger');

  test('em teste, info e warn ficam em silêncio', () => {
    const log = mock.method(console, 'log', () => {});
    logger.info('x');
    logger.warn('y');
    assert.equal(log.mock.callCount(), 0);
  });

  test('error escreve uma linha JSON com a stack do erro', () => {
    const err = mock.method(console, 'error', () => {});
    logger.error('falhou', { erro: new Error('boom'), extra: 1 });
    const linha = JSON.parse(err.mock.calls[0].arguments[0]);
    assert.equal(linha.nivel, 'error');
    assert.equal(linha.mensagem, 'falhou');
    assert.equal(linha.extra, 1);
    assert.match(linha.erro, /Error: boom/);
    assert.ok(!Number.isNaN(Date.parse(linha.t)));
  });

  test('error sem extra funciona', () => {
    const err = mock.method(console, 'error', () => {});
    logger.error('só mensagem');
    assert.equal(JSON.parse(err.mock.calls[0].arguments[0]).mensagem, 'só mensagem');
  });

  test('fora de teste, info e warn vão para console.log', () => {
    const log = mock.method(console, 'log', () => {});
    process.env.NODE_ENV = 'development';
    try {
      logger.info('oi', { a: 1 });
      logger.warn('cuidado');
    } finally {
      process.env.NODE_ENV = 'test';
    }
    assert.equal(log.mock.callCount(), 2);
    assert.equal(JSON.parse(log.mock.calls[0].arguments[0]).a, 1);
    assert.equal(JSON.parse(log.mock.calls[1].arguments[0]).nivel, 'warn');
  });
});

describe('mailer', () => {
  // Carrega mailer/config de novo com outro ambiente e um nodemailer falso.
  function carregarMailer(env) {
    const salvo = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
    Object.assign(process.env, env);
    const restaurarAmbiente = () => {
      for (const [k, v] of Object.entries(salvo)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    };
    const enviados = [];
    const opcoesTransporte = [];
    const caminhoNodemailer = require.resolve('nodemailer', { paths: [SRC] });
    const original = require.cache[caminhoNodemailer];
    require.cache[caminhoNodemailer] = {
      id: caminhoNodemailer,
      filename: caminhoNodemailer,
      loaded: true,
      exports: {
        createTransport: (opcoes) => {
          opcoesTransporte.push(opcoes);
          return { sendMail: async (m) => enviados.push(m) };
        },
      },
    };
    for (const m of ['config.js', 'lib/mailer.js']) delete require.cache[path.join(SRC, m)];
    try {
      return { mailer: require('../../src/lib/mailer'), enviados, opcoesTransporte };
    } finally {
      restaurarAmbiente();
      if (original) require.cache[caminhoNodemailer] = original;
      else delete require.cache[caminhoNodemailer];
      for (const m of ['config.js', 'lib/mailer.js']) delete require.cache[path.join(SRC, m)];
    }
  }

  test('sem SMTP, só registra no log e não lança', async () => {
    const { mailer, opcoesTransporte } = carregarMailer({ SMTP_HOST: '' });
    await mailer.enviarEmail({ para: 'a@b.com', assunto: 'x', texto: 'y' });
    assert.equal(opcoesTransporte.length, 0);
  });

  test('com SMTP, envia com remetente configurado', async () => {
    const { mailer, enviados, opcoesTransporte } = carregarMailer({
      SMTP_HOST: 'smtp.exemplo.com',
      SMTP_PORT: '587',
      SMTP_USER: 'usuario',
      SMTP_SENHA: 'senha',
      SMTP_REMETENTE: 'App <no-reply@exemplo.com>',
    });
    await mailer.enviarEmail({ para: 'a@b.com', assunto: 'Assunto', texto: 'Corpo' });
    assert.deepEqual(opcoesTransporte[0], {
      host: 'smtp.exemplo.com',
      port: 587,
      secure: false,
      auth: { user: 'usuario', pass: 'senha' },
    });
    assert.deepEqual(enviados[0], {
      from: 'App <no-reply@exemplo.com>',
      to: 'a@b.com',
      subject: 'Assunto',
      text: 'Corpo',
    });
  });

  test('porta 465 usa TLS direto e sem usuário não manda auth', () => {
    const { opcoesTransporte } = carregarMailer({ SMTP_HOST: 'smtp.x.com', SMTP_PORT: '465', SMTP_USER: '' });
    assert.equal(opcoesTransporte[0].secure, true);
    assert.equal(opcoesTransporte[0].auth, undefined);
  });

  test('produção sem SMTP avisa no log e não registra o texto (link de redefinição)', async () => {
    const log = mock.method(console, 'log', () => {});
    const erro = mock.method(console, 'error', () => {});
    process.env.NODE_ENV = 'production';
    let mailer;
    try {
      ({ mailer } = carregarMailer({ NODE_ENV: 'production', SMTP_HOST: '' }));
    } finally {
      process.env.NODE_ENV = 'test';
    }
    await mailer.enviarEmail({ para: 'a@b.com', assunto: 'x', texto: 'token-secreto' });
    const linhas = [...log.mock.calls, ...erro.mock.calls].map((c) => String(c.arguments[0]));
    log.mock.restore();
    erro.mock.restore();
    assert.ok(linhas.some((l) => l.includes('SMTP não configurado')));
    assert.ok(linhas.every((l) => !l.includes('token-secreto')));
  });
});

describe('config', () => {
  const lerConfig = (env) =>
    rodarNode(['-e', "console.log(JSON.stringify(require('./src/config')))"], {
      NODE_ENV: '',
      PORT: '',
      APP_URL: '',
      SMTP_HOST: '',
      BCRYPT_CUSTO: '',
      DATABASE_URL,
      JWT_SECRET,
      ...env,
    });

  test('aplica padrões quando variáveis estão vazias', async () => {
    const { codigo, saida } = await lerConfig({});
    assert.equal(codigo, 0);
    const config = JSON.parse(saida);
    assert.equal(config.NODE_ENV, 'development');
    assert.equal(config.PORT, 4000);
    assert.equal(config.BCRYPT_CUSTO, 12);
    assert.equal(config.JWT_EXPIRA_EM, '7d');
    assert.equal(config.SMTP_HOST, undefined);
  });

  test('converte números vindos do ambiente', async () => {
    const config = JSON.parse((await lerConfig({ PORT: '8080', SMTP_PORT: '465' })).saida);
    assert.equal(config.PORT, 8080);
    assert.equal(config.SMTP_PORT, 465);
  });

  test('falha no boot sem DATABASE_URL', async () => {
    const { codigo, saida } = await lerConfig({ DATABASE_URL: '' });
    assert.equal(codigo, 1);
    assert.match(saida, /Configuração inválida[\s\S]*DATABASE_URL/);
  });

  test('falha no boot com JWT_SECRET curto', async () => {
    const { codigo, saida } = await lerConfig({ JWT_SECRET: 'curto' });
    assert.equal(codigo, 1);
    assert.match(saida, /JWT_SECRET precisa de pelo menos 32 caracteres/);
  });

  test('falha com NODE_ENV desconhecido, APP_URL inválida ou BCRYPT_CUSTO fora da faixa', async () => {
    for (const env of [{ NODE_ENV: 'staging' }, { APP_URL: 'nao-e-url' }, { BCRYPT_CUSTO: '20' }]) {
      assert.equal((await lerConfig(env)).codigo, 1, JSON.stringify(env));
    }
  });
});
