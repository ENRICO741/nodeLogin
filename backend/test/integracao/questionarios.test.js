const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  app,
  request,
  pool,
  prepararBanco,
  novoUsuario,
  novoAdmin,
  tornarAdmin,
  concluirAulas,
} = require('../ajuda');
const config = require('../../src/config');
const DEFINICOES = require('../../src/modulos/questionarios/definicao');
const { lerVisao } = require('../../src/modulos/admin/pesquisa');

before(prepararBanco);
after(() => pool.end());

// Participante (usuário comum que consentiu no cadastro) com o pré ainda pendente.
const participante = () => novoUsuario({}, { respondeuPre: false });
const semConsentimento = async () => {
  const u = await participante();
  await pool.query('UPDATE usuarios SET consentiu_pesquisa_em = NULL WHERE id = $1', [u.usuario.id]);
  return u;
};
const adminSemPre = async () => {
  const u = await participante();
  await tornarAdmin(u.email);
  return u;
};

const itens = (def) => def.blocos.flatMap((b) => b.itens);

// Respostas para todos os itens da definição: escala = 4 (ATN = 1), opção = 0, múltipla = [0], aberta = texto.
function respostasCompletas(def, extra = {}) {
  const r = {};
  for (const b of def.blocos) {
    for (const i of b.itens) {
      if (i.aberta) r[i.codigo] = 'Mais aulas, por favor';
      else if (i.multipla) r[i.codigo] = [0];
      else if (i.opcoes) r[i.codigo] = 0;
      else r[i.codigo] = i.codigo === 'ATN' ? 1 : 4;
    }
  }
  return { ...r, ...extra };
}

// Busca a definição e envia todas as respostas. `extra` sobrepõe respostas.
async function responderPre(u, extra = {}, status = 201) {
  const def = (await u.api('get', '/api/questionarios/pre').expect(200)).body;
  return u
    .api('post', '/api/questionarios/pre')
    .send({ respostas: respostasCompletas(def, extra) })
    .expect(status);
}

const linhasDo = async (usuarioId) =>
  (
    await pool.query(
      `SELECT r.item, r.valor FROM questionario_respostas r
       JOIN questionario_envios e ON e.id = r.envio_id
       WHERE e.usuario_id = $1 AND e.momento = 'pre' ORDER BY r.item, r.valor`,
      [usuarioId],
    )
  ).rows;

const primeiraAula = async () =>
  (await pool.query('SELECT id FROM aulas WHERE ativo ORDER BY ordem LIMIT 1')).rows[0].id;

const PENDENTE = { pre_pendente: true, pos_pendente: false };
const NADA = { pre_pendente: false, pos_pendente: false };

describe('situação dos questionários no usuário', () => {
  test('participante: cadastro, login e /auth/me trazem o pré pendente; depois do envio, nada', async () => {
    const u = await participante();
    assert.deepEqual(u.usuario.questionarios, PENDENTE);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificador: u.email, senha: u.senha })
      .expect(200);
    assert.deepEqual(login.body.usuario.questionarios, PENDENTE);
    assert.deepEqual((await u.api('get', '/api/auth/me').expect(200)).body.questionarios, PENDENTE);

    const res = await responderPre(u);
    assert.deepEqual(res.body, { questionarios: NADA });
    assert.deepEqual((await u.api('get', '/api/auth/me')).body.questionarios, NADA);
  });

  test('sem consentimento: nada pendente e 404; ao passar a consentir, cai na mesma regra', async () => {
    const u = await semConsentimento();
    assert.deepEqual((await u.api('get', '/api/auth/me')).body.questionarios, NADA);
    const login = await request(app).post('/api/auth/login').send({ identificador: u.email, senha: u.senha });
    assert.deepEqual(login.body.usuario.questionarios, NADA);
    const res = await u.api('get', '/api/questionarios/pre').expect(404);
    assert.deepEqual(res.body.erro, { codigo: 'NAO_ENCONTRADO', mensagem: 'Questionário não disponível' });
    await u.api('post', '/api/questionarios/pre').send({ respostas: {} }).expect(404);

    await pool.query('UPDATE usuarios SET consentiu_pesquisa_em = now() WHERE id = $1', [u.usuario.id]);
    assert.deepEqual((await u.api('get', '/api/auth/me')).body.questionarios, PENDENTE);
    await responderPre(u);
  });

  test('admin: nada pendente e 403 em GET/POST dos dois momentos', async () => {
    const admin = await adminSemPre();
    assert.deepEqual((await admin.api('get', '/api/auth/me')).body.questionarios, NADA);
    for (const momento of ['pre', 'pos']) {
      const res = await admin.api('get', `/api/questionarios/${momento}`).expect(403);
      assert.deepEqual(res.body.erro, {
        codigo: 'PROIBIDO',
        mensagem: 'Administradores não participam da pesquisa',
      });
      await admin.api('post', `/api/questionarios/${momento}`).send({ respostas: {} }).expect(403);
    }
  });

  test('sem login dá 401; momento desconhecido dá 404', async () => {
    await request(app).get('/api/questionarios/pre').expect(401);
    const u = await participante();
    await u.api('get', '/api/questionarios/meio').expect(404);
    await u.api('post', '/api/questionarios/PRE').send({}).expect(404);
  });
});

