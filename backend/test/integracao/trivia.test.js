const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, prepararBanco, novoUsuario, gabarito, errada } = require('../ajuda');

before(prepararBanco);
after(() => pool.end());

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const novaRodada = (u, corpo = { dificuldade: 'facil' }) => u.api('post', '/api/trivia/rodadas').send(corpo);
const responder = (u, rodadaId, questao_id, alternativa) =>
  u.api('post', `/api/trivia/rodadas/${rodadaId}/respostas`).send({ questao_id, alternativa });

describe('POST /api/trivia/rodadas', () => {
  test('sorteia questões só da dificuldade pedida, sem gabarito', async () => {
    const u = await novoUsuario();
    for (const [dificuldade, total] of [
      ['facil', 3],
      ['media', 3],
      ['dificil', 4],
    ]) {
      const rodada = (await novaRodada(u, { dificuldade }).expect(201)).body;
      assert.equal(rodada.dificuldade, dificuldade);
      assert.equal(rodada.questoes.length, total);
      assert.equal(rodada.pontos_ganhos, 0);
      assert.equal(rodada.finalizada_em, null);
      const { rows } = await pool.query(
        'SELECT DISTINCT dificuldade FROM questoes_trivia WHERE id = ANY($1)',
        [rodada.questoes.map((q) => q.id)],
      );
      assert.deepEqual(
        rows.map((r) => r.dificuldade),
        [dificuldade],
      );
      for (const q of rodada.questoes) {
        assert.equal(q.resposta_correta, undefined);
        assert.equal(q.respondida, false);
        assert.equal(q.correta, null);
      }
    }
  });

  test('respeita o limite pedido e não repete questão na rodada', async () => {
    const u = await novoUsuario();
    for (let i = 0; i < 5; i++) {
      await pool.query(
        "INSERT INTO questoes_trivia (dificuldade, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta) VALUES ('media', $1, 'a', 'b', 'c', 'd', 'a')",
        [`Extra ${i}`],
      );
    }
    const rodada = (await novaRodada(u, { dificuldade: 'media', limite: 5 }).expect(201)).body;
    assert.equal(rodada.questoes.length, 5);
    assert.equal(new Set(rodada.questoes.map((q) => q.id)).size, 5);
    await pool.query("DELETE FROM questoes_trivia WHERE enunciado LIKE 'Extra %'");
  });

  test('limite fora de 5–20, dificuldade inválida ou ausente dá 400', async () => {
    const u = await novoUsuario();
    for (const corpo of [
      { dificuldade: 'facil', limite: 4 },
      { dificuldade: 'facil', limite: 21 },
      { dificuldade: 'facil', limite: '10' },
      { dificuldade: 'impossivel' },
      {},
    ]) {
      await novaRodada(u, corpo).expect(400);
    }
  });

  test('sem questões ativas na dificuldade dá 409 e não deixa rodada vazia', async () => {
    const u = await novoUsuario();
    await pool.query("UPDATE questoes_trivia SET ativo = false WHERE dificuldade = 'dificil'");
    try {
      const res = await novaRodada(u, { dificuldade: 'dificil' }).expect(409);
      assert.equal(res.body.erro.codigo, 'SEM_QUESTOES');
      const { rows } = await pool.query(
        'SELECT count(*)::int AS n FROM trivia_rodadas WHERE usuario_id = $1',
        [u.usuario.id],
      );
      assert.equal(rows[0].n, 0, 'transação desfeita');
    } finally {
      await pool.query("UPDATE questoes_trivia SET ativo = true WHERE dificuldade = 'dificil'");
    }
  });
});

describe('GET /api/trivia/rodadas/:id', () => {
  test('retoma a rodada com o que já foi respondido', async () => {
    const u = await novoUsuario();
    const rodada = (await novaRodada(u)).body;
    const certas = await gabarito(
      'questoes_trivia',
      rodada.questoes.map((q) => q.id),
    );
    const [q1, q2] = rodada.questoes;
    await responder(u, rodada.id, q1.id, certas[q1.id]).expect(200);
    await responder(u, rodada.id, q2.id, errada(certas[q2.id])).expect(200);
    const retomada = (await u.api('get', `/api/trivia/rodadas/${rodada.id}`).expect(200)).body;
    assert.deepEqual(
      retomada.questoes.map((q) => q.id),
      rodada.questoes.map((q) => q.id),
      'mesma ordem',
    );
    assert.deepEqual(
      retomada.questoes.map((q) => [q.respondida, q.correta]),
      [
        [true, true],
        [true, false],
        [false, null],
      ],
    );
    assert.equal(retomada.pontos_ganhos, q1.pontos);
  });

  test('rodada inexistente ou malformada', async () => {
    const u = await novoUsuario();
    await u.api('get', `/api/trivia/rodadas/${UUID_INEXISTENTE}`).expect(404);
    await u.api('get', '/api/trivia/rodadas/abc').expect(400);
  });
});

