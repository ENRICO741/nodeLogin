const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, prepararBanco, novoUsuario } = require('./ajuda');

before(prepararBanco);
after(() => pool.end());

const gabarito = async (tabela, ids) => {
  const { rows } = await pool.query(`SELECT id, resposta_correta FROM ${tabela} WHERE id = ANY($1)`, [ids]);
  return Object.fromEntries(rows.map((r) => [r.id, r.resposta_correta]));
};

async function fazerAula(u, aulaId) {
  const aula = (await u.api('get', `/api/aulas/${aulaId}`).expect(200)).body;
  assert.equal(aula.questoes[0].resposta_correta, undefined, 'gabarito não pode vazar');
  const certas = await gabarito(
    'questoes_aula',
    aula.questoes.map((q) => q.id),
  );
  const visita = (await u.api('post', `/api/aulas/${aulaId}/visitas`).expect(201)).body;
  for (const q of aula.questoes) {
    await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: q.id, alternativa: certas[q.id] })
      .expect(200);
  }
  return { aula, visita };
}

test('aula: questões e bônus pontuam só na primeira vez, badge concedido', async () => {
  const u = await novoUsuario();
  const [primeira] = (await u.api('get', '/api/aulas').expect(200)).body;

  const { visita } = await fazerAula(u, primeira.id);
  const fim = (await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200)).body;
  assert.equal(fim.pontos_questoes, 20);
  assert.equal(fim.bonus_conclusao, primeira.pontos_conclusao);
  assert.equal(fim.pontuacao_total, 20 + primeira.pontos_conclusao);
  assert.deepEqual(
    fim.novos_badges.map((b) => b.tipo_criterio),
    ['aula_concluida'],
  );

  const { visita: segunda } = await fazerAula(u, primeira.id);
  const fim2 = (await u.api('post', `/api/visitas/${segunda.id}/finalizar`).expect(200)).body;
  assert.equal(fim2.pontos_questoes, 0);
  assert.equal(fim2.bonus_conclusao, 0);
  assert.equal(fim2.pontuacao_total, fim.pontuacao_total);
  assert.deepEqual(fim2.novos_badges, []);
});

test('aula: não conclui com questões pendentes', async () => {
  const u = await novoUsuario();
  const [primeira] = (await u.api('get', '/api/aulas').expect(200)).body;
  const visita = (await u.api('post', `/api/aulas/${primeira.id}/visitas`).expect(201)).body;
  const res = await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(409);
  assert.equal(res.body.erro.codigo, 'QUESTOES_PENDENTES');
});

test('aula: finalizações em paralelo creditam o bônus uma vez e visita fecha', async () => {
  const u = await novoUsuario();
  const [primeira] = (await u.api('get', '/api/aulas').expect(200)).body;
  const { visita } = await fazerAula(u, primeira.id);

  const respostas = await Promise.all([
    u.api('post', `/api/visitas/${visita.id}/finalizar`),
    u.api('post', `/api/visitas/${visita.id}/finalizar`),
  ]);
  assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 409]);
  const me = (await u.api('get', '/api/auth/me').expect(200)).body;
  assert.equal(me.pontuacao_total, 20 + primeira.pontos_conclusao);

  const [q] = (await u.api('get', `/api/aulas/${primeira.id}`)).body.questoes;
  await u
    .api('post', `/api/visitas/${visita.id}/respostas`)
    .send({ questao_id: q.id, alternativa: 'a' })
    .expect(409);
});

test('trivia: só aceita questões da rodada e não pontua a mesma questão duas vezes', async () => {
  const u = await novoUsuario();
  const rodada = (await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'facil' }).expect(201)).body;
  assert.ok(rodada.questoes.length > 0);
  assert.equal(rodada.questoes[0].resposta_correta, undefined, 'gabarito não pode vazar');

  const { rows } = await pool.query("SELECT id FROM questoes_trivia WHERE dificuldade = 'dificil' LIMIT 1");
  await u
    .api('post', `/api/trivia/rodadas/${rodada.id}/respostas`)
    .send({ questao_id: rows[0].id, alternativa: 'a' })
    .expect(404);

  const certas = await gabarito(
    'questoes_trivia',
    rodada.questoes.map((q) => q.id),
  );
  const q = rodada.questoes[0];
  const r1 = await u
    .api('post', `/api/trivia/rodadas/${rodada.id}/respostas`)
    .send({ questao_id: q.id, alternativa: certas[q.id] })
    .expect(200);
  assert.equal(r1.body.pontos_ganhos, q.pontos);
  await u
    .api('post', `/api/trivia/rodadas/${rodada.id}/respostas`)
    .send({ questao_id: q.id, alternativa: certas[q.id] })
    .expect(409);

  const retomada = (await u.api('get', `/api/trivia/rodadas/${rodada.id}`).expect(200)).body;
  assert.equal(retomada.questoes.find((x) => x.id === q.id).respondida, true);

  const fim = (await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`).expect(200)).body;
  assert.equal(fim.pontos_ganhos, q.pontos);
  assert.deepEqual(
    fim.novos_badges.map((b) => b.tipo_criterio),
    ['primeira_trivia'],
  );
  await u.api('post', `/api/trivia/rodadas/${rodada.id}/finalizar`).expect(409);

  // Nova rodada: acertar de novo a mesma questão não gera pontos (anti-farm).
  let pontosSegundaVez = null;
  for (let i = 0; i < 10 && pontosSegundaVez === null; i++) {
    const outra = (await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'facil' }).expect(201))
      .body;
    if (!outra.questoes.some((x) => x.id === q.id)) continue;
    const r2 = await u
      .api('post', `/api/trivia/rodadas/${outra.id}/respostas`)
      .send({ questao_id: q.id, alternativa: certas[q.id] })
      .expect(200);
    pontosSegundaVez = r2.body.pontos_ganhos;
  }
  assert.equal(pontosSegundaVez, 0);
});

test('ranking mostra só apelido e pontos, com a posição do usuário', async () => {
  const u = await novoUsuario();
  const res = (await u.api('get', '/api/ranking').expect(200)).body;
  assert.ok(Number.isInteger(res.minha_posicao));
  const eu = res.lideres.find((l) => l.eu);
  assert.ok(eu);
  assert.deepEqual(Object.keys(eu).sort(), [
    'apelido',
    'eu',
    'foto_perfil_url',
    'pontuacao_total',
    'posicao',
  ]);
});
