const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('./logger');

const transporte = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_SENHA } : undefined,
    })
  : null;

if (!transporte && config.NODE_ENV === 'production') {
  logger.warn('SMTP não configurado: e-mails serão apenas registrados no log');
}

async function enviarEmail({ para, assunto, texto }) {
  if (!transporte) {
    logger.info('e-mail não enviado (SMTP não configurado)', { para, assunto, texto });
    return;
  }
  await transporte.sendMail({ from: config.SMTP_REMETENTE, to: para, subject: assunto, text: texto });
}

module.exports = { enviarEmail };
