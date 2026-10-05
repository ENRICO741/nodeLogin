const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  app,
  request,
  pool,
  prepararBanco,
  novoUsuario,
  novoJogador,
  concluirAulas,
  novoAdmin,
  gabarito,
  errada,
} = require('../ajuda');
const { importarConteudo } = require('../../src/scripts/importar-aulas');
const { paraCsv, lerVisao } = require('../../src/modulos/admin/pesquisa');
const { pergunta, aulaHtml, criarConteudo, escreverConteudo } = require('../conteudo-falso');

before(prepararBanco);
after(() => pool.end());

const aulaPorSlug = async (slug) => (await pool.query('SELECT * FROM aulas WHERE slug = $1', [slug])).rows[0];
const questoesDe = async (aulaId) =>
  (
    await pool.query(
      'SELECT chave, ordem, ativo, resposta_correta FROM questoes_aula WHERE aula_id = $1 ORDER BY ordem',
      [aulaId],
    )
  ).rows;

describe('importação para o banco', () => {
  test('cria, atualiza sem duplicar, desativa pergunta removida e troca a ordem entre aulas', async () => {
    const raiz = criarConteudo({
      '90-teste-phishing': {
        html: aulaHtml({
          titulo: 'Phishing',
          perguntas: [pergunta({ chave: 'a' }), pergunta({ chave: 'b' })],
        }),
      },
      '91-teste-senhas': { html: aulaHtml({ titulo: 'Senhas' }) },
    });
    const primeira = await importarConteudo(raiz);
    assert.deepEqual([primeira.criadas, primeira.atualizadas, primeira.inalteradas], [2, 0, 0]);
    const phishing = await aulaPorSlug('teste-phishing');
    assert.deepEqual(await questoesDe(phishing.id), [
      { chave: 'a', ordem: 1, ativo: true, resposta_correta: 'b' },
      { chave: 'b', ordem: 2, ativo: true, resposta_correta: 'b' },
    ]);

    const repetida = await importarConteudo(raiz);
    assert.deepEqual([repetida.criadas, repetida.atualizadas, repetida.inalteradas], [0, 0, 2]);

    // Troca a ordem (90 ↔ 91), muda gabarito de "a" e remove "b".
    escreverConteudo(raiz, {
      '91-teste-phishing': {
        html: aulaHtml({ titulo: 'Phishing 2', perguntas: [pergunta({ chave: 'a', correta: 3 })] }),
      },
      '90-teste-senhas': { html: aulaHtml({ titulo: 'Senhas' }) },
    });
    const terceira = await importarConteudo(raiz);
    assert.deepEqual([terceira.criadas, terceira.atualizadas], [0, 2]);
    const depois = await aulaPorSlug('teste-phishing');
    assert.equal(depois.id, phishing.id, 'mesma aula (identidade pelo slug)');
    assert.deepEqual([depois.titulo, depois.ordem], ['Phishing 2', 91]);
    assert.equal((await aulaPorSlug('teste-senhas')).ordem, 90);
    assert.deepEqual(await questoesDe(phishing.id), [
      { chave: 'a', ordem: 1, ativo: true, resposta_correta: 'd' },
      { chave: 'b', ordem: 2, ativo: false, resposta_correta: 'b' },
    ]);

    // Pergunta volta ao arquivo: reativada.
    escreverConteudo(raiz, {
      '91-teste-phishing': {
        html: aulaHtml({
          titulo: 'Phishing 2',
          perguntas: [pergunta({ chave: 'a', correta: 3 }), pergunta({ chave: 'b' })],
        }),
      },
      '90-teste-senhas': { html: aulaHtml({ titulo: 'Senhas' }) },
    });
    await importarConteudo(raiz);
    assert.equal((await questoesDe(phishing.id))[1].ativo, true);
  });

  test('não mexe no "ativo" da aula (o admin pode ocultar)', async () => {
    const raiz = criarConteudo({ '92-oculta': { html: aulaHtml() } });
    await importarConteudo(raiz);
    await pool.query("UPDATE aulas SET ativo = false WHERE slug = 'oculta'");
    escreverConteudo(raiz, { '92-oculta': { html: aulaHtml({ titulo: 'Mudou' }) } });
    await importarConteudo(raiz);
    const aula = await aulaPorSlug('oculta');
    assert.deepEqual([aula.titulo, aula.ativo], ['Mudou', false]);
  });

  test('com erro de validação não grava nada', async () => {
    const raiz = criarConteudo({
      '93-boa': { html: aulaHtml() },
      '94-ruim': { html: aulaHtml({ perguntas: [pergunta({ correta: -1 })] }) },
    });
    const r = await importarConteudo(raiz);
    assert.equal(r.erros.length, 1);
    assert.equal(await aulaPorSlug('boa'), undefined);
  });

  test('ordem já usada por aula criada no admin: falha na transação e nada muda', async () => {
    const admin = await novoAdmin();
    await admin
      .api('post', '/api/admin/aulas')
      .send({ titulo: 'Manual', ordem: 95, conteudo_html: '<p>x</p>', pontos_conclusao: 0 })
      .expect(201);
    const raiz = criarConteudo({ '95-conflito': { html: aulaHtml() } });
    await assert.rejects(importarConteudo(raiz), { code: '23505' });
    assert.equal(await aulaPorSlug('conflito'), undefined);
  });

  test('perguntas importadas saem na ordem do arquivo para o usuário', async () => {
    const raiz = criarConteudo({
      '96-ordem': {
        html: aulaHtml({
          perguntas: ['z', 'a', 'm'].map((chave) => pergunta({ chave, enunciado: `P-${chave}` })),
        }),
      },
    });
    await importarConteudo(raiz);
    const u = await novoJogador();
    const aula = (await u.api('get', `/api/aulas/${(await aulaPorSlug('ordem')).id}`).expect(200)).body;
    assert.deepEqual(
      aula.questoes.map((q) => q.enunciado),
      ['P-z', 'P-a', 'P-m'],
    );
  });
});

