const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, prepararBanco, novoUsuario, tornarAdmin } = require('./ajuda');

before(prepararBanco);
after(() => pool.end());

test('usuário não mexe em visita, rodada ou sessão de outro usuário', async () => {
  const dono = await novoUsuario();
  const intruso = await novoUsuario();
  const [aula] = (await dono.api('get', '/api/aulas').expect(200)).body;

  const visita = (await dono.api('post', `/api/aulas/${aula.id}/visitas`).expect(201)).body;
  await intruso.api('post', `/api/visitas/${visita.id}/finalizar`).expect(404);

  const rodada = (await dono.api('post', '/api/trivia/rodadas').send({ dificuldade: 'media' }).expect(201))
    .body;
  await intruso.api('get', `/api/trivia/rodadas/${rodada.id}`).expect(404);
  await intruso
    .api('post', `/api/trivia/rodadas/${rodada.id}/respostas`)
    .send({ questao_id: rodada.questoes[0].id, alternativa: 'a' })
    .expect(404);

  const sessao = (await dono.api('post', '/api/sessoes').expect(201)).body;
  await intruso.api('post', '/api/eventos').send({ sessao_id: sessao.id, tipo_evento: 'clique' }).expect(404);
  await dono.api('post', '/api/eventos').send({ sessao_id: sessao.id, tipo_evento: 'clique' }).expect(204);
});

test('perfil só altera campos permitidos do próprio usuário', async () => {
  const u = await novoUsuario();
  const res = await u
    .api('patch', '/api/perfil')
    .send({ bio: 'Analista', papel: 'admin', pontuacao_total: 9999 })
    .expect(200);
  assert.equal(res.body.bio, 'Analista');
  assert.equal(res.body.papel, 'usuario');
  assert.equal(res.body.pontuacao_total, 0);
});

test('rotas de admin exigem papel admin', async () => {
  const u = await novoUsuario();
  await u.api('get', '/api/admin/estatisticas').expect(403);

  await tornarAdmin(u.email);
  const stats = (await u.api('get', '/api/admin/estatisticas').expect(200)).body;
  assert.deepEqual(Object.keys(stats).sort(), [
    'aulas',
    'questoesAula',
    'questoesTrivia',
    'trivia',
    'usuariosAula',
    'usuariosTrivia',
  ]);
});

test('admin: CRUD de aula sanitiza HTML e exclusão é lógica', async () => {
  const admin = await novoUsuario();
  await tornarAdmin(admin.email);

  const aula = (
    await admin
      .api('post', '/api/admin/aulas')
      .send({
        titulo: 'Phishing',
        ordem: 99,
        conteudo_html: '<p onclick="x()">Oi</p><script>alert(1)</script>',
        pontos_conclusao: 10,
      })
      .expect(201)
  ).body;
  assert.equal(aula.conteudo_html, '<p>Oi</p>');

  await admin
    .api('post', `/api/admin/aulas/${aula.id}/questoes`)
    .send({
      enunciado: 'Um e-mail pede sua senha. O que fazer?',
      alternativa_a: 'Responder',
      alternativa_b: 'Reportar ao time de segurança',
      alternativa_c: 'Ignorar',
      alternativa_d: 'Encaminhar',
      resposta_correta: 'b',
      pontos: 10,
      imagem_url: 'http://inseguro.com/x.png',
    })
    .expect(400);

  await admin.api('delete', `/api/admin/aulas/${aula.id}`).expect(204);
  await admin.api('get', `/api/aulas/${aula.id}`).expect(404);
  const lista = (await admin.api('get', '/api/admin/aulas').expect(200)).body;
  assert.equal(lista.find((a) => a.id === aula.id).ativo, false);
});
