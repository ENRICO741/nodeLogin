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
  completarRodada,
} = require('../ajuda');
const { concederBadges } = require('../../src/modulos/pontuacao');

before(prepararBanco);
after(() => pool.end());

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
const novaRodada = (u, corpo = { dificuldade: 'facil' }) => u.api('post', '/api/trivia/rodadas').send(corpo);
const responder = (u, rodadaId, questao_id, alternativa) =>
  u.api('post', `/api/trivia/rodadas/${rodadaId}/respostas`).send({ questao_id, alternativa });

// Corrida forçada: segura o usuário (FOR UPDATE) numa conexão à parte, dispara os pedidos e só solta
// quando os dois estão esperando lock no banco. Assim eles se cruzam sempre, não por sorte.
async function emCorrida(usuarioId, disparar) {
  const c = await pool.connect();
  let pendentes;
  try {
    await c.query('BEGIN');
    await c.query('SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE', [usuarioId]);
    pendentes = Promise.all(disparar()); // o supertest só envia no .then
    for (let i = 0; ; i++) {
      // Pelo pool, fora da transação: dentro dela o pg_stat_activity fica no retrato da primeira leitura.
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if (rows[0].n >= 2) break;
      if (i === 250) throw new Error('os pedidos não chegaram a esperar o lock');
      await new Promise((r) => setTimeout(r, 20));
    }
  } finally {
    await c.query('COMMIT');
    c.release();
  }
  return pendentes;
}

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

  test('sorteio ignora questões de aula que o aluno não concluiu (sem referência também não entra)', async () => {
    const u = await novoJogador();
    // Aula inativa: não segura a liberação da trivia, mas o aluno não a concluiu.
    const { rows } = await pool.query(
      "INSERT INTO aulas (titulo, ordem, conteudo_html, ativo) VALUES ('Não dada', 960, '<p>x</p>', false) RETURNING id",
    );
    // Duas difíceis a mais (6 no total): 4 elegíveis para o aluno depois de tirar as duas abaixo.
    const { rows: extras } = await pool.query(
      `INSERT INTO questoes_trivia (dificuldade, enunciado, alternativa_a, alternativa_b, alternativa_c,
         alternativa_d, resposta_correta, aula_referencia_id)
       SELECT 'dificil', 'Extra ' || n, 'a', 'b', 'c', 'd', 'a', (SELECT id FROM aulas WHERE ordem = 1)
       FROM generate_series(1, 2) n RETURNING id`,
    );
    const { rows: dificeis } = await pool.query(
      "SELECT id FROM questoes_trivia WHERE dificuldade = 'dificil' AND ativo ORDER BY criado_em",
    );
    const [deAulaNaoDada, semReferencia] = dificeis.map((q) => q.id);
    await pool.query('UPDATE questoes_trivia SET aula_referencia_id = $2 WHERE id = $1', [
      deAulaNaoDada,
      rows[0].id,
    ]);
    await pool.query('UPDATE questoes_trivia SET aula_referencia_id = NULL WHERE id = $1', [semReferencia]);
    // Visita aberta do aluno e visita concluída de outro na aula não dada: nenhuma das duas conta.
    // Por SQL: a aula é inativa, o POST da visita daria 404.
    const outro = await novoUsuario();
    await pool.query(
      `INSERT INTO aula_visitas (usuario_id, aula_id, finalizada_em, concluida)
       VALUES ($1, $3, NULL, false), ($2, $3, now(), true)`,
      [u.usuario.id, outro.usuario.id, rows[0].id],
    );
    try {
      for (let i = 0; i < 3; i++) {
        const ids = (await novaRodada(u, { dificuldade: 'dificil' }).expect(201)).body.questoes.map(
          (q) => q.id,
        );
        assert.ok(!ids.includes(deAulaNaoDada) && !ids.includes(semReferencia), 'sorteou questão proibida');
        assert.equal(ids.length, dificeis.length - 2);
      }
      // Admin confere o conteúdo: sorteia entre todas, inclusive as duas.
      const admin = await novoAdmin();
      const vistas = new Set();
      for (let i = 0; i < 20 && !(vistas.has(deAulaNaoDada) && vistas.has(semReferencia)); i++) {
        for (const q of (await novaRodada(admin, { dificuldade: 'dificil' }).expect(201)).body.questoes) {
          vistas.add(q.id);
        }
      }
      assert.ok(vistas.has(deAulaNaoDada) && vistas.has(semReferencia));
    } finally {
      await pool.query(
        'UPDATE questoes_trivia SET aula_referencia_id = (SELECT id FROM aulas WHERE ordem = 1) WHERE id = ANY($1)',
        [[deAulaNaoDada, semReferencia]],
      );
      await pool.query('DELETE FROM questoes_trivia WHERE id = ANY($1)', [extras.map((q) => q.id)]);
      await pool.query('DELETE FROM aulas WHERE id = $1', [rows[0].id]);
    }
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

  // Deixa exatamente `n` questões médias ativas e ligadas à aula 01 (o seed tem 3); devolve a limpeza.
  async function mediasDisponiveis(n) {
    const extras = Math.max(0, n - 3);
    const { rows } = await pool.query(
      `INSERT INTO questoes_trivia (dificuldade, enunciado, alternativa_a, alternativa_b, alternativa_c,
         alternativa_d, resposta_correta, aula_referencia_id)
       SELECT 'media', 'Extra ' || i, 'a', 'b', 'c', 'd', 'a', (SELECT id FROM aulas WHERE ordem = 1)
       FROM generate_series(1, $1::int) i RETURNING id`,
      [extras],
    );
    const { rows: desligadas } = await pool.query(
      `UPDATE questoes_trivia SET ativo = false WHERE id IN (
         SELECT id FROM questoes_trivia WHERE dificuldade = 'media' AND ativo ORDER BY criado_em LIMIT $1)
       RETURNING id`,
      [Math.max(0, 3 - n)],
    );
    return async () => {
      await pool.query('DELETE FROM questoes_trivia WHERE id = ANY($1)', [rows.map((r) => r.id)]);
      await pool.query('UPDATE questoes_trivia SET ativo = true WHERE id = ANY($1)', [
        desligadas.map((r) => r.id),
      ]);
    };
  }

  test('rodada tem 5 questões; com 3 ou 4 disponíveis sai com elas, sem repetir', async () => {
    const u = await novoJogador();
    for (const [disponiveis, esperado] of [
      [3, 3],
      [4, 4],
      [5, 5],
      [8, 5],
    ]) {
      const limpar = await mediasDisponiveis(disponiveis);
      try {
        const rodada = (await novaRodada(u, { dificuldade: 'media' }).expect(201)).body;
        assert.equal(rodada.questoes.length, esperado, `${disponiveis} disponíveis`);
        assert.equal(new Set(rodada.questoes.map((q) => q.id)).size, esperado);
      } finally {
        await limpar();
      }
    }
  });

  test('menos de 3 disponíveis no nível: 409 NIVEL_INDISPONIVEL e nenhuma rodada criada', async () => {
    const u = await novoJogador();
    for (const disponiveis of [2, 0]) {
      const limpar = await mediasDisponiveis(disponiveis);
      try {
        const res = await novaRodada(u, { dificuldade: 'media' }).expect(409);
        assert.deepEqual(res.body.erro, {
          codigo: 'NIVEL_INDISPONIVEL',
          mensagem: 'Este nível ainda não tem questões suficientes',
        });
      } finally {
        await limpar();
      }
    }
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM trivia_rodadas WHERE usuario_id = $1', [
      u.usuario.id,
    ]);
    assert.equal(rows[0].n, 0, 'transação desfeita');
  });

  test('o tamanho é do servidor: limite enviado pelo cliente é ignorado', async () => {
    const u = await novoJogador();
    const limpar = await mediasDisponiveis(8);
    try {
      for (const limite of [20, 1, '10']) {
        const rodada = (await novaRodada(u, { dificuldade: 'media', limite }).expect(201)).body;
        assert.equal(rodada.questoes.length, 5, `limite ${limite}`);
      }
    } finally {
      await limpar();
    }
  });

  test('dificuldade inválida ou ausente dá 400', async () => {
    const u = await novoJogador();
    for (const corpo of [{ dificuldade: 'impossivel' }, { dificuldade: 'MEDIA' }, {}]) {
      await novaRodada(u, corpo).expect(400);
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
    // Todas as questões do seed são de LGPD: o feedback aponta a aula 01 para rever.
    const { rows } = await pool.query("SELECT id, ordem, titulo FROM aulas WHERE slug = 'introducao-lgpd'");
    assert.deepEqual(erro.aula_referencia, rows[0]);
    assert.deepEqual(certo.aula_referencia, rows[0]);
    // O reenvio idempotente também traz a aula.
    const reenvio = (await responder(u, rodada.id, q2.id, errada(certas[q2.id])).expect(200)).body;
    assert.deepEqual(reenvio.aula_referencia, rows[0]);
  });

  test('questão sem aula de referência (dado antigo) responde com aula_referencia null', async () => {
    const admin = await novoAdmin(); // admin sorteia qualquer questão ativa do nível
    const { rows } = await pool.query(
      "UPDATE questoes_trivia SET aula_referencia_id = NULL WHERE dificuldade = 'facil' RETURNING id",
    );
    try {
      const rodada = (await novaRodada(admin).expect(201)).body;
      const res = (await responder(admin, rodada.id, rodada.questoes[0].id, 'a').expect(200)).body;
      assert.equal(res.aula_referencia, null);
    } finally {
      await pool.query(
        'UPDATE questoes_trivia SET aula_referencia_id = (SELECT id FROM aulas WHERE ordem = 1) WHERE id = ANY($1)',
        [rows.map((r) => r.id)],
      );
    }
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

  test('reenvio de um acerto mostra os pontos creditados, mesmo com a questão editada depois', async () => {
    const u = await novoJogador();
    const rodada = (await novaRodada(u)).body;
    const q = rodada.questoes[0];
    const certas = await gabarito('questoes_trivia', [q.id]);
    const primeira = (await responder(u, rodada.id, q.id, certas[q.id]).expect(200)).body;
    assert.equal(primeira.pontos_ganhos, 5);
    await pool.query('UPDATE questoes_trivia SET pontos = 99 WHERE id = $1', [q.id]);
    try {
      assert.deepEqual((await responder(u, rodada.id, q.id, certas[q.id]).expect(200)).body, primeira);
    } finally {
      await pool.query('UPDATE questoes_trivia SET pontos = $2 WHERE id = $1', [q.id, q.pontos]);
    }
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

  test('primeiro acerto em duas rodadas ao mesmo tempo: as duas gravam, pontua uma vez só', async () => {
    const u = await novoJogador();
    // Fácil tem 3 questões: as duas rodadas sorteiam as mesmas.
    const [r1, r2] = [(await novaRodada(u)).body, (await novaRodada(u)).body];
    const q = r1.questoes[0];
    const certas = await gabarito('questoes_trivia', [q.id]);
    const r = await emCorrida(u.usuario.id, () =>
      [r1, r2].map((rodada) => responder(u, rodada.id, q.id, certas[q.id])),
    );
    assert.deepEqual(
      r.map((x) => x.status),
      [200, 200],
    );
    assert.deepEqual(r.map((x) => x.body.pontos_ganhos).sort(), [0, 5]);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS respostas, count(*) FILTER (WHERE pontuou)::int AS pontuou,
         (SELECT sum(pontos_ganhos)::int FROM trivia_rodadas WHERE usuario_id = $1) AS pontos_rodadas
       FROM trivia_respostas WHERE usuario_id = $1 AND questao_id = $2`,
      [u.usuario.id, q.id],
    );
    assert.deepEqual(rows[0], { respostas: 2, pontuou: 1, pontos_rodadas: 5 });
    assert.equal((await u.api('get', '/api/auth/me')).body.pontuacao_total, 5);
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
    await completarRodada(u, rodada);
    const fim = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`).expect(200)).body;
    assert.equal(fim.acertos, 1);
    assert.equal(fim.total_questoes, 3);
    assert.equal(fim.pontos_ganhos, 5);
    assert.equal(fim.pontuacao_total, 5);
    assert.deepEqual(
      fim.novos_badges.map((b) => b.tipo_criterio),
      ['primeira_trivia'],
    );

    // Reenvio da finalização (retorno perdido): mesmo resumo e mesmas conquistas, sem data nova.
    const { finalizada_em } = (await u.api('get', `/api/trivia/rodadas/${rodada.id}`)).body;
    const de_novo = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`).expect(200)).body;
    assert.deepEqual(de_novo, fim);
    // Trocar a resposta de uma questão depois do fim: 409.
    const q1 = rodada.questoes[1];
    const trocada = await responder(u, rodada.id, q1.id, certas[q1.id]).expect(409);
    assert.equal(trocada.body.erro.codigo, 'JA_RESPONDIDA');
    // Questão que entrou na rodada depois do fim (só por SQL) é recusada.
    const { rows: outra } = await pool.query(
      "SELECT id FROM questoes_trivia WHERE dificuldade = 'media' LIMIT 1",
    );
    await pool.query(
      'INSERT INTO trivia_rodada_questoes (rodada_id, questao_id, ordem) VALUES ($1, $2, 99)',
      [rodada.id, outra[0].id],
    );
    const res = await responder(u, rodada.id, outra[0].id, 'a').expect(409);
    assert.equal(res.body.erro.codigo, 'RODADA_FINALIZADA');
    // A já respondida, reenviada igual, devolve o resultado gravado.
    const q = rodada.questoes[0];
    assert.equal((await responder(u, rodada.id, q.id, certas[q.id]).expect(200)).body.pontos_ganhos, 5);
    const vista = (await u.api('get', `/api/trivia/rodadas/${rodada.id}`)).body;
    assert.equal(vista.finalizada_em, finalizada_em);
    assert.equal((await u.api('get', '/api/auth/me')).body.pontuacao_total, 5);
  });

  test('com questão pendente dá 409 QUESTOES_PENDENTES e a rodada segue aberta', async () => {
    const u = await novoJogador();
    const rodada = (await novaRodada(u)).body;
    const finalizar = () => u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`);
    // Sem nenhuma resposta e com todas menos uma.
    assert.equal((await finalizar().expect(409)).body.erro.codigo, 'QUESTOES_PENDENTES');
    const [ultima, ...outras] = rodada.questoes;
    await completarRodada(u, { ...rodada, questoes: outras });
    assert.equal((await finalizar().expect(409)).body.erro.codigo, 'QUESTOES_PENDENTES');
    const aberta = (await u.api('get', `/api/trivia/rodadas/${rodada.id}`)).body;
    assert.equal(aberta.finalizada_em, null);
    // Respondida a última (mesmo errada), termina; o badge vem uma vez só.
    await completarRodada(u, { ...rodada, questoes: [ultima] });
    const fim = (await finalizar().expect(200)).body;
    assert.deepEqual(
      fim.novos_badges.map((b) => b.nome),
      ['Curioso da Trivia'],
    );
    const r2 = (await novaRodada(u)).body;
    await completarRodada(u, r2);
    const f2 = (await u.api('post', `/api/trivia/rodadas/${r2.id}/finalizar`).expect(200)).body;
    assert.deepEqual(f2.novos_badges, []);
  });

  test('finalizações paralelas: as duas recebem o resumo e o badge, gravado uma vez', async () => {
    const u = await novoJogador();
    const rodada = (await novaRodada(u)).body;
    await completarRodada(u, rodada);
    const r = await Promise.all(
      [1, 2].map(() => u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`)),
    );
    assert.deepEqual(
      r.map((x) => x.status),
      [200, 200],
    );
    assert.deepEqual(
      r.map((x) => x.body.novos_badges.map((b) => b.tipo_criterio)),
      [['primeira_trivia'], ['primeira_trivia']],
    );
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM usuario_badges ub JOIN badges b ON b.id = ub.badge_id
       WHERE ub.usuario_id = $1 AND b.tipo_criterio = 'primeira_trivia'`,
      [u.usuario.id],
    );
    assert.equal(rows[0].n, 1);
  });

  test('rodada inexistente dá 404', async () => {
    const u = await novoJogador();
    await u.api('post', `/api/trivia/rodadas/${UUID_INEXISTENTE}/finalizar`).expect(404);
  });
});

describe('rodada de outro usuário (IDOR)', () => {
  test('ver, responder e finalizar a rodada de A com o token de B dá 404 e não muda nada', async () => {
    const [a, b] = [await novoJogador(), await novoJogador()];
    const rodada = (await novaRodada(a).expect(201)).body;
    const certas = await gabarito(
      'questoes_trivia',
      rodada.questoes.map((q) => q.id),
    );
    const [q1, q2] = rodada.questoes;
    await responder(a, rodada.id, q1.id, certas[q1.id]).expect(200);
    const estado = async () =>
      (
        await pool.query(
          `SELECT r.finalizada_em, r.pontos_ganhos,
             (SELECT count(*)::int FROM trivia_respostas tr WHERE tr.rodada_id = r.id) AS respostas,
             (SELECT pontuacao_total FROM usuarios WHERE id = $2) AS pontos_b,
             (SELECT count(*)::int FROM usuario_badges WHERE usuario_id = $2) AS badges_b
           FROM trivia_rodadas r WHERE r.id = $1`,
          [rodada.id, b.usuario.id],
        )
      ).rows[0];
    const antes = await estado();

    await b.api('get', `/api/trivia/rodadas/${rodada.id}`).expect(404);
    for (const q of [q1, q2]) {
      const res = await responder(b, rodada.id, q.id, certas[q.id]).expect(404);
      assert.equal(res.body.erro.mensagem, 'Rodada não encontrada');
    }
    await b.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`).expect(404);
    assert.deepEqual(await estado(), antes);
    assert.equal(antes.finalizada_em, null);
    assert.equal(antes.respostas, 1);
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

  test('rodada com só um acerto não completa o nível', async () => {
    const u = await novoJogador();
    const rodada = (await novaRodada(u)).body;
    await completarRodada(u, rodada, (id) => id === rodada.questoes[0].id);
    const fim = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`)).body;
    assert.deepEqual(
      fim.novos_badges.map((b) => b.nome),
      ['Curioso da Trivia'],
    );
  });

  test('nova questão ativa no nível tira a chance de quem ainda não a respondeu', async () => {
    const u = await novoJogador();
    const { rows } = await pool.query(
      "INSERT INTO questoes_trivia (dificuldade, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta, aula_referencia_id) VALUES ('dificil', 'Nova', 'a', 'b', 'c', 'd', 'a', (SELECT id FROM aulas WHERE ordem = 1)) RETURNING id",
    );
    try {
      // A rodada sorteia todas as 5 difíceis; acerta todas menos a nova.
      const rodada = (await novaRodada(u, { dificuldade: 'dificil' })).body;
      assert.equal(rodada.questoes.length, 5);
      const certas = await gabarito(
        'questoes_trivia',
        rodada.questoes.map((q) => q.id),
      );
      for (const q of rodada.questoes.filter((q) => q.id !== rows[0].id)) {
        await responder(u, rodada.id, q.id, certas[q.id]).expect(200);
      }
      await completarRodada(u, rodada); // erra a nova
      const fim = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`)).body;
      assert.ok(!fim.novos_badges.some((b) => b.nome === 'Elite da Trivia'));

      // Questão desativada (remoção do admin) deixa de contar: a conquista sai na próxima rodada.
      await pool.query('UPDATE questoes_trivia SET ativo = false WHERE id = $1', [rows[0].id]);
      const r2 = (await novaRodada(u, { dificuldade: 'dificil' })).body;
      await completarRodada(u, r2);
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
      await completarRodada(u, rodada);
      nomes = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`)).body.novos_badges.map(
        (b) => b.nome,
      );
    }
    assert.ok(nomes.includes('Frequentador da Trivia'));
  });

  test('rodadas finalizadas sem resposta não dão Curioso nem Frequentador', async () => {
    const u = await novoJogador();
    // A API já não finaliza rodada vazia (409): o critério dos badges é que tem de recusá-la.
    const vazia = () =>
      pool.query(
        "INSERT INTO trivia_rodadas (usuario_id, dificuldade, finalizada_em) VALUES ($1, 'facil', now())",
        [u.usuario.id],
      );
    const conceder = async () => (await concederBadges(pool, u.usuario.id)).map((b) => b.nome);
    await vazia();
    assert.deepEqual(await conceder(), [], 'uma vazia não dá o Curioso');
    for (let i = 1; i < 10; i++) await vazia();
    assert.deepEqual(await conceder(), [], 'dez vazias não dão o Frequentador');
    // A 11ª, jogada até o fim, conta como a primeira: dá só o Curioso.
    const rodada = (await novaRodada(u)).body;
    await completarRodada(u, rodada);
    const fim = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`).expect(200)).body;
    assert.deepEqual(
      fim.novos_badges.map((b) => b.nome),
      ['Curioso da Trivia'],
    );
  });

  test('pontos acumulados dão Centena e Pontuação de Elite', async () => {
    const u = await novoJogador();
    await pool.query('UPDATE usuarios SET pontuacao_total = 99 WHERE id = $1', [u.usuario.id]);
    assert.ok(!(await jogar(u, 'facil', () => false)).includes('Centena'));
    await pool.query('UPDATE usuarios SET pontuacao_total = 300 WHERE id = $1', [u.usuario.id]);
    assert.deepEqual((await jogar(u, 'facil', () => false)).sort(), ['Centena', 'Pontuação de Elite'].sort());
  });
});
