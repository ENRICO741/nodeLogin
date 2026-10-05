const { describe, test, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const {
  app,
  request,
  pool,
  prepararBanco,
  novoUsuario,
  novoJogador,
  novoAdmin,
  tornarAdmin,
  autenticado,
  gabarito,
} = require('../ajuda');
const logger = require('../../src/lib/logger');

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
      ['get', '/api/admin/usuarios'],
      ['put', `/api/admin/usuarios/${UUID_INEXISTENTE}/senha`],
      ['patch', `/api/admin/usuarios/${UUID_INEXISTENTE}`],
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
    const u = await novoJogador();
    assert.deepEqual((await u.api('get', `/api/aulas/${aula.id}`)).body.questoes, []);
    await admin.api('patch', `/api/admin/questoes-aula/${q.id}`).send({ ativo: true }).expect(200);
    assert.equal((await u.api('get', `/api/aulas/${aula.id}`)).body.questoes.length, 1);
  });

  test('mudança de gabarito vale para as próximas respostas', async () => {
    const aula = (await novaAula()).body;
    const q = (await admin.api('post', `/api/admin/aulas/${aula.id}/questoes`).send(questao())).body;
    await admin.api('patch', `/api/admin/questoes-aula/${q.id}`).send({ resposta_correta: 'd' });
    const u = await novoJogador();
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
  const primeiraAulaAdmin = async () => (await admin.api('get', '/api/admin/aulas')).body[0];

  test('CRUD completo e listagem ordenada por dificuldade', async () => {
    const aula = await primeiraAulaAdmin();
    const criada = (
      await admin
        .api('post', '/api/admin/questoes-trivia')
        .send(questao({ dificuldade: 'dificil', explicacao: 'Sempre reporte.', aula_referencia_id: aula.id }))
        .expect(201)
    ).body;
    assert.equal(criada.dificuldade, 'dificil');
    assert.equal(criada.aula_referencia_id, aula.id);

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

  test('aula de referência é obrigatória: sem ela, nula ou inválida dá 400 no campo', async () => {
    for (const extra of [{}, { aula_referencia_id: null }, { aula_referencia_id: 'x' }]) {
      const res = await admin
        .api('post', '/api/admin/questoes-trivia')
        .send(questao({ dificuldade: 'media', ...extra }))
        .expect(400);
      assert.deepEqual(
        res.body.erro.detalhes.map((d) => d.campo),
        ['aula_referencia_id'],
      );
    }
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM questoes_trivia WHERE aula_referencia_id IS NULL',
    );
    assert.equal(rows[0].n, 0);
    // Na edição pode ficar de fora (mantém a atual), mas não pode virar nula.
    const aula = await primeiraAulaAdmin();
    const criada = (
      await admin
        .api('post', '/api/admin/questoes-trivia')
        .send(questao({ dificuldade: 'media', aula_referencia_id: aula.id }))
        .expect(201)
    ).body;
    await admin.api('patch', `/api/admin/questoes-trivia/${criada.id}`).send({ pontos: 3 }).expect(200);
    await admin
      .api('patch', `/api/admin/questoes-trivia/${criada.id}`)
      .send({ aula_referencia_id: null })
      .expect(400);
  });

  test('pode referenciar uma aula existente; aula inexistente dá 400', async () => {
    const aula = await primeiraAulaAdmin();
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
    // Com a aula informada, o 400 só pode vir da dificuldade.
    const aula_referencia_id = (await primeiraAulaAdmin()).id;
    for (const extra of [{}, { dificuldade: 'extrema' }]) {
      const res = await admin
        .api('post', '/api/admin/questoes-trivia')
        .send(questao({ aula_referencia_id, ...extra }))
        .expect(400);
      assert.deepEqual(
        res.body.erro.detalhes.map((d) => d.campo),
        ['dificuldade'],
      );
    }
    await admin
      .api('patch', `/api/admin/questoes-trivia/${UUID_INEXISTENTE}`)
      .send({ pontos: 1 })
      .expect(404);
    await admin.api('delete', `/api/admin/questoes-trivia/${UUID_INEXISTENTE}`).expect(404);
  });
});

describe('usuários', () => {
  test('lista ativos (admins e usuários) só com nome, e-mail, foto e papel', async () => {
    const u = await novoUsuario({ nome: 'Ana Lista' });
    const inativo = await novoUsuario();
    await pool.query('UPDATE usuarios SET ativo = false WHERE id = $1', [inativo.usuario.id]);

    const lista = (await admin.api('get', '/api/admin/usuarios').expect(200)).body;
    assert.deepEqual(Object.keys(lista[0]).sort(), ['email', 'foto_perfil_url', 'id', 'nome', 'papel']);
    assert.equal(lista.find((x) => x.id === admin.usuario.id).papel, 'admin');
    assert.deepEqual(
      lista.find((x) => x.id === u.usuario.id),
      {
        id: u.usuario.id,
        nome: 'Ana Lista',
        email: u.email,
        foto_perfil_url: null,
        papel: 'usuario',
      },
    );
    assert.ok(!lista.some((x) => x.id === inativo.usuario.id), 'inativo não aparece');
    const posicao = (id) => lista.findIndex((x) => x.id === id);
    assert.ok(posicao(u.usuario.id) < posicao(admin.usuario.id), 'ordenado por nome');
  });

  test('redefinir senha: troca a senha, derruba as sessões e invalida links de recuperação', async () => {
    const u = await novoUsuario();
    await pool.query(
      `INSERT INTO tokens_recuperacao_senha (usuario_id, token_hash, expira_em)
       VALUES ($1, repeat('a', 64), now() + interval '30 minutes')`,
      [u.usuario.id],
    );

    const res = await admin
      .api('put', `/api/admin/usuarios/${u.usuario.id}/senha`)
      .send({ senha: 'Nova-senha-456' })
      .expect(204);
    assert.equal(res.text, '');

    const login = (senha) => request(app).post('/api/auth/login').send({ identificador: u.email, senha });
    await login('Nova-senha-456').expect(200);
    await login(u.senha).expect(401);
    await u.api('get', '/api/auth/me').expect(401);
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM tokens_recuperacao_senha WHERE usuario_id = $1 AND NOT usado',
      [u.usuario.id],
    );
    assert.equal(rows[0].n, 0);
  });

  test('redefinir senha: senha curta dá 400; inexistente ou inativo dá 404; id inválido dá 400', async () => {
    const u = await novoUsuario();
    const inativo = await novoUsuario();
    await pool.query('UPDATE usuarios SET ativo = false WHERE id = $1', [inativo.usuario.id]);
    const put = (id, senha = 'Nova-senha-456') =>
      admin.api('put', `/api/admin/usuarios/${id}/senha`).send({ senha });

    const curta = await put(u.usuario.id, 'curta').expect(400);
    assert.match(JSON.stringify(curta.body), /pelo menos 8 caracteres/);
    await put(u.usuario.id, 'x'.repeat(73)).expect(400);
    await u.api('get', '/api/auth/me').expect(200);
    await put(UUID_INEXISTENTE).expect(404);
    await put(inativo.usuario.id).expect(404);
    await put('abc').expect(400);
  });

  test('papel: promove e rebaixa com efeito imediato; repetir dá o mesmo resultado', async () => {
    const u = await novoUsuario();
    const patch = (valor) => admin.api('patch', `/api/admin/usuarios/${u.usuario.id}`).send({ admin: valor });
    await u.api('get', '/api/admin/usuarios').expect(403);

    const promovido = (await patch(true).expect(200)).body;
    assert.deepEqual(promovido, {
      id: u.usuario.id,
      nome: u.nome,
      email: u.email,
      foto_perfil_url: null,
      papel: 'admin',
    });
    await u.api('get', '/api/admin/usuarios').expect(200);
    assert.deepEqual((await patch(true).expect(200)).body, promovido);

    const rebaixado = (await patch(false).expect(200)).body;
    assert.deepEqual(rebaixado, { ...promovido, papel: 'usuario' });
    await u.api('get', '/api/admin/usuarios').expect(403);
    await u.api('get', '/api/auth/me').expect(200); // perde o acesso, mas a sessão continua
    assert.deepEqual((await patch(false).expect(200)).body, rebaixado);
  });

  test('papel: não altera o próprio; 404, id inválido e corpo inválido', async () => {
    const proprio = await admin
      .api('patch', `/api/admin/usuarios/${admin.usuario.id}`)
      .send({ admin: false });
    assert.equal(proprio.status, 409);
    assert.equal(proprio.body.erro.codigo, 'PROPRIO_PAPEL');
    await admin
      .api('patch', `/api/admin/usuarios/${admin.usuario.id.toUpperCase()}`)
      .send({ admin: false })
      .expect(409);

    const inativo = await novoUsuario();
    await pool.query('UPDATE usuarios SET ativo = false WHERE id = $1', [inativo.usuario.id]);
    // Rebaixar (que passa pela trava dos admins) também dá 404, e não "último admin".
    for (const id of [UUID_INEXISTENTE, inativo.usuario.id]) {
      for (const valor of [true, false]) {
        const res = await admin.api('patch', `/api/admin/usuarios/${id}`).send({ admin: valor }).expect(404);
        assert.equal(res.body.erro.codigo, 'NAO_ENCONTRADO');
      }
    }
    await admin.api('patch', '/api/admin/usuarios/abc').send({ admin: true }).expect(400);

    const u = await novoUsuario();
    for (const corpo of [{}, { admin: 'true' }, { admin: true, papel: 'admin' }]) {
      await admin.api('patch', `/api/admin/usuarios/${u.usuario.id}`).send(corpo).expect(400);
    }
    const { rows } = await pool.query('SELECT papel FROM usuarios WHERE id = ANY($1)', [
      [admin.usuario.id, inativo.usuario.id, u.usuario.id],
    ]);
    assert.deepEqual(rows.map((r) => r.papel).sort(), ['admin', 'usuario', 'usuario']);
  });

  test('lista: ordem ignora maiúsculas e desempata pelo id', async () => {
    // Sem lower(nome), a ordem depende da collation: em "C" (a do Postgres de dev) "Zeca" vem antes de
    // "bia"; em en_US da glibc, "zeca" vem antes de "Zeca". Com lower(nome), id as duas dão bia, Zeca, zeca.
    const ids = [1, 2, 3].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
    await pool.query(
      `INSERT INTO usuarios (id, nome, apelido, email, senha_hash) VALUES
         ($1, 'Zeca', 'zeca_maiusculo', 'zeca1@exemplo.com', 'x'),
         ($2, 'zeca', 'zeca_minusculo', 'zeca2@exemplo.com', 'x'),
         ($3, 'bia', 'bia_ordem', 'bia@exemplo.com', 'x')`,
      ids,
    );
    const lista = (await admin.api('get', '/api/admin/usuarios').expect(200)).body;
    assert.deepEqual(
      lista.filter((x) => ids.includes(x.id)).map((x) => x.id),
      [ids[2], ids[0], ids[1]],
    );
  });

  describe('redefinir senha: limites e corpo', () => {
    const put = (id, corpo) => admin.api('put', `/api/admin/usuarios/${id}/senha`).send(corpo);
    const login = (email, senha) =>
      request(app).post('/api/auth/login').send({ identificador: email, senha });

    test('aceita 8 e 72 caracteres ASCII; 7 ou 73 dão 400 e a sessão continua', async () => {
      const u = await novoUsuario();
      const SENHA_72 = 'Ab1!' + 'x'.repeat(68);
      await put(u.usuario.id, { senha: 'Abcde1!' }).expect(400);
      const longa = await put(u.usuario.id, { senha: SENHA_72 + 'x' }).expect(400);
      assert.match(JSON.stringify(longa.body), /Senha muito longa/);
      await u.api('get', '/api/auth/me').expect(200);
      for (const senha of ['Abcdef1!', SENHA_72]) {
        await put(u.usuario.id, { senha }).expect(204);
        await login(u.email, senha).expect(200);
      }
    });

    test('limite é de 72 bytes: acento conta 2 e o 73º byte dá 400', async () => {
      // bcrypt ignora o que passa do 72º byte: sem esse limite, X+"A" e X+"B" seriam a mesma senha.
      const u = await novoUsuario();
      const SENHA_72_BYTES = 'Ab1!' + 'é'.repeat(34); // 38 caracteres, 72 bytes
      const res = await put(u.usuario.id, { senha: SENHA_72_BYTES + 'A' }).expect(400);
      assert.match(JSON.stringify(res.body), /Senha muito longa/);
      await u.api('get', '/api/auth/me').expect(200);
      await login(u.email, u.senha).expect(200);

      await put(u.usuario.id, { senha: SENHA_72_BYTES }).expect(204);
      await login(u.email, SENHA_72_BYTES).expect(200);
      await login(u.email, SENHA_72_BYTES.slice(0, -1)).expect(401);
    });

    test('sem maiúscula ou com emoji dá 400 com a mensagem no campo senha e nada muda', async () => {
      const u = await novoUsuario();
      for (const [senha, mensagem] of [
        ['nova-senha-456', 'A senha precisa de uma letra maiúscula'],
        ['Nova-senha-456🇧🇷', 'A senha não pode ter emoji nem caracteres invisíveis'],
      ]) {
        const res = await put(u.usuario.id, { senha }).expect(400);
        assert.deepEqual(res.body.erro.detalhes, [{ campo: 'senha', mensagem }], senha);
      }
      await u.api('get', '/api/auth/me').expect(200);
      await login(u.email, u.senha).expect(200);
    });

    test('aceita aspas, aspas simples e barra invertida, e o login com ela funciona', async () => {
      const u = await novoUsuario();
      const senha = `Ab1"'\\'; DROP TABLE usuarios; --`;
      await put(u.usuario.id, { senha }).expect(204);
      await login(u.email, senha).expect(200);
      await login(u.email, u.senha).expect(401);
    });

    test('guarda a senha exatamente como enviada (espaços nas pontas e unicode)', async () => {
      const u = await novoUsuario();
      const senha = '  Sénha çã-1  ';
      await put(u.usuario.id, { senha }).expect(204);
      await login(u.email, senha.trim()).expect(401);
      await login(u.email, senha).expect(200);
    });

    test('corpo ausente, JSON null, array ou senha que não é string dão 400 e não mudam nada', async () => {
      const u = await novoUsuario();
      const antes = (await pool.query('SELECT senha_alterada_em FROM usuarios WHERE id = $1', [u.usuario.id]))
        .rows[0];
      const url = `/api/admin/usuarios/${u.usuario.id}/senha`;

      await admin.api('put', url).expect(400);
      const nulo = await admin
        .api('put', url)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(400);
      assert.equal(nulo.body.erro.codigo, 'JSON_INVALIDO');
      for (const corpo of [[], { senha: 12345678 }, { senha: null }]) {
        const res = await put(u.usuario.id, corpo).expect(400);
        assert.equal(res.body.erro.codigo, 'VALIDACAO', JSON.stringify(corpo));
      }

      const depois = (
        await pool.query('SELECT senha_alterada_em FROM usuarios WHERE id = $1', [u.usuario.id])
      ).rows[0];
      assert.deepEqual(depois, antes);
      await u.api('get', '/api/auth/me').expect(200);
    });

    test('campos extras no corpo são ignorados (não muda papel, ativo nem e-mail)', async () => {
      const u = await novoUsuario();
      await put(u.usuario.id, {
        senha: 'Nova-senha-456',
        papel: 'admin',
        ativo: false,
        email: 'x@y.com',
      }).expect(204);
      const { rows } = await pool.query('SELECT papel, ativo, email FROM usuarios WHERE id = $1', [
        u.usuario.id,
      ]);
      assert.deepEqual(rows[0], { papel: 'usuario', ativo: true, email: u.email });
    });

    test('admin pode redefinir a própria senha: a sessão dele cai e o login novo continua admin', async () => {
      const a = await novoAdmin();
      await a
        .api('put', `/api/admin/usuarios/${a.usuario.id}/senha`)
        .send({ senha: 'Nova-senha-456' })
        .expect(204);
      await a.api('get', '/api/auth/me').expect(401);
      const sessao = (await login(a.email, 'Nova-senha-456').expect(200)).body;
      assert.equal(sessao.usuario.papel, 'admin');
      await autenticado(sessao.token)('get', '/api/admin/usuarios').expect(200);
    });
  });

  test('uuid em maiúsculas de outro usuário: senha e papel funcionam e o id volta minúsculo', async () => {
    const u = await novoUsuario();
    const ID = u.usuario.id.toUpperCase();
    await admin.api('put', `/api/admin/usuarios/${ID}/senha`).send({ senha: 'Nova-senha-456' }).expect(204);
    await request(app)
      .post('/api/auth/login')
      .send({ identificador: u.email, senha: 'Nova-senha-456' })
      .expect(200);
    const res = await admin.api('patch', `/api/admin/usuarios/${ID}`).send({ admin: true }).expect(200);
    assert.equal(res.body.id, u.usuario.id);
    assert.equal(res.body.papel, 'admin');
  });

  test('papel: corpo ausente, JSON null ou array dão 400 e não mudam o papel', async () => {
    const u = await novoUsuario();
    const url = `/api/admin/usuarios/${u.usuario.id}`;
    await admin.api('patch', url).expect(400);
    const nulo = await admin
      .api('patch', url)
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(400);
    assert.equal(nulo.body.erro.codigo, 'JSON_INVALIDO');
    await admin.api('patch', url).send([]).expect(400);
    const { rows } = await pool.query('SELECT papel FROM usuarios WHERE id = $1', [u.usuario.id]);
    assert.equal(rows[0].papel, 'usuario');
  });

  describe('registro das ações', () => {
    let info;
    beforeEach(() => (info = mock.method(logger, 'info')));
    afterEach(() => info.mock.restore());
    // O log de acesso ("http") também passa por logger.info; aqui só interessa a auditoria.
    const auditoria = () => info.mock.calls.filter((c) => c.arguments[0] !== 'http');

    test('só ids (e o papel novo): nunca a senha, o hash ou o e-mail', async () => {
      const u = await novoUsuario();
      const senha = 'Senha-secreta-do-log-1';
      await admin.api('put', `/api/admin/usuarios/${u.usuario.id}/senha`).send({ senha }).expect(204);
      await admin.api('patch', `/api/admin/usuarios/${u.usuario.id}`).send({ admin: true }).expect(200);

      const extras = auditoria().map((c) => c.arguments[1]);
      assert.deepEqual(extras, [
        { admin_id: admin.usuario.id, usuario_id: u.usuario.id },
        { admin_id: admin.usuario.id, usuario_id: u.usuario.id, papel: 'admin' },
      ]);
      const tudo = JSON.stringify(info.mock.calls.map((c) => c.arguments));
      for (const proibido of [senha, '$2b$', u.email]) assert.ok(!tudo.includes(proibido), proibido);
    });

    test('nada é registrado quando a operação falha', async () => {
      const u = await novoUsuario();
      await admin
        .api('put', `/api/admin/usuarios/${u.usuario.id}/senha`)
        .send({ senha: 'curta' })
        .expect(400);
      await admin
        .api('put', `/api/admin/usuarios/${UUID_INEXISTENTE}/senha`)
        .send({ senha: 'Nova-senha-456' })
        .expect(404);
      await admin.api('patch', `/api/admin/usuarios/${admin.usuario.id}`).send({ admin: false }).expect(409);
      await admin.api('patch', `/api/admin/usuarios/${UUID_INEXISTENTE}`).send({ admin: true }).expect(404);
      assert.deepEqual(auditoria(), []);
    });
  });

  test('papel: rebaixar nunca deixa o sistema sem admin ativo (409 ULTIMO_ADMIN)', async () => {
    await pool.query("UPDATE usuarios SET papel = 'usuario' WHERE papel = 'admin'");
    const a = await novoAdmin();
    const b = await novoAdmin();

    // Segura as linhas dos admins enquanto o pedido de b (já autenticado) rebaixa a; nesse meio-tempo
    // b é rebaixado. Quando o pedido seguir, a é o único admin e não pode sair.
    const c = await pool.connect();
    let aberta = false;
    try {
      await c.query('BEGIN');
      aberta = true;
      await c.query("SELECT 1 FROM usuarios WHERE papel = 'admin' AND ativo FOR UPDATE");
      const pedido = b
        .api('patch', `/api/admin/usuarios/${a.usuario.id}`)
        .send({ admin: false })
        .then((r) => r);
      // Consulta por outra conexão: dentro da transação de `c` o pg_stat_activity congela na 1ª leitura.
      for (let i = 0; ; i++) {
        const { rows } = await pool.query(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()",
        );
        if (rows[0].n > 0) break;
        if (i > 200) throw new Error('o pedido não chegou a esperar pela trava');
        await new Promise((r) => setTimeout(r, 25));
      }
      await c.query("UPDATE usuarios SET papel = 'usuario' WHERE id = $1", [b.usuario.id]);
      await c.query('COMMIT');
      aberta = false;

      const res = await pedido;
      assert.equal(res.status, 409);
      assert.equal(res.body.erro.codigo, 'ULTIMO_ADMIN');
    } finally {
      // Sem isso, uma falha devolve ao pool uma conexão segurando as travas (deadlock nos testes seguintes).
      if (aberta) await c.query('ROLLBACK');
      c.release();
    }
    const { rows } = await pool.query("SELECT id FROM usuarios WHERE papel = 'admin' AND ativo");
    assert.deepEqual(
      rows.map((r) => r.id),
      [a.usuario.id],
    );
    await tornarAdmin(admin.email);
  });
});