describe('questionário pré', () => {
  test('GET devolve a definição completa (40 itens), sem campos internos', async () => {
    const u = await participante();
    const def = (await u.api('get', '/api/questionarios/pre').expect(200)).body;
    assert.equal(def.tipo, 'pre');
    assert.equal(def.titulo, 'Boas-vindas à pesquisa');
    assert.match(def.abertura.join(' '), /cerca de 10 minutos/);
    assert.equal(itens(def).length, 40);
    assert.ok(!JSON.stringify(def).includes('sePre'));
  });

  test('envio grava uma linha por item (A6: uma por opção); campos extras ignorados; depois, 409', async () => {
    const u = await participante();
    const def = (await u.api('get', '/api/questionarios/pre')).body;
    await u
      .api('post', '/api/questionarios/pre')
      .send({ respostas: respostasCompletas(def, { A6: [1, 0], K1_R: 2 }), ordem: ['A1'], duracao_s: 600 })
      .expect(201);

    const linhas = await linhasDo(u.usuario.id);
    assert.equal(linhas.length, 41);
    assert.deepEqual(
      linhas.filter((l) => l.item === 'A6').map((l) => l.valor),
      ['0', '1'],
    );
    assert.equal(linhas.find((l) => l.item === 'K1_R').valor, '2');

    const denovo = await u.api('get', '/api/questionarios/pre').expect(409);
    assert.equal(denovo.body.erro.codigo, 'QUESTIONARIO_RESPONDIDO');
    const reenvio = await u.api('post', '/api/questionarios/pre').send({ respostas: {} }).expect(409);
    assert.equal(reenvio.body.erro.codigo, 'QUESTIONARIO_RESPONDIDO');
  });

  test('C1 = Não: C2–C4 e a UES enviados são descartados', async () => {
    const u = await participante();
    await responderPre(u, { C1: 1 });
    const linhas = await linhasDo(u.usuario.id);
    assert.equal(linhas.length, 25);
    assert.ok(!linhas.some((l) => /^(C[234]|FA|PU|AE|RW)/.test(l.item)));
  });

  test('erros de validação: 400 no formato padrão, um detalhe por item, e nada é gravado', async () => {
    const u = await participante();
    const def = (await u.api('get', '/api/questionarios/pre')).body;
    const respostas = respostasCompletas(def, { A2: 9, A6: [6, 1], K1_R: 0, XYZ: 1 });
    delete respostas.HXF1;
    const res = await u.api('post', '/api/questionarios/pre').send({ respostas }).expect(400);
    assert.equal(res.body.erro.codigo, 'VALIDACAO');
    assert.deepEqual(res.body.erro.detalhes.map((d) => d.campo).sort(), ['A2', 'A6', 'HXF1', 'K1_R', 'XYZ']);
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM questionario_envios WHERE usuario_id = $1',
      [u.usuario.id],
    );
    assert.equal(rows[0].n, 0);
    assert.equal((await u.api('get', '/api/auth/me')).body.questionarios.pre_pendente, true);
  });

  test('corpo inválido (sem respostas, respostas fora de objeto) e chaves demais dão 400', async () => {
    const u = await participante();
    for (const corpo of [{}, { respostas: [] }, { respostas: 'x' }]) {
      const res = await u.api('post', '/api/questionarios/pre').send(corpo).expect(400);
      assert.equal(res.body.erro.codigo, 'VALIDACAO', JSON.stringify(corpo));
    }
    const respostas = Object.fromEntries(Array.from({ length: 101 }, (_, i) => ['X' + i, 1]));
    const res = await u.api('post', '/api/questionarios/pre').send({ respostas }).expect(400);
    assert.deepEqual(res.body.erro.detalhes, [{ campo: 'respostas', mensagem: 'Respostas demais' }]);
  });

  test('duplo envio concorrente: um 201 e um 409 QUESTIONARIO_RESPONDIDO, um envio só', async () => {
    const u = await participante();
    const def = (await u.api('get', '/api/questionarios/pre')).body;
    const corpo = { respostas: respostasCompletas(def) };
    const respostas = await Promise.all(
      [1, 2].map(() => u.api('post', '/api/questionarios/pre').send(corpo)),
    );
    assert.deepEqual(respostas.map((r) => r.status).sort(), [201, 409]);
    assert.equal(respostas.find((r) => r.status === 409).body.erro.codigo, 'QUESTIONARIO_RESPONDIDO');
    const { rows } = await pool.query(
      `SELECT count(DISTINCT e.id)::int AS envios, count(*)::int AS linhas
       FROM questionario_envios e JOIN questionario_respostas r ON r.envio_id = e.id WHERE e.usuario_id = $1`,
      [u.usuario.id],
    );
    assert.deepEqual(rows[0], { envios: 1, linhas: 40 });
  });

  test('banco: envio repetido, momento inválido e resposta repetida violam as restrições', async () => {
    const u = await participante();
    const inserir = (momento) =>
      pool.query('INSERT INTO questionario_envios (usuario_id, momento) VALUES ($1, $2) RETURNING id', [
        u.usuario.id,
        momento,
      ]);
    const { rows } = await inserir('pre');
    await assert.rejects(inserir('pre'), { code: '23505' });
    await assert.rejects(inserir('fim'), { code: '23514' });
    const resposta = () =>
      pool.query("INSERT INTO questionario_respostas (envio_id, item, valor) VALUES ($1, 'A6', '0')", [
        rows[0].id,
      ]);
    await resposta();
    await assert.rejects(resposta(), { code: '23505' });
    await assert.rejects(
      pool.query("INSERT INTO questionario_respostas (envio_id, item, valor) VALUES ($1, 'A1', NULL)", [
        rows[0].id,
      ]),
      { code: '23502' },
    );
  });
});

