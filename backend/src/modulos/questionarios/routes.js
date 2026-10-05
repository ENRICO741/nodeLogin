const { Router } = require('express');
const service = require('./service');
const { naoEncontrado } = require('../../lib/erros');
const { limiteEscrita } = require('../../middleware/limites');

const momentoDaRota = (req) => {
  if (!['pre', 'pos'].includes(req.params.momento)) throw naoEncontrado('Questionário não encontrado');
  return req.params.momento;
};

const router = Router();

router.get('/:momento', async (req, res) => {
  res.json(await service.obterDefinicao(req.usuario, momentoDaRota(req)));
});

router.post('/:momento', limiteEscrita(), async (req, res) => {
  res.status(201).json(await service.enviar(req.usuario, momentoDaRota(req), req.body));
});

module.exports = router;
