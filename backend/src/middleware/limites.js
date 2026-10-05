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
// Mesma normalização que o zod e o login fazem depois (NFC, trim, minúsculas): senão " ana", "ana " ou
// "joão" com o til separado ganhariam 10 tentativas novas cada.
const chaveLogin = (req) =>
  `${ipKeyGenerator(req.ip)}|${String(req.body?.identificador ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()}`;

module.exports = {
  chaveLogin,
  // Cadastro, login e redefinição somados, por IP. Folga para uma turma inteira atrás do mesmo NAT
  // (cadastro + login de ~50 pessoas) e ainda segura quem testa uma senha em muitas contas.
  limiteAuthIp: limitar(15 * MINUTO, 100),
  // Força bruta contra uma conta: 10 tentativas de login em 15 min.
  limiteLogin: limitar(15 * MINUTO, 10, { keyGenerator: chaveLogin }),
  // Por IP com folga para a turma atrás do mesmo NAT; quem segura o spam é o limite por e-mail.
  limiteRecuperacaoIp: limitar(60 * MINUTO, 30),
  // 3 e-mails por hora para o mesmo endereço. Estourado, a rota responde o mesmo 200 sem enviar: um 429
  // deixaria um terceiro travar a vítima (e cada pedido invalida o link anterior).
  limiteRecuperacaoEmail: limitar(60 * MINUTO, 3, {
    keyGenerator: (req) =>
      String(req.body?.email ?? '')
        .trim()
        .toLowerCase(),
    handler: (req, _res, next) => {
      req.limiteEmailEstourado = true;
      next();
    },
  }),
  // Rotas autenticadas: chave pelo usuário, não pelo IP (vários funcionários atrás do mesmo NAT).
  limiteGeral: limitar(MINUTO, 300, { keyGenerator: (req) => req.usuario.id }),
  // Rotas que gravam uma linha por chamada (sessões e eventos, visitas de aula, rodadas de trivia).
  // Um contador por rota: uma rajada de telemetria não bloqueia o aluno de iniciar uma aula.
  limiteEscrita: () => limitar(MINUTO, 60, { keyGenerator: (req) => req.usuario.id }),
};
