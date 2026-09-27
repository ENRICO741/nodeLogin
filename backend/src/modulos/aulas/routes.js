const { Router } = require('express');
const service = require('./service');
const { idDaRota, esquemaResposta } = require('../../lib/validacao');

const router = Router();

router.get('/aulas', async (req, res) => {
  res.json(await service.listar(req.usuario.id));
});

router.get('/aulas/:id', async (req, res) => {
  res.json(await service.obter(idDaRota(req), req.usuario.id));
});

router.post('/aulas/:id/visitas', async (req, res) => {
  res.status(201).json(await service.iniciarVisita(idDaRota(req), req.usuario.id));
});

router.post('/visitas/:id/respostas', async (req, res) => {
  res.json(await service.responder(idDaRota(req), req.usuario.id, esquemaResposta.parse(req.body)));
});

router.post('/visitas/:id/finalizar', async (req, res) => {
  res.json(await service.finalizar(idDaRota(req), req.usuario.id));
});

module.exports = router;
