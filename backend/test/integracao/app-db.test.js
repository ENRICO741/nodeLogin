const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, pool, prepararBanco, novoUsuario } = require('../ajuda');
const { migrar } = require('../../src/db/migrar');
const { semear } = require('../../src/db/seed');
const { transacao, atualizarLinha } = require('../../src/db/pool');
const mailer = require('../../src/lib/mailer');

before(prepararBanco);
after(() => pool.end());

describe('pool', () => {
  test('abre até 20 conexões; as consultas seguintes esperam na fila e terminam', async () => {
    const consultas = Array.from({ length: 22 }, () => pool.query('SELECT pg_sleep(0.3)'));
    await new Promise((resolver) => setTimeout(resolver, 100));
    assert.equal(pool.totalCount, 20);
    assert.equal(pool.waitingCount, 2);
    assert.equal((await Promise.all(consultas)).length, 22);
  });
});

describe('app', () => {
  test('GET /api/saude responde sem login; sem SMTP fica "degradado" (200)', async () => {
    const res = await request(app).get('/api/saude').expect(200);
    assert.deepEqual(res.body, {
      status: 'degradado',
      verificacoes: { banco: 'ok', smtp: 'nao_configurado' },
    });
  });

  test('GET /api/saude: SMTP ok dá "ok"; SMTP recusando login dá "degradado" (200)', async (t) => {
    const verificar = t.mock.method(mailer, 'verificar', async () => true);
    assert.deepEqual((await request(app).get('/api/saude').expect(200)).body, {
      status: 'ok',
      verificacoes: { banco: 'ok', smtp: 'ok' },
    });
    verificar.mock.mockImplementation(async () => false);
    assert.deepEqual((await request(app).get('/api/saude').expect(200)).body, {
      status: 'degradado',
      verificacoes: { banco: 'ok', smtp: 'falha' },
    });
  });

  test('conexão ociosa que cai (banco reiniciou) só vai para o log, sem derrubar a API', (t) => {
    const erro = t.mock.method(console, 'error', () => {});
    pool.emit('error', new Error('terminating connection due to administrator command'));
    assert.ok(
      erro.mock.calls.some((c) => String(c.arguments[0]).includes('conexão ociosa com o banco caiu')),
    );
  });

  test('GET /api/saude com o banco fora dá 503 sem detalhes do erro', async (t) => {
    t.mock.method(pool, 'query', async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1:5432');
    });
    t.mock.method(console, 'error', () => {});
    const res = await request(app).get('/api/saude').expect(503);
    assert.deepEqual(res.body, { status: 'erro', verificacoes: { banco: 'falha', smtp: 'nao_configurado' } });
  });

  test('não expõe X-Powered-By e manda headers de segurança do helmet', async () => {
    const res = await request(app).get('/api/saude');
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.headers['content-security-policy']);
  });

  test('rota inexistente: 401 sem login, 404 com login', async () => {
    await request(app).get('/api/nao-existe').expect(401);
    const u = await novoUsuario();
    const res = await u.api('get', '/api/nao-existe').expect(404);
    assert.equal(res.body.erro.mensagem, 'Rota não encontrada');
  });

  test('fora de /api dá 404', async () => {
    await request(app).get('/qualquer').expect(404);
  });

  test('JSON malformado dá 400 JSON_INVALIDO', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"identificador": ')
      .expect(400);
    assert.equal(res.body.erro.codigo, 'JSON_INVALIDO');
  });

  test('corpo acima de 300 KB dá 413', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identificador: 'x'.repeat(310_000), senha: 'x' })
      .expect(413);
    assert.equal(res.body.erro.codigo, 'MUITO_GRANDE');
  });

  test('charset que o body-parser não conhece dá 415, não 500', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json; charset=latin-9')
      .send('{"identificador":"a","senha":"b"}')
      .expect(415);
    assert.equal(res.body.erro.codigo, 'REQUISICAO_INVALIDA');
    assert.equal(log.mock.callCount(), 0);
  });

  test('NUL (\\u0000) num texto dá 400, não 500', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    const u = await novoUsuario();
    // nome tem validação própria; a bio chega ao banco e o Postgres recusa o NUL.
    const res = await u
      .api('patch', '/api/perfil')
      .send({ bio: 'Olá' + String.fromCharCode(0) + 'mundo' })
      .expect(400);
    assert.equal(res.body.erro.codigo, 'VALIDACAO');
    await u
      .api('patch', '/api/perfil')
      .send({ nome: 'Ana' + String.fromCharCode(0) })
      .expect(400);
    assert.equal(log.mock.callCount(), 0);
  });

  test('Content-Type diferente de JSON é tratado como corpo ausente (400, não 500)', async () => {
    await request(app).post('/api/auth/login').set('Content-Type', 'text/plain').send('oi').expect(400);
  });
});

