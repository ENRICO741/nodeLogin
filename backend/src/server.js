const config = require('./config');
const app = require('./app');
const logger = require('./lib/logger');
const { pool } = require('./db/pool');
const { migrar } = require('./db/migrar');
const { semear } = require('./db/seed');
const { importarConteudo } = require('./scripts/importar-aulas');
const { agendarEmailsPos, encerrarEmailsPos } = require('./modulos/questionarios/emails');

async function iniciar() {
  await migrar();
  // Arquivo de aula com erro não derruba a API: o banco fica com a versão anterior e o erro vai para o log.
  try {
    const importacao = await importarConteudo();
    if (importacao.erros.length)
      logger.error('aulas não importadas: corrija os arquivos', { erros: importacao.erros });
    else logger.info('aulas importadas', importacao);
  } catch (erro) {
    logger.error('aulas não importadas: conflito com o banco', { erro });
  }
  await semear();
  const servidor = app.listen(config.PORT, () => logger.info('API no ar', { porta: config.PORT }));
  agendarEmailsPos();

  const desligar = () => {
    logger.info('desligando');
    const emails = encerrarEmailsPos();
    servidor.close(() => emails.then(() => pool.end()).then(() => process.exit(0)));
  };
  process.on('SIGTERM', desligar);
  process.on('SIGINT', desligar);
}

iniciar().catch((erro) => {
  logger.error('falha ao iniciar', { erro });
  process.exit(1);
});
