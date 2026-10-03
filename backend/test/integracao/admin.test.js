const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, prepararBanco, novoUsuario, novoAdmin, gabarito } = require('../ajuda');

let admin;
before(async () => {
  await prepararBanco();
  admin = await novoAdmin();
});
after(() => pool.end());

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';
let ordem = 500;
const novaAula = (extra = {}) =>
  admin.api('post', '/api/admin/aulas').send({
    titulo: 'Phishing',
    ordem: ordem++,
    conteudo_html: '<p>Conteúdo</p>',
    pontos_conclusao: 15,
    ...extra,
  });
const questao = (extra = {}) => ({
  enunciado: 'Um e-mail pede sua senha. O que fazer?',
  alternativa_a: 'Responder',
  alternativa_b: 'Reportar ao time de segurança',
  alternativa_c: 'Ignorar',
  alternativa_d: 'Encaminhar',
  resposta_correta: 'b',
  pontos: 10,
  ...extra,
});

describe('acesso', () => {
  test('usuário comum recebe 403 em todas as rotas de admin', async () => {
    const u = await novoUsuario();
    const rotas = [
      ['get', '/api/admin/estatisticas'],
      ['get', '/api/admin/aulas'],
      ['post', '/api/admin/aulas'],
      ['get', `/api/admin/aulas/${UUID_INEXISTENTE}`],
      ['patch', `/api/admin/aulas/${UUID_INEXISTENTE}`],
      ['delete', `/api/admin/aulas/${UUID_INEXISTENTE}`],
      ['post', `/api/admin/aulas/${UUID_INEXISTENTE}/questoes`],
      ['patch', `/api/admin/questoes-aula/${UUID_INEXISTENTE}`],
      ['delete', `/api/admin/questoes-aula/${UUID_INEXISTENTE}`],
      ['get', '/api/admin/questoes-trivia'],
      ['post', '/api/admin/questoes-trivia'],
      ['patch', `/api/admin/questoes-trivia/${UUID_INEXISTENTE}`],
      ['delete', `/api/admin/questoes-trivia/${UUID_INEXISTENTE}`],
    ];
    for (const [metodo, url] of rotas) {
      const res = await u.api(metodo, url).send({}).expect(403);
      assert.equal(res.body.erro.codigo, 'PROIBIDO');
    }
  });
});

describe('CRUD de aulas', () => {
  test('cria, lê, edita e desativa/reativa uma aula', async () => {
    const criada = (await novaAula().expect(201)).body;
    assert.equal(criada.ativo, true);
    assert.equal(criada.pontos_conclusao, 15);

    const lida = (await admin.api('get', `/api/admin/aulas/${criada.id}`).expect(200)).body;
    assert.deepEqual(lida.questoes, []);

    const editada = (
      await admin
        .api('patch', `/api/admin/aulas/${criada.id}`)
        .send({ titulo: 'Phishing avançado' })
        .expect(200)
    ).body;
    assert.equal(editada.titulo, 'Phishing avançado');
    assert.equal(editada.pontos_conclusao, 15, 'campos não enviados ficam iguais');
    assert.ok(new Date(editada.atualizado_em) >= new Date(criada.atualizado_em));

    await admin.api('delete', `/api/admin/aulas/${criada.id}`).expect(204);
    const lista = (await admin.api('get', '/api/admin/aulas').expect(200)).body;
    assert.equal(lista.find((a) => a.id === criada.id).ativo, false, 'admin ainda vê a aula inativa');
    await admin.api('get', `/api/aulas/${criada.id}`).expect(404);

    await admin.api('patch', `/api/admin/aulas/${criada.id}`).send({ ativo: true }).expect(200);
    await admin.api('get', `/api/aulas/${criada.id}`).expect(200);
  });

  test('sanitiza HTML: remove script, eventos e esquemas perigosos; mantém tags seguras', async () => {
    const html =
      '<h2>Título</h2><p onclick="x()">Oi <a href="javascript:alert(1)">link</a> <a href="https://ok.com">ok</a></p>' +
      '<img src="http://x.com/a.png"><img src="https://x.com/b.png" alt="b" onerror="x()"><script>alert(1)</script><style>*{}</style>';
    const aula = (await novaAula({ conteudo_html: html }).expect(201)).body;
    assert.equal(
      aula.conteudo_html,
      '<h2>Título</h2><p>Oi <a>link</a> <a href="https://ok.com">ok</a></p><img /><img src="https://x.com/b.png" alt="b" />',
    );
  });

  test('HTML que vira vazio depois de limpo ainda é aceito como string', async () => {
    const aula = (await novaAula({ conteudo_html: '<script>x</script>' }).expect(201)).body;
    assert.equal(aula.conteudo_html, '');
  });

  test('validação: campos obrigatórios, ordem >= 1, pontos entre 0 e 1000', async () => {
    const casos = [
      { titulo: '' },
      { ordem: 0 },
      { ordem: 1.5 },
      { pontos_conclusao: -1 },
      { pontos_conclusao: 1001 },
      { conteudo_html: '' },
    ];
    for (const extra of casos) await novaAula(extra).expect(400);
    await admin.api('post', '/api/admin/aulas').send({}).expect(400);
  });

  test('ordem repetida dá 409 com mensagem clara', async () => {
    const res = await novaAula({ ordem: 1 }).expect(409);
    assert.equal(res.body.erro.mensagem, 'Já existe uma aula com essa ordem');
  });

  test('PATCH vazio só atualiza atualizado_em; aula inexistente dá 404', async () => {
    const aula = (await novaAula()).body;
    await admin.api('patch', `/api/admin/aulas/${aula.id}`).send({}).expect(200);
    await admin.api('patch', `/api/admin/aulas/${UUID_INEXISTENTE}`).send({ titulo: 'x' }).expect(404);
    await admin.api('delete', `/api/admin/aulas/${UUID_INEXISTENTE}`).expect(404);
    await admin.api('get', `/api/admin/aulas/${UUID_INEXISTENTE}`).expect(404);
  });
});