describe('GET /api/admin/estatisticas', () => {
  test('pergunta provisória (confirmacao-leitura) não entra em respostas, acertos nem na lista de questões', async () => {
    await prepararBanco();
    admin = await novoAdmin();
    const u = await novoJogador();
    const segunda = (await u.api('get', '/api/aulas')).body[1];
    const detalhe = (await u.api('get', `/api/aulas/${segunda.id}`)).body;
    // Antes de abrir a requisição: um erro no meio do encadeamento deixaria o servidor do supertest aberto.
    assert.ok(detalhe.questoes.length, 'aula 2 sem pergunta');
    const visita = (await u.api('post', `/api/aulas/${segunda.id}/visitas`)).body;
    await u
      .api('post', `/api/visitas/${visita.id}/respostas`)
      .send({ questao_id: detalhe.questoes[0].id, alternativa: 'a' })
      .expect(200);
    await u.api('post', `/api/visitas/${visita.id}/finalizar`).expect(200);

    const s = (await admin.api('get', '/api/admin/estatisticas').expect(200)).body;
    const porAula = s.aulas.find((x) => x.aula_id === segunda.id);
    // A visita conta (mais a do novoJogador); a resposta 'Sim' não.
    assert.deepEqual([porAula.total_concluidas, porAula.total_respostas, porAula.total_acertos], [2, 0, 0]);
    assert.ok(!s.questoesAula.some((q) => q.questao_id === detalhe.questoes[0].id));
    const doAluno = s.usuariosAula.find((x) => x.apelido === u.apelido && x.aula_titulo === segunda.titulo);
    assert.deepEqual([doAluno.total_respostas, doAluno.total_acertos], [0, 0]);
  });

  test('questão criada pelo admin (chave NULL) entra nas questões e nos totais', async () => {
    const u = await novoJogador();
    // Aula manual (última da trilha, liberada para o jogador); apagada no fim: as aulas do app são fixas.
    const aula = (await novaAula().expect(201)).body;
    try {
      const q = (await admin.api('post', `/api/admin/aulas/${aula.id}/questoes`).send(questao()).expect(201))
        .body;
      assert.equal(q.chave, null);
      const visita = (await u.api('post', `/api/aulas/${aula.id}/visitas`).expect(201)).body;
      await u
        .api('post', `/api/visitas/${visita.id}/respostas`)
        .send({ questao_id: q.id, alternativa: 'b' })
        .expect(200);

      const s = (await admin.api('get', '/api/admin/estatisticas').expect(200)).body;
      const porAula = s.aulas.find((x) => x.aula_id === aula.id);
      assert.deepEqual([porAula.total_respostas, porAula.total_acertos], [1, 1]);
      const daQuestao = s.questoesAula.find((x) => x.questao_id === q.id);
      assert.deepEqual([daQuestao?.total_respostas, daQuestao?.total_acertos], [1, 1]);
      const doAluno = s.usuariosAula.find((x) => x.apelido === u.apelido && x.aula_titulo === aula.titulo);
      assert.deepEqual([doAluno.total_respostas, doAluno.total_acertos], [1, 1]);
    } finally {
      await pool.query('DELETE FROM aulas WHERE id = $1', [aula.id]);
    }
  });

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

    // A trivia exige a trilha inteira. Só a primeira aula fica ativa por um instante,
    // para liberar a trivia sem criar visitas que mudariam as métricas.
    const { rows: outras } = await pool.query(
      'UPDATE aulas SET ativo = false WHERE ativo AND id <> $1 RETURNING id',
      [aula.id],
    );
    let rodada;
    try {
      rodada = (await u.api('post', '/api/trivia/rodadas').send({ dificuldade: 'media' }).expect(201)).body;
    } finally {
      await pool.query('UPDATE aulas SET ativo = true WHERE id = ANY($1)', [outras.map((a) => a.id)]);
    }
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

    // Só as duas da aula 01: a provisória "Terminou?" das aulas 02 a 15 fica fora das estatísticas.
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
