const config = require('./config');
const app = require('./app');
const logger = require('./lib/logger');
const { pool } = require('./db/pool');
const { migrar } = require('./db/migrar');
const { semear } = require('./db/seed');

async function iniciar() {
  await migrar();
  await semear();
  const servidor = app.listen(config.PORT, () => logger.info('API no ar', { porta: config.PORT }));

  const desligar = () => {
    logger.info('desligando');
    servidor.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', desligar);
  process.on('SIGINT', desligar);
}

iniciar().catch((erro) => {
  logger.error('falha ao iniciar', { erro });
  process.exit(1);
});
