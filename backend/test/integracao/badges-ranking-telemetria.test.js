const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  pool,
  prepararBanco,
  novoUsuario,
  novoJogador,
  concluirAulas,
  novoAdmin,
  request,
  app,
} = require('../ajuda');
const { semear } = require('../../src/db/seed');

before(prepararBanco);
after(() => pool.end());

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const definirPontos = (id, pontos) =>
  pool.query('UPDATE usuarios SET pontuacao_total = $2 WHERE id = $1', [id, pontos]);

describe('GET /api/badges', () => {
  test('lista badges ativos; obtida_em só nos conquistados pelo usuário', async () => {
    const u = await novoUsuario();
    const outro = await novoUsuario();
    const antes = (await u.api('get', '/api/badges').expect(200)).body;
    assert.equal(antes.length, 14);
    assert.ok(antes.every((b) => b.obtida_em === null));
    await concluirAulas(u.usuario.id);

    const rodada = (await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'facil' })).body;
    await u
      .api('post', `/api/trivia/rodadas/${rodada.id}/respostas`)
      .send({ questao_id: rodada.questoes[0].id, alternativa: 'a' });
    await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`);
    const depois = (await u.api('get', '/api/badges')).body;
    assert.ok(depois.find((b) => b.tipo_criterio === 'primeira_trivia').obtida_em);
    assert.ok((await outro.api('get', '/api/badges')).body.every((b) => b.obtida_em === null));
  });

  test('badge desativado some da lista e deixa de ser concedido', async () => {
    const u = await novoJogador();
    await pool.query("UPDATE badges SET ativo = false WHERE tipo_criterio = 'primeira_trivia'");
    try {
      assert.equal((await u.api('get', '/api/badges')).body.length, 13);
      const rodada = (await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'facil' })).body;
      await u
        .api('post', `/api/trivia/rodadas/${rodada.id}/respostas`)
        .send({ questao_id: rodada.questoes[0].id, alternativa: 'a' });
      const fim = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`)).body;
      assert.deepEqual(fim.novos_badges, []);
    } finally {
      await pool.query("UPDATE badges SET ativo = true WHERE tipo_criterio = 'primeira_trivia'");
    }
  });

  test('ordem fixa: aulas em escada, depois trivia por nível, depois pontos', async () => {
    const u = await novoUsuario();
    assert.deepEqual(
      (await u.api('get', '/api/badges')).body.map((b) => b.nome),
      [
        'Primeiros Passos',
        'Aprendiz Dedicado',
        'Sentinela',
        'Graduado',
        'Aluno Nota 10',
        'Curioso da Trivia',
        'Frequentador da Trivia',
        'Recruta da Trivia',
        'Agente da Trivia',
        'Elite da Trivia',
        'Mestre da Trivia',
        'Rodada Perfeita',
        'Centena',
        'Pontuação de Elite',
      ],
    );
  });

  test('seed recria só o badge que falta, sem mexer nos existentes', async () => {
    const { rows: antes } = await pool.query("SELECT id FROM badges WHERE nome <> 'Centena' ORDER BY id");
    await pool.query("DELETE FROM badges WHERE nome = 'Centena'");
    await semear();
    const { rows } = await pool.query("SELECT quantidade FROM badges WHERE nome = 'Centena'");
    assert.deepEqual(rows, [{ quantidade: 100 }]);
    assert.deepEqual(
      (await pool.query("SELECT id FROM badges WHERE nome <> 'Centena' ORDER BY id")).rows,
      antes,
    );
  });

  test('exige login', async () => {
    await request(app).get('/api/badges').expect(401);
  });
});

