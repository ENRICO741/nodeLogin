const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { pool, prepararBanco, novoUsuario, tornarAdmin } = require('../ajuda');
const config = require('../../src/config');
const mailer = require('../../src/lib/mailer');
const logger = require('../../src/lib/logger');
const {
  enviarEmailsPos,
  rodadaAgendada,
  agendarEmailsPos,
  encerrarEmailsPos,
} = require('../../src/modulos/questionarios/emails');

before(prepararBanco);
after(() => pool.end());
beforeEach(() => {
  config.PESQUISA_DATA_FIM = undefined;
});
after(() => {
  config.PESQUISA_DATA_FIM = undefined;
});

// Participante com o pré enviado há `intervalo` (novoUsuario já grava o pré).
async function comPre(intervalo) {
  const u = await novoUsuario();
  await pool.query(
    "UPDATE questionario_envios SET enviado_em = now() - $2::interval WHERE usuario_id = $1 AND momento = 'pre'",
    [u.usuario.id, intervalo],
  );
  return u;
}

// Troca o envio por uma captura. E-mails para endereços em `falhar` lançam (SMTP fora).
function capturar(t) {
  const enviados = [];
  const falhar = new Set();
  t.mock.method(mailer, 'enviarEmail', async (m) => {
    if (falhar.has(m.para)) throw new Error('SMTP fora');
    enviados.push(m);
  });
  // Outros testes deixam participantes na janela: cada asserção olha só os e-mails da pessoa.
  const de = (u) => enviados.filter((m) => m.para === u.email);
  return { enviados, falhar, de };
}

const tipos = async (u) =>
  (
    await pool.query('SELECT tipo FROM questionario_emails WHERE usuario_id = $1 ORDER BY tipo', [
      u.usuario.id,
    ])
  ).rows.map((r) => r.tipo);
const conviteHa = (u, intervalo) =>
  pool.query(
    "INSERT INTO questionario_emails (usuario_id, tipo, enviado_em) VALUES ($1, 'convite_pos', now() - $2::interval)",
    [u.usuario.id, intervalo],
  );
const CONVITE = 'Questionário final da pesquisa';
const LEMBRETE = 'Lembrete: questionário final da pesquisa';
const DIA_MS = 86_400_000;
// Rodada dentro do horário de envio (12h de SP), seja qual for a hora em que o teste roda.
const MEIO_DIA = new Date('2026-10-05T15:00:00Z');
const rodar = () => enviarEmailsPos({ agora: MEIO_DIA });