describe('banco', () => {
  test('migrar de novo não reaplica nada', async () => {
    const antes = (await pool.query('SELECT nome FROM migracoes ORDER BY nome')).rows;
    await migrar();
    const depois = (await pool.query('SELECT nome FROM migracoes ORDER BY nome')).rows;
    assert.deepEqual(depois, antes);
    assert.ok(antes.some((m) => m.nome === '001_schema_inicial.sql'));
  });

  test('migração 004: "Guardião de Dados" vira "Graduado" e quem tinha continua com ela', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const sql = fs.readFileSync(
      path.join(__dirname, '../../src/db/migrations/004_mais_conquistas.sql'),
      'utf8',
    );
    const renomear = sql.match(/UPDATE badges[^;]+;/)[0];
    const u = await novoUsuario();
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Volta o banco ao estado de antes da 004 só dentro desta transação (desfeita no fim).
      await c.query('ALTER TABLE badges DROP CONSTRAINT badges_tipo_criterio_check');
      await c.query("UPDATE badges SET nome = 'Outro' WHERE nome = 'Graduado'");
      const {
        rows: [antigo],
      } = await c.query(
        "INSERT INTO badges (nome, descricao, tipo_criterio) VALUES ('Guardião de Dados', 'Concluiu todas as aulas.', 'todas_aulas') RETURNING id",
      );
      await c.query('INSERT INTO usuario_badges (usuario_id, badge_id) VALUES ($1, $2)', [
        u.usuario.id,
        antigo.id,
      ]);

      await c.query(renomear);

      const { rows } = await c.query(
        'SELECT b.id, b.nome, b.tipo_criterio, b.quantidade FROM badges b JOIN usuario_badges ub ON ub.badge_id = b.id WHERE ub.usuario_id = $1',
        [u.usuario.id],
      );
      assert.deepEqual(rows, [
        { id: antigo.id, nome: 'Graduado', tipo_criterio: 'aulas_concluidas', quantidade: 15 },
      ]);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  test('seed não duplica conteúdo se já existe aula', async () => {
    const contar = async () =>
      (
        await pool.query(
          'SELECT (SELECT count(*) FROM aulas)::int AS a, (SELECT count(*) FROM questoes_trivia)::int AS t, (SELECT count(*) FROM badges)::int AS b',
        )
      ).rows[0];
    const antes = await contar();
    await semear();
    assert.deepEqual(await contar(), antes);
  });

  test('transacao desfaz tudo quando a função lança', async () => {
    await assert.rejects(
      transacao(async (c) => {
        await c.query("INSERT INTO aulas (titulo, ordem, conteudo_html) VALUES ('Temporária', 7777, 'x')");
        throw new Error('falhou no meio');
      }),
      /falhou no meio/,
    );
    const { rows } = await pool.query('SELECT 1 FROM aulas WHERE ordem = 7777');
    assert.equal(rows.length, 0);
  });

  test('banco derruba a conexão no meio da transação: rejeita com o erro original e a API segue', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    await assert.rejects(
      transacao((c) => c.query('SELECT pg_terminate_backend(pg_backend_pid())')),
      (erro) => erro.code === '57P01',
    );
    assert.ok(log.mock.calls.some((c) => String(c.arguments[0]).includes('falha no ROLLBACK')));
    assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok, 1);
  });

  test('conexão morta enquanto a transação espera: o erro vai para o log, não derruba o processo', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    await assert.rejects(
      transacao(async (c) => {
        const { rows } = await c.query('SELECT pg_backend_pid() AS pid');
        await pool.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
        // Dá tempo de o socket fechar e o cliente emitir 'error' sem query ativa.
        await new Promise((resolver) => setTimeout(resolver, 300));
        await c.query('SELECT 1');
      }),
    );
    assert.ok(
      log.mock.calls.some((c) =>
        String(c.arguments[0]).includes('conexão com o banco caiu durante uma transação'),
      ),
    );
    assert.equal((await transacao((c) => c.query('SELECT 2 AS ok'))).rows[0].ok, 2);
  });

  test('transacao confirma e devolve o resultado', async () => {
    const r = await transacao(async (c) => (await c.query('SELECT 41 + 1 AS n')).rows[0].n);
    assert.equal(r, 42);
  });

  test('atualizarLinha: sem dados só lê; id inexistente devolve undefined', async () => {
    const { rows } = await pool.query('SELECT id, titulo FROM aulas LIMIT 1');
    assert.deepEqual(await atualizarLinha(pool, 'aulas', rows[0].id, {}, 'id, titulo'), rows[0]);
    assert.equal(
      await atualizarLinha(pool, 'aulas', '00000000-0000-4000-8000-000000000000', { titulo: 'x' }, 'id'),
      undefined,
    );
  });

  test('constraints do banco barram dados inválidos mesmo sem passar pela API', async () => {
    const invalidos = [
      "INSERT INTO questoes_trivia (dificuldade, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta) VALUES ('facil','x','a','b','c','d','e')",
      "INSERT INTO questoes_trivia (dificuldade, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta) VALUES ('extrema','x','a','b','c','d','a')",
      "INSERT INTO badges (nome, descricao, tipo_criterio) VALUES ('x', 'y', 'aula_concluida')",
      "INSERT INTO badges (nome, descricao, tipo_criterio) VALUES ('x', 'y', 'desconhecido')",
      "INSERT INTO badges (nome, descricao, tipo_criterio) VALUES ('x', 'y', 'todas_aulas')",
      "INSERT INTO badges (nome, descricao, tipo_criterio) VALUES ('x', 'y', 'pontos')",
      "INSERT INTO badges (nome, descricao, tipo_criterio, quantidade) VALUES ('x', 'y', 'aulas_concluidas', 0)",
      "INSERT INTO badges (nome, descricao, tipo_criterio, dificuldade) VALUES ('x', 'y', 'trivia_completa', 'extrema')",
      'UPDATE usuarios SET pontuacao_total = -1',
      "UPDATE usuarios SET papel = 'root'",
    ];
    for (const sql of invalidos) await assert.rejects(pool.query(sql), { code: '23514' }, sql);
  });
});
