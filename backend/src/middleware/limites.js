const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
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

// Mesma conta e mesmo IP. Com o IP na chave, ninguém trava a conta de outra pessoa errando a senha dela.
const chaveLogin = (req) =>
  `${ipKeyGenerator(req.ip)}|${String(req.body?.identificador ?? '').toLowerCase()}`;

module.exports = {
  chaveLogin,
  // Cadastro, login e redefinição somados, por IP. Folga para uma turma inteira atrás do mesmo NAT
  // (cadastro + login de ~50 pessoas) e ainda segura quem testa uma senha em muitas contas.
  limiteAuthIp: limitar(15 * MINUTO, 100),
  // Força bruta contra uma conta: 10 tentativas de login em 15 min.
  limiteLogin: limitar(15 * MINUTO, 10, { keyGenerator: chaveLogin }),
  limiteRecuperacaoIp: limitar(60 * MINUTO, 3),
  limiteRecuperacaoEmail: limitar(60 * MINUTO, 3, {
    keyGenerator: (req) => String(req.body?.email ?? '').toLowerCase(),
  }),
  // Rotas autenticadas: chave pelo usuário, não pelo IP (vários funcionários atrás do mesmo NAT).
  limiteGeral: limitar(MINUTO, 300, { keyGenerator: (req) => req.usuario.id }),
  // Rotas que gravam uma linha por chamada (telemetria, rodadas de trivia).
  limiteEscrita: limitar(MINUTO, 60, { keyGenerator: (req) => req.usuario.id }),
};
