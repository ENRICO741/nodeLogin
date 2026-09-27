const { Router } = require('express');
const { z } = require('zod');
const service = require('./service');
const { pool } = require('../../db/pool');
const { idDaRota, esquemaResposta } = require('../../lib/validacao');

const esquemaNovaRodada = z.object({
  dificuldade: z.enum(['facil', 'media', 'dificil']),
  limite: z.number().int().min(5).max(20).default(10),
});

const router = Router();

router.post('/rodadas', async (req, res) => {
  res.status(201).json(await service.criarRodada(req.usuario.id, esquemaNovaRodada.parse(req.body)));
});

router.get('/rodadas/:id', async (req, res) => {
  res.json(await service.obterRodada(pool, idDaRota(req), req.usuario.id));
});

router.post('/rodadas/:id/respostas', async (req, res) => {
  res.json(await service.responder(idDaRota(req), req.usuario.id, esquemaResposta.parse(req.body)));
});

router.post('/rodadas/:id/finalizar', async (req, res) => {
  res.json(await service.finalizar(idDaRota(req), req.usuario.id));
});

module.exports = router;