describe('imagens das aulas', () => {
  test('servidas sem login, com cache; inexistente ou fora da pasta não vaza nada (cai no login)', async () => {
    const img = await request(app)
      .get('/api/conteudo/aulas/02-o-que-estamos-protegendo/imagens/capa.jpg')
      .expect(200);
    assert.match(img.headers['content-type'], /image\/jpeg/);
    assert.match(img.headers['cache-control'], /max-age=86400/);
    await request(app)
      .get('/api/conteudo/aulas/02-o-que-estamos-protegendo/imagens/nao-existe.png')
      .expect(401);
    await request(app).get('/api/conteudo/aulas/..%2F..%2Fpackage.json').expect(401);
    // O HTML da aula traz o gabarito: não pode ser servido.
    await request(app).get('/api/conteudo/aulas/02-o-que-estamos-protegendo/aula.html').expect(401);
  });

  test('a aula real aponta a imagem para a URL pública', async () => {
    const u = await novoJogador();
    const aula = (await u.api('get', `/api/aulas/${(await aulaPorSlug('o-que-estamos-protegendo')).id}`))
      .body;
    assert.match(
      aula.conteudo_html,
      /<img src="\/api\/conteudo\/aulas\/02-o-que-estamos-protegendo\/imagens\/capa\.jpg"/,
    );
    assert.match(aula.conteudo_html, /<aside class="dica">/);
  });
});

describe('admin com aula vinda de arquivo', () => {
  test('conteúdo e perguntas bloqueados (409); ocultar e reativar liberados', async () => {
    const admin = await novoAdmin();
    const aula = await aulaPorSlug('introducao-lgpd');
    const detalhe = (await admin.api('get', `/api/admin/aulas/${aula.id}`).expect(200)).body;
    assert.equal(detalhe.slug, 'introducao-lgpd');
    assert.equal(detalhe.questoes[0].chave, 'numero-da-lei');
    const lista = (await admin.api('get', '/api/admin/aulas')).body;
    assert.equal(lista.find((a) => a.id === aula.id).slug, 'introducao-lgpd');

    const res = await admin.api('patch', `/api/admin/aulas/${aula.id}`).send({ titulo: 'x' }).expect(409);
    assert.equal(res.body.erro.codigo, 'AULA_DE_ARQUIVO');
    assert.match(res.body.erro.mensagem, /introducao-lgpd/);
    await admin.api('post', `/api/admin/aulas/${aula.id}/questoes`).send({}).expect(400);
    const questaoValida = {
      enunciado: 'x',
      alternativa_a: 'a',
      alternativa_b: 'b',
      alternativa_c: 'c',
      alternativa_d: 'd',
      resposta_correta: 'a',
      pontos: 1,
    };
    await admin.api('post', `/api/admin/aulas/${aula.id}/questoes`).send(questaoValida).expect(409);
    const { rows } = await pool.query('SELECT id FROM questoes_aula WHERE aula_id = $1 LIMIT 1', [aula.id]);
    await admin.api('patch', `/api/admin/questoes-aula/${rows[0].id}`).send({ pontos: 99 }).expect(409);
    await admin.api('delete', `/api/admin/questoes-aula/${rows[0].id}`).expect(409);

    await admin.api('delete', `/api/admin/aulas/${aula.id}`).expect(204);
    await admin.api('patch', `/api/admin/aulas/${aula.id}`).send({ ativo: true }).expect(200);
    await admin.api('patch', `/api/admin/aulas/${aula.id}`).send({}).expect(200);
  });
});

