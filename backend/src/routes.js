const express = require('express');
const logger = require('./lib/logger');
const {
  userModel: {
    createUser,
    findByUsername,
    findByUsernameAndPassword,
    getProfileById,
    updateProfile,
    getPontuacaoTotal,
    incrementarPontuacao,
  },
  aulaModel: {
    listAulasAtivas,
    getAulaById,
    listQuestoesParaAluno,
    getQuestaoAulaById,
    createAulaVisita,
    getAulaVisitaById,
    registrarAulaResposta,
    finalizarAulaVisita,
    listQuestoesAdmin: listQuestoesAdminAula,
    atualizarImagemQuestao: atualizarImagemQuestaoAula,
  },
  triviaModel: {
    listQuestoesPorDificuldade,
    getQuestaoTriviaById,
    createTriviaRodada,
    getTriviaRodadaById,
    registrarTriviaResposta,
    finalizarTriviaRodada,
    listQuestoesAdmin: listQuestoesAdminTrivia,
    atualizarImagemQuestao: atualizarImagemQuestaoTrivia,
  },
  badgeModel: { listBadgesAtivos, listBadgesDoUsuario, checkAndAwardAulaBadges },
  telemetriaModel: { iniciarSessao, finalizarSessao, registrarEvento },
  estatisticasModel: {
    getEstatisticasPorAula,
    getEstatisticasQuestoesAula,
    getEstatisticasUsuariosAula,
    getEstatisticasPorTrivia,
    getEstatisticasQuestoesTrivia,
    getEstatisticasUsuariosTrivia,
  },
} = require('./models');
const { listarConteudos, getConteudoPorOrdem } = require('./lib/conteudoAulas');

const routes = express.Router();

// Helper: validate presence of fields
const requireFields = (fields, body) => fields.every((f) => body[f]);