describe('questionário pós', () => {
  // Os testes trocam o teto em tempo de execução; sem ele, a janela é só a dos 14 aos 28 dias.
  beforeEach(() => {
    config.PESQUISA_DATA_FIM = undefined;
  });
  after(() => {
    config.PESQUISA_DATA_FIM = undefined;
  });

  const DIA_MS = 86_400_000;
  // Move o envio do pré para `intervalo` atrás: a janela é calculada pelo relógio do banco.
  const preHa = (u, intervalo) =>
    pool.query(
      "UPDATE questionario_envios SET enviado_em = now() - $2::interval WHERE usuario_id = $1 AND momento = 'pre'",
      [u.usuario.id, intervalo],
    );
  // Participante com o pré enviado há `intervalo`. Com `pre`, responde pela API (C1 = Sim por padrão).
  async function comPre(intervalo, pre) {
    const u = pre ? await participante() : await novoUsuario();
    if (pre) await responderPre(u, pre);
    await preHa(u, intervalo);
    return u;
  }
  const enviadoPre = async (u) =>
    (
      await pool.query(
        "SELECT enviado_em FROM questionario_envios WHERE usuario_id = $1 AND momento = 'pre'",
        [u.usuario.id],
      )
    ).rows[0].enviado_em;
  const situacaoDe = async (u) => (await u.api('get', '/api/auth/me').expect(200)).body.questionarios;
  // Hoje em SP (AAAA-MM-DD), deslocado em `dias`.
  const diaSP = (dias = 0) =>
    new Date(Date.now() + dias * DIA_MS).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  async function responderPos(u, extra = {}, status = 201) {
    const def = (await u.api('get', '/api/questionarios/pos').expect(200)).body;
    return u
      .api('post', '/api/questionarios/pos')
      .send({ respostas: respostasCompletas(def, extra) })
      .expect(status);
  }
  async function esperarStatus(u, status, erro) {
    for (const metodo of ['get', 'post']) {
      const res = await u.api(metodo, '/api/questionarios/pos').send({ respostas: {} }).expect(status);
      assert.deepEqual(res.body.erro, erro, metodo);
    }
  }
  const INDISPONIVEL = { codigo: 'NAO_ENCONTRADO', mensagem: 'Questionário não disponível' };
  const ENCERRADO = { codigo: 'QUESTIONARIO_ENCERRADO', mensagem: 'O prazo para responder terminou' };
  const linhasPos = async (u) =>
    (
      await pool.query(
        `SELECT r.item, r.valor FROM questionario_respostas r JOIN questionario_envios e ON e.id = r.envio_id
         WHERE e.usuario_id = $1 AND e.momento = 'pos' ORDER BY r.item`,
        [u.usuario.id],
      )
    ).rows;

  test('antes do dia 14, sem pré ou sem consentimento: 404 e não pendente', async () => {
    const quase = await comPre('13 days 23 hours');
    await esperarStatus(quase, 404, INDISPONIVEL);
    assert.deepEqual(await situacaoDe(quase), NADA);

    const semPre = await participante();
    await esperarStatus(semPre, 404, INDISPONIVEL);
    assert.deepEqual(await situacaoDe(semPre), PENDENTE);

    const fora = await comPre('15 days');
    await pool.query('UPDATE usuarios SET consentiu_pesquisa_em = NULL WHERE id = $1', [fora.usuario.id]);
    await esperarStatus(fora, 404, INDISPONIVEL);
    assert.deepEqual(await situacaoDe(fora), NADA);
  });

  test('no dia 14 abre: pendente no /auth/me e no login, com pos_fecha_em = pré + 28 dias; GET traz o aviso', async () => {
    const u = await comPre('14 days');
    const esperado = {
      pre_pendente: false,
      pos_pendente: true,
      pos_fecha_em: new Date((await enviadoPre(u)).getTime() + 28 * DIA_MS).toISOString(),
    };
    assert.deepEqual(await situacaoDe(u), esperado);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificador: u.email, senha: u.senha })
      .expect(200);
    assert.deepEqual(login.body.usuario.questionarios, esperado);

    const def = (await u.api('get', '/api/questionarios/pos').expect(200)).body;
    assert.equal(def.tipo, 'pos');
    assert.equal(def.aviso, DEFINICOES.pos.aviso);
    assert.match(def.aviso, /só pode responder este questionário uma vez/);
    assert.ok(!JSON.stringify(def).includes('sePre'));
  });

  test('no dia 28 fecha: 410 QUESTIONARIO_ENCERRADO em GET e POST; uma hora antes ainda aceita', async () => {
    const fechado = await comPre('28 days');
    await esperarStatus(fechado, 410, ENCERRADO);
    assert.deepEqual(await situacaoDe(fechado), NADA);

    const ultimaHora = await comPre('27 days 23 hours');
    assert.equal((await situacaoDe(ultimaHora)).pos_pendente, true);
    await responderPos(ultimaHora);
  });

  test('janela fecha entre o GET e o POST: 410 no envio e nada gravado', async () => {
    const u = await comPre('20 days');
    const def = (await u.api('get', '/api/questionarios/pos').expect(200)).body;
    await preHa(u, '29 days');
    const res = await u
      .api('post', '/api/questionarios/pos')
      .send({ respostas: respostasCompletas(def) })
      .expect(410);
    assert.deepEqual(res.body.erro, ENCERRADO);
    assert.deepEqual(await linhasPos(u), []);
  });

  test('PESQUISA_DATA_FIM antes do dia 28: fecha no fim desse dia (SP); ontem já fechou', async () => {
    const u = await comPre('15 days');
    config.PESQUISA_DATA_FIM = diaSP(0);
    // Último dia aceito inteiro: fecha à 00:00 de SP (UTC−3) do dia seguinte.
    const fimDoDia = new Date(Date.parse(`${diaSP(0)}T00:00:00-03:00`) + DIA_MS).toISOString();
    assert.deepEqual(await situacaoDe(u), {
      pre_pendente: false,
      pos_pendente: true,
      pos_fecha_em: fimDoDia,
    });
    await u.api('get', '/api/questionarios/pos').expect(200);

    config.PESQUISA_DATA_FIM = diaSP(-1);
    assert.deepEqual(await situacaoDe(u), NADA);
    await esperarStatus(u, 410, ENCERRADO);
  });

  test('PESQUISA_DATA_FIM depois do dia 28 não muda o fechamento', async () => {
    const u = await comPre('20 days');
    config.PESQUISA_DATA_FIM = diaSP(30);
    const dia28 = new Date((await enviadoPre(u)).getTime() + 28 * DIA_MS).toISOString();
    assert.equal((await situacaoDe(u)).pos_fecha_em, dia28);
    await preHa(u, '28 days');
    await esperarStatus(u, 410, ENCERRADO);
  });

  test('CMP só para quem respondeu C1 = Sim no pré', async () => {
    const sim = await comPre('14 days', { C1: 0 });
    const defSim = (await sim.api('get', '/api/questionarios/pos')).body;
    assert.equal(itens(defSim).length, 32);
    const semCmp = respostasCompletas(defSim);
    delete semCmp.CMP;
    const faltou = await sim.api('post', '/api/questionarios/pos').send({ respostas: semCmp }).expect(400);
    assert.deepEqual(faltou.body.erro.detalhes, [{ campo: 'CMP', mensagem: 'Responda esta pergunta' }]);
    await responderPos(sim, { CMP: 4 });
    assert.equal((await linhasPos(sim)).find((l) => l.item === 'CMP').valor, '4');

    for (const C1 of [1, 2]) {
      const u = await comPre('14 days', { C1 });
      const def = (await u.api('get', '/api/questionarios/pos')).body;
      assert.equal(itens(def).length, 31);
      assert.ok(!itens(def).some((i) => i.codigo === 'CMP'));
      const res = await u
        .api('post', '/api/questionarios/pos')
        .send({ respostas: respostasCompletas(def, { CMP: 3 }) })
        .expect(400);
      assert.deepEqual(res.body.erro.detalhes, [{ campo: 'CMP', mensagem: 'Pergunta desconhecida' }]);
      await responderPos(u);
      assert.ok(!(await linhasPos(u)).some((l) => l.item === 'CMP'));
    }
  });

  test('envio grava as respostas, tira o pendente e não dá pontos nem conquistas; depois, 409', async () => {
    const u = await comPre('16 days');
    const placar = async () =>
      (
        await pool.query(
          `SELECT u.pontuacao_total,
             (SELECT count(*)::int FROM usuario_badges WHERE usuario_id = u.id) AS badges,
             (SELECT count(*)::int FROM pontuacao_historico WHERE usuario_id = u.id) AS historico
           FROM usuarios u WHERE u.id = $1`,
          [u.usuario.id],
        )
      ).rows[0];
    const antes = await placar();

    const res = await responderPos(u, { ABR2: 'Mais aulas' });
    assert.deepEqual(res.body, { questionarios: NADA });
    assert.deepEqual(await placar(), antes);
    assert.equal((await linhasPos(u)).length, 31); // sem C1 no pré, sem CMP
    assert.deepEqual(await situacaoDe(u), NADA);

    for (const metodo of ['get', 'post']) {
      const res = await u.api(metodo, '/api/questionarios/pos').send({ respostas: {} }).expect(409);
      assert.equal(res.body.erro.codigo, 'QUESTIONARIO_RESPONDIDO');
    }
    // Respondido e já fechado: continua 409 (a resposta existe).
    await preHa(u, '40 days');
    await u.api('get', '/api/questionarios/pos').expect(409);
  });

  test('abertas: 2000 caracteres com acento e emoji (emoji conta 1) gravam; 2001 dá 400 e nada é gravado', async () => {
    // Emojis sortidos (4 bytes UTF-8, sem repetição para o Postgres não comprimir): ~8 KB, além do btree.
    const emojis = Array.from({ length: 1000 }, () =>
      String.fromCodePoint(0x1f300 + crypto.randomInt(0x250)),
    ).join('');
    const longo = 'é'.repeat(1000) + emojis;
    const recusado = await comPre('15 days');
    const res = await responderPos(recusado, { ABR1: `${longo}x` }, 400);
    assert.deepEqual(res.body.erro.detalhes, [{ campo: 'ABR1', mensagem: 'Use no máximo 2000 caracteres' }]);
    assert.deepEqual(await linhasPos(recusado), []);

    const u = await comPre('15 days');
    await responderPos(u, { ABR1: longo, ABR2: longo });
    const abertas = (await linhasPos(u)).filter((l) => l.item.startsWith('ABR'));
    assert.deepEqual(abertas, [
      { item: 'ABR1', valor: longo },
      { item: 'ABR2', valor: longo },
    ]);
  });

  test('duplo envio concorrente do pós: um 201 e um 409, um envio só', async () => {
    const u = await comPre('14 days');
    const def = (await u.api('get', '/api/questionarios/pos')).body;
    const corpo = { respostas: respostasCompletas(def) };
    const respostas = await Promise.all(
      [1, 2].map(() => u.api('post', '/api/questionarios/pos').send(corpo)),
    );
    assert.deepEqual(respostas.map((r) => r.status).sort(), [201, 409]);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM questionario_envios WHERE usuario_id = $1 AND momento = 'pos'",
      [u.usuario.id],
    );
    assert.equal(rows[0].n, 1);
  });
});

