const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, prepararBanco, novoUsuario, novoJogador, novoAdmin, gabarito, errada } = require('../ajuda');

before(prepararBanco);
after(() => pool.end());

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

async function primeiraAula(u) {
  return (await u.api('get', '/api/aulas').expect(200)).body[0];
}

// Responde todas as questões; `acertar(i)` decide se a i-ésima é respondida certa.
async function responderAula(u, aulaId, acertar = () => true) {
  const aula = (await u.api('get', `/api/aulas/${aulaId}`).expect(200)).body;
  const certas = await gabarito(
    'questoes_aula',
    aula.questoes.map((q) => q.id),
  );
  const visita = (await u.api('post', `/api/aulas/${aulaId}/visitas`).expect(201)).body;
  const respostas = [];
  for (const [i, q] of aula.questoes.entries()) {
    const alternativa = acertar(i) ? certas[q.id] : errada(certas[q.id]);
    respostas.push(
      (
        await u
          .api('post', `/api/visitas/${visita.id}/respostas`)
          .send({ questao_id: q.id, alternativa })
          .expect(200)
      ).body,
    );
  }
  return { aula, visita, respostas, certas };
}

describe('GET /api/aulas', () => {
  test('lista aulas ativas em ordem, com total de questões e status de conclusão', async () => {
    const u = await novoUsuario();
    const aulas = (await u.api('get', '/api/aulas').expect(200)).body;
    const ordens = aulas.map((a) => a.ordem);
    assert.deepEqual(
      ordens,
      [...ordens].sort((x, y) => x - y),
    );
    assert.equal(aulas[0].total_questoes, 2);
    assert.ok(aulas.every((a) => a.concluida === false));
    assert.equal(aulas[0].conteudo_html, undefined, 'lista não traz o conteúdo inteiro');
  });

  test('aula desativada some da lista e questões desativadas não contam', async () => {
    const u = await novoUsuario();
    // a2 = primeira aula (a que tem questões); a1 = a segunda.
    const [a2, a1] = (await u.api('get', '/api/aulas')).body;
    await pool.query('UPDATE aulas SET ativo = false WHERE id = $1', [a1.id]);
    await pool.query(
      'UPDATE questoes_aula SET ativo = false WHERE id = (SELECT id FROM questoes_aula WHERE aula_id = $1 LIMIT 1)',
      [a2.id],
    );
    try {
      const aulas = (await u.api('get', '/api/aulas')).body;
      assert.equal(
        aulas.find((a) => a.id === a1.id),
        undefined,
      );
      assert.equal(aulas.find((a) => a.id === a2.id).total_questoes, 1);
    } finally {
      await pool.query('UPDATE aulas SET ativo = true WHERE id = $1', [a1.id]);
      await pool.query('UPDATE questoes_aula SET ativo = true WHERE aula_id = $1', [a2.id]);
    }
  });

  test('conclusão é por usuário', async () => {
    const a = await novoUsuario();
    const b = await novoUsuario();
    const aula = await primeiraAula(a);
    const { visita } = await responderAula(a, aula.id);
    await a.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
    assert.equal((await primeiraAula(a)).concluida, true);
    assert.equal((await primeiraAula(b)).concluida, false);
  });
});

