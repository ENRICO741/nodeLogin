const { z } = require('zod');
const config = require('../../config');
const { query, transacao } = require('../../db/pool');
const { HttpError, proibido, naoEncontrado, conflito } = require('../../lib/erros');
const DEFINICOES = require('./definicao');

// Participa da pesquisa: usuário comum que consentiu (admins e contas sem consentimento ficam de fora).
const participa = (usuario) => usuario.papel === 'usuario' && Boolean(usuario.consentiu_pesquisa_em);

async function prePendente(executor, usuario) {
  if (!participa(usuario)) return false;
  const { rows } = await executor.query(
    "SELECT NOT EXISTS (SELECT 1 FROM questionario_envios WHERE usuario_id = $1 AND momento = 'pre') AS pendente",
    [usuario.id],
  );
  return rows[0].pendente;
}

// Fim da janela do pós sobre a linha `pre` (envio do pré): dia 28 ou o fim da pesquisa, o que vier
// antes. $1 = PESQUISA_DATA_FIM (último dia aceito, inteiro, em SP) ou null = sem teto (LEAST ignora null).
const FECHA_POS = `LEAST(pre.enviado_em + interval '28 days',
  ($1::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`;

// Janela do pós pelo relógio do banco (abre no dia 14). undefined = pré não enviado.
async function janelaPos(executor, usuarioId) {
  const { rows } = await executor.query(
    `SELECT pre.id AS pre_id, ${FECHA_POS} AS fecha,
       now() >= pre.enviado_em + interval '14 days' AS abriu, now() >= ${FECHA_POS} AS fechou,
       EXISTS (SELECT 1 FROM questionario_envios WHERE usuario_id = $2 AND momento = 'pos') AS respondido
     FROM questionario_envios pre WHERE pre.usuario_id = $2 AND pre.momento = 'pre'`,
    [config.PESQUISA_DATA_FIM ?? null, usuarioId],
  );
  return rows[0];
}

// O pós só entra como pendente dentro da janela e sem resposta; pos_fecha_em = instante em que fecha.
async function situacao(usuario, executor = { query }) {
  if (!participa(usuario)) return { pre_pendente: false, pos_pendente: false };
  const janela = await janelaPos(executor, usuario.id);
  if (!janela) return { pre_pendente: true, pos_pendente: false };
  if (!janela.abriu || janela.fechou || janela.respondido)
    return { pre_pendente: false, pos_pendente: false };
  return { pre_pendente: false, pos_pendente: true, pos_fecha_em: janela.fecha.toISOString() };
}

// Barra o início de aula e de trivia até o pré ser enviado.
async function exigirPre(usuario, executor = { query }) {
  if (await prePendente(executor, usuario)) {
    throw new HttpError(403, 'QUESTIONARIO_PRE_PENDENTE', 'Responda ao questionário inicial para continuar');
  }
}

// Remove os blocos cuja condição depende do pré (sePre) e não foi satisfeita; tira o campo interno.
// `respostasPre` com números (ex.: { C1: 0 }), como no envio.
function resolver(definicao, respostasPre = {}) {
  return {
    ...definicao,
    blocos: definicao.blocos
      .filter((b) => !b.sePre || respostasPre[b.sePre.item] === b.sePre.igual)
      .map(({ sePre: _sePre, ...b }) => b),
  };
}

const ITENS_SE_PRE = DEFINICOES.pos.blocos.filter((b) => b.sePre).map((b) => b.sePre.item);

// Respostas do pré que as condições sePre do pós olham. No banco o valor é texto ('0' = Sim em C1).
async function respostasPre(executor, preId) {
  const { rows } = await executor.query(
    'SELECT item, valor FROM questionario_respostas WHERE envio_id = $1 AND item = ANY($2)',
    [preId, ITENS_SE_PRE],
  );
  return Object.fromEntries(rows.map((r) => [r.item, Number(r.valor)]));
}

const respondido = () => conflito('QUESTIONARIO_RESPONDIDO', 'Você já respondeu este questionário');

// Mesmas regras de acesso para GET e POST. Devolve a definição do momento (o pós já resolvido pelo pré).
async function verificarAcesso(executor, usuario, momento) {
  if (usuario.papel === 'admin') throw proibido('Administradores não participam da pesquisa');
  if (!participa(usuario)) throw naoEncontrado('Questionário não disponível');
  if (momento === 'pre') {
    if (!(await prePendente(executor, usuario))) throw respondido();
    return DEFINICOES.pre;
  }
  const janela = await janelaPos(executor, usuario.id);
  if (!janela?.abriu) throw naoEncontrado('Questionário não disponível');
  if (janela.respondido) throw respondido();
  if (janela.fechou) throw new HttpError(410, 'QUESTIONARIO_ENCERRADO', 'O prazo para responder terminou');
  return resolver(DEFINICOES.pos, await respostasPre(executor, janela.pre_id));
}