describe('questões de aula', () => {
  test('cria, edita, desativa e reativa; admin vê gabarito, usuário não', async () => {
    const aula = (await novaAula()).body;
    const q = (await admin.api('post', `/api/admin/aulas/${aula.id}/questoes`).send(questao()).expect(201))
      .body;
    assert.equal(q.resposta_correta, 'b');
    assert.equal(q.imagem_url, null);

    const detalhe = (await admin.api('get', `/api/admin/aulas/${aula.id}`)).body;
    assert.equal(detalhe.questoes[0].resposta_correta, 'b');

    const editada = (
      await admin
        .api('patch', `/api/admin/questoes-aula/${q.id}`)
        .send({ resposta_correta: 'c', imagem_url: 'https://x.com/q.png' })
        .expect(200)
    ).body;
    assert.equal(editada.resposta_correta, 'c');
    assert.equal(editada.enunciado, q.enunciado);

    await admin.api('delete', `/api/admin/questoes-aula/${q.id}`).expect(204);
    const u = await novoUsuario();
    assert.deepEqual((await u.api('get', `/api/aulas/${aula.id}`)).body.questoes, []);
    await admin.api('patch', `/api/admin/questoes-aula/${q.id}`).send({ ativo: true }).expect(200);
    assert.equal((await u.api('get', `/api/aulas/${aula.id}`)).body.questoes.length, 1);
  });

  test('mudança de gabarito vale para as próximas respostas', async () => {
    const aula = (await novaAula()).body;
    const q = (await admin.api('post', `/api/admin/aulas/${aula.id}/questoes`).send(questao())).body;
    await admin.api('patch', `/api/admin/questoes-aula/${q.id}`).send({ resposta_correta: 'd' });
    const u = await novoUsuario();
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    const r = (
      await u.api('post', `/api/visitas/${visita.id}/respostas`).send({ questao_id: q.id, alternativa: 'd' })
    ).body;
    assert.equal(r.correta, true);
  });

  test('aula ou questão inexistente dá 404', async () => {
    await admin.api('post', `/api/admin/aulas/${UUID_INEXISTENTE}/questoes`).send(questao()).expect(404);
    await admin.api('patch', `/api/admin/questoes-aula/${UUID_INEXISTENTE}`).send({ pontos: 1 }).expect(404);
    await admin.api('delete', `/api/admin/questoes-aula/${UUID_INEXISTENTE}`).expect(404);
  });

  test('recusa questão inválida', async () => {
    const aula = (await novaAula()).body;
    for (const extra of [
      { resposta_correta: 'e' },
      { imagem_url: 'http://x.com/a.png' },
      { pontos: 101 },
      { enunciado: '' },
    ]) {
      await admin.api('post', `/api/admin/aulas/${aula.id}/questoes`).send(questao(extra)).expect(400);
    }
  });
});