describe('GET /api/ranking', () => {
  test('ordena por pontos, empata com o mesmo rank e marca o próprio usuário', async () => {
    const a = await novoUsuario();
    const b = await novoUsuario();
    const c = await novoUsuario();
    await definirPontos(a.usuario.id, 5000);
    await definirPontos(b.usuario.id, 5000);
    await definirPontos(c.usuario.id, 4000);

    const res = (await c.api('get', '/api/ranking').expect(200)).body;
    const [p1, p2, p3] = res.lideres;
    assert.deepEqual([p1.posicao, p2.posicao, p3.posicao], [1, 1, 3]);
    assert.equal(p3.apelido, c.apelido);
    assert.equal(p3.eu, true);
    assert.equal(p1.eu, false);
    assert.equal(res.minha_posicao, 3);
    assert.equal(res.pontuacao_total, 4000);
  });

  test('só mostra apelido, foto e pontos (LGPD)', async () => {
    const u = await novoUsuario();
    const lider = (await u.api('get', '/api/ranking')).body.lideres[0];
    assert.deepEqual(Object.keys(lider).sort(), [
      'apelido',
      'eu',
      'foto_perfil_url',
      'pontuacao_total',
      'posicao',
    ]);
  });

  test('limita a 20 e calcula a posição de quem está fora do top', async () => {
    const usuarios = [];
    for (let i = 0; i < 22; i++) usuarios.push(await novoUsuario());
    for (const [i, u] of usuarios.entries()) await definirPontos(u.usuario.id, 1000 + i);
    const ultimo = usuarios[0];
    const res = (await ultimo.api('get', '/api/ranking')).body;
    assert.equal(res.lideres.length, 20);
    assert.ok(!res.lideres.some((l) => l.eu));
    assert.ok(res.minha_posicao > 20);
  });

  test('admins e desativados ficam fora; admin não tem posição', async () => {
    const admin = await novoAdmin();
    const inativo = await novoUsuario();
    await definirPontos(admin.usuario.id, 999_999);
    await definirPontos(inativo.usuario.id, 999_998);
    await pool.query('UPDATE usuarios SET ativo = false WHERE id = $1', [inativo.usuario.id]);
    const res = (await admin.api('get', '/api/ranking')).body;
    assert.ok(!res.lideres.some((l) => [admin.apelido, inativo.apelido].includes(l.apelido)));
    assert.equal(res.minha_posicao, null);
  });
});