describe('trilha em sequência', () => {
  test('lista marca bloqueada toda aula cuja anterior não foi concluída', async () => {
    const u = await novoUsuario();
    let aulas = (await u.api('get', '/api/aulas')).body;
    assert.deepEqual(
      aulas.map((a) => a.bloqueada),
      aulas.map((_, i) => i > 0),
    );
    const { visita } = await responderAula(u, aulas[0].id);
    await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
    aulas = (await u.api('get', '/api/aulas')).body;
    assert.deepEqual(
      aulas.map((a) => a.bloqueada),
      aulas.map((_, i) => i > 1),
    );
  });

  test('aula bloqueada não abre nem inicia visita: 403 dizendo qual concluir', async () => {
    const u = await novoUsuario();
    const [, segunda, terceira] = (await u.api('get', '/api/aulas')).body;
    for (const [metodo, url] of [
      ['get', `/api/aulas/${segunda.id}`],
      ['post', `/api/aulas/${segunda.id}/visitas`],
    ]) {
      const res = await u.api(metodo, url).expect(403);
      assert.deepEqual(res.body.erro, {
        codigo: 'AULA_BLOQUEADA',
        mensagem: 'Conclua a aula 1 para continuar',
      });
    }
    const res = await u.api('get', `/api/aulas/${terceira.id}`).expect(403);
    assert.equal(res.body.erro.mensagem, 'Conclua a aula 2 para continuar');
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM aula_visitas WHERE usuario_id = $1', [
      u.usuario.id,
    ]);
    assert.equal(rows[0].n, 0);
  });

  test('visita aberta sem concluir não libera a próxima; concluir libera', async () => {
    const u = await novoUsuario();
    const [primeira, segunda] = (await u.api('get', '/api/aulas')).body;
    const { visita } = await responderAula(u, primeira.id);
    await u.api('get', `/api/aulas/${segunda.id}`).expect(403);
    await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
    await u.api('get', `/api/aulas/${segunda.id}`).expect(200);
    await u.api('post', `/api/aulas/${segunda.id}/visitas`).expect(201);
  });

  test('aula desativada sai da trilha: a seguinte passa a depender da anterior a ela', async () => {
    const u = await novoUsuario();
    const [primeira, segunda, terceira] = (await u.api('get', '/api/aulas')).body;
    const { visita } = await responderAula(u, primeira.id);
    await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
    await pool.query('UPDATE aulas SET ativo = false WHERE id = $1', [segunda.id]);
    try {
      await u.api('get', `/api/aulas/${terceira.id}`).expect(200);
      const aulas = (await u.api('get', '/api/aulas')).body;
      assert.equal(aulas.find((a) => a.id === terceira.id).bloqueada, false);
    } finally {
      await pool.query('UPDATE aulas SET ativo = true WHERE id = $1', [segunda.id]);
    }
  });

  test('conclusão é permanente: aula concluída segue aberta mesmo sem a anterior constar como concluída', async () => {
    const u = await novoUsuario();
    const [a1, a2, a3, a4] = (await u.api('get', '/api/aulas')).body;
    for (const a of [a1, a2]) {
      const { visita } = await responderAula(u, a.id);
      await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
    }
    // A aula 01 deixa de constar como concluída (simulado por SQL).
    await pool.query('DELETE FROM aula_visitas WHERE usuario_id = $1 AND aula_id = $2', [
      u.usuario.id,
      a1.id,
    ]);

    await u.api('get', `/api/aulas/${a2.id}`).expect(200);
    await u.api('post', `/api/aulas/${a2.id}/visitas`).expect(201);
    await u.api('get', `/api/aulas/${a3.id}`).expect(200); // liberada pela 02, que segue concluída
    const res = await u.api('get', `/api/aulas/${a4.id}`).expect(403);
    assert.equal(res.body.erro.codigo, 'AULA_BLOQUEADA');

    const lista = (await u.api('get', '/api/aulas')).body;
    const bloqueada = (id) => lista.find((a) => a.id === id).bloqueada;
    assert.deepEqual(
      [bloqueada(a1.id), bloqueada(a2.id), bloqueada(a3.id), bloqueada(a4.id)],
      [false, false, false, true],
    );
    assert.equal(lista.find((a) => a.id === a2.id).concluida, true);
  });

  test('aula não concluída com a anterior pendente continua bloqueada (403)', async () => {
    const u = await novoUsuario();
    const [, a2] = (await u.api('get', '/api/aulas')).body;
    await u.api('get', `/api/aulas/${a2.id}`).expect(403);
    await u.api('post', `/api/aulas/${a2.id}/visitas`).expect(403);
    // Visita aberta (não concluída) na própria aula não libera.
    await pool.query('INSERT INTO aula_visitas (usuario_id, aula_id) VALUES ($1, $2)', [u.usuario.id, a2.id]);
    await u.api('get', `/api/aulas/${a2.id}`).expect(403);
  });

  test('aluno comum percorre a trilha de 01 a 15 pela tela e a trivia libera no fim', async () => {
    const u = await novoUsuario();
    const aulas = (await u.api('get', '/api/aulas')).body;
    assert.equal(aulas.length, 15);
    for (const [i, a] of aulas.entries()) {
      // Toda aula tem ao menos uma pergunta: sem ela, a tela não teria como concluir a aula.
      const { visita, aula } = await responderAula(u, a.id);
      assert.ok(aula.questoes.length > 0, `aula ${a.ordem} sem pergunta`);
      const fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
      assert.equal(fim.trivia_liberada, i === aulas.length - 1, `trivia na aula ${a.ordem}`);
      if (i === 0) await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'facil' }).expect(403);
    }
    assert.ok((await u.api('get', '/api/aulas')).body.every((a) => a.concluida && !a.bloqueada));
    await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'facil' }).expect(201);
  });

  test('pergunta provisória das aulas 02 a 15: uma só, chave confirmacao-leitura, "Sim" correta', async () => {
    const { rows } = await pool.query(
      `SELECT a.ordem, q.chave, q.resposta_correta, q.alternativa_a, q.pontos
       FROM aulas a JOIN questoes_aula q ON q.aula_id = a.id AND q.ativo WHERE a.ordem > 1 ORDER BY a.ordem`,
    );
    assert.equal(rows.length, 14);
    for (const q of rows) {
      assert.deepEqual(
        [q.chave, q.resposta_correta, q.alternativa_a, q.pontos],
        ['confirmacao-leitura', 'a', 'Sim', 10],
      );
    }
  });
});