describe('bloqueio de aula e trivia até o pré', () => {
  const iniciar = async (u) => ({
    aula: await u.api('post', `/api/aulas/${await primeiraAula()}/visitas`),
    trivia: await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'facil' }),
  });

  test('participante sem o pré: 403 QUESTIONARIO_PRE_PENDENTE ao iniciar aula e trivia; nada é criado', async () => {
    const u = await participante();
    await concluirAulas(u.usuario.id);
    const { rows: antes } = await pool.query(
      'SELECT count(*)::int AS n FROM aula_visitas WHERE usuario_id = $1',
      [u.usuario.id],
    );
    const { aula, trivia } = await iniciar(u);
    for (const res of [aula, trivia]) {
      assert.equal(res.status, 403);
      assert.deepEqual(res.body.erro, {
        codigo: 'QUESTIONARIO_PRE_PENDENTE',
        mensagem: 'Responda ao questionário inicial para continuar',
      });
    }
    const { rows: depois } = await pool.query(
      `SELECT (SELECT count(*)::int FROM aula_visitas WHERE usuario_id = $1) AS visitas,
         (SELECT count(*)::int FROM trivia_rodadas WHERE usuario_id = $1) AS rodadas`,
      [u.usuario.id],
    );
    assert.deepEqual(depois[0], { visitas: antes[0].n, rodadas: 0 });

    await responderPre(u);
    const liberado = await iniciar(u);
    assert.deepEqual([liberado.aula.status, liberado.trivia.status], [201, 201]);
  });

  test('admin e quem não consentiu nunca são barrados', async () => {
    for (const u of [await adminSemPre(), await semConsentimento()]) {
      await concluirAulas(u.usuario.id);
      const { aula, trivia } = await iniciar(u);
      assert.deepEqual([aula.status, trivia.status], [201, 201], u.email);
    }
  });

  test('o resto do app segue aberto (listar aulas, ranking)', async () => {
    const u = await participante();
    await u.api('get', '/api/aulas').expect(200);
    await u.api('get', '/api/ranking').expect(200);
  });
});

