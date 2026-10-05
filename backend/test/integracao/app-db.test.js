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

describe('statement_timeout', () => {
  test('consulta acima de 10 s é cancelada (57014) e o pool segue atendendo', async () => {
    await assert.rejects(pool.query('SELECT pg_sleep(11)'), (erro) => erro.code === '57014');
    assert.equal((await pool.query('SELECT 1 AS ok')).rows[0].ok, 1);
  });

  test('SET LOCAL da exportação vale só na transação', async () => {
    const dentro = await transacao(async (c) => {
      await c.query("SET LOCAL statement_timeout = '60s'");
      return (await c.query('SHOW statement_timeout')).rows[0].statement_timeout;
    });
    assert.equal(dentro, '1min');
    assert.equal((await pool.query('SHOW statement_timeout')).rows[0].statement_timeout, '10s');
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
    // jsonb (metadata da telemetria): o Postgres recusa com outro código (22P05).
    const evento = await u
      .api('post', '/api/eventos')
      .send({ tipo_evento: 'tela_visualizada', metadata: { a: 'x' + String.fromCharCode(0) } })
      .expect(400);
    assert.equal(evento.body.erro.codigo, 'VALIDACAO');
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

  test('dois seeds ao mesmo tempo em banco sem trivia não duplicam questões nem conquistas', async () => {
    await pool.query('DELETE FROM questoes_trivia');
    await pool.query("DELETE FROM badges WHERE nome IN ('Centena', 'Primeiros Passos')");
    await Promise.all([semear(), semear(), semear()]);
    const { rows } = await pool.query(
      `SELECT (SELECT count(*)::int FROM questoes_trivia) AS trivia,
              (SELECT count(*)::int FROM badges) AS badges,
              (SELECT count(DISTINCT nome)::int FROM badges) AS nomes`,
    );
    assert.deepEqual(rows[0], { trivia: 10, badges: 14, nomes: 14 });
  });

  test('seed em banco sem trivia liga cada questão à aula 01 (LGPD)', async () => {
    await pool.query('DELETE FROM questoes_trivia');
    await semear();
    const { rows } = await pool.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE a.slug = 'introducao-lgpd')::int AS lgpd
       FROM questoes_trivia q LEFT JOIN aulas a ON a.id = q.aula_referencia_id`,
    );
    assert.deepEqual(rows[0], { total: 10, lgpd: 10 });
  });

  test('seed que rodou antes da aula 01 existir: a subida seguinte liga as questões sem aula', async () => {
    const { rows: aula } = await pool.query("SELECT id FROM aulas WHERE slug = 'introducao-lgpd'");
    const outra = (await pool.query('SELECT id FROM aulas WHERE ordem = 2')).rows[0].id;
    const { rows: q } = await pool.query('SELECT id FROM questoes_trivia ORDER BY id');
    // Simula o seed sem a aula 01: todas sem aula, menos uma que o admin ligou à aula 02.
    await pool.query('UPDATE questoes_trivia SET aula_referencia_id = NULL');
    await pool.query('UPDATE questoes_trivia SET aula_referencia_id = $2 WHERE id = $1', [q[0].id, outra]);
    try {
      // Aula 01 ainda ausente (slug trocado): nada acontece e nada quebra.
      await pool.query("UPDATE aulas SET slug = 'temporario' WHERE id = $1", [aula[0].id]);
      await semear();
      const semAula = (
        await pool.query('SELECT count(*)::int AS n FROM questoes_trivia WHERE aula_referencia_id IS NULL')
      ).rows[0].n;
      assert.equal(semAula, q.length - 1);
      await pool.query("UPDATE aulas SET slug = 'introducao-lgpd' WHERE id = $1", [aula[0].id]);
      await semear();
      const { rows } = await pool.query(
        'SELECT aula_referencia_id, count(*)::int AS n FROM questoes_trivia GROUP BY 1 ORDER BY n DESC',
      );
      assert.deepEqual(rows, [
        { aula_referencia_id: aula[0].id, n: q.length - 1 },
        { aula_referencia_id: outra, n: 1 },
      ]);
    } finally {
      await pool.query("UPDATE aulas SET slug = 'introducao-lgpd' WHERE id = $1", [aula[0].id]);
      await pool.query('UPDATE questoes_trivia SET aula_referencia_id = $1', [aula[0].id]);
    }
  });

  test('migration 008 liga à aula 01 as questões sem aula, sem mexer nas já ligadas', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const sql = fs.readFileSync(
      path.join(__dirname, '../../src/db/migrations/008_trivia_aula_referencia.sql'),
      'utf8',
    );
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const { rows: q } = await c.query('SELECT id FROM questoes_trivia ORDER BY id');
      const outraAula = (await c.query('SELECT id FROM aulas WHERE ordem = 2')).rows[0].id;
      // Antes da 008: questões sem aula, menos uma que o admin já tinha ligado à aula 02.
      await c.query('UPDATE questoes_trivia SET aula_referencia_id = NULL');
      await c.query('UPDATE questoes_trivia SET aula_referencia_id = $2 WHERE id = $1', [q[0].id, outraAula]);
      await c.query(sql);
      const { rows } = await c.query(
        `SELECT a.slug, count(*)::int AS n FROM questoes_trivia q JOIN aulas a ON a.id = q.aula_referencia_id
         GROUP BY a.slug ORDER BY a.slug`,
      );
      assert.deepEqual(rows, [
        { slug: 'introducao-lgpd', n: q.length - 1 },
        { slug: 'o-que-estamos-protegendo', n: 1 },
      ]);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  test('banco recusa conquista com nome repetido (badges_nome_uk)', async () => {
    await assert.rejects(
      pool.query(
        "INSERT INTO badges (nome, descricao, tipo_criterio, quantidade) VALUES ('Centena', 'x', 'pontos', 1)",
      ),
      (erro) => erro.code === '23505' && erro.constraint === 'badges_nome_uk',
    );
  });

  test('migration 007 com duplicatas já gravadas: fica a mais antiga e quem tinha a cópia não perde a conquista', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const sql = fs.readFileSync(
      path.join(__dirname, '../../src/db/migrations/007_badges_nome_unico.sql'),
      'utf8',
    );
    const [u1, u2] = [await novoUsuario(), await novoUsuario()];
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      // Volta ao estado de antes da 007 só dentro desta transação (desfeita no fim).
      await c.query('DROP INDEX badges_nome_uk');
      const {
        rows: [original],
      } = await c.query("SELECT id FROM badges WHERE nome = 'Centena'");
      const {
        rows: [copia],
      } = await c.query(
        "INSERT INTO badges (nome, descricao, tipo_criterio, quantidade, criado_em) VALUES ('Centena', 'Chegou a 100 pontos.', 'pontos', 100, now() + interval '1 hour') RETURNING id",
      );
      // u1 tem só a cópia; u2 tem as duas.
      await c.query('INSERT INTO usuario_badges (usuario_id, badge_id) VALUES ($1, $3), ($2, $3), ($2, $4)', [
        u1.usuario.id,
        u2.usuario.id,
        copia.id,
        original.id,
      ]);

      await c.query(sql);

      const { rows } = await c.query(
        `SELECT ub.usuario_id, b.id FROM usuario_badges ub JOIN badges b ON b.id = ub.badge_id
         WHERE b.nome = 'Centena' ORDER BY ub.usuario_id = $1 DESC`,
        [u1.usuario.id],
      );
      assert.deepEqual(rows, [
        { usuario_id: u1.usuario.id, id: original.id },
        { usuario_id: u2.usuario.id, id: original.id },
      ]);
      const { rows: n } = await c.query("SELECT count(*)::int AS n FROM badges WHERE nome = 'Centena'");
      assert.equal(n[0].n, 1);
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
