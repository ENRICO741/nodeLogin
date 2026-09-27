// Regras de pontuação e badges compartilhadas por aulas e trivia. Sempre chamadas dentro de uma transação.

// Credita pontos e registra no histórico (pontuacao_historico), que permite reconstruir a evolução no tempo.
// origem: 'aula_questao' | 'aula_conclusao' | 'trivia_questao'; referenciaId: questão ou aula que gerou os pontos.
async function creditarPontos(c, usuarioId, pontos, origem, referenciaId) {
  if (pontos <= 0) return pontuacaoAtual(c, usuarioId); // questão de 0 pontos: nada a registrar
  const { rows } = await c.query(
    `UPDATE usuarios SET pontuacao_total = pontuacao_total + $2, pontuacao_atualizada_em = now()
     WHERE id = $1 RETURNING pontuacao_total`,
    [usuarioId, pontos],
  );
  const total = rows[0].pontuacao_total;
  await c.query(
    `INSERT INTO pontuacao_historico (usuario_id, origem, referencia_id, pontos, total_apos)
     VALUES ($1, $2, $3, $4, $5)`,
    [usuarioId, origem, referenciaId, pontos, total],
  );
  return total;
}

async function pontuacaoAtual(c, usuarioId) {
  const { rows } = await c.query('SELECT pontuacao_total FROM usuarios WHERE id = $1', [usuarioId]);
  return rows[0].pontuacao_total;
}

// Concede os badges cujo critério o usuário já cumpre e devolve só os novos.
async function concederBadges(c, usuarioId) {
  const { rows } = await c.query(
    `WITH novos AS (
       INSERT INTO usuario_badges (usuario_id, badge_id)
       SELECT $1, b.id FROM badges b
       WHERE b.ativo AND (
         (b.tipo_criterio = 'aula_concluida' AND EXISTS (
           SELECT 1 FROM aula_visitas v WHERE v.usuario_id = $1 AND v.aula_id = b.aula_id AND v.concluida))
         OR (b.tipo_criterio = 'primeira_trivia' AND EXISTS (
           SELECT 1 FROM trivia_rodadas r WHERE r.usuario_id = $1 AND r.finalizada_em IS NOT NULL))
         OR (b.tipo_criterio = 'todas_aulas'
           AND EXISTS (SELECT 1 FROM aulas WHERE ativo)
           AND NOT EXISTS (
             SELECT 1 FROM aulas a WHERE a.ativo AND NOT EXISTS (
               SELECT 1 FROM aula_visitas v WHERE v.usuario_id = $1 AND v.aula_id = a.id AND v.concluida)))
       )
       ON CONFLICT (usuario_id, badge_id) DO NOTHING
       RETURNING badge_id
     )
     SELECT b.id, b.nome, b.descricao, b.imagem_url, b.tipo_criterio FROM badges b JOIN novos n ON n.badge_id = b.id`,
    [usuarioId],
  );
  return rows;
}

module.exports = { creditarPontos, pontuacaoAtual, concederBadges };