describe('telemetria', () => {
  test('cria sessão, registra eventos com e sem sessão e finaliza', async () => {
    const u = await novoUsuario();
    const sessao = (await u.api('post', '/api/sessoes').expect(201)).body;
    assert.ok(sessao.id && sessao.iniciada_em);

    await u
      .api('post', '/api/eventos')
      .send({
        sessao_id: sessao.id,
        tipo_evento: 'quiz_respondido',
        tela: '/aulas/x',
        elemento: 'q1',
        duracao_ms: 1234,
        metadata: { correta: true },
      })
      .expect(204);
    await u.api('post', '/api/eventos').send({ tipo_evento: 'tela_visualizada' }).expect(204);
    await u
      .api('post', '/api/eventos')
      .send({ tipo_evento: 'tela_visualizada', sessao_id: null })
      .expect(204);

    const { rows } = await pool.query(
      'SELECT sessao_id, metadata, duracao_ms FROM eventos WHERE usuario_id = $1 ORDER BY criado_em',
      [u.usuario.id],
    );
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], { sessao_id: sessao.id, metadata: { correta: true }, duracao_ms: 1234 });
    assert.equal(rows[1].sessao_id, null);

    await u.api('post', `/api/sessoes/${sessao.id}/finalizar`).expect(204);
    const { rows: s } = await pool.query('SELECT finalizada_em FROM sessoes_app WHERE id = $1', [sessao.id]);
    assert.ok(s[0].finalizada_em);
  });

  test('finalizar é idempotente e não muda o horário da primeira vez', async () => {
    const u = await novoUsuario();
    const sessao = (await u.api('post', '/api/sessoes')).body;
    await u.api('post', `/api/sessoes/${sessao.id}/finalizar`).expect(204);
    const primeiro = (await pool.query('SELECT finalizada_em FROM sessoes_app WHERE id = $1', [sessao.id]))
      .rows[0];
    await u.api('post', `/api/sessoes/${sessao.id}/finalizar`).expect(204);
    const segundo = (await pool.query('SELECT finalizada_em FROM sessoes_app WHERE id = $1', [sessao.id]))
      .rows[0];
    assert.deepEqual(primeiro, segundo);
  });

  test('não finaliza nem usa sessão de outro usuário', async () => {
    const dono = await novoUsuario();
    const intruso = await novoUsuario();
    const sessao = (await dono.api('post', '/api/sessoes')).body;
    await intruso.api('post', `/api/sessoes/${sessao.id}/finalizar`).expect(204);
    const { rows } = await pool.query('SELECT finalizada_em FROM sessoes_app WHERE id = $1', [sessao.id]);
    assert.equal(rows[0].finalizada_em, null);
    await intruso
      .api('post', '/api/eventos')
      .send({ sessao_id: sessao.id, tipo_evento: 'clique' })
      .expect(404);
    await intruso
      .api('post', '/api/eventos')
      .send({ sessao_id: UUID_INEXISTENTE, tipo_evento: 'clique' })
      .expect(404);
  });

  test('recusa eventos malformados', async () => {
    const u = await novoUsuario();
    const invalidos = [
      {},
      { tipo_evento: 'Com Maiúscula' },
      { tipo_evento: 'x' },
      { tipo_evento: 'a'.repeat(41) },
      { tipo_evento: 'ok', tela: 'x'.repeat(61) },
      { tipo_evento: 'ok', elemento: 'x'.repeat(81) },
      { tipo_evento: 'ok', duracao_ms: -1 },
      { tipo_evento: 'ok', duracao_ms: 1.5 },
      { tipo_evento: 'ok', duracao_ms: 86_400_001 },
      { tipo_evento: 'ok', metadata: 'texto' },
      { tipo_evento: 'ok', metadata: { grande: 'x'.repeat(2100) } },
      { tipo_evento: 'ok', sessao_id: 'nao-uuid' },
    ];
    for (const corpo of invalidos) {
      await u.api('post', '/api/eventos').send(corpo).expect(400);
    }
  });

  test('aceita metadata no limite de 2 KB', async () => {
    const u = await novoUsuario();
    const metadata = { v: 'x'.repeat(2048 - '{"v":""}'.length) };
    assert.equal(JSON.stringify(metadata).length, 2048);
    await u.api('post', '/api/eventos').send({ tipo_evento: 'ok', metadata }).expect(204);
  });

  test('sessão malformada na finalização dá 400', async () => {
    const u = await novoUsuario();
    await u.api('post', '/api/sessoes/xyz/finalizar').expect(400);
  });

  test('consentimento retirado: sessões e eventos respondem 204 sem gravar; reconsentir volta a gravar', async () => {
    const u = await novoUsuario();
    const contar = async () => {
      const { rows } = await pool.query(
        `SELECT (SELECT count(*)::int FROM sessoes_app WHERE usuario_id = $1) AS sessoes,
                (SELECT count(*)::int FROM eventos WHERE usuario_id = $1) AS eventos`,
        [u.usuario.id],
      );
      return rows[0];
    };
    const sessao = (await u.api('post', '/api/sessoes').expect(201)).body;

    await u.api('patch', '/api/perfil').send({ consentiu_pesquisa: false }).expect(200);
    const nova = await u.api('post', '/api/sessoes').send({ standalone: true }).expect(204);
    assert.deepEqual(nova.body, {});
    await u.api('post', '/api/eventos').send({ tipo_evento: 'tela_visualizada' }).expect(204);
    // Nem com a sessão antiga, nem com corpo inválido (nada é lido nem gravado).
    await u.api('post', '/api/eventos').send({ tipo_evento: 'x', sessao_id: sessao.id }).expect(204);
    assert.deepEqual(await contar(), { sessoes: 1, eventos: 0 });

    await u.api('patch', '/api/perfil').send({ consentiu_pesquisa: true }).expect(200);
    await u.api('post', '/api/sessoes').expect(201);
    await u.api('post', '/api/eventos').send({ tipo_evento: 'tela_visualizada' }).expect(204);
    assert.deepEqual(await contar(), { sessoes: 2, eventos: 1 });
  });
});