const atende = (se, respostas) => !se || respostas[se.item] === se.igual;
const inteiroEntre = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Valida um item visível. Devolve [valores, erro]; valores = o que vai para questionario_respostas.valor.
function validarItem(item, escala, resposta) {
  if (resposta === undefined) return [[]];
  if (item.aberta) {
    if (typeof resposta !== 'string') return [[], 'Resposta inválida'];
    const texto = resposta.trim();
    if ([...texto].length > item.max) return [[], `Use no máximo ${item.max} caracteres`];
    return [texto ? [texto] : []];
  }
  if (item.multipla) {
    const unicos = new Set(Array.isArray(resposta) ? resposta : []);
    const validos =
      Array.isArray(resposta) &&
      resposta.length > 0 &&
      unicos.size === resposta.length &&
      resposta.every((v) => inteiroEntre(v, 0, item.opcoes.length - 1));
    if (!validos) return [[], 'Resposta inválida'];
    if (item.exclusiva !== undefined && unicos.has(item.exclusiva) && unicos.size > 1) {
      return [[], `"${item.opcoes[item.exclusiva]}" não pode ser marcada junto com outras opções`];
    }
    return [[...unicos].sort((a, b) => a - b)];
  }
  if (item.opcoes) {
    return inteiroEntre(resposta, 0, item.opcoes.length - 1) ? [[resposta]] : [[], 'Resposta inválida'];
  }
  if (item.naoUsei && resposta === 0) return [[0]];
  return inteiroEntre(resposta, 1, escala.length) ? [[resposta]] : [[], 'Resposta inválida'];
}

// Validação autoritativa do envio contra a definição. Itens ocultos (condição `se` não satisfeita
// pelas próprias respostas) são descartados; os visíveis não opcionais são obrigatórios.
// Devolve as linhas [{ item, valor }] de questionario_respostas ou lança 400 com um detalhe por item.
function validarRespostas(definicao, { respostas }) {
  const erros = [];
  const conhecidos = new Set(definicao.blocos.flatMap((b) => b.itens.map((i) => i.codigo)));
  for (const codigo of Object.keys(respostas)) {
    if (!conhecidos.has(codigo)) erros.push({ campo: codigo, mensagem: 'Pergunta desconhecida' });
  }

  const linhas = [];
  for (const bloco of definicao.blocos) {
    if (!atende(bloco.se, respostas)) continue;
    for (const item of bloco.itens) {
      if (!atende(item.se, respostas)) continue;
      const [valores, erro] = validarItem(item, bloco.escala, respostas[item.codigo]);
      if (erro) erros.push({ campo: item.codigo, mensagem: erro });
      else if (!valores.length && !item.opcional) {
        erros.push({ campo: item.codigo, mensagem: 'Responda esta pergunta' });
      }
      for (const valor of valores) linhas.push({ item: item.codigo, valor: String(valor) });
    }
  }
  if (erros.length) throw new HttpError(400, 'VALIDACAO', 'Dados inválidos', erros);
  return linhas;
}

// Campos extras (ex.: ordem, duracao_s de versões antigas do app) são descartados pelo zod.
const esquemaEnvio = z.object({
  // Limite folgado (o pré tem 40 itens): evita um 400 com milhares de detalhes.
  respostas: z
    .record(z.string(), z.unknown())
    .refine((r) => Object.keys(r).length <= 100, 'Respostas demais'),
});

async function obterDefinicao(usuario, momento, executor = { query }) {
  return verificarAcesso(executor, usuario, momento);
}

// O pós não dá pontos nem conquistas (docs/questionario-pesquisa.txt): nada de pontuacao.js aqui.
async function enviar(usuario, momento, corpo) {
  await transacao(async (c) => {
    // Pós: a janela é checada aqui dentro, no now() da transação do envio.
    const definicao = await verificarAcesso(c, usuario, momento);
    const linhas = validarRespostas(definicao, esquemaEnvio.parse(corpo));
    // Envio duplo ou concorrente: o segundo espera o primeiro e cai no ON CONFLICT (409, não 500).
    const { rows } = await c.query(
      `INSERT INTO questionario_envios (usuario_id, momento) VALUES ($1, $2)
       ON CONFLICT (usuario_id, momento) DO NOTHING RETURNING id`,
      [usuario.id, momento],
    );
    if (!rows[0]) throw respondido();
    await c.query(
      `INSERT INTO questionario_respostas (envio_id, item, valor)
       SELECT $1, * FROM unnest($2::varchar[], $3::text[])`,
      [rows[0].id, linhas.map((l) => l.item), linhas.map((l) => l.valor)],
    );
  });
  return { questionarios: await situacao(usuario) };
}

module.exports = {
  participa,
  situacao,
  exigirPre,
  obterDefinicao,
  enviar,
  resolver,
  validarRespostas,
  FECHA_POS,
};