describe('questões de trivia', () => {
  test('CRUD completo e listagem ordenada por dificuldade', async () => {
    const criada = (
      await admin
        .api('post', '/api/admin/questoes-trivia')
        .send(questao({ dificuldade: 'dificil', explicacao: 'Sempre reporte.' }))
        .expect(201)
    ).body;
    assert.equal(criada.dificuldade, 'dificil');
    assert.equal(criada.aula_referencia_id, null);

    const lista = (await admin.api('get', '/api/admin/questoes-trivia').expect(200)).body;
    const ordem = lista.map((q) => q.dificuldade);
    assert.deepEqual(
      ordem,
      [...ordem].sort(
        (a, b) => ['facil', 'media', 'dificil'].indexOf(a) - ['facil', 'media', 'dificil'].indexOf(b),
      ),
    );
    assert.ok(lista.some((q) => q.id === criada.id));

    const editada = (
      await admin
        .api('patch', `/api/admin/questoes-trivia/${criada.id}`)
        .send({ dificuldade: 'facil' })
        .expect(200)
    ).body;
    assert.equal(editada.dificuldade, 'facil');

    await admin.api('delete', `/api/admin/questoes-trivia/${criada.id}`).expect(204);
    assert.equal(
      (await admin.api('get', '/api/admin/questoes-trivia')).body.find((q) => q.id === criada.id).ativo,
      false,
    );
  });

  test('pode referenciar uma aula existente; aula inexistente dá 400', async () => {
    const [aula] = (await admin.api('get', '/api/admin/aulas')).body;
    const ok = await admin
      .api('post', '/api/admin/questoes-trivia')
      .send(questao({ dificuldade: 'media', aula_referencia_id: aula.id }))
      .expect(201);
    assert.equal(ok.body.aula_referencia_id, aula.id);
    await admin
      .api('post', '/api/admin/questoes-trivia')
      .send(questao({ dificuldade: 'media', aula_referencia_id: UUID_INEXISTENTE }))
      .expect(400);
  });

  test('exige dificuldade válida; inexistente dá 404', async () => {
    await admin.api('post', '/api/admin/questoes-trivia').send(questao()).expect(400);
    await admin
      .api('post', '/api/admin/questoes-trivia')
      .send(questao({ dificuldade: 'extrema' }))
      .expect(400);
    await admin
      .api('patch', `/api/admin/questoes-trivia/${UUID_INEXISTENTE}`)
      .send({ pontos: 1 })
      .expect(404);
    await admin.api('delete', `/api/admin/questoes-trivia/${UUID_INEXISTENTE}`).expect(404);
  });
});

describe('GET /api/admin/estatisticas', () => {
  test('números batem com a atividade real, e usuários aparecem só pelo apelido', async () => {
    await prepararBanco();
    admin = await novoAdmin();
    const u = await novoUsuario();

    const [aula] = (await u.api('get', '/api/aulas')).body;
    const detalhe = (await u.api('get', `/api/aulas/${aula.id}`)).body;
    const certas = await gabarito(
      'questoes_aula',
      detalhe.questoes.map((q) => q.id),
    );
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: detalhe.questoes[0].id, alternativa: certas[detalhe.questoes[0].id] });
    await u.api('post', `/api/visitas/${visita.id}/respostas`).send({
      questao_id: detalhe.questoes[1].id,
      alternativa: 'a' === certas[detalhe.questoes[1].id] ? 'b' : 'a',
    });
    await u.api('post', `/api/visitas/${visita.id}/finalizar`);
    await u.api('post', `/api/aulas/${aula.id}/visitas`); // tentativa aberta

    const rodada = (await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'media' })).body;
    await u
      .api('post', `/api/trivia/rodadas/${rodada.id}/respostas`)
      .send({ questao_id: rodada.questoes[0].id, alternativa: 'a' });

    // Atividade do admin não entra nas métricas.
    const visitaAdmin = (await admin.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    await admin
      .api('post', `/api/visitas/${visitaAdmin.id}/respostas`)
      .send({ questao_id: detalhe.questoes[0].id, alternativa: certas[detalhe.questoes[0].id] });
    const rodadaAdmin = (await admin.api('post', '/api/trivia/rodadas').send({ dificuldade: 'facil' })).body;
    await admin
      .api('post', `/api/trivia/rodadas/${rodadaAdmin.id}/respostas`)
      .send({ questao_id: rodadaAdmin.questoes[0].id, alternativa: 'a' });

    const s = (await admin.api('get', '/api/admin/estatisticas').expect(200)).body;

    const porAula = s.aulas.find((a) => a.aula_id === aula.id);
    assert.equal(porAula.total_tentativas, 2);
    assert.equal(porAula.total_concluidas, 1);
    assert.equal(porAula.total_respostas, 2);
    assert.equal(porAula.total_acertos, 1);
    assert.ok(Number.isInteger(porAula.duracao_media_ms) && porAula.duracao_media_ms >= 0);
    const semVisitas = s.aulas.find((a) => a.aula_id !== aula.id);
    assert.deepEqual(
      [semVisitas.total_tentativas, semVisitas.total_respostas, semVisitas.duracao_media_ms],
      [0, 0, null],
    );

    assert.equal(s.questoesAula.length, 2);
    assert.equal(s.questoesAula.find((q) => q.questao_id === detalhe.questoes[0].id).total_acertos, 1);

    assert.deepEqual(Object.keys(s.usuariosAula[0]).sort(), [
      'apelido',
      'aula_titulo',
      'duracao_media_ms',
      'total_acertos',
      'total_respostas',
      'total_tentativas',
    ]);
    assert.deepEqual(
      s.usuariosAula.map((x) => x.apelido),
      [u.apelido],
    );

    assert.deepEqual(
      s.trivia.map((t) => [t.dificuldade, t.total_tentativas, t.total_concluidas, t.total_respostas]),
      [['media', 1, 0, 1]],
    );
    assert.equal(s.trivia[0].duracao_media_ms, null, 'rodada aberta não tem duração');
    assert.equal(s.questoesTrivia.length, 10);
    assert.deepEqual(
      s.usuariosTrivia.map((t) => [t.apelido, t.dificuldade, t.total_respostas]),
      [[u.apelido, 'media', 1]],
    );
  });
});
