const { rateLimit } = require('express-rate-limit');
const config = require('../config');

const MINUTO = 60 * 1000;

const limitar = (janelaMs, limite, opcoes = {}) =>
  rateLimit({
    windowMs: janelaMs,
    limit: limite,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => config.NODE_ENV === 'test',
    message: {
      erro: { codigo: 'MUITAS_REQUISICOES', mensagem: 'Muitas tentativas. Aguarde e tente de novo' },
    },
    ...opcoes,
  });

module.exports = {
  limiteAuth: limitar(15 * MINUTO, 10),
  limiteRecuperacaoIp: limitar(60 * MINUTO, 3),
  limiteRecuperacaoEmail: limitar(60 * MINUTO, 3, {
    keyGenerator: (req) => String(req.body?.email ?? '').toLowerCase(),
  }),
  // Rotas autenticadas: chave pelo usuário, não pelo IP (vários funcionários atrás do mesmo NAT).
  limiteGeral: limitar(MINUTO, 300, { keyGenerator: (req) => req.usuario.id }),
};