describe('admin', () => {
  test('vê a trilha toda liberada: abre e faz qualquer aula', async () => {
    const admin = await novoAdmin();
    const aulas = (await admin.api('get', '/api/aulas')).body;
    assert.ok(aulas.every((a) => !a.bloqueada));
    const ultima = aulas.at(-1);
    await admin.api('get', `/api/aulas/${ultima.id}`).expect(200);
    const { visita } = await responderAula(admin, ultima.id);
    await admin.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
  });

  test('acertar e concluir não dá pontos, bônus nem histórico', async () => {
    const admin = await novoAdmin();
    const aula = await primeiraAula(admin);
    const { respostas, visita } = await responderAula(admin, aula.id);
    assert.ok(respostas.every((r) => r.correta && r.pontos_ganhos === 0 && r.pontuacao_total === 0));
    const fim = (await admin.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
    assert.deepEqual(
      [fim.pontos_questoes, fim.bonus_conclusao, fim.pontuacao_total, fim.trivia_liberada],
      [0, 0, 0, true],
    );
    const { rows } = await pool.query(
      `SELECT (SELECT count(*)::int FROM pontuacao_historico WHERE usuario_id = $1) AS historico,
         (SELECT count(*)::int FROM aula_respostas WHERE usuario_id = $1 AND pontuou) AS pontuadas,
         (SELECT count(*)::int FROM aula_visitas WHERE usuario_id = $1 AND pontos_conclusao_ganhos) AS bonus`,
      [admin.usuario.id],
    );
    assert.deepEqual(rows[0], { historico: 0, pontuadas: 0, bonus: 0 });
  });
});

describe('GET /api/aulas/:id', () => {
  test('traz conteúdo e questões sem gabarito nem explicação', async () => {
    const u = await novoUsuario();
    const aula = (await u.api('get', `/api/aulas/${(await primeiraAula(u)).id}`).expect(200)).body;
    assert.match(aula.conteudo_html, /<h2>/);
    assert.equal(aula.questoes.length, 2);
    for (const q of aula.questoes) {
      assert.equal(q.resposta_correta, undefined);
      assert.equal(q.explicacao, undefined);
      assert.ok(q.alternativa_a && q.alternativa_d);
    }
  });

  test('id inexistente dá 404, id malformado dá 400', async () => {
    const u = await novoUsuario();
    await u.api('get', `/api/aulas/${UUID_INEXISTENTE}`).expect(404);
    const res = await u.api('get', '/api/aulas/123').expect(400);
    assert.equal(res.body.erro.detalhes[0].mensagem, 'Identificador inválido');
  });

  test('aula desativada dá 404 e aula sem questões traz lista vazia', async () => {
    const u = await novoJogador(); // as aulas novas vão para o fim da trilha
    const { rows } = await pool.query(
      "INSERT INTO aulas (titulo, ordem, conteudo_html, ativo) VALUES ('Vazia', 900, '<p>x</p>', true), ('Off', 901, '<p>x</p>', false) RETURNING id",
    );
    try {
      const vazia = (await u.api('get', `/api/aulas/${rows[0].id}`).expect(200)).body;
      assert.deepEqual(vazia.questoes, []);
      await u.api('get', `/api/aulas/${rows[1].id}`).expect(404);
    } finally {
      await pool.query('DELETE FROM aulas WHERE id = ANY($1)', [rows.map((r) => r.id)]);
    }
  });
});

describe('POST /api/aulas/:id/visitas', () => {
  test('cria visita para aula ativa', async () => {
    const u = await novoUsuario();
    const aula = await primeiraAula(u);
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`).expect(201)).body;
    assert.equal(visita.aula_id, aula.id);
    assert.ok(visita.iniciada_em);
  });

  test('aula inexistente ou desativada dá 404', async () => {
    const u = await novoUsuario();
    await u.api('post', `/api/aulas/${UUID_INEXISTENTE}/visitas`).expect(404);
  });
});

describe('POST /api/visitas/:id/respostas', () => {
  test('resposta certa pontua e devolve gabarito, explicação e novo total', async () => {
    const u = await novoUsuario();
    const { respostas, certas } = await responderAula(u, (await primeiraAula(u)).id);
    assert.equal(respostas[0].correta, true);
    assert.equal(respostas[0].pontos_ganhos, 10);
    assert.equal(respostas[0].pontuacao_total, 10);
    assert.equal(respostas[1].pontuacao_total, 20);
    assert.ok(Object.values(certas).includes(respostas[0].resposta_correta));
    assert.ok(respostas[0].explicacao);
  });

  test('resposta errada não pontua, mas mostra o gabarito', async () => {
    const u = await novoUsuario();
    const { respostas } = await responderAula(u, (await primeiraAula(u)).id, () => false);
    assert.equal(respostas[0].correta, false);
    assert.equal(respostas[0].pontos_ganhos, 0);
    assert.equal(respostas[1].pontuacao_total, 0);
    assert.match(respostas[0].resposta_correta, /^[a-d]$/);
  });

  test('errar numa visita e acertar na seguinte ainda pontua (primeiro acerto)', async () => {
    const u = await novoUsuario();
    const aula = await primeiraAula(u);
    await responderAula(u, aula.id, () => false);
    const { respostas } = await responderAula(u, aula.id);
    assert.equal(respostas[0].pontos_ganhos, 10);
  });

  test('reenvio da mesma alternativa (retorno perdido) devolve o mesmo resultado sem pontuar de novo', async () => {
    const u = await novoUsuario();
    const aula = (await u.api('get', `/api/aulas/${(await primeiraAula(u)).id}`)).body;
    const q = aula.questoes[0];
    const certas = await gabarito('questoes_aula', [q.id]);
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    const corpo = { questao_id: q.id, alternativa: certas[q.id] };
    const url = `/api/visitas/${visita.id}/respostas`;
    const primeira = (await u.api('post', url).send(corpo).expect(200)).body;
    assert.equal(primeira.pontos_ganhos, 10);
    const historico = async () =>
      (
        await pool.query('SELECT count(*)::int AS n FROM pontuacao_historico WHERE usuario_id = $1', [
          u.usuario.id,
        ])
      ).rows[0].n;
    const antes = await historico();
    const segunda = (await u.api('post', url).send(corpo).expect(200)).body;
    assert.deepEqual(segunda, primeira);
    assert.equal(await historico(), antes);
    assert.equal((await u.api('get', '/api/auth/me')).body.pontuacao_total, 10);
    const { rows } = await pool.query('SELECT alternativa FROM aula_respostas WHERE visita_id = $1', [
      visita.id,
    ]);
    assert.deepEqual(rows, [{ alternativa: certas[q.id] }]);
  });

  test('reenvio de um acerto mostra os pontos creditados, mesmo com a questão editada depois', async () => {
    const u = await novoUsuario();
    const aula = (await u.api('get', `/api/aulas/${(await primeiraAula(u)).id}`)).body;
    const q = aula.questoes[0];
    const certas = await gabarito('questoes_aula', [q.id]);
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    const url = `/api/visitas/${visita.id}/respostas`;
    const corpo = { questao_id: q.id, alternativa: certas[q.id] };
    const primeira = (await u.api('post', url).send(corpo).expect(200)).body;
    assert.equal(primeira.pontos_ganhos, 10);
    await pool.query('UPDATE questoes_aula SET pontos = 99 WHERE id = $1', [q.id]);
    try {
      assert.deepEqual((await u.api('post', url).send(corpo).expect(200)).body, primeira);
    } finally {
      await pool.query('UPDATE questoes_aula SET pontos = $2 WHERE id = $1', [q.id, q.pontos]);
    }
  });

  test('reenvio de resposta errada devolve o mesmo resultado; trocar a alternativa dá 409', async () => {
    const u = await novoUsuario();
    const aula = (await u.api('get', `/api/aulas/${(await primeiraAula(u)).id}`)).body;
    const q = aula.questoes[0];
    const certas = await gabarito('questoes_aula', [q.id]);
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    const url = `/api/visitas/${visita.id}/respostas`;
    const corpo = { questao_id: q.id, alternativa: errada(certas[q.id]) };
    const primeira = (await u.api('post', url).send(corpo).expect(200)).body;
    assert.equal(primeira.correta, false);
    assert.deepEqual((await u.api('post', url).send(corpo).expect(200)).body, primeira);
    // Nem a certa (que pontuaria) nem outra errada trocam a resposta gravada.
    for (const alternativa of [certas[q.id], errada(errada(certas[q.id]))]) {
      const res = await u.api('post', url).send({ questao_id: q.id, alternativa }).expect(409);
      assert.equal(res.body.erro.codigo, 'JA_RESPONDIDA');
    }
    assert.equal((await u.api('get', '/api/auth/me')).body.pontuacao_total, 0);
  });

  test('resposta antiga sem alternativa gravada (antes da migration 006): reenvio continua 409', async () => {
    const u = await novoUsuario();
    const aula = (await u.api('get', `/api/aulas/${(await primeiraAula(u)).id}`)).body;
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    const corpo = { questao_id: aula.questoes[0].id, alternativa: 'a' };
    await u.api('post', `/api/visitas/${visita.id}/respostas`).send(corpo).expect(200);
    await pool.query('UPDATE aula_respostas SET alternativa = NULL WHERE visita_id = $1', [visita.id]);
    const res = await u.api('post', `/api/visitas/${visita.id}/respostas`).send(corpo).expect(409);
    assert.equal(res.body.erro.codigo, 'JA_RESPONDIDA');
  });

  test('duas respostas iguais em paralelo: as duas recebem o mesmo resultado, gravado uma vez', async () => {
    const u = await novoUsuario();
    const aula = (await u.api('get', `/api/aulas/${(await primeiraAula(u)).id}`)).body;
    const q = aula.questoes[0];
    const certas = await gabarito('questoes_aula', [q.id]);
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    const corpo = { questao_id: q.id, alternativa: certas[q.id] };
    const r = await Promise.all(
      [1, 2].map(() => u.api('post', `/api/visitas/${visita.id}/respostas`).send(corpo)),
    );
    assert.deepEqual(
      r.map((x) => x.status),
      [200, 200],
    );
    assert.deepEqual(r[0].body, r[1].body);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM aula_respostas WHERE visita_id = $1', [
      visita.id,
    ]);
    assert.equal(rows[0].n, 1);
    assert.equal((await u.api('get', '/api/auth/me')).body.pontuacao_total, 10);
  });

  test('questão de outra aula, desativada ou inexistente dá 404', async () => {
    const u = await novoJogador();
    const [a2, a1] = (await u.api('get', '/api/aulas')).body;
    const outra = (await u.api('get', `/api/aulas/${a2.id}`)).body.questoes[0];
    const visita = (await u.api('post', `/api/aulas/${a1.id}/visitas`)).body;
    const res = await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: outra.id, alternativa: 'a' })
      .expect(404);
    assert.equal(res.body.erro.mensagem, 'Questão não encontrada nesta aula');
    await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: UUID_INEXISTENTE, alternativa: 'a' })
      .expect(404);
  });

  test('corpo inválido dá 400', async () => {
    const u = await novoUsuario();
    const visita = (await u.api('post', `/api/aulas/${(await primeiraAula(u)).id}/visitas`)).body;
    for (const corpo of [
      {},
      { questao_id: 'x', alternativa: 'a' },
      { questao_id: UUID_INEXISTENTE, alternativa: 'e' },
    ]) {
      await u.api('post', `/api/visitas/${visita.id}/respostas`).send(corpo).expect(400);
    }
  });

  test('visita inexistente dá 404', async () => {
    const u = await novoUsuario();
    await u
      .api('post', `/api/visitas/${UUID_INEXISTENTE}/respostas`)
      .send({ questao_id: UUID_INEXISTENTE, alternativa: 'a' })
      .expect(404);
  });
});

describe('aula desativada com a visita aberta', () => {
  test('responder e finalizar dão 404, sem pontos nem bônus; reativada, a visita segue', async () => {
    const u = await novoJogador();
    const { rows } = await pool.query(
      "INSERT INTO aulas (titulo, ordem, conteudo_html, pontos_conclusao) VALUES ('Some no meio', 952, '<p>x</p>', 7) RETURNING id",
    );
    const aulaId = rows[0].id;
    try {
      const { rows: q } = await pool.query(
        `INSERT INTO questoes_aula (aula_id, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d,
           resposta_correta, pontos) VALUES ($1, 'P?', 'a', 'b', 'c', 'd', 'a', 10) RETURNING id`,
        [aulaId],
      );
      const visita = (await u.api('post', `/api/aulas/${aulaId}/visitas`).expect(201)).body;
      await pool.query('UPDATE aulas SET ativo = false WHERE id = $1', [aulaId]);

      const resposta = await u
        .api('post', `/api/visitas/${visita.id}/respostas`)
        .send({ questao_id: q[0].id, alternativa: 'a' })
        .expect(404);
      assert.equal(resposta.body.erro.mensagem, 'Visita não encontrada');
      await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(404);
      const { rows: estado } = await pool.query(
        `SELECT v.finalizada_em, (SELECT count(*)::int FROM aula_respostas WHERE visita_id = v.id) AS respostas
         FROM aula_visitas v WHERE v.id = $1`,
        [visita.id],
      );
      assert.deepEqual(estado[0], { finalizada_em: null, respostas: 0 });
      assert.equal((await u.api('get', '/api/auth/me')).body.pontuacao_total, 0);

      await pool.query('UPDATE aulas SET ativo = true WHERE id = $1', [aulaId]);
      await u
        .api('post', `/api/visitas/${visita.id}/respostas`)
        .send({ questao_id: q[0].id, alternativa: 'a' })
        .expect(200);
      assert.equal(
        (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body.bonus_conclusao,
        7,
      );
    } finally {
      await pool.query('DELETE FROM aulas WHERE id = $1', [aulaId]);
    }
  });
});

describe('visita de outro usuário (IDOR)', () => {
  test('responder e finalizar a visita de A com o token de B dá 404 e não muda nada', async () => {
    const [a, b] = [await novoUsuario(), await novoUsuario()];
    const aulaId = (await primeiraAula(a)).id;
    const aula = (await a.api('get', `/api/aulas/${aulaId}`)).body;
    const visita = (await a.api('post', `/api/aulas/${aulaId}/visitas`).expect(201)).body;
    const certas = await gabarito(
      'questoes_aula',
      aula.questoes.map((q) => q.id),
    );
    const [q1, q2] = aula.questoes;
    await a
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: q1.id, alternativa: certas[q1.id] })
      .expect(200);
    const estado = async () =>
      (
        await pool.query(
          `SELECT v.finalizada_em, v.concluida, (SELECT count(*)::int FROM aula_respostas r WHERE r.visita_id = v.id) AS respostas,
             (SELECT pontuacao_total FROM usuarios WHERE id = $2) AS pontos_a, (SELECT pontuacao_total FROM usuarios WHERE id = $3) AS pontos_b
           FROM aula_visitas v WHERE v.id = $1`,
          [visita.id, a.usuario.id, b.usuario.id],
        )
      ).rows[0];
    const antes = await estado();

    for (const questao of [q1, q2]) {
      const res = await b
        .api('post', `/api/visitas/${visita.id}/respostas`)
        .send({ questao_id: questao.id, alternativa: certas[questao.id] })
        .expect(404);
      assert.equal(res.body.erro.mensagem, 'Visita não encontrada');
    }
    await b.api('post', `/api/visitas/${visita.id}/finalizar`).expect(404);
    assert.deepEqual(await estado(), antes);
    assert.equal(antes.respostas, 1);
    assert.equal(antes.pontos_b, 0);
  });
});

describe('POST /api/visitas/:id/finalizar', () => {
  test('primeira conclusão paga bônus, concede badge e marca a aula como concluída', async () => {
    const u = await novoUsuario();
    const aula = await primeiraAula(u);
    const { visita } = await responderAula(u, aula.id, (i) => i === 0);
    const fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
    assert.deepEqual(
      { ...fim, novos_badges: fim.novos_badges.map((b) => b.tipo_criterio) },
      {
        acertos: 1,
        total_questoes: 2,
        pontos_questoes: 10,
        bonus_conclusao: aula.pontos_conclusao,
        pontuacao_total: 10 + aula.pontos_conclusao,
        novos_badges: ['aula_concluida'],
        trivia_liberada: false,
      },
    );
  });

  test('resumo mostra o que foi creditado: editar os pontos entre responder e finalizar não muda nada', async () => {
    const u = await novoUsuario();
    const aula = await primeiraAula(u);
    const { visita, respostas } = await responderAula(u, aula.id, (i) => i === 0);
    assert.equal(respostas[0].pontos_ganhos, 10);
    const ids = (await u.api('get', `/api/aulas/${aula.id}`)).body.questoes.map((q) => q.id);
    await pool.query('UPDATE questoes_aula SET pontos = 99 WHERE id = ANY($1)', [ids]);
    try {
      const fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
      assert.deepEqual(
        [fim.pontos_questoes, fim.bonus_conclusao, fim.pontuacao_total],
        [10, aula.pontos_conclusao, 10 + aula.pontos_conclusao],
      );
      // Reenvio (retorno perdido) com o bônus da aula editado: continua o que foi creditado.
      await pool.query('UPDATE aulas SET pontos_conclusao = 77 WHERE id = $1', [aula.id]);
      const reenvio = (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
      assert.deepEqual([reenvio.pontos_questoes, reenvio.bonus_conclusao], [10, aula.pontos_conclusao]);
    } finally {
      await pool.query('UPDATE questoes_aula SET pontos = 10 WHERE id = ANY($1)', [ids]);
      await pool.query('UPDATE aulas SET pontos_conclusao = $2 WHERE id = $1', [
        aula.id,
        aula.pontos_conclusao,
      ]);
    }
  });

  test('refazer uma aula já pontuada mostra 0 no resumo (acertos contam, pontos não)', async () => {
    const u = await novoUsuario();
    const aula = await primeiraAula(u);
    let { visita } = await responderAula(u, aula.id);
    await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
    ({ visita } = await responderAula(u, aula.id));
    const fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
    assert.deepEqual([fim.acertos, fim.pontos_questoes, fim.bonus_conclusao], [2, 0, 0]);
  });

  test('refazer a aula não paga bônus de novo', async () => {
    const u = await novoUsuario();
    const aula = await primeiraAula(u);
    let { visita } = await responderAula(u, aula.id);
    const primeira = (await u.api('post', `/api/visitas/${visita.id}/finalizar`)).body;
    ({ visita } = await responderAula(u, aula.id));
    const segunda = (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
    assert.equal(segunda.bonus_conclusao, 0);
    assert.equal(segunda.pontos_questoes, 0);
    assert.equal(segunda.pontuacao_total, primeira.pontuacao_total);
    assert.deepEqual(segunda.novos_badges, []);
    // Reenvio de uma finalização que não deu conquista continua sem nenhuma.
    assert.deepEqual((await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body, segunda);
  });

  test('com questões pendentes dá 409', async () => {
    const u = await novoUsuario();
    const aula = (await u.api('get', `/api/aulas/${(await primeiraAula(u)).id}`)).body;
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    const finalizar = async () =>
      (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(409)).body.erro.codigo;
    assert.equal(await finalizar(), 'QUESTOES_PENDENTES');
    // Uma das duas respondida ainda não basta.
    await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: aula.questoes[0].id, alternativa: 'a' })
      .expect(200);
    assert.equal(await finalizar(), 'QUESTOES_PENDENTES');
  });

  test('aula sem questões pode ser concluída direto', async () => {
    const u = await novoJogador();
    const { rows } = await pool.query(
      "INSERT INTO aulas (titulo, ordem, conteudo_html, pontos_conclusao) VALUES ('Só leitura', 950, '<p>x</p>', 5) RETURNING id",
    );
    try {
      const visita = (await u.api('post', `/api/aulas/${rows[0].id}/visitas`)).body;
      const fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
      assert.equal(fim.total_questoes, 0);
      assert.equal(fim.bonus_conclusao, 5);
    } finally {
      await pool.query('DELETE FROM aulas WHERE id = $1', [rows[0].id]);
    }
  });

  test('finalizar de novo (retorno perdido) devolve o mesmo resumo sem pagar o bônus de novo', async () => {
    const u = await novoUsuario();
    const aula = await primeiraAula(u);
    const { visita, respostas, certas } = await responderAula(u, aula.id);
    const url = `/api/visitas/${visita.id}/finalizar`;
    const primeira = (await u.api('post', url).expect(200)).body;
    const historico = async () =>
      (
        await pool.query('SELECT count(*)::int AS n FROM pontuacao_historico WHERE usuario_id = $1', [
          u.usuario.id,
        ])
      ).rows[0].n;
    const { rows: antes } = await pool.query('SELECT finalizada_em FROM aula_visitas WHERE id = $1', [
      visita.id,
    ]);
    const nHistorico = await historico();
    const segunda = (await u.api('post', url).expect(200)).body;
    // Mesmas conquistas: se o retorno se perdeu, o aluno ainda vê "Nova conquista!".
    assert.deepEqual(segunda, primeira);
    assert.ok(primeira.novos_badges.length > 0);
    assert.equal(segunda.bonus_conclusao, aula.pontos_conclusao);
    assert.equal(segunda.pontuacao_total, 20 + aula.pontos_conclusao);
    assert.equal(await historico(), nHistorico);
    const { rows: depois } = await pool.query('SELECT finalizada_em FROM aula_visitas WHERE id = $1', [
      visita.id,
    ]);
    assert.deepEqual(depois, antes, 'a data de fim não muda');
    // Depois de finalizada: reenvio idêntico ainda devolve o resultado; trocar a alternativa, 409.
    const [q] = (await u.api('get', `/api/aulas/${aula.id}`)).body.questoes;
    const reenvio = await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: q.id, alternativa: certas[q.id] })
      .expect(200);
    assert.deepEqual(reenvio.body, { ...respostas[0], pontuacao_total: 20 + aula.pontos_conclusao });
    await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: q.id, alternativa: errada(certas[q.id]) })
      .expect(409);
  });

  test('visita finalizada não aceita resposta a questão nova (409 VISITA_FINALIZADA)', async () => {
    const u = await novoJogador();
    const { rows } = await pool.query(
      "INSERT INTO aulas (titulo, ordem, conteudo_html, pontos_conclusao) VALUES ('Sem questões', 951, '<p>x</p>', 0) RETURNING id",
    );
    try {
      const visita = (await u.api('post', `/api/aulas/${rows[0].id}/visitas`)).body;
      const fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
      // O admin adicionou uma questão depois.
      const { rows: q } = await pool.query(
        `INSERT INTO questoes_aula (aula_id, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d,
           resposta_correta, pontos) VALUES ($1, 'Nova?', 'a', 'b', 'c', 'd', 'a', 10) RETURNING id`,
        [rows[0].id],
      );
      const res = await u
        .api('post', `/api/visitas/${visita.id}/respostas`)
        .send({ questao_id: q[0].id, alternativa: 'a' })
        .expect(409);
      assert.equal(res.body.erro.codigo, 'VISITA_FINALIZADA');
      // A questão nova pendente não barra o reenvio da finalização (total_questoes conta as ativas de agora).
      const reenvio = (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
      assert.deepEqual(
        [reenvio.total_questoes, reenvio.acertos, reenvio.bonus_conclusao, reenvio.pontuacao_total],
        [1, 0, fim.bonus_conclusao, fim.pontuacao_total],
      );
    } finally {
      await pool.query('DELETE FROM aulas WHERE id = $1', [rows[0].id]);
    }
  });

  test('finalizações paralelas da mesma visita creditam uma única vez e devolvem o mesmo resumo', async () => {
    const u = await novoUsuario();
    const aula = await primeiraAula(u);
    const { visita } = await responderAula(u, aula.id);
    const r = await Promise.all([1, 2, 3].map(() => u.api('post', `/api/visitas/${visita.id}/finalizar`)));
    assert.deepEqual(
      r.map((x) => x.status),
      [200, 200, 200],
    );
    for (const x of r) assert.equal(x.body.pontuacao_total, 20 + aula.pontos_conclusao);
    // Todas trazem as conquistas da finalização que pagou; cada uma gravada uma vez só.
    assert.ok(r[0].body.novos_badges.length > 0);
    for (const x of r) assert.deepEqual(x.body.novos_badges, r[0].body.novos_badges);
    const { rows } = await pool.query(
      'SELECT count(*)::int AS linhas, count(DISTINCT badge_id)::int AS badges FROM usuario_badges WHERE usuario_id = $1',
      [u.usuario.id],
    );
    assert.deepEqual(rows[0], {
      linhas: r[0].body.novos_badges.length,
      badges: r[0].body.novos_badges.length,
    });
    const me = (await u.api('get', '/api/auth/me')).body;
    assert.equal(me.pontuacao_total, 20 + aula.pontos_conclusao);
  });

  test('duas visitas diferentes finalizadas em paralelo não pagam o bônus duas vezes', async () => {
    const u = await novoUsuario();
    const aula = await primeiraAula(u);
    const v1 = (await responderAula(u, aula.id)).visita;
    const v2 = (await responderAula(u, aula.id)).visita;
    const r = await Promise.all([v1, v2].map((v) => u.api('post', `/api/visitas/${v.id}/finalizar`)));
    assert.deepEqual(
      r.map((x) => x.status),
      [200, 200],
    );
    assert.deepEqual(r.map((x) => x.body.bonus_conclusao).sort(), [0, aula.pontos_conclusao].sort());
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM aula_visitas WHERE usuario_id = $1 AND pontos_conclusao_ganhos',
      [u.usuario.id],
    );
    assert.equal(rows[0].n, 1);
    const me = (await u.api('get', '/api/auth/me')).body;
    assert.equal(me.pontuacao_total, 20 + aula.pontos_conclusao);
  });

  test('primeiro acerto em duas visitas ao mesmo tempo: pontua uma vez só', async () => {
    const u = await novoUsuario();
    const aula = (await u.api('get', `/api/aulas/${(await primeiraAula(u)).id}`)).body;
    const q = aula.questoes[0];
    const certas = await gabarito('questoes_aula', [q.id]);
    const visitas = [
      (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body,
      (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body,
    ];
    const r = await Promise.all(
      visitas.map((v) =>
        u.api('post', `/api/visitas/${v.id}/respostas`).send({ questao_id: q.id, alternativa: certas[q.id] }),
      ),
    );
    // As duas respostas são gravadas (antes, a segunda esbarrava no índice único e voltava 409).
    assert.deepEqual(
      r.map((x) => x.status),
      [200, 200],
    );
    assert.deepEqual(r.map((x) => x.body.pontos_ganhos).sort(), [0, 10]);
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM aula_respostas WHERE usuario_id = $1 AND questao_id = $2 AND pontuou',
      [u.usuario.id, q.id],
    );
    assert.equal(rows[0].n, 1);
    assert.equal((await u.api('get', '/api/auth/me')).body.pontuacao_total, 10);
  });

  test('conquistas por quantidade de aulas: 5, 10 e Graduado em 15', async () => {
    const u = await novoUsuario();
    const aulas = (await u.api('get', '/api/aulas')).body;
    assert.equal(aulas.length, 15);
    const ganhas = {};
    for (const [i, aula] of aulas.entries()) {
      // Concluir de novo a mesma aula não conta como outra.
      if (i === 1) {
        const { visita } = await responderAula(u, aulas[0].id);
        await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
      }
      const { visita } = await responderAula(u, aula.id, () => false);
      const fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`)).body;
      for (const b of fim.novos_badges) ganhas[b.nome] = i + 1;
      assert.equal(
        fim.trivia_liberada,
        i === aulas.length - 1,
        `trivia liberada só na última (aula ${i + 1})`,
      );
    }
    assert.deepEqual(
      [ganhas['Primeiros Passos'], ganhas['Aprendiz Dedicado'], ganhas.Sentinela, ganhas.Graduado],
      [1, 5, 10, 15],
    );
    assert.ok(!('Guardião de Dados' in ganhas));
  });

  test('aula desativada não conta para as conquistas por quantidade', async () => {
    const u = await novoUsuario();
    const aulas = (await u.api('get', '/api/aulas')).body.slice(0, 5);
    for (const aula of aulas) {
      const { visita } = await responderAula(u, aula.id);
      await u.api('post', `/api/visitas/${visita.id}/finalizar`);
    }
    await pool.query('DELETE FROM usuario_badges WHERE usuario_id = $1', [u.usuario.id]);
    await pool.query('UPDATE aulas SET ativo = false WHERE id = $1', [aulas[4].id]);
    try {
      const { visita } = await responderAula(u, aulas[0].id);
      const fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`)).body;
      assert.ok(!fim.novos_badges.some((b) => b.nome === 'Aprendiz Dedicado'));
    } finally {
      await pool.query('UPDATE aulas SET ativo = true WHERE id = $1', [aulas[4].id]);
    }
  });

  test('visita aberta sem concluir não conta para as conquistas por quantidade', async () => {
    const u = await novoUsuario();
    const aulas = (await u.api('get', '/api/aulas')).body.slice(0, 5);
    for (const aula of aulas.slice(0, 4)) {
      const { visita } = await responderAula(u, aula.id);
      await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
    }
    const aberta = (await responderAula(u, aulas[4].id)).visita;
    const { visita } = await responderAula(u, aulas[0].id);
    let fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`)).body;
    assert.ok(!fim.novos_badges.some((b) => b.nome === 'Aprendiz Dedicado'));
    fim = (await u.api('post', `/api/visitas/${aberta.id}/finalizar`)).body;
    assert.deepEqual(
      fim.novos_badges.map((b) => b.nome),
      ['Aprendiz Dedicado'],
    );
  });

  // Acerta a pergunta das aulas 02 a 15 (trilha liberada): para o Aluno Nota 10 só falta a aula 01.
  async function acertarOutrasAulas(u) {
    const [, ...outras] = (await u.api('get', '/api/aulas')).body;
    for (const a of outras) await responderAula(u, a.id);
  }

  test('Aluno Nota 10: acertar todas as perguntas de todas as aulas, mesmo em outra visita', async () => {
    const u = await novoJogador();
    await acertarOutrasAulas(u);
    const aula = await primeiraAula(u);
    let { visita } = await responderAula(u, aula.id, (i) => i === 0);
    let fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`)).body;
    assert.ok(!fim.novos_badges.some((b) => b.tipo_criterio === 'aulas_gabaritadas'));

    ({ visita } = await responderAula(u, aula.id, (i) => i === 1));
    fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`)).body;
    assert.deepEqual(
      fim.novos_badges.map((b) => b.nome),
      ['Aluno Nota 10'],
    );
  });

  test('Aluno Nota 10 exige as perguntas das outras aulas também', async () => {
    const u = await novoJogador();
    // Sem a pergunta das aulas 02 a 15, gabaritar a aula 01 não basta.
    const { visita: primeira } = await responderAula(u, (await primeiraAula(u)).id);
    const fimSem = (await u.api('post', `/api/visitas/${primeira.id}/finalizar`)).body;
    assert.ok(!fimSem.novos_badges.some((b) => b.nome === 'Aluno Nota 10'));
    await acertarOutrasAulas(u);
    const outra = (await u.api('get', '/api/aulas')).body[1];
    const { rows } = await pool.query(
      "INSERT INTO questoes_aula (aula_id, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta) VALUES ($1, 'Extra', 'a', 'b', 'c', 'd', 'a') RETURNING id",
      [outra.id],
    );
    try {
      let { visita } = await responderAula(u, (await primeiraAula(u)).id);
      let fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`)).body;
      assert.ok(!fim.novos_badges.some((b) => b.nome === 'Aluno Nota 10'));
      // Questão desativada (remoção do admin) deixa de contar.
      await pool.query('UPDATE questoes_aula SET ativo = false WHERE id = $1', [rows[0].id]);
      ({ visita } = await responderAula(u, (await primeiraAula(u)).id));
      fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`)).body;
      assert.ok(fim.novos_badges.some((b) => b.nome === 'Aluno Nota 10'));
    } finally {
      await pool.query('DELETE FROM questoes_aula WHERE id = $1', [rows[0].id]);
    }
  });
});
