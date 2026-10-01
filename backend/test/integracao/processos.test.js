// Scripts e servidor rodam em processos filhos: cobre os pontos de entrada (require.main) e o boot.
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, prepararBanco, novoUsuario, rodarNode } = require('../ajuda');

before(prepararBanco);
after(() => pool.end());

const BANCO_INVALIDO = { DATABASE_URL: 'postgres://ninguem:errada@127.0.0.1:1/nada' };

describe('npm run promover-admin', () => {
  test('promove pelo e-mail, sem diferenciar maiúsculas', async () => {
    const u = await novoUsuario();
    const { codigo, saida } = await rodarNode(['src/scripts/promover-admin.js', u.email.toUpperCase()]);
    assert.equal(codigo, 0);
    assert.match(saida, new RegExp(`${u.apelido} agora é admin`));
    const { rows } = await pool.query('SELECT papel FROM usuarios WHERE id = $1', [u.usuario.id]);
    assert.equal(rows[0].papel, 'admin');
  });

  test('e-mail inexistente sai com código 1', async () => {
    const { codigo, saida } = await rodarNode(['src/scripts/promover-admin.js', 'ninguem@x.com']);
    assert.equal(codigo, 1);
    assert.match(saida, /Nenhum usuário com o e-mail/);
  });

  test('sem argumento mostra o uso e sai com código 1', async () => {
    const { codigo, saida } = await rodarNode(['src/scripts/promover-admin.js']);
    assert.equal(codigo, 1);
    assert.match(saida, /Uso: npm run promover-admin/);
  });
});

