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
      assert.match(migracao.saida, /"nome":"003_aulas_lgpd_substituidas.sql"/);
      const env = { DATABASE_URL: url.href, NODE_ENV: 'development' };
      const importacao = await rodarNode(['src/scripts/importar-aulas.js'], env);
      assert.equal(importacao.codigo, 0, importacao.saida);
      assert.match(importacao.saida, /✓ 15 aula\(s\): 15 nova\(s\), 0 atualizada\(s\), 0 sem mudança/);
      const repetida = await rodarNode(['src/scripts/importar-aulas.js'], env);
      assert.match(repetida.saida, /0 nova\(s\), 0 atualizada\(s\), 15 sem mudança/);
      const seed = await rodarNode(['src/db/seed.js'], env);
      assert.match(seed.saida, /"mensagem":"seed aplicado","trivia":180/);
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

  test('login bloqueia a 11ª tentativa na mesma conta em 15 minutos, com mensagem padrão', async () => {
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

  test('login: outra conta no mesmo IP (turma atrás do NAT) e a mesma conta em outro IP seguem liberadas', async () => {
    const { saida } = await rodarComLimite(`
      const login = (identificador, ip = '10.0.3.1') =>
        request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ identificador, senha: 'y' });
      for (let i = 0; i < 10; i++) await login('conta');
      const r = {
        mesmaConta: (await login('conta')).status,
        maiusculas: (await login('CONTA')).status,
        outraConta: (await login('outra')).status,
        outroIp: (await login('conta', '10.0.3.2')).status,
      };
      console.log('RESULTADO', JSON.stringify(r));
    `);
    assert.deepEqual(resultado(saida), { mesmaConta: 429, maiusculas: 429, outraConta: 401, outroIp: 401 });
  });

  test('conta bloqueada: variantes "marİa" ou NFD não dão tentativas extras de senha', async () => {
    // Acento (para a NFD mudar algo) e um "i" (para as variantes com İ e ponto combinante).
    const u = await novoUsuario({ apelido: `joãomaria${process.pid}` });
    const { saida } = await rodarComLimite(`
      const login = (identificador, senha = 'errada') => request(app).post('/api/auth/login')
        .set('X-Forwarded-For', '10.0.8.1').send({ identificador, senha });
      for (let i = 0; i < 10; i++) await login('${u.apelido}');
      const apelido = '${u.apelido}';
      const pontoAcima = String.fromCharCode(0x307);
      const r = {
        bloqueada: (await login(apelido, '${u.senha}')).status,
        comIPontuado: (await login(apelido.replace('i', String.fromCharCode(0x130)), '${u.senha}')).status,
        comCombinante: (await login(apelido.replace('i', 'i' + pontoAcima), '${u.senha}')).status,
        maiusculas: (await login(apelido.toUpperCase(), '${u.senha}')).status,
        nfd: (await login(apelido.normalize('NFD'), '${u.senha}')).status,
        espacos: (await login('  ' + apelido + ' ', '${u.senha}')).status,
      };
      console.log('RESULTADO', JSON.stringify(r));
    `);
    // İ e ponto combinante nunca chegam a conferir a senha (400 na validação); maiúsculas, NFD e
    // espaços nas pontas caem na mesma chave do limite e seguem bloqueadas.
    assert.deepEqual(resultado(saida), {
      bloqueada: 429,
      comIPontuado: 400,
      comCombinante: 400,
      maiusculas: 429,
      nfd: 429,
      espacos: 429,
    });
  });

  test('teto de 100 por IP soma cadastro, login e redefinição; outro IP segue liberado', async () => {
    const { saida } = await rodarComLimite(`
      const post = (rota, corpo, ip = '10.0.4.1') =>
        request(app).post('/api/auth/' + rota).set('X-Forwarded-For', ip).send(corpo);
      const antes = new Set();
      for (let i = 0; i < 50; i++) antes.add((await post('cadastro', {})).status);
      for (let i = 0; i < 50; i++) antes.add((await post('login', { identificador: 'c' + i })).status);
      const r = {
        antes: [...antes],
        redefinir: (await post('redefinir-senha', {})).status,
        cadastro: (await post('cadastro', {})).status,
        outroIp: (await post('cadastro', {}, '10.0.4.2')).status,
      };
      console.log('RESULTADO', JSON.stringify(r));
    `);
    assert.deepEqual(resultado(saida), { antes: [400], redefinir: 429, cadastro: 429, outroIp: 400 });
  });

  test('esqueci-senha: 30 por IP (turma atrás do NAT); 31º recebe 429', async () => {
    const { saida } = await rodarComLimite(`
      const status = [];
      for (let i = 0; i < 31; i++) {
        status.push((await request(app).post('/api/auth/esqueci-senha').set('X-Forwarded-For', '10.0.6.1')
          .send({ email: 'ip' + i + '@x.com' })).status);
      }
      const outroIp = (await request(app).post('/api/auth/esqueci-senha').set('X-Forwarded-For', '10.0.6.2')
        .send({ email: 'ip0@x.com' })).status;
      console.log('RESULTADO', JSON.stringify({ status, outroIp }));
    `);
    const { status, outroIp } = resultado(saida);
    assert.deepEqual(status.slice(0, 30), Array(30).fill(200), 'o 4º pedido do mesmo IP passa');
    assert.equal(status[30], 429);
    assert.equal(outroIp, 200);
  });

  test('esqueci-senha: estourado o limite do e-mail, responde o mesmo 200 sem enviar (terceiro não trava a vítima)', async () => {
    const u = await novoUsuario();
    const misturada = [...u.email].map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('');
    const { saida } = await rodarComLimite(`
      const mailer = require('./src/lib/mailer');
      let enviados = 0;
      mailer.enviarEmail = async () => { enviados++; };
      const respostas = [];
      // Grafias diferentes do mesmo e-mail somam no mesmo contador.
      const grafias = ['${u.email}', '${u.email.toUpperCase()}', '${misturada}', '${u.email}'];
      for (let i = 0; i < 4; i++) {
        const res = await request(app).post('/api/auth/esqueci-senha')
          .set('X-Forwarded-For', '10.0.0.' + (i + 10)).send({ email: grafias[i] });
        respostas.push([res.status, res.body.mensagem]);
      }
      // Espaços nas pontas não abrem cota nova: o zod recusa (400), e nada é enviado.
      const comEspaco = (await request(app).post('/api/auth/esqueci-senha')
        .set('X-Forwarded-For', '10.0.0.20').send({ email: ' ${u.email} ' })).status;
      const semEmail = (await request(app).post('/api/auth/esqueci-senha')
        .set('X-Forwarded-For', '10.0.1.1').send({})).status;
      await new Promise((r) => setTimeout(r, 100));
      console.log('RESULTADO', JSON.stringify({ respostas, enviados, comEspaco, semEmail }));
    `);
    const { respostas, enviados, comEspaco, semEmail } = resultado(saida);
    assert.deepEqual(
      respostas.map(([status]) => status),
      [200, 200, 200, 200],
    );
    assert.equal(new Set(respostas.map(([, mensagem]) => mensagem)).size, 1, 'mesma mensagem genérica');
    assert.equal(enviados, 3);
    // Total de tokens, não só os válidos: cada pedido invalida o anterior, então um 4º token (sem
    // e-mail) também deixaria só 1 válido, mas mataria o último link enviado.
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM tokens_recuperacao_senha WHERE usuario_id = $1',
      [u.usuario.id],
    );
    assert.equal(rows[0].n, 3, 'o 4º pedido não gerou token (nem invalidou o último link enviado)');
    assert.equal(comEspaco, 400);
    assert.equal(semEmail, 400, 'corpo sem e-mail passa pelo limite e cai na validação');
  });

  test('sessões, eventos, visitas de aula e rodadas: 60 por minuto por usuário; outro usuário no mesmo IP segue liberado', async () => {
    const [a, b] = [await novoUsuario(), await novoUsuario()];
    const { rows } = await pool.query('SELECT id FROM aulas WHERE ativo ORDER BY ordem LIMIT 1');
    const { saida } = await rodarComLimite(`
      const post = (token, url) => request(app).post(url).set('X-Forwarded-For', '10.0.5.1')
        .set('Authorization', 'Bearer ' + token);
      const r = {};
      // Sem corpo: eventos e rodadas caem na validação (400), mas passam pelo limite antes.
      const urls = ['/api/sessoes', '/api/eventos', '/api/aulas/${rows[0].id}/visitas', '/api/trivia/rodadas'];
      for (const url of urls) {
        const status = new Set();
        for (let i = 0; i < 60; i++) status.add((await post('${a.token}', url)).status);
        const bloqueada = await post('${a.token}', url);
        r[url.split('/')[2]] = {
          antes: [...status],
          bloqueada: [bloqueada.status, bloqueada.body.erro?.codigo],
          outroUsuario: (await post('${b.token}', url)).status,
        };
      }
      console.log('RESULTADO', JSON.stringify(r));
    `);
    const esperado = (ok) => ({ antes: [ok], bloqueada: [429, 'MUITAS_REQUISICOES'], outroUsuario: ok });
    assert.deepEqual(resultado(saida), {
      sessoes: esperado(201),
      eventos: esperado(400),
      aulas: esperado(201),
      trivia: esperado(400),
    });
  });

  test('rotas autenticadas: 300 por minuto por usuário; a 301ª dá 429 e outro usuário segue liberado', async () => {
    const [a, b] = [await novoUsuario(), await novoUsuario()];
    const { saida } = await rodarComLimite(`
      const get = (token) => request(app).get('/api/perfil').set('X-Forwarded-For', '10.0.7.1')
        .set('Authorization', 'Bearer ' + token);
      const status = new Set();
      for (let i = 0; i < 300; i++) status.add((await get('${a.token}')).status);
      const bloqueada = await get('${a.token}');
      console.log('RESULTADO', JSON.stringify({
        antes: [...status],
        bloqueada: [bloqueada.status, bloqueada.body.erro?.codigo],
        outroUsuario: (await get('${b.token}')).status,
      }));
    `);
    assert.deepEqual(resultado(saida), {
      antes: [200],
      bloqueada: [429, 'MUITAS_REQUISICOES'],
      outroUsuario: 200,
    });
  });

  test('rotas autenticadas mandam os cabeçalhos RateLimit', async () => {
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