describe('exportação dos questionários', () => {
  // Mesmo cálculo de pesquisa_participantes (migration 002).
  const pseudonimo = (id) =>
    crypto
      .createHash('md5')
      .update(id + config.PESQUISA_SEGREDO)
      .digest('hex');

  test('visão pesquisa_questionario: colunas fixas, pseudônimo das outras visões, uma linha por opção, desvio sem linha', async () => {
    const u = await participante();
    await responderPre(u, { A6: [2, 4], C1: 1, C2: 0, FA1: 5 });
    const saiu = await participante();
    await responderPre(saiu);
    await pool.query('UPDATE usuarios SET consentiu_pesquisa_em = NULL WHERE id = $1', [saiu.usuario.id]);

    const { fields, rows } = await lerVisao('pesquisa_questionario');
    assert.deepEqual(
      fields.map((f) => f.name),
      ['participante', 'momento', 'item', 'valor', 'respondido_em'],
    );
    const doU = rows.filter((r) => r.participante === pseudonimo(u.usuario.id));
    const engajamento = (await lerVisao('pesquisa_engajamento_usuario')).rows;
    assert.ok(
      engajamento.some((r) => r.participante === pseudonimo(u.usuario.id)),
      'mesmo pseudônimo',
    );
    assert.equal(doU.length, 25 + 1); // C1 ≠ Sim: sem C2–C4 e UES; A6 com duas opções
    assert.deepEqual(
      doU.filter((r) => r.item === 'A6').map((r) => r.valor),
      ['2', '4'],
    );
    assert.ok(!doU.some((r) => ['C2', 'FA1'].includes(r.item)));
    assert.ok(doU.every((r) => r.momento === 'pre'));
    assert.equal(new Set(doU.map((r) => r.respondido_em)).size, 1);
    assert.match(doU[0].respondido_em, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

    // Quem retirou o consentimento fica de fora; o id real nunca aparece.
    assert.ok(!rows.some((r) => r.participante === pseudonimo(saiu.usuario.id)));
    assert.ok(!JSON.stringify(rows).includes(u.usuario.id));
  });

  test('CSV pelo admin: cabeçalho exato, texto livre protegido; usuário comum dá 403', async () => {
    const u = await participante();
    await responderPre(u);
    // Grava o pós direto (sem esperar a janela) para conferir a aberta no CSV.
    const { rows } = await pool.query(
      "INSERT INTO questionario_envios (usuario_id, momento) VALUES ($1, 'pos') RETURNING id",
      [u.usuario.id],
    );
    await pool.query(
      "INSERT INTO questionario_respostas (envio_id, item, valor) VALUES ($1, 'ABR1', '=Texto, com vírgula')",
      [rows[0].id],
    );
    const admin = await novoAdmin();
    const csv = (
      await admin
        .api('get', '/api/admin/pesquisa/questionario.csv')
        .expect(200)
        .buffer(true)
        .parse((r, cb) => {
          let texto = '';
          r.on('data', (d) => (texto += d));
          r.on('end', () => cb(null, texto));
        })
    ).body;
    assert.equal(csv.slice(0, csv.indexOf('\r\n')), '\uFEFFparticipante,momento,item,valor,respondido_em');
    assert.match(csv, /,pos,ABR1,"'=Texto, com vírgula",/);
    await u.api('get', '/api/admin/pesquisa/questionario.csv').expect(403);
  });

  test('admin: contagem de quem respondeu o pré e o pós, só participantes', async () => {
    const admin = await novoAdmin();
    const contagem = async () => (await admin.api('get', '/api/admin/pesquisa').expect(200)).body;
    const antes = await contagem();

    const u = await participante();
    await responderPre(u);
    await pool.query("INSERT INTO questionario_envios (usuario_id, momento) VALUES ($1, 'pos')", [
      u.usuario.id,
    ]);
    await participante(); // pendente: conta como participante, não como resposta
    await adminSemPre();
    const fora = await participante();
    await responderPre(fora);
    await pool.query('UPDATE usuarios SET consentiu_pesquisa_em = NULL WHERE id = $1', [fora.usuario.id]);

    const depois = await contagem();
    assert.equal(depois.participantes, antes.participantes + 2);
    assert.deepEqual(depois.questionarios, {
      pre: antes.questionarios.pre + 1,
      pos: antes.questionarios.pos + 1,
    });
    assert.ok(depois.visoes.some((v) => v.id === 'questionario'));
  });
});