describe('histórico de pontos', () => {
  test('cada crédito gera um registro com origem e total acumulado; sem crédito, sem registro', async () => {
    const u = await novoUsuario();
    const aula = await aulaPorSlug('introducao-lgpd');
    const detalhe = (await u.api('get', `/api/aulas/${aula.id}`)).body;
    const certas = await gabarito(
      'questoes_aula',
      detalhe.questoes.map((q) => q.id),
    );
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    const [q1, q2] = detalhe.questoes;
    await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: q1.id, alternativa: certas[q1.id] });
    await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: q2.id, alternativa: errada(certas[q2.id]) });
    await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
    await concluirAulas(u.usuario.id); // libera a trivia sem creditar pontos

    const rodada = (await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'facil' })).body;
    const certasTrivia = await gabarito(
      'questoes_trivia',
      rodada.questoes.map((q) => q.id),
    );
    const t = rodada.questoes[0];
    await u
      .api('post', `/api/trivia/rodadas/${rodada.id}/respostas`)
      .send({ questao_id: t.id, alternativa: certasTrivia[t.id] });

    const { rows } = await pool.query(
      'SELECT origem, referencia_id, pontos, total_apos FROM pontuacao_historico WHERE usuario_id = $1 ORDER BY criado_em, total_apos',
      [u.usuario.id],
    );
    assert.deepEqual(rows, [
      { origem: 'aula_questao', referencia_id: q1.id, pontos: 10, total_apos: 10 },
      { origem: 'aula_conclusao', referencia_id: aula.id, pontos: 20, total_apos: 30 },
      { origem: 'trivia_questao', referencia_id: t.id, pontos: 5, total_apos: 35 },
    ]);
  });

  test('questão de 0 pontos: acerto conta, mas não gera registro', async () => {
    const admin = await novoAdmin();
    const aula = (
      await admin
        .api('post', '/api/admin/aulas')
        .send({ titulo: 'Zero', ordem: 800, conteudo_html: '<p>x</p>', pontos_conclusao: 0 })
    ).body;
    const q = (
      await admin.api('post', `/api/admin/aulas/${aula.id}/questoes`).send({
        enunciado: 'x',
        alternativa_a: 'a',
        alternativa_b: 'b',
        alternativa_c: 'c',
        alternativa_d: 'd',
        resposta_correta: 'a',
        pontos: 0,
      })
    ).body;
    const u = await novoJogador();
    const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
    const r = (
      await u
        .api('post', `/api/visitas/${visita.id}/respostas`)
        .send({ questao_id: q.id, alternativa: 'a' })
        .expect(200)
    ).body;
    assert.deepEqual([r.correta, r.pontos_ganhos, r.pontuacao_total], [true, 0, 0]);
    await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM pontuacao_historico WHERE usuario_id = $1',
      [u.usuario.id],
    );
    assert.equal(rows[0].n, 0);
  });
});

