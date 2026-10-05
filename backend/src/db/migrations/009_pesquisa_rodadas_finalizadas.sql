-- rodadas_trivia passa a contar só as rodadas finalizadas (antes contava as criadas, inclusive as
-- abandonadas). A rodada só é finalizada com todas as questões respondidas. Resto igual à 005.
CREATE OR REPLACE VIEW pesquisa_engajamento_usuario AS
SELECT p.participante,
  p.criado_em AT TIME ZONE 'America/Sao_Paulo' AS cadastro,
  (SELECT count(DISTINCT (s.iniciada_em AT TIME ZONE 'America/Sao_Paulo')::date)::int
     FROM sessoes_app s WHERE s.usuario_id = p.id) AS dias_ativos,
  (SELECT count(*)::int FROM sessoes_app s WHERE s.usuario_id = p.id) AS sessoes,
  (SELECT COALESCE(round(sum(extract(epoch FROM s.fim - s.iniciada_em))), 0)::int
     FROM sessoes_app_fim s WHERE s.usuario_id = p.id) AS tempo_total_s,
  (SELECT COALESCE(bool_or(s.standalone), false) FROM sessoes_app s WHERE s.usuario_id = p.id) AS usa_pwa_instalado,
  (SELECT count(DISTINCT v.aula_id)::int FROM aula_visitas v WHERE v.usuario_id = p.id AND v.concluida) AS aulas_concluidas,
  (SELECT count(*)::int FROM aula_respostas r WHERE r.usuario_id = p.id) AS respostas_aulas,
  (SELECT count(*) FILTER (WHERE r.correta)::int FROM aula_respostas r WHERE r.usuario_id = p.id) AS acertos_aulas,
  (SELECT count(*)::int FROM trivia_rodadas t WHERE t.usuario_id = p.id AND t.finalizada_em IS NOT NULL) AS rodadas_trivia,
  (SELECT count(*)::int FROM trivia_respostas r WHERE r.usuario_id = p.id) AS respostas_trivia,
  (SELECT count(*) FILTER (WHERE r.correta)::int FROM trivia_respostas r WHERE r.usuario_id = p.id) AS acertos_trivia,
  u.pontuacao_total AS pontos,
  (SELECT count(*)::int FROM usuario_badges b WHERE b.usuario_id = p.id) AS badges,
  (SELECT count(*)::int FROM eventos e WHERE e.usuario_id = p.id AND e.tipo_evento = 'tela_visualizada' AND e.tela = '/ranking') AS visitas_ranking,
  (SELECT count(*)::int FROM eventos e WHERE e.usuario_id = p.id AND e.tipo_evento = 'tela_visualizada' AND e.tela = '/conquistas') AS visitas_conquistas,
  (SELECT min(s.iniciada_em) AT TIME ZONE 'America/Sao_Paulo' FROM sessoes_app s WHERE s.usuario_id = p.id) AS primeira_atividade,
  (SELECT max(s.iniciada_em) AT TIME ZONE 'America/Sao_Paulo' FROM sessoes_app s WHERE s.usuario_id = p.id) AS ultima_atividade
FROM pesquisa_participantes p JOIN usuarios u ON u.id = p.id;
