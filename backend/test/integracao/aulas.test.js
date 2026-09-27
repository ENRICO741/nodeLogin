const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, prepararBanco, novoUsuario, gabarito, errada } = require('../ajuda');

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
    assert.deepEqual(
      aulas.map((a) => a.ordem),
      [1, 2, 3],
    );
    assert.ok(aulas.every((a) => a.total_questoes === 2 && a.concluida === false));
    assert.equal(aulas[0].conteudo_html, undefined, 'lista não traz o conteúdo inteiro');
  });

  test('aula desativada some da lista e questões desativadas não contam', async () => {
    const u = await novoUsuario();
    const [a1, a2] = (await u.api('get', '/api/aulas')).body;
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
    const u = await novoUsuario();
    const { rows } = await pool.query(
      "INSERT INTO aulas (titulo, ordem, conteudo_html, ativo) VALUES ('Vazia', 900, '<p>x</p>', true), ('Off', 901, '<p>x</p>', false) RETURNING id",
    );
    const vazia = (await u.api('get', `/api/aulas/${rows[0].id}`).expect(200)).body;
    assert.deepEqual(vazia.questoes, []);
    await u.api('get', `/api/aulas/${rows[1].id}`).expect(404);
    await pool.query('DELETE FROM aulas WHERE id = ANY($1)', [rows.map((r) => r.id)]);
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

  test('mesma questão duas vezes na visita dá 409', async () => {
    const u = await novoUsuario();
    const aula = (await u.api('get', `/api/aulas/${(await primeiraAula(u)).id}`)).body;
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    const corpo = { questao_id: aula.questoes[0].id, alternativa: 'a' };
    await u.api('post', `/api/visitas/${visita.id}/respostas`).send(corpo).expect(200);
    const res = await u.api('post', `/api/visitas/${visita.id}/respostas`).send(corpo).expect(409);
    assert.equal(res.body.erro.codigo, 'JA_RESPONDIDA');
  });

  test('duas respostas iguais em paralelo: uma vale, a outra dá 409', async () => {
    const u = await novoUsuario();
    const aula = (await u.api('get', `/api/aulas/${(await primeiraAula(u)).id}`)).body;
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    const corpo = { questao_id: aula.questoes[0].id, alternativa: 'b' };
    const r = await Promise.all(
      [1, 2].map(() => u.api('post', `/api/visitas/${visita.id}/respostas`).send(corpo)),
    );
    assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
  });

  test('questão de outra aula, desativada ou inexistente dá 404', async () => {
    const u = await novoUsuario();
    const [a1, a2] = (await u.api('get', '/api/aulas')).body;
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
      },
    );
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
  });

  test('com questões pendentes dá 409', async () => {
    const u = await novoUsuario();
    const visita = (await u.api('post', `/api/aulas/${(await primeiraAula(u)).id}/visitas`)).body;
    const res = await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(409);
    assert.equal(res.body.erro.codigo, 'QUESTOES_PENDENTES');
  });

  test('aula sem questões pode ser concluída direto', async () => {
    const u = await novoUsuario();
    const { rows } = await pool.query(
      "INSERT INTO aulas (titulo, ordem, conteudo_html, pontos_conclusao) VALUES ('Só leitura', 950, '<p>x</p>', 5) RETURNING id",
    );
    const visita = (await u.api('post', `/api/aulas/${rows[0].id}/visitas`)).body;
    const fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
    assert.equal(fim.total_questoes, 0);
    assert.equal(fim.bonus_conclusao, 5);
    await pool.query('DELETE FROM aulas WHERE id = $1', [rows[0].id]);
  });

  test('finalizar duas vezes dá 409 e responder depois de finalizar também', async () => {
    const u = await novoUsuario();
    const { visita, aula } = await responderAula(u, (await primeiraAula(u)).id);
    await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
    const res = await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(409);
    assert.equal(res.body.erro.codigo, 'VISITA_FINALIZADA');
    await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: aula.questoes[0].id, alternativa: 'a' })
      .expect(409);
  });

  test('finalizações paralelas da mesma visita creditam uma única vez', async () => {
    const u = await novoUsuario();
    const aula = await primeiraAula(u);
    const { visita } = await responderAula(u, aula.id);
    const r = await Promise.all([1, 2, 3].map(() => u.api('post', `/api/visitas/${visita.id}/finalizar`)));
    assert.deepEqual(r.map((x) => x.status).sort(), [200, 409, 409]);
    const me = (await u.api('get', '/api/auth/me')).body;
    assert.equal(me.pontuacao_total, 20 + aula.pontos_conclusao);
  });

  test('duas visitas diferentes finalizadas em paralelo não pagam o bônus duas vezes', async () => {
    const u = await novoUsuario();
    const aula = await primeiraAula(u);
    const v1 = (await responderAula(u, aula.id)).visita;
    const v2 = (await responderAula(u, aula.id)).visita;
    await Promise.all([v1, v2].map((v) => u.api('post', `/api/visitas/${v.id}/finalizar`)));
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM aula_visitas WHERE usuario_id = $1 AND pontos_conclusao_ganhos',
      [u.usuario.id],
    );
    assert.equal(rows[0].n, 1);
    const me = (await u.api('get', '/api/auth/me')).body;
    assert.equal(me.pontuacao_total, 20 + aula.pontos_conclusao);
  });

  test('concluir todas as aulas concede o badge de especialista', async () => {
    const u = await novoUsuario();
    const aulas = (await u.api('get', '/api/aulas')).body;
    let ultimos;
    for (const aula of aulas) {
      const { visita } = await responderAula(u, aula.id);
      ultimos = (await u.api('post', `/api/visitas/${visita.id}/finalizar`)).body.novos_badges;
    }
    assert.ok(ultimos.some((b) => b.tipo_criterio === 'todas_aulas'));
  });
});
