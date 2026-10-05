// Regras de pontuação e badges compartilhadas por aulas e trivia. Sempre chamadas dentro de uma transação.

// Admin vê e faz tudo (trilha e trivia liberadas) para conferir o conteúdo, mas nunca pontua.
// Fragmento SQL; `usuario` é o parâmetro com o id (ex.: '$1').
const ehAdmin = (usuario) => `EXISTS (SELECT 1 FROM usuarios WHERE id = ${usuario} AND papel = 'admin')`;

// Uma escrita de pontuação por usuário por vez (duas abas, dois aparelhos). Sem isso, duas transações
// leem "ainda não pontuou" ao mesmo tempo e a segunda esbarra no índice único: os pontos ficam certos,
// mas a resposta legítima dela volta 409 e se perde. Sempre antes de travar a visita ou rodada.
async function travarUsuario(c, usuarioId) {
  await c.query('SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE', [usuarioId]);
}

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
         -- Rodadas jogadas: finalizadas com pelo menos uma resposta (a API deixa finalizar uma rodada vazia).
         OR (b.tipo_criterio = 'primeira_trivia' AND EXISTS (
           SELECT 1 FROM trivia_rodadas r WHERE r.usuario_id = $1 AND r.finalizada_em IS NOT NULL
             AND EXISTS (SELECT 1 FROM trivia_respostas tr WHERE tr.rodada_id = r.id)))
         OR (b.tipo_criterio = 'aulas_concluidas' AND b.quantidade <= (
           SELECT count(DISTINCT v.aula_id) FROM aula_visitas v JOIN aulas a ON a.id = v.aula_id
           WHERE v.usuario_id = $1 AND v.concluida AND a.ativo))
         -- Acertou, em alguma visita, cada questão ativa de cada aula ativa.
         OR (b.tipo_criterio = 'aulas_gabaritadas'
           AND EXISTS (SELECT 1 FROM questoes_aula q JOIN aulas a ON a.id = q.aula_id WHERE q.ativo AND a.ativo)
           AND NOT EXISTS (
             SELECT 1 FROM questoes_aula q JOIN aulas a ON a.id = q.aula_id
             WHERE q.ativo AND a.ativo AND NOT EXISTS (
               SELECT 1 FROM aula_respostas r WHERE r.usuario_id = $1 AND r.questao_id = q.id AND r.correta)))
         OR (b.tipo_criterio = 'trivia_rodadas' AND b.quantidade <= (
           SELECT count(*) FROM trivia_rodadas r WHERE r.usuario_id = $1 AND r.finalizada_em IS NOT NULL
             AND EXISTS (SELECT 1 FROM trivia_respostas tr WHERE tr.rodada_id = r.id)))
         -- Acertou, em alguma rodada, cada questão ativa do nível; sem nível, de todos.
         OR (b.tipo_criterio = 'trivia_completa'
           AND EXISTS (SELECT 1 FROM questoes_trivia q
             WHERE q.ativo AND q.dificuldade = COALESCE(b.dificuldade, q.dificuldade))
           AND NOT EXISTS (
             SELECT 1 FROM questoes_trivia q
             WHERE q.ativo AND q.dificuldade = COALESCE(b.dificuldade, q.dificuldade) AND NOT EXISTS (
               SELECT 1 FROM trivia_respostas r WHERE r.usuario_id = $1 AND r.questao_id = q.id AND r.correta)))
         -- Rodada finalizada com todas as questões sorteadas acertadas.
         OR (b.tipo_criterio = 'rodada_perfeita' AND EXISTS (
           SELECT 1 FROM trivia_rodadas r
           WHERE r.usuario_id = $1 AND r.finalizada_em IS NOT NULL
             AND EXISTS (SELECT 1 FROM trivia_rodada_questoes rq WHERE rq.rodada_id = r.id)
             AND NOT EXISTS (
               SELECT 1 FROM trivia_rodada_questoes rq WHERE rq.rodada_id = r.id AND NOT EXISTS (
                 SELECT 1 FROM trivia_respostas tr
                 WHERE tr.rodada_id = r.id AND tr.questao_id = rq.questao_id AND tr.correta))))
         OR (b.tipo_criterio = 'pontos' AND b.quantidade <= (
           SELECT pontuacao_total FROM usuarios WHERE id = $1))
       )
       ON CONFLICT (usuario_id, badge_id) DO NOTHING
       RETURNING badge_id
     )
     SELECT b.id, b.nome, b.descricao, b.imagem_url, b.tipo_criterio FROM badges b JOIN novos n ON n.badge_id = b.id`,
    [usuarioId],
  );
  return rows;
}

module.exports = { ehAdmin, travarUsuario, creditarPontos, pontuacaoAtual, concederBadges };
