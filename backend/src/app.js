const crypto = require('node:crypto');
const express = require('express');
const path = require('node:path');
const helmet = require('helmet');
const config = require('./config');
const logger = require('./lib/logger');
const mailer = require('./lib/mailer');
const { query } = require('./db/pool');
const { naoEncontrado } = require('./lib/erros');
const { autenticar, exigirAdmin } = require('./middleware/autenticacao');
const { limiteGeral } = require('./middleware/limites');
const { tratarErros } = require('./middleware/tratarErros');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // atrás do Caddy: IP real vem do X-Forwarded-For
app.use(helmet());
app.use(express.json({ limit: '300kb' }));

app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  const inicio = performance.now();
  res.on('finish', () =>
    logger.info('http', {
      req_id: req.id,
      metodo: req.method,
      url: req.path,
      status: res.statusCode,
      ms: Math.round(performance.now() - inicio),
    }),
  );
  next();
});

// Cada verificação tem 2 s: o healthcheck do Docker desiste em 5 s.
const PRAZO_VERIFICACAO_MS = 2000;
const comPrazo = (promessa) =>
  Promise.race([
    promessa,
    new Promise((_, rejeitar) => {
      setTimeout(rejeitar, PRAZO_VERIFICACAO_MS, new Error('tempo esgotado')).unref();
    }),
  ]);

// Banco fora = 503 (o container fica "unhealthy"). SMTP fora = 200 "degradado": o app funciona,
// só a redefinição de senha não chega. A resposta é pública, então não leva detalhes do erro.
app.get('/api/saude', async (_req, res) => {
  const [banco, smtp] = await Promise.allSettled([comPrazo(query('SELECT 1')), comPrazo(mailer.verificar())]);
  if (banco.status === 'rejected') logger.error('saúde: banco indisponível', { erro: banco.reason });
  const verificacoes = {
    banco: banco.status === 'fulfilled' ? 'ok' : 'falha',
    smtp:
      smtp.status === 'fulfilled' && smtp.value === null ? 'nao_configurado' : smtp.value ? 'ok' : 'falha',
  };
  const status = verificacoes.banco === 'falha' ? 'erro' : verificacoes.smtp === 'ok' ? 'ok' : 'degradado';
  res.status(status === 'erro' ? 503 : 200).json({ status, verificacoes });
});

// Imagens das aulas (conteudo/aulas/<pasta>/imagens). Públicas: um <img> não envia o token.
// Só imagens: o aula.html da mesma pasta traz o gabarito (data-correta). O resto segue para o login.
const imagensDasAulas = express.static(path.join(config.CONTEUDO_DIR, 'aulas'), {
  maxAge: '1d',
  index: false,
  dotfiles: 'ignore',
});
app.use('/api/conteudo/aulas', (req, res, next) =>
  /\.(png|jpe?g|webp|gif|svg)$/i.test(req.path) ? imagensDasAulas(req, res, next) : next(),
);

app.use('/api/auth', require('./modulos/auth/routes'));

app.use('/api', autenticar, limiteGeral);
app.use('/api/perfil', require('./modulos/perfil/routes'));
app.use('/api', require('./modulos/aulas/routes'));
app.use('/api/trivia', require('./modulos/trivia/routes'));
app.use('/api/badges', require('./modulos/badges/routes'));
app.use('/api/ranking', require('./modulos/ranking/routes'));
app.use('/api', require('./modulos/telemetria/routes'));
app.use('/api/questionarios', require('./modulos/questionarios/routes'));
app.use('/api/admin', exigirAdmin, require('./modulos/admin/routes'));

app.use(() => {
  throw naoEncontrado('Rota não encontrada');
});
app.use(tratarErros);

module.exports = app;