describe('e-mails do questionário pós', () => {
  test('convite no dia 14 com link, prazo (último dia inteiro, dd/mm/aaaa em SP) e texto neutro; antes do dia 14, nada', async (t) => {
    const { de } = capturar(t);
    const u = await comPre('14 days');
    const cedo = await comPre('13 days 23 hours');
    await rodar();

    const [email, ...resto] = de(u);
    assert.deepEqual(resto, []);
    assert.equal(email.assunto, CONVITE);
    // Fecha no dia 28 na hora do envio do pré: o prazo mostrado é o dia anterior (último inteiro).
    const { rows } = await pool.query(
      `SELECT to_char((enviado_em + interval '27 days') AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS prazo
       FROM questionario_envios WHERE usuario_id = $1 AND momento = 'pre'`,
      [u.usuario.id],
    );
    assert.ok(email.texto.includes(`até ${rows[0].prazo}`), email.texto);
    assert.ok(email.texto.includes(`${config.APP_URL}/questionario`));
    assert.match(email.texto, /voluntária/);
    assert.ok(!email.texto.includes(u.nome));
    assert.doesNotMatch(email.texto, /satisfeit|necessári/i);
    assert.deepEqual(await tipos(u), ['convite_pos']);

    assert.deepEqual(de(cedo), []);
    assert.deepEqual(await tipos(cedo), []);
  });

  test('lembrete no dia 18 (convite dias antes); no dia 17, ainda não', async (t) => {
    const { de } = capturar(t);
    const u = await comPre('18 days');
    await conviteHa(u, '4 days');
    const cedo = await comPre('17 days 23 hours');
    await conviteHa(cedo, '3 days');
    await rodar();

    assert.deepEqual(
      de(u).map((m) => m.assunto),
      [LEMBRETE],
    );
    assert.match(de(u)[0].texto, /continua disponível/);
    assert.deepEqual(await tipos(u), ['convite_pos', 'lembrete_pos']);
    assert.deepEqual(de(cedo), []);
  });

  test('nunca convite e lembrete no mesmo dia (API parada do dia 14 ao 19): lembrete só 1 dia depois do convite', async (t) => {
    const { de } = capturar(t);
    const u = await comPre('19 days');
    await rodar();
    await rodar();
    assert.deepEqual(
      de(u).map((m) => m.assunto),
      [CONVITE],
    );

    await pool.query(
      "UPDATE questionario_emails SET enviado_em = now() - interval '1 day' WHERE usuario_id = $1",
      [u.usuario.id],
    );
    await rodar();
    await rodar();
    assert.deepEqual(
      de(u).map((m) => m.assunto),
      [CONVITE, LEMBRETE],
    );
  });

  test('rodadas seguidas e concorrentes não duplicam', async (t) => {
    const { de } = capturar(t);
    const convite = await comPre('14 days');
    const lembrete = await comPre('20 days');
    await conviteHa(lembrete, '2 days');
    await Promise.all([rodar(), rodar(), rodar()]);
    await rodar();
    assert.deepEqual(
      de(convite).map((m) => m.assunto),
      [CONVITE],
    );
    assert.deepEqual(
      de(lembrete).map((m) => m.assunto),
      [LEMBRETE],
    );
  });

  test('quem já respondeu o pós não recebe', async (t) => {
    const { de } = capturar(t);
    const u = await comPre('15 days');
    await pool.query("INSERT INTO questionario_envios (usuario_id, momento) VALUES ($1, 'pos')", [
      u.usuario.id,
    ]);
    const lembrar = await comPre('19 days');
    await conviteHa(lembrar, '5 days');
    await pool.query("INSERT INTO questionario_envios (usuario_id, momento) VALUES ($1, 'pos')", [
      lembrar.usuario.id,
    ]);
    await rodar();
    assert.deepEqual([...de(u), ...de(lembrar)], []);
  });

  test('pós fechado não recebe: dia 28 e PESQUISA_DATA_FIM vencida; no último dia, recebe com esse prazo', async (t) => {
    const { de } = capturar(t);
    const dia28 = await comPre('28 days');
    const u = await comPre('15 days');
    const ontem = new Date(Date.now() - DIA_MS).toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    });
    config.PESQUISA_DATA_FIM = ontem;
    await rodar();
    assert.deepEqual([...de(dia28), ...de(u)], []);

    const hoje = new Date();
    config.PESQUISA_DATA_FIM = hoje.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    await rodar();
    assert.deepEqual(de(dia28), []);
    const prazo = hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    assert.ok(de(u)[0].texto.includes(`até ${prazo}.`), de(u)[0].texto);
  });

  test('admin, sem consentimento e inativo ficam de fora', async (t) => {
    const { de } = capturar(t);
    const admin = await comPre('15 days');
    await tornarAdmin(admin.email);
    const semConsentimento = await comPre('15 days');
    await pool.query('UPDATE usuarios SET consentiu_pesquisa_em = NULL WHERE id = $1', [
      semConsentimento.usuario.id,
    ]);
    const inativo = await comPre('15 days');
    await pool.query('UPDATE usuarios SET ativo = false WHERE id = $1', [inativo.usuario.id]);
    await rodar();
    for (const u of [admin, semConsentimento, inativo]) assert.deepEqual(de(u), [], u.email);
  });

  test('falha no envio libera a reserva: a próxima rodada tenta de novo', async (t) => {
    const { de, falhar } = capturar(t);
    const erros = t.mock.method(console, 'error', () => {});
    const u = await comPre('14 days');
    falhar.add(u.email);
    await rodar();
    assert.deepEqual(await tipos(u), []);
    assert.ok(
      erros.mock.calls.some((c) => c.arguments[0].includes('falha ao enviar e-mail do questionário final')),
    );

    falhar.clear();
    await rodar();
    assert.deepEqual(
      de(u).map((m) => m.assunto),
      [CONVITE],
    );
    assert.deepEqual(await tipos(u), ['convite_pos']);
  });

  test('destinatário recusado de vez (5xx no RCPT TO) mantém a reserva: não tenta de novo a cada hora', async (t) => {
    t.mock.method(console, 'error', () => {});
    const enviar = t.mock.method(mailer, 'enviarEmail', async () => {
      throw Object.assign(new Error('Recipient command failed'), {
        code: 'EENVELOPE',
        command: 'RCPT TO',
        responseCode: 550,
      });
    });
    const u = await comPre('14 days');
    await rodar();
    await rodar();
    const para = enviar.mock.calls.filter((c) => c.arguments[0].para === u.email);
    assert.equal(para.length, 1);
    assert.deepEqual(await tipos(u), ['convite_pos']);
  });

  test('falha ao liberar a reserva vai para o log e não interrompe a rodada', async (t) => {
    const erros = t.mock.method(console, 'error', () => {});
    const enviar = t.mock.method(mailer, 'enviarEmail', async () => {
      throw new Error('SMTP fora');
    });
    const original = pool.query;
    t.mock.method(pool, 'query', function (sql, ...resto) {
      if (String(sql).startsWith('DELETE FROM questionario_emails'))
        return Promise.reject(new Error('banco fora'));
      return original.call(this, sql, ...resto);
    });
    const [a, b] = [await comPre('14 days'), await comPre('14 days')];
    await rodar();
    const tentados = enviar.mock.calls.map((c) => c.arguments[0].para);
    assert.ok(tentados.includes(a.email) && tentados.includes(b.email), tentados.join());
    assert.ok(erros.mock.calls.some((c) => c.arguments[0].includes('reserva de e-mail não liberada')));
  });

  test('horário de SP: 08:59 e 18:01 não enviam nada; 09:00 e 18:00 enviam', async (t) => {
    const { de } = capturar(t);
    const u = await comPre('14 days');
    const em = (hora) => enviarEmailsPos({ agora: new Date(`2026-10-05T${hora}:00-03:00`) });
    assert.equal(await em('08:59'), 0);
    assert.equal(await em('18:01'), 0);
    assert.deepEqual(await tipos(u), []);
    assert.ok((await em('09:00')) >= 1);
    assert.deepEqual(
      de(u).map((m) => m.assunto),
      [CONVITE],
    );

    const v = await comPre('14 days');
    await em('18:00');
    assert.deepEqual(
      de(v).map((m) => m.assunto),
      [CONVITE],
    );
  });

  test('banco: tipo fora da lista, repetido e usuário apagado (cascade)', async () => {
    const u = await comPre('1 day');
    const inserir = (tipo) =>
      pool.query('INSERT INTO questionario_emails (usuario_id, tipo) VALUES ($1, $2)', [u.usuario.id, tipo]);
    await inserir('convite_pos');
    await assert.rejects(inserir('convite_pos'), { code: '23505' });
    await assert.rejects(inserir('outro'), { code: '23514' });
    await pool.query('DELETE FROM usuarios WHERE id = $1', [u.usuario.id]);
    assert.deepEqual(await tipos(u), []);
  });
});

