// E-mails do questionário pós (protocolo em docs/questionario-pesquisa.txt): convite no dia 14 e lembrete
// no dia 18, só para quem ainda pode responder. Rodadas periódicas agendadas pelo server.js.
const config = require('../../config');
const { query } = require('../../db/pool');
const mailer = require('../../lib/mailer');
const logger = require('../../lib/logger');
const { FECHA_POS } = require('./service');

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;

// Mesma janela do app (abriu, não fechou, sem resposta), só participantes ativos. O lembrete exige o
// convite enviado há pelo menos 1 dia: com a API parada do dia 14 ao 19, os dois não saem juntos.
// Só das 9h às 18h (inclusive) de SP; $2 troca o relógio só desse filtro (testes).
const PENDENTES = `
  SELECT * FROM (
    SELECT u.id, u.email, ${FECHA_POS} AS fecha,
      CASE
        WHEN c.enviado_em IS NULL THEN 'convite_pos'
        WHEN l.usuario_id IS NULL AND now() >= pre.enviado_em + interval '18 days'
          AND c.enviado_em <= now() - interval '1 day' THEN 'lembrete_pos'
      END AS tipo
    FROM usuarios u
    JOIN questionario_envios pre ON pre.usuario_id = u.id AND pre.momento = 'pre'
    LEFT JOIN questionario_emails c ON c.usuario_id = u.id AND c.tipo = 'convite_pos'
    LEFT JOIN questionario_emails l ON l.usuario_id = u.id AND l.tipo = 'lembrete_pos'
    WHERE u.ativo AND u.papel = 'usuario' AND u.consentiu_pesquisa_em IS NOT NULL
      AND now() >= pre.enviado_em + interval '14 days'
      AND NOT EXISTS (SELECT 1 FROM questionario_envios pos WHERE pos.usuario_id = u.id AND pos.momento = 'pos')
  ) p
  WHERE tipo IS NOT NULL AND now() < fecha
    AND (COALESCE($2::timestamptz, now()) AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN '09:00' AND '18:00'`;

// Último dia inteiro aceito, em SP: o dia anterior ao fechamento. Pelo dia 28 o pós fecha na hora do
// envio do pré (ex.: 14h37); mostrar esse dia faria quem abre à noite receber 410.
const prazo = (fecha) =>
  new Date(fecha.getTime() - DIA_MS).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

// Texto fixo, sem o nome da pessoa (mesmo motivo da recuperação de senha) e neutro: nada de
// "satisfeito" ou "necessário", que pressionam a participação.
function mensagem(tipo, fecha) {
  const inicio =
    tipo === 'convite_pos'
      ? `O questionário final da pesquisa do Guardião Impacta já está disponível no app. Leva cerca de 10 minutos e pode ser respondido até ${prazo(fecha)}.`
      : `Lembrete: o questionário final da pesquisa do Guardião Impacta continua disponível no app até ${prazo(fecha)}. Leva cerca de 10 minutos.`;
  return {
    assunto:
      tipo === 'convite_pos' ? 'Questionário final da pesquisa' : 'Lembrete: questionário final da pesquisa',
    texto:
      `Olá.\n\n${inicio}\n\nPara responder, acesse:\n${config.APP_URL}/questionario\n\n` +
      'A participação é voluntária. Suas respostas são usadas só nesta pesquisa e analisadas sem o seu nome.',
  };
}

let encerrando = false;

// Uma rodada. A linha de questionario_emails é reservada antes do envio (o UNIQUE barra a duplicata);
// se o envio falhar, a reserva sai e a próxima rodada tenta de novo. Devolve quantos e-mails saíram.
async function enviarEmailsPos({ agora } = {}) {
  const { rows } = await query(PENDENTES, [config.PESQUISA_DATA_FIM ?? null, agora ?? null]);
  let enviados = 0;
  for (const { id, email, fecha, tipo } of rows) {
    if (encerrando) break;
    const reserva = await query(
      'INSERT INTO questionario_emails (usuario_id, tipo) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1',
      [id, tipo],
    );
    if (!reserva.rows[0]) continue;
    try {
      await mailer.enviarEmail({ para: email, ...mensagem(tipo, fecha) });
      enviados += 1;
    } catch (erro) {
      // Destinatário recusado de vez (5xx no RCPT TO, ex.: endereço inexistente): mantém a reserva, senão
      // seriam ~24 tentativas por dia até o pós fechar. Outras falhas (SMTP fora) liberam para a próxima rodada.
      const recusado = erro.code === 'EENVELOPE' && erro.command === 'RCPT TO' && erro.responseCode >= 500;
      logger.error('falha ao enviar e-mail do questionário final', { erro, tipo, recusado });
      if (recusado) continue;
      // Erro ao liberar não interrompe a rodada (os demais da lista ainda recebem).
      await query('DELETE FROM questionario_emails WHERE usuario_id = $1 AND tipo = $2', [id, tipo]).catch(
        (erroBanco) => logger.error('reserva de e-mail não liberada', { erro: erroBanco, tipo }),
      );
    }
  }
  return enviados;
}

// Rodada do agendador: nunca duas ao mesmo tempo (a sobreposta devolve a que já roda), e erro só vai
// para o log (não derruba a API).
let rodada = null;
function rodadaAgendada(opcoes) {
  if (rodada || encerrando) return rodada;
  rodada = enviarEmailsPos(opcoes)
    .then((enviados) => {
      if (enviados) logger.info('e-mails do questionário final enviados', { enviados });
    })
    .catch((erro) => logger.error('falha na rodada de e-mails do questionário final', { erro }))
    .finally(() => {
      rodada = null;
    });
  return rodada;
}

// Uma rodada ao subir e depois a cada hora (chamado pelo server.js depois do listen). Em produção sem
// SMTP não agenda: o mailer descartaria o e-mail e a reserva marcaria como enviado.
function agendarEmailsPos() {
  if (config.NODE_ENV === 'test') return;
  if (config.NODE_ENV === 'production' && !config.SMTP_HOST) {
    logger.warn('e-mails do questionário final desligados: SMTP não configurado');
    return;
  }
  rodadaAgendada();
  setInterval(rodadaAgendada, HORA_MS).unref();
}

// Desligamento: nenhuma reserva nova e espera o e-mail em andamento, para a reserva não ficar sem envio.
// ponytail: um SIGKILL no meio do envio (prazo do docker stop) ainda perde no máximo um e-mail.
function encerrarEmailsPos() {
  encerrando = true;
  return rodada ?? Promise.resolve();
}

module.exports = { enviarEmailsPos, rodadaAgendada, agendarEmailsPos, encerrarEmailsPos, mensagem };