describe('consentimento para a pesquisa', () => {
  test('cadastro com consentimento grava a data', async () => {
    const com = await novoUsuario();
    assert.ok(com.usuario.consentiu_pesquisa_em);
  });

  test('cadastro sem consentimento é recusado e não cria a conta', async () => {
    const corpo = { nome: 'Xx', apelido: 'xconsent', email: 'xconsent@x.com', senha: 'Senha-forte-123' };
    for (const consentiu_pesquisa of [undefined, false, 'sim', 'true', 1]) {
      const res = await request(app)
        .post('/api/auth/cadastro')
        .send({ ...corpo, consentiu_pesquisa })
        .expect(400);
      assert.deepEqual(
        res.body.erro.detalhes.map((d) => d.campo),
        ['consentiu_pesquisa'],
      );
    }
    const { rows } = await pool.query("SELECT 1 FROM usuarios WHERE apelido = 'xconsent'");
    assert.equal(rows.length, 0);
  });

  test('perfil não altera o consentimento: o campo é descartado (sem 400, sem mudar a data)', async () => {
    const u = await novoUsuario();
    const antes = u.usuario.consentiu_pesquisa_em;
    for (const consentiu_pesquisa of [false, true, null, 'x']) {
      const res = (await u.api('patch', '/api/perfil').send({ consentiu_pesquisa }).expect(200)).body;
      assert.equal(res.consentiu_pesquisa_em, antes, String(consentiu_pesquisa));
    }
    // Junto com outro campo: o outro é salvo, o consentimento não.
    const res = (
      await u
        .api('patch', '/api/perfil')
        .send({ bio: 'Oi', consentiu_pesquisa: false, consentiu_pesquisa_em: null })
    ).body;
    assert.deepEqual([res.bio, res.consentiu_pesquisa_em], ['Oi', antes]);
    const { rows } = await pool.query('SELECT consentiu_pesquisa_em FROM usuarios WHERE id = $1', [
      u.usuario.id,
    ]);
    assert.ok(rows[0].consentiu_pesquisa_em);
  });
});

describe('sessões com contexto', () => {
  test('guarda se é PWA instalado e a largura da tela; corpo vazio continua valendo', async () => {
    const u = await novoUsuario();
    const s1 = (await u.api('post', '/api/sessoes').send({ standalone: true, largura_tela: 390 }).expect(201))
      .body;
    const s2 = (await u.api('post', '/api/sessoes').expect(201)).body;
    const { rows } = await pool.query(
      'SELECT id, standalone, largura_tela FROM sessoes_app WHERE id = ANY($1) ORDER BY iniciada_em',
      [[s1.id, s2.id]],
    );
    assert.deepEqual(
      rows.find((r) => r.id === s1.id),
      { id: s1.id, standalone: true, largura_tela: 390 },
    );
    assert.deepEqual(
      rows.find((r) => r.id === s2.id),
      { id: s2.id, standalone: null, largura_tela: null },
    );
  });

  test('retomar: reabre sessão encerrada há menos de 30 min; depois disso, ou de outro usuário, dá 404', async () => {
    const u = await novoUsuario();
    const outro = await novoUsuario();
    const s = (await u.api('post', '/api/sessoes')).body;
    await u.api('post', `/api/sessoes/${s.id}/retomar`).expect(204); // ainda aberta: continua
    await u.api('post', `/api/sessoes/${s.id}/finalizar`).expect(204);
    await u.api('post', `/api/sessoes/${s.id}/retomar`).expect(204);
    const reaberta = (await pool.query('SELECT finalizada_em FROM sessoes_app WHERE id = $1', [s.id]))
      .rows[0];
    assert.equal(reaberta.finalizada_em, null);

    await outro.api('post', `/api/sessoes/${s.id}/retomar`).expect(404);
    await pool.query("UPDATE sessoes_app SET finalizada_em = now() - interval '31 minutes' WHERE id = $1", [
      s.id,
    ]);
    const res = await u.api('post', `/api/sessoes/${s.id}/retomar`).expect(404);
    assert.equal(res.body.erro.mensagem, 'Sessão expirada');
    await u.api('post', '/api/sessoes/xyz/retomar').expect(400);
  });

  test('largura inválida dá 400', async () => {
    const u = await novoUsuario();
    for (const corpo of [{ largura_tela: 0 }, { largura_tela: 1.5 }, { standalone: 'sim' }]) {
      await u.api('post', '/api/sessoes').send(corpo).expect(400);
    }
  });
});