routes.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!requireFields(['username', 'password'], req.body)) {
    return res.status(400).json({ error: 'username e password são obrigatórios' });
  }

  try {
    const existingUser = await findByUsername(username);
    if (existingUser) return res.status(409).json({ error: 'Usuário já existe' });

    const user = await createUser(username, password);
    return res.status(201).json(user);
  } catch (err) {
    logger.error('Erro ao criar usuário:', err);
    return res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

routes.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!requireFields(['username', 'password'], req.body)) {
    return res.status(400).json({ error: 'username e password são obrigatórios' });
  }

  try {
    const user = await findByUsernameAndPassword(username, password);
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    return res.json({ message: 'Login bem-sucedido', user });
  } catch (err) {
    logger.error('Erro ao buscar usuário:', err);
    return res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

routes.get('/profile/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const profile = await getProfileById(id);
    if (!profile) return res.status(404).json({ error: 'Usuário não encontrado' });
    return res.json(profile);
  } catch (err) {
    logger.error('Erro ao buscar perfil:', err);
    return res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

routes.put('/profile/:id', async (req, res) => {
  const { id } = req.params;
  const { fullName, email, bio, avatar, nivel, ritmo, areaInteresse, badges } = req.body;

  if (!fullName || !email) return res.status(400).json({ error: 'Nome completo e email são obrigatórios' });

  try {
    const updatedProfile = await updateProfile(id, { fullName, email, bio, avatar, nivel, ritmo, areaInteresse, badges });
    return res.json({ message: 'Perfil atualizado com sucesso', profile: updatedProfile });
  } catch (err) {
    logger.error('Erro ao atualizar perfil:', err);
    return res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// ----- Aulas -----

routes.get('/aulas', async (req, res) => {
  const { usuarioId } = req.query;
  try {
    const aulas = await listAulasAtivas(usuarioId);
    return res.json(aulas);
  } catch (err) {
    logger.error('Erro ao listar aulas:', err);
    return res.status(500).json({ error: 'Erro ao listar aulas' });
  }
});

routes.get('/aulas/:id', async (req, res) => {
  const { id } = req.params;
  const { usuarioId } = req.query;
  try {
    const aula = await getAulaById(id, usuarioId);
    if (!aula) return res.status(404).json({ error: 'Aula não encontrada' });

    const questoes = await listQuestoesParaAluno(id);
    return res.json({ ...aula, questoes });
  } catch (err) {
    logger.error('Erro ao buscar aula:', err);
    return res.status(500).json({ error: 'Erro ao buscar aula' });
  }
});

routes.post('/aulas/:id/visitas', async (req, res) => {
  const { id } = req.params;
  const { usuarioId } = req.body;

  if (!requireFields(['usuarioId'], req.body)) {
    return res.status(400).json({ error: 'usuarioId é obrigatório' });
  }

  try {
    const aula = await getAulaById(id);
    if (!aula) return res.status(404).json({ error: 'Aula não encontrada' });

    const visita = await createAulaVisita(usuarioId, id);
    return res.status(201).json(visita);
  } catch (err) {
    logger.error('Erro ao iniciar visita de aula:', err);
    return res.status(500).json({ error: 'Erro ao iniciar aula' });
  }
});

routes.post('/visitas/:id/respostas', async (req, res) => {
  const { id } = req.params;
  const { usuarioId, questaoId, alternativa } = req.body;

  if (!requireFields(['usuarioId', 'questaoId', 'alternativa'], req.body)) {
    return res.status(400).json({ error: 'usuarioId, questaoId e alternativa são obrigatórios' });
  }

  try {
    const visita = await getAulaVisitaById(id);
    if (!visita) return res.status(404).json({ error: 'Visita não encontrada' });
    if (visita.usuario_id !== Number(usuarioId)) return res.status(403).json({ error: 'Visita não pertence ao usuário' });
    if (visita.finalizada_em) return res.status(400).json({ error: 'Esta atividade já foi finalizada' });

    const questao = await getQuestaoAulaById(questaoId);
    if (!questao || questao.aula_id !== visita.aula_id) {
      return res.status(400).json({ error: 'Questão não pertence a esta aula' });
    }

    const correta = questao.resposta_correta === alternativa;

    await registrarAulaResposta({ visitaId: id, questaoId, usuarioId, correta });

    return res.status(201).json({
      correta,
      pontuou: correta,
      pontos: correta ? questao.pontos : 0,
      explicacao: questao.explicacao,
      alternativaCorreta: questao.resposta_correta,
    });
  } catch (err) {
    if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message });
    logger.error('Erro ao registrar resposta de aula:', err);
    return res.status(500).json({ error: 'Erro ao registrar resposta' });
  }
});

routes.post('/visitas/:id/finalizar', async (req, res) => {
  const { id } = req.params;
  const { usuarioId } = req.body;

  if (!requireFields(['usuarioId'], req.body)) {
    return res.status(400).json({ error: 'usuarioId é obrigatório' });
  }

  try {
    const visitaAntes = await getAulaVisitaById(id);
    if (!visitaAntes) return res.status(404).json({ error: 'Visita não encontrada' });
    if (visitaAntes.usuario_id !== Number(usuarioId)) return res.status(403).json({ error: 'Visita não pertence ao usuário' });

    const { pontosConclusaoGanhos } = await finalizarAulaVisita(id);

    let novosBadges = [];
    let pontosGanhos = 0;
    if (pontosConclusaoGanhos) {
      const aula = await getAulaById(visitaAntes.aula_id);
      pontosGanhos = aula.pontos_conclusao;
      await incrementarPontuacao(usuarioId, pontosGanhos);
      novosBadges = await checkAndAwardAulaBadges(usuarioId, visitaAntes.aula_id);
    }

    const pontuacaoTotal = await getPontuacaoTotal(usuarioId);

    return res.json({ concluida: true, pontosGanhos, pontuacaoTotal, novosBadges });
  } catch (err) {
    logger.error('Erro ao finalizar visita de aula:', err);
    return res.status(500).json({ error: 'Erro ao finalizar aula' });
  }
});

// ----- Trivia -----

routes.get('/trivia/questoes', async (req, res) => {
  const { dificuldade, limite } = req.query;
  if (!dificuldade) return res.status(400).json({ error: 'dificuldade é obrigatória' });

  try {
    const questoes = await listQuestoesPorDificuldade(dificuldade, limite ? Number(limite) : 10);
    return res.json(questoes);
  } catch (err) {
    logger.error('Erro ao listar questões de trivia:', err);
    return res.status(500).json({ error: 'Erro ao listar questões de trivia' });
  }
});

routes.post('/trivia/rodadas', async (req, res) => {
  const { usuarioId, dificuldade } = req.body;

  if (!requireFields(['usuarioId', 'dificuldade'], req.body)) {
    return res.status(400).json({ error: 'usuarioId e dificuldade são obrigatórios' });
  }

  try {
    const rodada = await createTriviaRodada(usuarioId, dificuldade);
    return res.status(201).json(rodada);
  } catch (err) {
    logger.error('Erro ao iniciar rodada de trivia:', err);
    return res.status(500).json({ error: 'Erro ao iniciar rodada de trivia' });
  }
});

routes.post('/rodadas/:id/respostas', async (req, res) => {
  const { id } = req.params;
  const { usuarioId, questaoId, alternativa } = req.body;

  if (!requireFields(['usuarioId', 'questaoId', 'alternativa'], req.body)) {
    return res.status(400).json({ error: 'usuarioId, questaoId e alternativa são obrigatórios' });
  }

  try {
    const rodada = await getTriviaRodadaById(id);
    if (!rodada) return res.status(404).json({ error: 'Rodada não encontrada' });
    if (rodada.usuario_id !== Number(usuarioId)) return res.status(403).json({ error: 'Rodada não pertence ao usuário' });
    if (rodada.finalizada_em) return res.status(400).json({ error: 'Esta rodada já foi finalizada' });

    const questao = await getQuestaoTriviaById(questaoId);
    if (!questao) return res.status(400).json({ error: 'Questão inválida' });

    const correta = questao.resposta_correta === alternativa;

    await registrarTriviaResposta({ rodadaId: id, questaoId, usuarioId, correta });

    return res.status(201).json({
      correta,
      pontuou: correta,
      pontos: correta ? questao.pontos : 0,
      explicacao: questao.explicacao,
      alternativaCorreta: questao.resposta_correta,
    });
  } catch (err) {
    if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message });
    logger.error('Erro ao registrar resposta de trivia:', err);
    return res.status(500).json({ error: 'Erro ao registrar resposta' });
  }
});

routes.post('/rodadas/:id/finalizar', async (req, res) => {
  const { id } = req.params;
  const { usuarioId } = req.body;

  if (!requireFields(['usuarioId'], req.body)) {
    return res.status(400).json({ error: 'usuarioId é obrigatório' });
  }

  try {
    const rodadaAntes = await getTriviaRodadaById(id);
    if (!rodadaAntes) return res.status(404).json({ error: 'Rodada não encontrada' });
    if (rodadaAntes.usuario_id !== Number(usuarioId)) return res.status(403).json({ error: 'Rodada não pertence ao usuário' });

    const { pontosGanhos } = await finalizarTriviaRodada(id);

    if (!rodadaAntes.finalizada_em) {
      await incrementarPontuacao(usuarioId, pontosGanhos);
    }

    const pontuacaoTotal = await getPontuacaoTotal(usuarioId);

    return res.json({ pontosGanhos, pontuacaoTotal });
  } catch (err) {
    logger.error('Erro ao finalizar rodada de trivia:', err);
    return res.status(500).json({ error: 'Erro ao finalizar rodada' });
  }
});

// ----- Badges -----

routes.get('/badges', async (req, res) => {
  try {
    const badges = await listBadgesAtivos();
    return res.json(badges);
  } catch (err) {
    logger.error('Erro ao listar badges:', err);
    return res.status(500).json({ error: 'Erro ao listar badges' });
  }
});

routes.get('/usuarios/:id/badges', async (req, res) => {
  const { id } = req.params;
  try {
    const badges = await listBadgesDoUsuario(id);
    return res.json(badges);
  } catch (err) {
    logger.error('Erro ao listar badges do usuário:', err);
    return res.status(500).json({ error: 'Erro ao listar badges do usuário' });
  }
});

// ----- Telemetria -----

routes.post('/sessoes', async (req, res) => {
  const { usuarioId } = req.body;

  if (!requireFields(['usuarioId'], req.body)) {
    return res.status(400).json({ error: 'usuarioId é obrigatório' });
  }

  try {
    const sessao = await iniciarSessao(usuarioId);
    return res.status(201).json(sessao);
  } catch (err) {
    logger.error('Erro ao iniciar sessão:', err);
    return res.status(500).json({ error: 'Erro ao iniciar sessão' });
  }
});

routes.post('/sessoes/:id/finalizar', async (req, res) => {
  const { id } = req.params;
  try {
    await finalizarSessao(id);
    return res.json({ finalizada: true });
  } catch (err) {
    logger.error('Erro ao finalizar sessão:', err);
    return res.status(500).json({ error: 'Erro ao finalizar sessão' });
  }
});

routes.post('/eventos', async (req, res) => {
  const { usuarioId, sessaoId, tipoEvento, tela, elemento, duracaoMs, metadata } = req.body;

  if (!requireFields(['usuarioId', 'sessaoId', 'tipoEvento'], req.body)) {
    return res.status(400).json({ error: 'usuarioId, sessaoId e tipoEvento são obrigatórios' });
  }

  try {
    const evento = await registrarEvento({ usuarioId, sessaoId, tipoEvento, tela, elemento, duracaoMs, metadata });
    return res.status(201).json(evento);
  } catch (err) {
    logger.error('Erro ao registrar evento:', err);
    return res.status(500).json({ error: 'Erro ao registrar evento' });
  }
});

// ----- Estatísticas de atividades (Aulas + Trivia) -----

routes.get('/estatisticas/aulas', async (req, res) => {
  try {
    const estatisticas = await getEstatisticasPorAula();
    return res.json(estatisticas);
  } catch (err) {
    logger.error('Erro ao buscar estatísticas de aulas:', err);
    return res.status(500).json({ error: 'Erro ao buscar estatísticas de aulas' });
  }
});

routes.get('/estatisticas/aulas/questoes', async (req, res) => {
  try {
    const estatisticas = await getEstatisticasQuestoesAula();
    return res.json(estatisticas);
  } catch (err) {
    logger.error('Erro ao buscar estatísticas de questões de aula:', err);
    return res.status(500).json({ error: 'Erro ao buscar estatísticas de questões de aula' });
  }
});

routes.get('/estatisticas/aulas/usuarios', async (req, res) => {
  try {
    const estatisticas = await getEstatisticasUsuariosAula();
    return res.json(estatisticas);
  } catch (err) {
    logger.error('Erro ao buscar estatísticas de usuários em aulas:', err);
    return res.status(500).json({ error: 'Erro ao buscar estatísticas de usuários em aulas' });
  }
});

routes.get('/estatisticas/trivia', async (req, res) => {
  try {
    const estatisticas = await getEstatisticasPorTrivia();
    return res.json(estatisticas);
  } catch (err) {
    logger.error('Erro ao buscar estatísticas de trivia:', err);
    return res.status(500).json({ error: 'Erro ao buscar estatísticas de trivia' });
  }
});

routes.get('/estatisticas/trivia/questoes', async (req, res) => {
  try {
    const estatisticas = await getEstatisticasQuestoesTrivia();
    return res.json(estatisticas);
  } catch (err) {
    logger.error('Erro ao buscar estatísticas de questões de trivia:', err);
    return res.status(500).json({ error: 'Erro ao buscar estatísticas de questões de trivia' });
  }
});

routes.get('/estatisticas/trivia/usuarios', async (req, res) => {
  try {
    const estatisticas = await getEstatisticasUsuariosTrivia();
    return res.json(estatisticas);
  } catch (err) {
    logger.error('Erro ao buscar estatísticas de usuários em trivia:', err);
    return res.status(500).json({ error: 'Erro ao buscar estatísticas de usuários em trivia' });
  }
});

// ----- Gerenciamento de imagens das questões -----

routes.get('/questoes-aula', async (req, res) => {
  try {
    const questoes = await listQuestoesAdminAula();
    return res.json(questoes);
  } catch (err) {
    logger.error('Erro ao listar questões de aula (admin):', err);
    return res.status(500).json({ error: 'Erro ao listar questões de aula' });
  }
});

routes.put('/questoes-aula/:id', async (req, res) => {
  const { id } = req.params;
  const imagemUrl = req.body.imagemUrl ? req.body.imagemUrl.trim() || null : null;

  try {
    const resultado = await atualizarImagemQuestaoAula(id, imagemUrl);
    return res.json(resultado);
  } catch (err) {
    logger.error('Erro ao atualizar imagem da questão de aula:', err);
    return res.status(500).json({ error: 'Erro ao atualizar imagem da questão' });
  }
});

routes.get('/questoes-trivia', async (req, res) => {
  try {
    const questoes = await listQuestoesAdminTrivia();
    return res.json(questoes);
  } catch (err) {
    logger.error('Erro ao listar questões de trivia (admin):', err);
    return res.status(500).json({ error: 'Erro ao listar questões de trivia' });
  }
});

routes.put('/questoes-trivia/:id', async (req, res) => {
  const { id } = req.params;
  const imagemUrl = req.body.imagemUrl ? req.body.imagemUrl.trim() || null : null;

  try {
    const resultado = await atualizarImagemQuestaoTrivia(id, imagemUrl);
    return res.json(resultado);
  } catch (err) {
    logger.error('Erro ao atualizar imagem da questão de trivia:', err);
    return res.status(500).json({ error: 'Erro ao atualizar imagem da questão' });
  }
});

// ----- Conteúdo teórico das aulas (módulo separado do quiz) -----

routes.get('/conteudos', (req, res) => {
  try {
    const conteudos = listarConteudos();
    return res.json(conteudos);
  } catch (err) {
    logger.error('Erro ao listar conteúdos de aula:', err);
    return res.status(500).json({ error: 'Erro ao listar conteúdos' });
  }
});

routes.get('/conteudos/:ordem', (req, res) => {
  const { ordem } = req.params;
  try {
    const conteudo = getConteudoPorOrdem(ordem);
    if (!conteudo) return res.status(404).json({ error: 'Conteúdo não encontrado' });
    return res.json(conteudo);
  } catch (err) {
    logger.error('Erro ao buscar conteúdo de aula:', err);
    return res.status(500).json({ error: 'Erro ao buscar conteúdo' });
  }
});

module.exports = routes;