describe('POST /api/trivia/rodadas/:id/respostas', () => {
  test('acerto pontua na hora e erro não pontua', async () => {
    const u = await novoUsuario();
    const rodada = (await novaRodada(u)).body;
    const certas = await gabarito(
      'questoes_trivia',
      rodada.questoes.map((q) => q.id),
    );
    const [q1, q2] = rodada.questoes;
    const certo = (await responder(u, rodada.id, q1.id, certas[q1.id]).expect(200)).body;
    assert.deepEqual([certo.correta, certo.pontos_ganhos, certo.pontuacao_total], [true, 5, 5]);
    const erro = (await responder(u, rodada.id, q2.id, errada(certas[q2.id])).expect(200)).body;
    assert.deepEqual([erro.correta, erro.pontos_ganhos, erro.pontuacao_total], [false, 0, 5]);
    assert.equal(erro.resposta_correta, certas[q2.id]);
    assert.ok(erro.explicacao);
  });

  test('questão fora da rodada (outra dificuldade ou inexistente) dá 404', async () => {
    const u = await novoUsuario();
    const rodada = (await novaRodada(u)).body;
    const { rows } = await pool.query("SELECT id FROM questoes_trivia WHERE dificuldade = 'dificil' LIMIT 1");
    const res = await responder(u, rodada.id, rows[0].id, 'a').expect(404);
    assert.equal(res.body.erro.mensagem, 'Questão não pertence a esta rodada');
    await responder(u, rodada.id, UUID_INEXISTENTE, 'a').expect(404);
  });

  test('mesma questão duas vezes na rodada dá 409', async () => {
    const u = await novoUsuario();
    const rodada = (await novaRodada(u)).body;
    await responder(u, rodada.id, rodada.questoes[0].id, 'a').expect(200);
    const res = await responder(u, rodada.id, rodada.questoes[0].id, 'b').expect(409);
    assert.equal(res.body.erro.codigo, 'JA_RESPONDIDA');
  });

  test('anti-farm: acertar de novo a mesma questão em outra rodada não pontua', async () => {
    const u = await novoUsuario();
    const r1 = (await novaRodada(u)).body;
    const certas = await gabarito(
      'questoes_trivia',
      r1.questoes.map((q) => q.id),
    );
    for (const q of r1.questoes) await responder(u, r1.id, q.id, certas[q.id]);
    const r2 = (await novaRodada(u)).body; // fácil só tem 3 questões: todas repetem
    const pontos = [];
    for (const q of r2.questoes)
      pontos.push((await responder(u, r2.id, q.id, certas[q.id])).body.pontos_ganhos);
    assert.deepEqual(pontos, [0, 0, 0]);
    const me = (await u.api('get', '/api/auth/me')).body;
    assert.equal(me.pontuacao_total, 15);
  });

  test('errou numa rodada, acerta na outra: pontua', async () => {
    const u = await novoUsuario();
    const r1 = (await novaRodada(u)).body;
    const certas = await gabarito(
      'questoes_trivia',
      r1.questoes.map((q) => q.id),
    );
    for (const q of r1.questoes) await responder(u, r1.id, q.id, errada(certas[q.id]));
    const r2 = (await novaRodada(u)).body;
    const q = r2.questoes[0];
    assert.equal((await responder(u, r2.id, q.id, certas[q.id])).body.pontos_ganhos, 5);
  });

  test('alternativa inválida dá 400', async () => {
    const u = await novoUsuario();
    const rodada = (await novaRodada(u)).body;
    await responder(u, rodada.id, rodada.questoes[0].id, 'x').expect(400);
  });
});

describe('POST /api/trivia/rodadas/:id/finalizar', () => {
  test('finaliza com resumo, badge da primeira trivia e não aceita mais nada', async () => {
    const u = await novoUsuario();
    const rodada = (await novaRodada(u)).body;
    const certas = await gabarito(
      'questoes_trivia',
      rodada.questoes.map((q) => q.id),
    );
    await responder(u, rodada.id, rodada.questoes[0].id, certas[rodada.questoes[0].id]);
    const fim = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`).expect(200)).body;
    assert.equal(fim.acertos, 1);
    assert.equal(fim.total_questoes, 3);
    assert.equal(fim.pontos_ganhos, 5);
    assert.equal(fim.pontuacao_total, 5);
    assert.deepEqual(
      fim.novos_badges.map((b) => b.tipo_criterio),
      ['primeira_trivia'],
    );

    const res = await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`).expect(409);
    assert.equal(res.body.erro.codigo, 'RODADA_FINALIZADA');
    await responder(u, rodada.id, rodada.questoes[1].id, 'a').expect(409);
    const vista = (await u.api('get', `/api/trivia/rodadas/${rodada.id}`)).body;
    assert.ok(vista.finalizada_em);
  });

  test('pode finalizar sem responder nada; badge só vem uma vez', async () => {
    const u = await novoUsuario();
    const r1 = (await novaRodada(u)).body;
    const f1 = (await u.api('post', `/api/trivia/rodadas/${r1.id}/finalizar`).expect(200)).body;
    assert.equal(f1.acertos, 0);
    assert.equal(f1.novos_badges.length, 1);
    const r2 = (await novaRodada(u)).body;
    const f2 = (await u.api('post', `/api/trivia/rodadas/${r2.id}/finalizar`).expect(200)).body;
    assert.deepEqual(f2.novos_badges, []);
  });

  test('finalizações paralelas: uma vale', async () => {
    const u = await novoUsuario();
    const rodada = (await novaRodada(u)).body;
    const r = await Promise.all(
      [1, 2].map(() => u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`)),
    );
    assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
  });

  test('rodada inexistente dá 404', async () => {
    const u = await novoUsuario();
    await u.api('post', `/api/trivia/rodadas/${UUID_INEXISTENTE}/finalizar`).expect(404);
  });
});
