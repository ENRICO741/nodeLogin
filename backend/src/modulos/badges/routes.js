const { Router } = require('express');
const { query } = require('../../db/pool');

const router = Router();

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT b.id, b.nome, b.descricao, b.imagem_url, b.tipo_criterio, ub.obtida_em
     FROM badges b
     LEFT JOIN usuario_badges ub ON ub.badge_id = b.id AND ub.usuario_id = $1
     WHERE b.ativo
     ORDER BY array_position(ARRAY['aula_concluida', 'aulas_concluidas', 'aulas_gabaritadas', 'primeira_trivia',
         'trivia_rodadas', 'trivia_completa', 'rodada_perfeita', 'pontos']::varchar[], b.tipo_criterio),
       b.quantidade, array_position(ARRAY['facil', 'media', 'dificil']::varchar[], b.dificuldade) NULLS LAST,
       b.criado_em`,
    [req.usuario.id],
  );
  res.json(rows);
});

module.exports = router;
