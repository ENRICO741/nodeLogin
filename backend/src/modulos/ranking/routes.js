const { Router } = require('express');
const { query } = require('../../db/pool');

const TAMANHO_RANKING = 20;

const router = Router();

// LGPD: expõe só apelido, foto e pontos. Admins ficam fora do ranking.
router.get('/', async (req, res) => {
  const { rows: lideres } = await query(
    `SELECT apelido, foto_perfil_url, pontuacao_total, id = $1 AS eu,
       rank() OVER (ORDER BY pontuacao_total DESC)::int AS posicao
     FROM usuarios WHERE ativo AND papel = 'usuario'
     ORDER BY pontuacao_total DESC, apelido LIMIT $2`,
    [req.usuario.id, TAMANHO_RANKING],
  );
  const { rows } = await query(
    `SELECT (count(*) + 1)::int AS posicao FROM usuarios
     WHERE ativo AND papel = 'usuario' AND pontuacao_total > $1`,
    [req.usuario.pontuacao_total],
  );
  res.json({
    lideres,
    minha_posicao: req.usuario.papel === 'usuario' ? rows[0].posicao : null,
    pontuacao_total: req.usuario.pontuacao_total,
  });
});

module.exports = router;
