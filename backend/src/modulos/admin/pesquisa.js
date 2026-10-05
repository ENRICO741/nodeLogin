// Exportação dos dados da pesquisa do TCC (visões pesquisa_* da migration 002) em CSV.
// Só entram usuários comuns que consentiram; o id vira pseudônimo com PESQUISA_SEGREDO.
const { Router } = require('express');
const { z } = require('zod');
const config = require('../../config');
const { query, transacao } = require('../../db/pool');

const VISOES = {
  'uso-diario': {
    visao: 'pesquisa_uso_diario',
    titulo: 'Uso diário',
    descricao: 'Usuários ativos (DAU), sessões, duração mediana e novos cadastros por dia',
  },
  engajamento: {
    visao: 'pesquisa_engajamento_usuario',
    titulo: 'Engajamento por participante',
    descricao: 'Dias ativos, sessões, aulas, acertos, pontos, badges e visitas ao ranking',
  },
  retencao: {
    visao: 'pesquisa_retencao',
    titulo: 'Retenção por coorte',
    descricao: 'Participantes ativos, contados em semanas de calendário desde a semana de entrada (coorte)',
  },
  sessoes: {
    visao: 'pesquisa_sessoes',
    titulo: 'Sessões',
    descricao: 'Cada abertura do app, com duração (estimada pelo último evento quando o fim não chegou)',
  },
  eventos: {
    visao: 'pesquisa_eventos',
    titulo: 'Eventos',
    descricao: 'Telas vistas, leitura, respostas e resultados',
  },
  respostas: {
    visao: 'pesquisa_respostas',
    titulo: 'Respostas',
    descricao: 'Cada resposta de aula e trivia',
  },
  pontos: {
    visao: 'pesquisa_pontos',
    titulo: 'Pontos',
    descricao: 'Cada crédito de pontos, com o total acumulado',
  },
  badges: {
    visao: 'pesquisa_badges',
    titulo: 'Conquistas',
    descricao: 'Cada conquista obtida, com a data',
  },
};

const BOOL = 16;
// Valores chegam como o texto do Postgres (datas locais sem conversão de fuso); só booleanos viram true/false.
const TIPOS_TEXTO = { getTypeParser: (oid) => (oid === BOOL ? (v) => v === 't' : (v) => v) };

// Célula CSV: aspas quando preciso e proteção contra injeção de fórmula (texto vindo do cliente, ex.: eventos).
function celula(valor) {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor);
  if (/^[=+@\t\r]/.test(texto) || (texto.startsWith('-') && !/^-\d+(\.\d+)?$/.test(texto)))
    texto = `'${texto}`;
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function paraCsv(campos, linhas) {
  const cabecalho = campos.join(',');
  return [cabecalho, ...linhas.map((l) => campos.map((c) => celula(l[c])).join(','))].join('\r\n') + '\r\n';
}

async function lerVisao(visao) {
  return transacao(async (c) => {
    // A visão de eventos cresce com o uso: mais folga que os 10 s do pool, só nesta transação.
    await c.query("SET LOCAL statement_timeout = '60s'");
    await c.query("SELECT set_config('app.pesquisa_segredo', $1, true)", [config.PESQUISA_SEGREDO]);
    return c.query({ text: `SELECT * FROM ${visao}`, types: TIPOS_TEXTO });
  });
}

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await query(
    "SELECT count(*)::int AS n FROM usuarios WHERE consentiu_pesquisa_em IS NOT NULL AND papel = 'usuario'",
  );
  res.json({
    participantes: rows[0].n,
    visoes: Object.entries(VISOES).map(([id, { titulo, descricao }]) => ({ id, titulo, descricao })),
  });
});

router.get('/:id.csv', async (req, res) => {
  const id = z.enum(Object.keys(VISOES), { error: 'Visão desconhecida' }).parse(req.params.id);
  const { fields, rows } = await lerVisao(VISOES[id].visao);
  const data = new Date().toISOString().slice(0, 10);
  res
    .type('text/csv; charset=utf-8')
    .attachment(`pesquisa-${id}-${data}.csv`)
    // BOM: o Excel reconhece UTF-8 (acentos) ao abrir o arquivo.
    .send(
      '\uFEFF' +
        paraCsv(
          fields.map((f) => f.name),
          rows,
        ),
    );
});

module.exports = router;
module.exports.paraCsv = paraCsv;
module.exports.VISOES = VISOES;
module.exports.lerVisao = lerVisao;
