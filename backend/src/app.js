const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const logger = require('./lib/logger');
const { query } = require('./db/pool');
const { naoEncontrado } = require('./lib/erros');
const { autenticar, exigirAdmin } = require('./middleware/autenticacao');
const { limiteGeral } = require('./middleware/limites');
const { tratarErros } = require('./middleware/tratarErros');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // atrás do Caddy: IP real vem do X-Forwarded-For
app.use(helmet());
if (config.CORS_ORIGEM) app.use(cors({ origin: config.CORS_ORIGEM }));
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

app.get('/api/saude', async (_req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok' });
});

app.use('/api/auth', require('./modulos/auth/routes'));

app.use('/api', autenticar, limiteGeral);
app.use('/api/perfil', require('./modulos/perfil/routes'));
app.use('/api', require('./modulos/aulas/routes'));
app.use('/api/trivia', require('./modulos/trivia/routes'));
app.use('/api/badges', require('./modulos/badges/routes'));
app.use('/api/ranking', require('./modulos/ranking/routes'));
app.use('/api', require('./modulos/telemetria/routes'));
app.use('/api/admin', exigirAdmin, require('./modulos/admin/routes'));

app.use(() => {
  throw naoEncontrado('Rota não encontrada');
});
app.use(tratarErros);

module.exports = app;
