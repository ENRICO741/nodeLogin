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

// Login no SMTP, no máximo a cada 5 min: o /api/saude é público e o healthcheck chama a cada 30 s.
// Guarda a promessa (e não o resultado) para chamadas simultâneas dividirem a mesma verificação.
const VALIDADE_VERIFICACAO_MS = 5 * 60 * 1000;
let verificacao = null;

// true = SMTP aceitou o login, false = falhou, null = SMTP não configurado.
async function verificar() {
  if (!transporte) return null;
  if (!verificacao || Date.now() - verificacao.em > VALIDADE_VERIFICACAO_MS) {
    verificacao = {
      em: Date.now(),
      promessa: transporte.verify().then(
        () => true,
        (erro) => {
          logger.error('SMTP indisponível', { erro });
          return false;
        },
      ),
    };
  }
  return verificacao.promessa;
}

async function enviarEmail({ para, assunto, texto }) {
  if (!transporte) {
    // Em produção o texto não vai para o log: traz o link de redefinição de senha.
    if (config.NODE_ENV === 'production') {
      logger.error('e-mail descartado (SMTP não configurado)', { para, assunto });
      return;
    }
    logger.info('e-mail não enviado (SMTP não configurado)', { para, assunto, texto });
    return;
  }
  await transporte.sendMail({ from: config.SMTP_REMETENTE, to: para, subject: assunto, text: texto });
}

module.exports = { enviarEmail, verificar };
