const { Router } = require('express');
const { z } = require('zod');
const sanitizeHtml = require('sanitize-html');
const { pool, query, atualizarLinha } = require('../../db/pool');
const { naoEncontrado } = require('../../lib/erros');
const { texto, esquemaQuestao, idDaRota } = require('../../lib/validacao');
const { obterEstatisticas } = require('./estatisticas');

// Conteúdo de aula é HTML escrito pelo admin: sanitizado na gravação (o front sanitiza de novo ao exibir).
const limparHtml = (html) =>
  sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title'] },
    allowedSchemes: ['https', 'mailto'],
  });

const esquemaAula = z.object({
  titulo: texto(1, 160),
  ordem: z.number().int().min(1),
  conteudo_html: texto(1, 100_000).transform(limparHtml),
  pontos_conclusao: z.number().int().min(0).max(1000),
  ativo: z.boolean().optional(),
});
const esquemaQuestaoTrivia = esquemaQuestao.extend({
  dificuldade: z.enum(['facil', 'media', 'dificil']),
  aula_referencia_id: z.uuid().nullable().optional(),
});

const COLUNAS_AULA = 'id, titulo, ordem, conteudo_html, pontos_conclusao, ativo, criado_em, atualizado_em';
const COLUNAS_QUESTAO =
  'id, enunciado, imagem_url, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta, explicacao, pontos, ativo, criado_em';
const COLUNAS_QUESTAO_TRIVIA = `${COLUNAS_QUESTAO}, dificuldade, aula_referencia_id`;

async function inserir(tabela, dados, retorno) {
  const colunas = Object.keys(dados);
  const { rows } = await query(
    `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING ${retorno}`,
    Object.values(dados),
  );
  return rows[0];
}

async function atualizar(tabela, id, dados, retorno) {
  const linha = await atualizarLinha(pool, tabela, id, dados, retorno);
  if (!linha) throw naoEncontrado();
  return linha;
}

const router = Router();

router.get('/estatisticas', async (_req, res) => {
  res.json(await obterEstatisticas());
});

// --- Aulas ---
router.get('/aulas', async (_req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.titulo, a.ordem, a.pontos_conclusao, a.ativo,
       (SELECT count(*)::int FROM questoes_aula q WHERE q.aula_id = a.id AND q.ativo) AS total_questoes
     FROM aulas a ORDER BY a.ordem`,
  );
  res.json(rows);
});

router.get('/aulas/:id', async (req, res) => {
  const id = idDaRota(req);
  const { rows } = await query(`SELECT ${COLUNAS_AULA} FROM aulas WHERE id = $1`, [id]);
  if (!rows[0]) throw naoEncontrado('Aula não encontrada');
  const { rows: questoes } = await query(
    `SELECT ${COLUNAS_QUESTAO} FROM questoes_aula WHERE aula_id = $1 ORDER BY criado_em`,
    [id],
  );
  res.json({ ...rows[0], questoes });
});

router.post('/aulas', async (req, res) => {
  res.status(201).json(await inserir('aulas', esquemaAula.parse(req.body), COLUNAS_AULA));
});

router.patch('/aulas/:id', async (req, res) => {
  const dados = { ...esquemaAula.partial().parse(req.body), atualizado_em: new Date() };
  res.json(await atualizar('aulas', idDaRota(req), dados, COLUNAS_AULA));
});

// "Excluir" desativa: respostas e estatísticas antigas continuam válidas.
router.delete('/aulas/:id', async (req, res) => {
  await atualizar('aulas', idDaRota(req), { ativo: false, atualizado_em: new Date() }, 'id');
  res.status(204).end();
});

// --- Questões de aula ---
router.post('/aulas/:id/questoes', async (req, res) => {
  const dados = { ...esquemaQuestao.parse(req.body), aula_id: idDaRota(req) };
  res.status(201).json(await inserir('questoes_aula', dados, COLUNAS_QUESTAO));
});

router.patch('/questoes-aula/:id', async (req, res) => {
  res.json(
    await atualizar(
      'questoes_aula',
      idDaRota(req),
      esquemaQuestao.partial().parse(req.body),
      COLUNAS_QUESTAO,
    ),
  );
});

router.delete('/questoes-aula/:id', async (req, res) => {
  await atualizar('questoes_aula', idDaRota(req), { ativo: false }, 'id');
  res.status(204).end();
});

// --- Questões de trivia ---
router.get('/questoes-trivia', async (_req, res) => {
  const { rows } = await query(
    `SELECT ${COLUNAS_QUESTAO_TRIVIA} FROM questoes_trivia
     ORDER BY array_position(ARRAY['facil', 'media', 'dificil']::varchar[], dificuldade), criado_em`,
  );
  res.json(rows);
});

router.post('/questoes-trivia', async (req, res) => {
  res
    .status(201)
    .json(await inserir('questoes_trivia', esquemaQuestaoTrivia.parse(req.body), COLUNAS_QUESTAO_TRIVIA));
});

router.patch('/questoes-trivia/:id', async (req, res) => {
  const dados = esquemaQuestaoTrivia.partial().parse(req.body);
  res.json(await atualizar('questoes_trivia', idDaRota(req), dados, COLUNAS_QUESTAO_TRIVIA));
});

router.delete('/questoes-trivia/:id', async (req, res) => {
  await atualizar('questoes_trivia', idDaRota(req), { ativo: false }, 'id');
  res.status(204).end();
});

module.exports = router;