describe('rodada agendada', () => {
  test('erro vai para o log e não lança', async (t) => {
    const erros = t.mock.method(console, 'error', () => {});
    t.mock.method(pool, 'query', async () => {
      throw new Error('banco fora');
    });
    await rodadaAgendada();
    t.mock.restoreAll();
    assert.ok(erros.mock.calls.some((c) => c.arguments[0].includes('falha na rodada de e-mails')));
  });

  test('rodadas sobrepostas viram uma; a seguinte roda normalmente', async (t) => {
    capturar(t);
    const consulta = t.mock.method(pool, 'query');
    const rodadas = () =>
      consulta.mock.calls.filter((c) => String(c.arguments[0]).includes('questionario_emails c')).length;
    await Promise.all([rodadaAgendada(), rodadaAgendada()]);
    assert.equal(rodadas(), 1);
    await rodadaAgendada();
    assert.equal(rodadas(), 2);
  });

  test('agendamento: em teste não agenda; em produção sem SMTP só avisa; senão roda já e a cada hora (unref)', async (t) => {
    capturar(t);
    const unref = t.mock.fn();
    const intervalo = t.mock.method(global, 'setInterval', () => ({ unref }));
    const agendados = () => intervalo.mock.calls.filter((c) => c.arguments[0] === rodadaAgendada);
    const aviso = t.mock.method(logger, 'warn', () => {});
    const consulta = t.mock.method(pool, 'query');
    const rodadas = () =>
      consulta.mock.calls.filter((c) => String(c.arguments[0]).includes('questionario_emails c')).length;
    const { NODE_ENV, SMTP_HOST } = config;
    t.after(() => Object.assign(config, { NODE_ENV, SMTP_HOST }));

    agendarEmailsPos();
    config.NODE_ENV = 'production';
    config.SMTP_HOST = undefined;
    agendarEmailsPos();
    assert.deepEqual(agendados(), []);
    assert.equal(rodadas(), 0);
    assert.match(aviso.mock.calls[0].arguments[0], /SMTP não configurado/);

    config.SMTP_HOST = 'smtp.exemplo';
    agendarEmailsPos();
    await rodadaAgendada(); // devolve a rodada imediata em andamento
    assert.equal(rodadas(), 1);
    assert.deepEqual(agendados()[0].arguments, [rodadaAgendada, 3_600_000]);
    assert.equal(unref.mock.callCount(), 1);
  });

  // Por último: depois de encerrar, nenhuma rodada roda mais neste processo.
  test('desligamento espera o e-mail em andamento e não reserva mais ninguém', async (t) => {
    let liberar;
    const emAndamento = new Promise((r) => {
      liberar = r;
    });
    let terminou = false;
    const enviar = t.mock.method(mailer, 'enviarEmail', async () => {
      await emAndamento;
      terminou = true;
    });
    // Dois pendentes: o primeiro fica no meio do envio quando o desligamento chega.
    await comPre('14 days');
    await comPre('14 days');
    const reservas = async () =>
      Number((await pool.query('SELECT count(*) FROM questionario_emails')).rows[0].count);
    const antes = await reservas();
    const rodada = rodadaAgendada({ agora: MEIO_DIA });
    while (!enviar.mock.callCount()) await new Promise((r) => setImmediate(r));
    const encerrado = encerrarEmailsPos();
    liberar();
    await encerrado;
    await rodada;
    assert.ok(terminou);
    assert.equal(enviar.mock.callCount(), 1);
    assert.equal(await reservas(), antes + 1);

    await rodadaAgendada();
    assert.equal(enviar.mock.callCount(), 1);
  });
});