describe('scripts de banco', () => {
  test('migrar e seed pela linha de comando terminam com sucesso', async () => {
    assert.equal((await rodarNode(['src/db/migrar.js'])).codigo, 0);
    assert.equal((await rodarNode(['src/db/seed.js'])).codigo, 0);
  });

  test('banco zerado: migrar cria o schema inteiro e o seed popula', async () => {
    const nome = `migracao_teste_${process.pid}`;
    await pool.query(`DROP DATABASE IF EXISTS ${nome}`);
    await pool.query(`CREATE DATABASE ${nome}`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${nome}`;
    try {
      const migracao = await rodarNode(['src/db/migrar.js'], {
        DATABASE_URL: url.href,
        NODE_ENV: 'development',
      });
      assert.equal(migracao.codigo, 0, migracao.saida);
      assert.match(migracao.saida, /"mensagem":"migração aplicada","nome":"001_schema_inicial.sql"/);
      assert.match(migracao.saida, /"nome":"002_aulas_arquivo_e_pesquisa.sql"/);
      const env = { DATABASE_URL: url.href, NODE_ENV: 'development' };
      const importacao = await rodarNode(['src/scripts/importar-aulas.js'], env);
      assert.equal(importacao.codigo, 0, importacao.saida);
      assert.match(importacao.saida, /✓ 3 aula\(s\): 3 nova\(s\), 0 atualizada\(s\), 0 sem mudança/);
      const repetida = await rodarNode(['src/scripts/importar-aulas.js'], env);
      assert.match(repetida.saida, /0 nova\(s\), 0 atualizada\(s\), 3 sem mudança/);
      const seed = await rodarNode(['src/db/seed.js'], env);
      assert.match(seed.saida, /"mensagem":"seed aplicado","trivia":10/);
    } finally {
      await pool.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
    }
  });

  test('migrar e seed com banco inacessível saem com código 1 e logam o erro', async () => {
    for (const script of ['src/db/migrar.js', 'src/db/seed.js']) {
      const { codigo, saida } = await rodarNode([script], BANCO_INVALIDO);
      assert.equal(codigo, 1, script);
      assert.match(saida, /falha/, script);
    }
  });
});

describe('npm run importar-aulas', () => {
  const { pergunta, aulaHtml, criarConteudo } = require('../conteudo-falso');
  const valido = () => criarConteudo({ '01-ok': { html: aulaHtml() } });
  const invalido = () =>
    criarConteudo({ '01-ruim': { html: aulaHtml({ perguntas: [pergunta({ correta: -1 })] }) } });

  test('--validar sem banco: sucesso e falha com a lista de erros', async () => {
    const semBanco = { DATABASE_URL: '', JWT_SECRET: '' };
    const ok = await rodarNode(['src/scripts/importar-aulas.js', '--validar'], {
      CONTEUDO_DIR: valido(),
      ...semBanco,
    });
    assert.equal(ok.codigo, 0);
    assert.match(ok.saida, /✓ 1 aula\(s\) válidas/);
    const ruim = await rodarNode(['src/scripts/importar-aulas.js', '--validar'], {
      CONTEUDO_DIR: invalido(),
      ...semBanco,
    });
    assert.equal(ruim.codigo, 1);
    assert.match(
      ruim.saida,
      /✗ 01-ruim\/aula\.html: pergunta "p1": precisa de exatamente 1 alternativa com data-correta/,
    );
    assert.match(ruim.saida, /1 erro\(s\) em/);
  });

  test('importar com arquivo inválido sai com código 1 e não grava', async () => {
    const { codigo, saida } = await rodarNode(['src/scripts/importar-aulas.js'], {
      CONTEUDO_DIR: invalido(),
    });
    assert.equal(codigo, 1);
    assert.match(saida, /✗ 01-ruim/);
    const { rows } = await pool.query("SELECT 1 FROM aulas WHERE slug = 'ruim'");
    assert.equal(rows.length, 0);
  });

  test('conflito no banco sai com código 1 e mensagem de falha', async () => {
    const { codigo, saida } = await rodarNode(['src/scripts/importar-aulas.js'], {
      CONTEUDO_DIR: criarConteudo({ '01-conflito-ordem': { html: aulaHtml() } }),
    });
    assert.equal(codigo, 1);
    assert.match(saida, /✗ falha ao gravar/);
  });
});

describe('servidor', () => {
  const subirEParar = (env) =>
    rodarNode(['-e', "require('./src/server'); setTimeout(() => process.emit('SIGTERM'), 1500);"], {
      NODE_ENV: 'development',
      PORT: String(20_000 + Math.floor(Math.random() * 20_000)),
      ...env,
    });

  test('aula inválida não derruba a API: loga os erros e sobe', async () => {
    const { pergunta, aulaHtml, criarConteudo } = require('../conteudo-falso');
    const { codigo, saida } = await subirEParar({
      CONTEUDO_DIR: criarConteudo({
        '01-ruim': { html: aulaHtml({ perguntas: [pergunta({ correta: -1 })] }) },
      }),
    });
    assert.equal(codigo, 0, saida);
    assert.match(saida, /aulas não importadas: corrija os arquivos/);
    assert.match(saida, /"mensagem":"API no ar"/);
  });

  test('conflito com o banco na importação também não derruba a API', async () => {
    const { aulaHtml, criarConteudo } = require('../conteudo-falso');
    const { codigo, saida } = await subirEParar({
      CONTEUDO_DIR: criarConteudo({ '01-outra-ordem-um': { html: aulaHtml() } }),
    });
    assert.equal(codigo, 0, saida);
    assert.match(saida, /aulas não importadas: conflito com o banco/);
    assert.match(saida, /"mensagem":"API no ar"/);
  });

  test('sobe, responde e desliga limpo ao receber SIGTERM', async () => {
    const porta = String(20_000 + Math.floor(Math.random() * 20_000));
    const script = `
      require('./src/server');
      setTimeout(async () => {
        const r = await fetch('http://127.0.0.1:${porta}/api/saude');
        console.log('SAUDE', r.status, JSON.stringify(await r.json()));
        process.emit('SIGTERM');
      }, 1500);
    `;
    const { codigo, saida } = await rodarNode(['-e', script], { PORT: porta, NODE_ENV: 'development' });
    assert.equal(codigo, 0, saida);
    assert.match(
      saida,
      /SAUDE 200 \{"status":"degradado","verificacoes":\{"banco":"ok","smtp":"nao_configurado"\}\}/,
    );
    assert.match(saida, /"mensagem":"API no ar"/);
    assert.match(saida, /"mensagem":"desligando"/);
  });

  test('com banco inacessível não sobe e sai com código 1', async () => {
    const { codigo, saida } = await rodarNode(['src/server.js'], BANCO_INVALIDO);
    assert.equal(codigo, 1);
    assert.match(saida, /falha ao iniciar/);
  });
});

describe('rate limit (desligado em teste, ligado aqui com NODE_ENV=development)', () => {
  const rodarComLimite = (corpo) =>
    rodarNode(
      [
        '-e',
        `const request = require('supertest'); const app = require('./src/app');
         (async () => { ${corpo} })().then(() => process.exit(0), (e) => { console.error(e); process.exit(2); });`,
      ],
      { NODE_ENV: 'development' },
    );
  const resultado = (saida) => JSON.parse(saida.match(/RESULTADO (.*)/)[1]);

  test('login bloqueia a 11ª tentativa em 15 minutos, com mensagem padrão', async () => {
    const { saida } = await rodarComLimite(`
      const r = [];
      for (let i = 0; i < 11; i++) {
        const res = await request(app).post('/api/auth/login').send({ identificador: 'x', senha: 'y' });
        r.push(res.status);
        if (res.status === 429) r.push(res.body.erro.codigo);
      }
      console.log('RESULTADO', JSON.stringify(r));
    `);
    const r = resultado(saida);
    assert.deepEqual(r.slice(0, 10), Array(10).fill(401));
    assert.deepEqual(r.slice(10), [429, 'MUITAS_REQUISICOES']);
  });

  test('esqueci-senha limita por IP e também por e-mail (mesmo trocando de IP)', async () => {
    const { saida } = await rodarComLimite(`
      const porIp = [];
      for (let i = 0; i < 4; i++) {
        porIp.push((await request(app).post('/api/auth/esqueci-senha').send({ email: 'ip' + i + '@x.com' })).status);
      }
      const porEmail = [];
      for (let i = 0; i < 4; i++) {
        porEmail.push((await request(app).post('/api/auth/esqueci-senha')
          .set('X-Forwarded-For', '10.0.0.' + (i + 10)).send({ email: 'Mesmo@X.com' })).status);
      }
      const semEmail = (await request(app).post('/api/auth/esqueci-senha')
        .set('X-Forwarded-For', '10.0.1.1').send({})).status;
      console.log('RESULTADO', JSON.stringify({ porIp, porEmail, semEmail }));
    `);
    const { porIp, porEmail, semEmail } = resultado(saida);
    assert.deepEqual(porIp, [200, 200, 200, 429]);
    assert.deepEqual(porEmail, [200, 200, 200, 429]);
    assert.equal(semEmail, 400, 'corpo sem e-mail passa pelo limite e cai na validação');
  });

  test('rotas autenticadas contam por usuário', async () => {
    const u = await novoUsuario();
    const { saida } = await rodarComLimite(`
      const res = await request(app).get('/api/aulas').set('Authorization', 'Bearer ${u.token}');
      console.log('RESULTADO', JSON.stringify([res.status, res.headers['ratelimit-policy'] ?? res.headers.ratelimit ?? null]));
    `);
    const [status, cabecalho] = resultado(saida);
    assert.equal(status, 200);
    assert.ok(cabecalho, 'cabeçalhos RateLimit presentes');
  });
});