describe('exportação da pesquisa', () => {
  let admin;
  let participante;
  let naoConsentiu;

  before(async () => {
    await prepararBanco();
    admin = await novoAdmin();
    participante = await novoUsuario();
    naoConsentiu = await novoUsuario();
    // Sem consentimento (só por SQL: dado anterior à regra atual).
    await pool.query('UPDATE usuarios SET consentiu_pesquisa_em = NULL WHERE id = $1', [
      naoConsentiu.usuario.id,
    ]);
    for (const u of [participante, naoConsentiu]) {
      const s = (await u.api('post', '/api/sessoes').send({ standalone: true, largura_tela: 390 })).body;
      await u
        .api('post', '/api/eventos')
        .send({ sessao_id: s.id, tipo_evento: 'tela_visualizada', tela: '/ranking' });
      await u
        .api('post', '/api/eventos')
        .send({ sessao_id: s.id, tipo_evento: 'tela_visualizada', tela: '=HYPERLINK("x")' });
      await u.api('post', `/api/sessoes/${s.id}/finalizar`);
      const aula = await aulaPorSlug('introducao-lgpd');
      const detalhe = (await u.api('get', `/api/aulas/${aula.id}`)).body;
      const certas = await gabarito(
        'questoes_aula',
        detalhe.questoes.map((q) => q.id),
      );
      const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`)).body;
      for (const q of detalhe.questoes) {
        await u
          .api('post', `/api/visitas/${visita.id}/respostas`)
          .send({ questao_id: q.id, alternativa: certas[q.id] });
      }
      await u.api('post', `/api/visitas/${visita.id}/finalizar`);
    }
  });

  const baixar = async (visao) => {
    const res = await admin
      .api('get', `/api/admin/pesquisa/${visao}.csv`)
      .buffer(true)
      .parse((r, cb) => {
        let t = '';
        r.on('data', (d) => (t += d));
        r.on('end', () => cb(null, t));
      });
    return res;
  };
  const tabela = (texto) => {
    const [cabecalho, ...linhas] = texto
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    const campos = cabecalho.split(',');
    return linhas.map((l) => Object.fromEntries(l.split(',').map((v, i) => [campos[i], v])));
  };

  test('lista as visões e o número de participantes (só quem consentiu, sem admins)', async () => {
    const res = (await admin.api('get', '/api/admin/pesquisa').expect(200)).body;
    assert.equal(res.participantes, 1);
    assert.deepEqual(
      res.visoes.map((v) => v.id),
      ['uso-diario', 'engajamento', 'retencao', 'sessoes', 'eventos', 'respostas', 'pontos', 'badges'],
    );
  });

  test('só admin exporta', async () => {
    await participante.api('get', '/api/admin/pesquisa').expect(403);
    await participante.api('get', '/api/admin/pesquisa/sessoes.csv').expect(403);
  });

  test('CSV com BOM, anexo e cabeçalho; visão desconhecida dá 400', async () => {
    const res = await baixar('uso-diario');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(
      res.headers['content-disposition'],
      /attachment; filename="pesquisa-uso-diario-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    assert.ok(res.body.startsWith('\uFEFFdia,usuarios_ativos,sessoes,duracao_mediana_s,novos_usuarios\r\n'));
    const [linha] = tabela(res.body);
    assert.deepEqual([linha.usuarios_ativos, linha.sessoes, linha.novos_usuarios], ['1', '1', '1']);
    assert.match(linha.dia, /^\d{4}-\d{2}-\d{2}$/);
    await admin.api('get', '/api/admin/pesquisa/usuarios.csv').expect(400);
  });

  test('engajamento: uma linha por participante, sem dados pessoais, com pseudônimo estável', async () => {
    const texto = (await baixar('engajamento')).body;
    for (const pessoal of [
      participante.email,
      participante.apelido,
      participante.usuario.id,
      naoConsentiu.apelido,
      admin.apelido,
    ]) {
      assert.ok(!texto.includes(pessoal), `não deveria conter ${pessoal}`);
    }
    const [linha, ...resto] = tabela(texto);
    assert.equal(resto.length, 0);
    assert.match(linha.participante, /^[0-9a-f]{32}$/);
    assert.deepEqual(
      [
        linha.dias_ativos,
        linha.sessoes,
        linha.aulas_concluidas,
        linha.respostas_aulas,
        linha.acertos_aulas,
        linha.pontos,
        linha.badges,
        linha.visitas_ranking,
        linha.usa_pwa_instalado,
      ],
      // Só a Primeiros Passos: o Aluno Nota 10 exige também a pergunta das aulas 02 a 15.
      ['1', '1', '1', '2', '2', '40', '1', '1', 'true'],
    );
    const sessoes = tabela((await baixar('sessoes')).body);
    assert.equal(sessoes[0].participante, linha.participante, 'mesmo pseudônimo nas visões');
  });

  test('eventos: bloqueia injeção de fórmula no Excel', async () => {
    const texto = (await baixar('eventos')).body;
    assert.ok(texto.includes(`"'=HYPERLINK(""x"")"`));
  });

  test('respostas, pontos e retenção trazem só o participante', async () => {
    assert.equal(tabela((await baixar('respostas')).body).length, 2);
    const pontos = tabela((await baixar('pontos')).body);
    assert.deepEqual(
      pontos.map((p) => p.origem),
      ['aula_questao', 'aula_questao', 'aula_conclusao'],
    );
    const [retencao] = tabela((await baixar('retencao')).body);
    assert.deepEqual(
      [retencao.semana, retencao.participantes_ativos, retencao.tamanho_coorte],
      ['0', '1', '1'],
    );
  });

  test('visão sem dados exporta só o cabeçalho', async () => {
    await pool.query('UPDATE usuarios SET consentiu_pesquisa_em = NULL');
    const texto = (await baixar('sessoes')).body;
    assert.equal(
      texto,
      '\uFEFFparticipante,sessao,iniciada_em,finalizada_em,duracao_s,standalone,largura_tela,fim_estimado\r\n',
    );
  });
});

describe('pesquisa: fim estimado das sessões e datas das conquistas', () => {
  let admin;
  let participante;
  let outro;
  let badges;

  const sessao = async (u, iniciada, finalizada = null) =>
    (
      await pool.query(
        'INSERT INTO sessoes_app (usuario_id, iniciada_em, finalizada_em) VALUES ($1, $2, $3) RETURNING id',
        [u.usuario.id, iniciada, finalizada],
      )
    ).rows[0].id;
  const evento = (u, sessaoId, criado) =>
    pool.query(
      "INSERT INTO eventos (usuario_id, sessao_id, tipo_evento, criado_em) VALUES ($1, $2, 'tela_visualizada', $3)",
      [u.usuario.id, sessaoId, criado],
    );
  const ganhar = (u, badge, quando) =>
    pool.query('INSERT INTO usuario_badges (usuario_id, badge_id, obtida_em) VALUES ($1, $2, $3)', [
      u.usuario.id,
      badge.id,
      quando,
    ]);
  const linhas = async (visao) => (await lerVisao(visao)).rows;
  // Pseudônimo de quem iniciou a sessão no horário (de São Paulo) informado.
  const pseudonimo = async (iniciada) =>
    (await linhas('pesquisa_sessoes')).find((r) => r.iniciada_em === iniciada).participante;

  before(async () => {
    await prepararBanco();
    admin = await novoAdmin();
    participante = await novoUsuario();
    outro = await novoUsuario();
    const naoConsentiu = await novoUsuario();
    await pool.query('UPDATE usuarios SET consentiu_pesquisa_em = NULL WHERE id = $1', [
      naoConsentiu.usuario.id,
    ]);

    // 10/01 em São Paulo, 09h às 11h: fim real (600 s), sem fim com eventos (300 s), sem fim e sem eventos (0 s).
    const real = await sessao(participante, '2026-01-10T12:00:00Z', '2026-01-10T12:10:00Z');
    await evento(participante, real, '2026-01-10T12:30:00Z'); // depois do fim real: ignorado
    const comEventos = await sessao(participante, '2026-01-10T13:00:00Z');
    await evento(participante, comEventos, '2026-01-10T13:01:00Z');
    await evento(participante, comEventos, '2026-01-10T13:05:00Z');
    await evento(participante, null, '2026-01-10T13:40:00Z'); // sem sessão: não estende nenhuma
    await sessao(participante, '2026-01-10T14:00:00Z');

    // Evento anterior ao início (relógio torto) não gera duração negativa.
    const torta = await sessao(outro, '2026-01-12T12:00:00Z');
    await evento(outro, torta, '2026-01-12T11:59:00Z');

    badges = (await pool.query('SELECT id, nome, tipo_criterio FROM badges ORDER BY nome LIMIT 2')).rows;
    // 03:30 UTC de 15/01 = 00:30 em São Paulo; 02:59 UTC de 01/01/2026 = 23:59 de 31/12/2025.
    await ganhar(participante, badges[0], '2026-01-15T03:30:00Z');
    await ganhar(participante, badges[1], '2026-01-01T02:59:00Z');
    // Admin e conta sem consentimento: sessões sem fim e conquistas que não podem aparecer.
    for (const u of [admin, naoConsentiu]) {
      await sessao(u, '2026-01-10T15:00:00Z');
      await ganhar(u, badges[0], '2026-01-15T03:30:00Z');
    }
  });

  test('sessões: fim real, último evento da sessão ou o início; fim_estimado marca a estimativa', async () => {
    const rows = await linhas('pesquisa_sessoes');
    const por = Object.fromEntries(
      rows.map((r) => [r.iniciada_em, [r.finalizada_em, r.duracao_s, r.fim_estimado]]),
    );
    // Admin e quem não consentiu ficam fora.
    assert.deepEqual(por, {
      '2026-01-10 09:00:00': ['2026-01-10 09:10:00', '600', false],
      '2026-01-10 10:00:00': ['2026-01-10 10:05:00', '300', true],
      '2026-01-10 11:00:00': ['2026-01-10 11:00:00', '0', true],
      '2026-01-12 09:00:00': ['2026-01-12 09:00:00', '0', true],
    });
  });

  test('fim_estimado entra no fim; as colunas anteriores mantêm nome e ordem', async () => {
    const { fields } = await lerVisao('pesquisa_sessoes');
    assert.deepEqual(
      fields.map((f) => f.name),
      [
        'participante',
        'sessao',
        'iniciada_em',
        'finalizada_em',
        'duracao_s',
        'standalone',
        'largura_tela',
        'fim_estimado',
      ],
    );
  });

  test('engajamento e uso diário contam o tempo estimado', async () => {
    const engajamento = await linhas('pesquisa_engajamento_usuario');
    const de = async (iniciada) => {
      const p = await pseudonimo(iniciada);
      return engajamento.find((r) => r.participante === p);
    };
    const p = await de('2026-01-10 09:00:00');
    assert.deepEqual([p.sessoes, p.tempo_total_s], ['3', '900']); // 600 + 300 + 0
    const o = await de('2026-01-12 09:00:00');
    assert.deepEqual([o.sessoes, o.tempo_total_s], ['1', '0']);

    const uso = await linhas('pesquisa_uso_diario');
    const dia = uso.find((r) => r.dia === '2026-01-10');
    // Mediana de 0, 300 e 600; admin e quem não consentiu não entram.
    assert.deepEqual([dia.usuarios_ativos, dia.sessoes, dia.duracao_mediana_s], ['1', '3', '300']);
    assert.equal(uso.find((r) => r.dia === '2026-01-12').duracao_mediana_s, '0');
  });

  test('sessão em andamento cai na regra e sai marcada; ao finalizar, vale o fim real', async () => {
    const u = await novoUsuario();
    const s = (await u.api('post', '/api/sessoes').expect(201)).body;
    await u
      .api('post', '/api/eventos')
      .send({ sessao_id: s.id, tipo_evento: 'tela_visualizada', tela: '/' })
      .expect(204);
    const atual = async () => (await linhas('pesquisa_sessoes')).find((r) => r.iniciada_em > '2026-02');
    const aberta = await atual();
    assert.equal(aberta.fim_estimado, true);
    assert.ok(Number(aberta.duracao_s) >= 0);
    await u.api('post', `/api/sessoes/${s.id}/finalizar`).expect(204);
    assert.equal((await atual()).fim_estimado, false);
  });

  test('badges: só quem consentiu e é usuário comum, com o mesmo pseudônimo e horário de São Paulo', async () => {
    const rows = await linhas('pesquisa_badges');
    const p = await pseudonimo('2026-01-10 09:00:00');
    const engajamento = (await linhas('pesquisa_engajamento_usuario')).find((r) => r.participante === p);
    assert.equal(engajamento.badges, '2');
    assert.deepEqual(
      rows.map((r) => [r.participante, r.badge, r.tipo_criterio, r.obtida_em]).sort(),
      [
        [p, badges[0].nome, badges[0].tipo_criterio, '2026-01-15 00:30:00'],
        [p, badges[1].nome, badges[1].tipo_criterio, '2025-12-31 23:59:00'],
      ].sort(),
    );
  });

  test('CSV de badges: 200 para admin, 403 para usuário comum, 401 sem login', async () => {
    const res = await admin.api('get', '/api/admin/pesquisa/badges.csv').expect(200);
    assert.match(res.headers['content-disposition'], /pesquisa-badges-\d{4}-\d{2}-\d{2}\.csv/);
    assert.ok(res.text.startsWith('\uFEFFparticipante,badge,tipo_criterio,obtida_em\r\n'));
    assert.equal(res.text.trim().split('\r\n').length, 3);
    await participante.api('get', '/api/admin/pesquisa/badges.csv').expect(403);
    await request(app).get('/api/admin/pesquisa/badges.csv').expect(401);
  });
});

describe('paraCsv', () => {
  test('aspas, quebras de linha, nulos, objetos e fórmulas', () => {
    const csv = paraCsv(
      ['a', 'b', 'c', 'd', 'e'],
      [
        { a: 'com,vírgula', b: 'com "aspas"', c: null, d: 'linha\nnova', e: '+SOMA(1)' },
        { a: '-1', b: '-x', c: '@x', d: 5, e: true },
        { a: '-1.5', b: '-1+cmd', c: '', d: '', e: '' },
      ],
    );
    assert.equal(
      csv,
      'a,b,c,d,e\r\n"com,vírgula","com ""aspas""",,"linha\nnova",\'+SOMA(1)\r\n-1,\'-x,\'@x,5,true\r\n' +
        "-1.5,'-1+cmd,,,\r\n",
    );
  });
});

describe('visão pesquisa_engajamento_usuario (migration 009)', () => {
  // Lê a linha de um usuário direto da visão (o pseudônimo depende do segredo da transação).
  const engajamento = async (usuarioId) => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.pesquisa_segredo', 'segredo-do-teste', true)");
      const { rows } = await c.query(
        `SELECT e.rodadas_trivia, e.respostas_trivia FROM pesquisa_engajamento_usuario e
         JOIN pesquisa_participantes p ON p.participante = e.participante WHERE p.id = $1`,
        [usuarioId],
      );
      return rows[0];
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  };

  test('rodadas_trivia conta só as finalizadas: aberta ou abandonada fica de fora', async () => {
    const { completarRodada } = require('../ajuda');
    const u = await novoJogador();
    assert.deepEqual(await engajamento(u.usuario.id), { rodadas_trivia: 0, respostas_trivia: 0 });
    const nova = async () => (await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'facil' })).body;

    const terminada = await nova();
    await completarRodada(u, terminada);
    await u.api('post', `/api/trivia/rodadas/${terminada.id}/finalizar`).expect(200);
    await nova(); // abandonada sem resposta
    const pelaMetade = await nova();
    await completarRodada(u, { ...pelaMetade, questoes: pelaMetade.questoes.slice(0, 1) });

    assert.deepEqual(await engajamento(u.usuario.id), { rodadas_trivia: 1, respostas_trivia: 4 });
  });
});

describe('visão pesquisa_respostas (migration 010)', () => {
  test('traz a chave da questão no fim: a provisória com confirmacao-leitura, trivia com NULL', async () => {
    const { completarRodada } = require('../ajuda');
    const u = await novoJogador();
    const [, segunda] = (await u.api('get', '/api/aulas')).body;
    const detalhe = (await u.api('get', `/api/aulas/${segunda.id}`)).body;
    const visita = (await u.api('post', `/api/aulas/${segunda.id}/visitas`)).body;
    await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: detalhe.questoes[0].id, alternativa: 'a' })
      .expect(200);
    const rodada = (await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'facil' })).body;
    await completarRodada(u, { ...rodada, questoes: rodada.questoes.slice(0, 1) });

    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.pesquisa_segredo', 'segredo-do-teste', true)");
      const { fields, rows } = await c.query(
        `SELECT r.* FROM pesquisa_respostas r
         JOIN pesquisa_participantes p ON p.participante = r.participante WHERE p.id = $1 ORDER BY r.tipo`,
        [u.usuario.id],
      );
      assert.equal(fields.at(-1).name, 'chave', 'coluna nova no fim');
      assert.deepEqual(
        fields.map((f) => f.name),
        ['participante', 'tipo', 'contexto', 'questao_id', 'correta', 'pontuou', 'respondido_em', 'chave'],
      );
      assert.deepEqual(
        rows.map((r) => [r.tipo, r.chave]),
        [
          ['aula', 'confirmacao-leitura'],
          ['trivia', null],
        ],
      );
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});
