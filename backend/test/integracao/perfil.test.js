const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { request, app, pool, prepararBanco, novoUsuario } = require('../ajuda');

before(prepararBanco);
after(() => pool.end());

const FOTO = `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`;

describe('GET /api/perfil', () => {
  test('devolve o perfil do próprio usuário', async () => {
    const u = await novoUsuario();
    const res = await u.api('get', '/api/perfil').expect(200);
    assert.equal(res.body.id, u.usuario.id);
    assert.equal(res.body.email, u.email);
    assert.equal(res.body.senha_hash, undefined);
  });

  test('exige login', async () => {
    await request(app).get('/api/perfil').expect(401);
  });
});

describe('PATCH /api/perfil', () => {
  test('atualiza todos os campos permitidos', async () => {
    const u = await novoUsuario();
    const dados = {
      nome: 'Novo Nome',
      apelido: `novo_${u.usuario.apelido}`,
      bio: 'Analista de segurança',
      profissao: 'Analista',
      empresa: 'ACME',
      foto_perfil_url: FOTO,
    };
    const res = await u.api('patch', '/api/perfil').send(dados).expect(200);
    for (const [campo, valor] of Object.entries(dados)) assert.equal(res.body[campo], valor, campo);
    const { rows } = await pool.query(
      'SELECT atualizado_em > criado_em AS mudou FROM usuarios WHERE id = $1',
      [u.usuario.id],
    );
    assert.equal(rows[0].mudou, true);
  });

  test('atualização parcial mantém os outros campos', async () => {
    const u = await novoUsuario();
    await u.api('patch', '/api/perfil').send({ empresa: 'ACME' }).expect(200);
    const res = await u.api('patch', '/api/perfil').send({ bio: 'Oi' }).expect(200);
    assert.equal(res.body.empresa, 'ACME');
    assert.equal(res.body.nome, u.usuario.nome);
  });

  test('corpo vazio não altera nada e devolve o perfil atual', async () => {
    const u = await novoUsuario();
    const res = await u.api('patch', '/api/perfil').send({}).expect(200);
    assert.equal(res.body.nome, u.usuario.nome);
  });

  test('texto vazio em campo opcional vira null', async () => {
    const u = await novoUsuario();
    await u.api('patch', '/api/perfil').send({ bio: 'algo', empresa: 'x' }).expect(200);
    const res = await u.api('patch', '/api/perfil').send({ bio: '', empresa: '   ' }).expect(200);
    assert.equal(res.body.bio, null);
    assert.equal(res.body.empresa, null);
  });

  test('foto pode ser removida com null', async () => {
    const u = await novoUsuario();
    await u.api('patch', '/api/perfil').send({ foto_perfil_url: FOTO }).expect(200);
    const res = await u.api('patch', '/api/perfil').send({ foto_perfil_url: null }).expect(200);
    assert.equal(res.body.foto_perfil_url, null);
  });

  test('ignora papel, pontos, e-mail e id (sem atribuição em massa)', async () => {
    const u = await novoUsuario();
    const res = await u
      .api('patch', '/api/perfil')
      .send({ papel: 'admin', pontuacao_total: 9999, email: 'hack@x.com', id: 'x', badges: [1] })
      .expect(200);
    assert.equal(res.body.papel, 'usuario');
    assert.equal(res.body.pontuacao_total, 0);
    assert.equal(res.body.email, u.email);
    assert.equal(res.body.id, u.usuario.id);
  });

  test('recusa foto que não é data URL de imagem permitida', async () => {
    const u = await novoUsuario();
    const invalidas = [
      'https://exemplo.com/foto.png',
      'data:image/gif;base64,R0lGOD',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:text/html;base64,PGgxPg==',
      'data:image/png;base64,<script>',
    ];
    for (const foto of invalidas) {
      const res = await u.api('patch', '/api/perfil').send({ foto_perfil_url: foto }).expect(400);
      assert.equal(res.body.erro.detalhes[0].campo, 'foto_perfil_url', foto);
    }
  });

  test('recusa foto acima de ~200 KB', async () => {
    const u = await novoUsuario();
    const grande = `data:image/png;base64,${'A'.repeat(270_001)}`;
    const res = await u.api('patch', '/api/perfil').send({ foto_perfil_url: grande }).expect(400);
    assert.match(res.body.erro.detalhes[0].mensagem, /200 KB/);
  });

  test('recusa bio acima de 500 caracteres e nome curto', async () => {
    const u = await novoUsuario();
    await u
      .api('patch', '/api/perfil')
      .send({ bio: 'x'.repeat(501) })
      .expect(400);
    await u.api('patch', '/api/perfil').send({ nome: 'A' }).expect(400);
    // Apelido com acento (mesma regra do cadastro); × é recusado.
    const comAcento = `joão_${Date.now()}`;
    const salvo = (await u.api('patch', '/api/perfil').send({ apelido: comAcento }).expect(200)).body;
    assert.equal(salvo.apelido, comAcento);
    await u.api('patch', '/api/perfil').send({ apelido: 'a×b' }).expect(400);
    const outro = await novoUsuario();
    const res = await outro
      .api('patch', '/api/perfil')
      .send({ apelido: comAcento.toUpperCase() })
      .expect(409);
    assert.equal(res.body.erro.mensagem, 'Este apelido já está em uso');
    // Mesma regra do cadastro: nada de quebra de linha ou caractere invisível no nome.
    for (const nome of ['Ana\nBia', 'Ana\u202Eetla']) {
      await u.api('patch', '/api/perfil').send({ nome }).expect(400);
    }
    await u
      .api('patch', '/api/perfil')
      .send({ bio: 'x'.repeat(500) })
      .expect(200);
  });

  test('apelido já usado por outra pessoa dá 409; o próprio apelido pode ser reenviado', async () => {
    const a = await novoUsuario();
    const b = await novoUsuario();
    const res = await b.api('patch', '/api/perfil').send({ apelido: a.apelido }).expect(409);
    assert.equal(res.body.erro.mensagem, 'Este apelido já está em uso');
    await a.api('patch', '/api/perfil').send({ apelido: a.apelido }).expect(200);
  });

  test('apelido inválido dá 400', async () => {
    const u = await novoUsuario();
    await u.api('patch', '/api/perfil').send({ apelido: 'a b' }).expect(400);
  });
});
