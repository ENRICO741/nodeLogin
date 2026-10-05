const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  pool,
  prepararBanco,
  novoUsuario,
  novoJogador,
  novoAdmin,
  concluirAulas,
  gabarito,
  errada,
} = require('../ajuda');

before(prepararBanco);
after(() => pool.end());

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const novaRodada = (u, corpo = { dificuldade: 'facil' }) => u.api('post', '/api/trivia/rodadas').send(corpo);
const responder = (u, rodadaId, questao_id, alternativa) =>
  u.api('post', `/api/trivia/rodadas/${rodadaId}/respostas`).send({ questao_id, alternativa });

describe('POST /api/trivia/rodadas', () => {
  test('bloqueada até concluir todas as aulas: 403 e nenhuma rodada criada', async () => {
    const u = await novoUsuario();
    const res = await novaRodada(u).expect(403);
    assert.deepEqual(res.body.erro, {
      codigo: 'TRIVIA_BLOQUEADA',
      mensagem: 'Conclua todas as aulas para liberar a trivia',
    });
    // Todas menos a última ainda não basta.
    const ultima = (await u.api('get', '/api/aulas')).body.at(-1);
    await pool.query('UPDATE aulas SET ativo = false WHERE id = $1', [ultima.id]);
    try {
      await concluirAulas(u.usuario.id);
    } finally {
      await pool.query('UPDATE aulas SET ativo = true WHERE id = $1', [ultima.id]);
    }
    await novaRodada(u).expect(403);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM trivia_rodadas WHERE usuario_id = $1', [
      u.usuario.id,
    ]);
    assert.equal(rows[0].n, 0);

    await concluirAulas(u.usuario.id);
    await novaRodada(u).expect(201);
  });

  test('admin joga sem concluir as aulas e não pontua', async () => {
    const admin = await novoAdmin();
    const rodada = (await novaRodada(admin).expect(201)).body;
    const certas = await gabarito(
      'questoes_trivia',
      rodada.questoes.map((q) => q.id),
    );
    for (const q of rodada.questoes) {
      const r = (await responder(admin, rodada.id, q.id, certas[q.id]).expect(200)).body;
      assert.deepEqual([r.correta, r.pontos_ganhos, r.pontuacao_total], [true, 0, 0]);
    }
    const fim = (await admin.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`).expect(200)).body;
    assert.deepEqual([fim.acertos, fim.pontos_ganhos, fim.pontuacao_total], [3, 0, 0]);
  });

  test('visita aberta na última aula não conta como concluída', async () => {
    const u = await novoUsuario();
    const ultima = (await u.api('get', '/api/aulas')).body.at(-1);
    await pool.query('UPDATE aulas SET ativo = false WHERE id = $1', [ultima.id]);
    try {
      await concluirAulas(u.usuario.id);
    } finally {
      await pool.query('UPDATE aulas SET ativo = true WHERE id = $1', [ultima.id]);
    }
    await u.api('post', `/api/aulas/${ultima.id}/visitas`).expect(201);
    await novaRodada(u).expect(403);
  });

  test('sorteia questões só da dificuldade pedida, sem gabarito', async () => {
    const u = await novoJogador();
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
    const u = await novoJogador();
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
    const u = await novoJogador();
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
    const u = await novoJogador();
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
    const u = await novoJogador();
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
    const u = await novoJogador();
    await u.api('get', `/api/trivia/rodadas/${UUID_INEXISTENTE}`).expect(404);
    await u.api('get', '/api/trivia/rodadas/abc').expect(400);
  });
});

describe('POST /api/trivia/rodadas/:id/respostas', () => {
  test('acerto pontua na hora e erro não pontua', async () => {
    const u = await novoJogador();
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
    const u = await novoJogador();
    const rodada = (await novaRodada(u)).body;
    const { rows } = await pool.query("SELECT id FROM questoes_trivia WHERE dificuldade = 'dificil' LIMIT 1");
    const res = await responder(u, rodada.id, rows[0].id, 'a').expect(404);
    assert.equal(res.body.erro.mensagem, 'Questão não pertence a esta rodada');
    await responder(u, rodada.id, UUID_INEXISTENTE, 'a').expect(404);
  });

  test('mesma questão com outra alternativa dá 409', async () => {
    const u = await novoJogador();
    const rodada = (await novaRodada(u)).body;
    await responder(u, rodada.id, rodada.questoes[0].id, 'a').expect(200);
    const res = await responder(u, rodada.id, rodada.questoes[0].id, 'b').expect(409);
    assert.equal(res.body.erro.codigo, 'JA_RESPONDIDA');
  });

  test('reenvio da mesma alternativa (retorno perdido) devolve o mesmo resultado sem pontuar de novo', async () => {
    const u = await novoJogador();
    const rodada = (await novaRodada(u)).body;
    const q = rodada.questoes[0];
    const certas = await gabarito('questoes_trivia', [q.id]);
    const primeira = (await responder(u, rodada.id, q.id, certas[q.id]).expect(200)).body;
    assert.equal(primeira.pontos_ganhos, 5);
    const historico = async () =>
      (
        await pool.query('SELECT count(*)::int AS n FROM pontuacao_historico WHERE usuario_id = $1', [
          u.usuario.id,
        ])
      ).rows[0].n;
    const antes = await historico();
    const r = await Promise.all([1, 2].map(() => responder(u, rodada.id, q.id, certas[q.id])));
    for (const x of r) assert.deepEqual([x.status, x.body], [200, primeira]);
    assert.equal(await historico(), antes);
    const { rows } = await pool.query('SELECT pontos_ganhos FROM trivia_rodadas WHERE id = $1', [rodada.id]);
    assert.equal(rows[0].pontos_ganhos, 5);
    assert.equal((await u.api('get', '/api/auth/me')).body.pontuacao_total, 5);
  });

  test('anti-farm: acertar de novo a mesma questão em outra rodada não pontua', async () => {
    const u = await novoJogador();
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
    const u = await novoJogador();
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
    const u = await novoJogador();
    const rodada = (await novaRodada(u)).body;
    await responder(u, rodada.id, rodada.questoes[0].id, 'x').expect(400);
  });
});

describe('POST /api/trivia/rodadas/:id/finalizar', () => {
  test('finaliza com resumo, badge da primeira trivia e não aceita mais nada', async () => {
    const u = await novoJogador();
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

    // Reenvio da finalização (retorno perdido): mesmo resumo, sem badge repetido nem data nova.
    const { finalizada_em } = (await u.api('get', `/api/trivia/rodadas/${rodada.id}`)).body;
    const de_novo = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`).expect(200)).body;
    assert.deepEqual(de_novo, { ...fim, novos_badges: [] });
    // Questão não respondida antes do fim continua recusada.
    const res = await responder(u, rodada.id, rodada.questoes[1].id, 'a').expect(409);
    assert.equal(res.body.erro.codigo, 'RODADA_FINALIZADA');
    // A já respondida, reenviada igual, devolve o resultado gravado.
    const q = rodada.questoes[0];
    assert.equal((await responder(u, rodada.id, q.id, certas[q.id]).expect(200)).body.pontos_ganhos, 5);
    const vista = (await u.api('get', `/api/trivia/rodadas/${rodada.id}`)).body;
    assert.equal(vista.finalizada_em, finalizada_em);
    assert.equal((await u.api('get', '/api/auth/me')).body.pontuacao_total, 5);
  });

  test('pode finalizar sem responder nada; badge só vem uma vez', async () => {
    const u = await novoJogador();
    const r1 = (await novaRodada(u)).body;
    const f1 = (await u.api('post', `/api/trivia/rodadas/${r1.id}/finalizar`).expect(200)).body;
    assert.equal(f1.acertos, 0);
    assert.equal(f1.novos_badges.length, 1);
    const r2 = (await novaRodada(u)).body;
    const f2 = (await u.api('post', `/api/trivia/rodadas/${r2.id}/finalizar`).expect(200)).body;
    assert.deepEqual(f2.novos_badges, []);
  });

  test('finalizações paralelas: as duas recebem o resumo, o badge vem uma vez', async () => {
    const u = await novoJogador();
    const rodada = (await novaRodada(u)).body;
    const r = await Promise.all(
      [1, 2].map(() => u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`)),
    );
    assert.deepEqual(
      r.map((x) => x.status),
      [200, 200],
    );
    assert.equal(r.flatMap((x) => x.body.novos_badges).length, 1);
  });

  test('rodada inexistente dá 404', async () => {
    const u = await novoJogador();
    await u.api('post', `/api/trivia/rodadas/${UUID_INEXISTENTE}/finalizar`).expect(404);
  });
});

describe('conquistas da trivia', () => {
  // Joga uma rodada inteira; `acertar(i, questaoId)` decide se a i-ésima é respondida certa.
  async function jogar(u, dificuldade, acertar = () => true) {
    const rodada = (await novaRodada(u, { dificuldade })).body;
    const certas = await gabarito(
      'questoes_trivia',
      rodada.questoes.map((q) => q.id),
    );
    for (const [i, q] of rodada.questoes.entries()) {
      await responder(u, rodada.id, q.id, acertar(i, q.id) ? certas[q.id] : errada(certas[q.id])).expect(200);
    }
    const fim = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`).expect(200)).body;
    return fim.novos_badges.map((b) => b.nome);
  }

  test('errar uma questão do nível segura a conquista; acertar depois, em outra rodada, libera', async () => {
    const u = await novoJogador();
    let errou;
    const primeira = await jogar(u, 'facil', (i, id) => {
      if (i === 0) errou = id;
      return i > 0;
    });
    assert.deepEqual(primeira, ['Curioso da Trivia']);
    // Só a que faltava certa: o nível fica completo, mas a rodada não é perfeita.
    assert.deepEqual(await jogar(u, 'facil', (i, id) => id === errou), ['Recruta da Trivia']);
  });

  test('rodada toda certa dá a rodada perfeita; os três níveis dão o Mestre da Trivia', async () => {
    const u = await novoJogador();
    assert.deepEqual(
      (await jogar(u, 'facil')).sort(),
      ['Curioso da Trivia', 'Recruta da Trivia', 'Rodada Perfeita'].sort(),
    );
    assert.deepEqual(await jogar(u, 'media'), ['Agente da Trivia']);
    // 15 + 30 + 60 pontos: passa de 100.
    assert.deepEqual(
      (await jogar(u, 'dificil')).sort(),
      ['Centena', 'Elite da Trivia', 'Mestre da Trivia'].sort(),
    );
  });

  test('rodada pela metade não completa o nível', async () => {
    const u = await novoJogador();
    const rodada = (await novaRodada(u)).body;
    const certas = await gabarito('questoes_trivia', [rodada.questoes[0].id]);
    await responder(u, rodada.id, rodada.questoes[0].id, certas[rodada.questoes[0].id]);
    const fim = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`)).body;
    assert.deepEqual(
      fim.novos_badges.map((b) => b.nome),
      ['Curioso da Trivia'],
    );
  });

  test('nova questão ativa no nível tira a chance de quem ainda não a respondeu', async () => {
    const u = await novoJogador();
    const { rows } = await pool.query(
      "INSERT INTO questoes_trivia (dificuldade, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta) VALUES ('dificil', 'Nova', 'a', 'b', 'c', 'd', 'a') RETURNING id",
    );
    try {
      // A rodada sorteia todas as 5 difíceis; responde todas menos a nova.
      const rodada = (await novaRodada(u, { dificuldade: 'dificil' })).body;
      assert.equal(rodada.questoes.length, 5);
      const certas = await gabarito(
        'questoes_trivia',
        rodada.questoes.map((q) => q.id),
      );
      for (const q of rodada.questoes.filter((q) => q.id !== rows[0].id)) {
        await responder(u, rodada.id, q.id, certas[q.id]).expect(200);
      }
      const fim = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`)).body;
      assert.ok(!fim.novos_badges.some((b) => b.nome === 'Elite da Trivia'));

      // Questão desativada (remoção do admin) deixa de contar: a conquista sai na próxima rodada.
      await pool.query('UPDATE questoes_trivia SET ativo = false WHERE id = $1', [rows[0].id]);
      const r2 = (await novaRodada(u, { dificuldade: 'dificil' })).body;
      const fim2 = (await u.api('post', `/api/trivia/rodadas/${r2.id}/finalizar`)).body;
      assert.ok(fim2.novos_badges.some((b) => b.nome === 'Elite da Trivia'));
    } finally {
      await pool.query('DELETE FROM questoes_trivia WHERE id = $1', [rows[0].id]);
    }
  });

  test('10 rodadas terminadas dão o Frequentador da Trivia', async () => {
    const u = await novoJogador();
    let nomes = [];
    for (let i = 0; i < 10; i++) {
      assert.ok(!nomes.includes('Frequentador da Trivia'), `antes da rodada ${i + 1}`);
      const rodada = (await novaRodada(u)).body;
      nomes = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`)).body.novos_badges.map(
        (b) => b.nome,
      );
    }
    assert.ok(nomes.includes('Frequentador da Trivia'));
  });

  test('pontos acumulados dão Centena e Pontuação de Elite', async () => {
    const u = await novoJogador();
    await pool.query('UPDATE usuarios SET pontuacao_total = 99 WHERE id = $1', [u.usuario.id]);
    assert.ok(!(await jogar(u, 'facil', () => false)).includes('Centena'));
    await pool.query('UPDATE usuarios SET pontuacao_total = 300 WHERE id = $1', [u.usuario.id]);
    assert.deepEqual((await jogar(u, 'facil', () => false)).sort(), ['Centena', 'Pontuação de Elite'].sort());
  });
});
