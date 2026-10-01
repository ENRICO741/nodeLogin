const { Router } = require('express');
const { z } = require('zod');
const { query } = require('../../db/pool');
const { naoEncontrado } = require('../../lib/erros');
const { idDaRota } = require('../../lib/validacao');
const { limiteEscrita } = require('../../middleware/limites');

const TAMANHO_MAXIMO_METADATA = 2048;

const esquemaEvento = z.object({
  sessao_id: z.uuid().nullable().optional(),
  tipo_evento: z.string().regex(/^[a-z_]{2,40}$/, 'Use letras minúsculas e sublinhado'),
  tela: z.string().max(60).optional(),
  elemento: z.string().max(80).optional(),
  duracao_ms: z.number().int().min(0).max(86_400_000).optional(),
  metadata: z
    .record(z.string(), z.unknown())
    .refine((m) => JSON.stringify(m).length <= TAMANHO_MAXIMO_METADATA, 'metadata acima de 2 KB')
    .optional(),
});

const router = Router();

// Contexto da sessão: app instalado (PWA) ou navegador, e largura da tela. Corpo opcional.
const esquemaSessao = z
  .object({
    standalone: z.boolean().optional(),
    largura_tela: z.number().int().min(1).max(10_000).optional(),
  })
  .default({});

router.post('/sessoes', async (req, res) => {
  const { standalone, largura_tela } = esquemaSessao.parse(req.body);
  const { rows } = await query(
    'INSERT INTO sessoes_app (usuario_id, standalone, largura_tela) VALUES ($1, $2, $3) RETURNING id, iniciada_em',
    [req.usuario.id, standalone ?? null, largura_tela ?? null],
  );
  res.status(201).json(rows[0]);
});

router.post('/sessoes/:id/finalizar', async (req, res) => {
  await query(
    'UPDATE sessoes_app SET finalizada_em = now() WHERE id = $1 AND usuario_id = $2 AND finalizada_em IS NULL',
    [idDaRota(req), req.usuario.id],
  );
  res.status(204).end();
});

// O app voltou do segundo plano: reabre a sessão se ela terminou há menos de 30 minutos (relógio do
// servidor). Senão 404, e o app abre uma sessão nova. Padrão de "sessão" usado em analytics.
const JANELA_RETOMADA = '30 minutes';
router.post('/sessoes/:id/retomar', async (req, res) => {
  const { rowCount } = await query(
    `UPDATE sessoes_app SET finalizada_em = NULL
     WHERE id = $1 AND usuario_id = $2 AND (finalizada_em IS NULL OR finalizada_em > now() - $3::interval)`,
    [idDaRota(req), req.usuario.id, JANELA_RETOMADA],
  );
  if (rowCount === 0) throw naoEncontrado('Sessão expirada');
  res.status(204).end();
});

router.post('/eventos', limiteEscrita, async (req, res) => {
  const e = esquemaEvento.parse(req.body);
  // O evento só entra se a sessão (quando informada) for do próprio usuário.
  const { rowCount } = await query(
    `INSERT INTO eventos (usuario_id, sessao_id, tipo_evento, tela, elemento, duracao_ms, metadata)
     SELECT $1, $2::uuid, $3, $4, $5, $6, $7
     WHERE $2::uuid IS NULL OR EXISTS (SELECT 1 FROM sessoes_app WHERE id = $2::uuid AND usuario_id = $1)`,
    [req.usuario.id, e.sessao_id ?? null, e.tipo_evento, e.tela, e.elemento, e.duracao_ms, e.metadata],
  );
  if (rowCount === 0) throw naoEncontrado('Sessão não encontrada');
  res.status(204).end();
});

module.exports = router;
