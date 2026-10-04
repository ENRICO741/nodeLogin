-- Pesquisa: fim estimado das sessões sem fim registrado e datas das conquistas.

-- Visão interna (não exportada): fim de cada sessão. Sem finalizada_em (o keepalive não chegou ou a
-- sessão segue aberta), o fim é o último evento da sessão; sem eventos, o próprio início (duração 0).
CREATE VIEW sessoes_app_fim AS
SELECT s.*,
  COALESCE(s.finalizada_em,
    GREATEST(s.iniciada_em, (SELECT max(e.criado_em) FROM eventos e WHERE e.sessao_id = s.id))) AS fim,
  s.finalizada_em IS NULL AS fim_estimado
FROM sessoes_app s;

CREATE OR REPLACE VIEW pesquisa_sessoes AS
SELECT p.participante,
  md5(s.id::text || current_setting('app.pesquisa_segredo')) AS sessao,
  s.iniciada_em AT TIME ZONE 'America/Sao_Paulo' AS iniciada_em,
  s.fim AT TIME ZONE 'America/Sao_Paulo' AS finalizada_em,
  round(extract(epoch FROM s.fim - s.iniciada_em))::int AS duracao_s,
  s.standalone,
  s.largura_tela,
  s.fim_estimado
FROM sessoes_app_fim s JOIN pesquisa_participantes p ON p.id = s.usuario_id;

CREATE OR REPLACE VIEW pesquisa_uso_diario AS
WITH s AS (
  SELECT (s.iniciada_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia, p.participante,
    extract(epoch FROM s.fim - s.iniciada_em) AS duracao
  FROM sessoes_app_fim s JOIN pesquisa_participantes p ON p.id = s.usuario_id
), uso AS (
  SELECT dia, count(DISTINCT participante)::int AS usuarios_ativos, count(*)::int AS sessoes,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duracao))::int AS duracao_mediana_s
  FROM s GROUP BY dia
), novos AS (
  SELECT (criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*)::int AS novos_usuarios
  FROM pesquisa_participantes GROUP BY 1
)
SELECT dia, COALESCE(usuarios_ativos, 0) AS usuarios_ativos, COALESCE(sessoes, 0) AS sessoes,
  duracao_mediana_s, COALESCE(novos_usuarios, 0) AS novos_usuarios
FROM uso FULL JOIN novos USING (dia)
ORDER BY dia;

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
  (SELECT count(*)::int FROM trivia_rodadas t WHERE t.usuario_id = p.id) AS rodadas_trivia,
  (SELECT count(*)::int FROM trivia_respostas r WHERE r.usuario_id = p.id) AS respostas_trivia,
  (SELECT count(*) FILTER (WHERE r.correta)::int FROM trivia_respostas r WHERE r.usuario_id = p.id) AS acertos_trivia,
  u.pontuacao_total AS pontos,
  (SELECT count(*)::int FROM usuario_badges b WHERE b.usuario_id = p.id) AS badges,
  (SELECT count(*)::int FROM eventos e WHERE e.usuario_id = p.id AND e.tipo_evento = 'tela_visualizada' AND e.tela = '/ranking') AS visitas_ranking,
  (SELECT count(*)::int FROM eventos e WHERE e.usuario_id = p.id AND e.tipo_evento = 'tela_visualizada' AND e.tela = '/conquistas') AS visitas_conquistas,
  (SELECT min(s.iniciada_em) AT TIME ZONE 'America/Sao_Paulo' FROM sessoes_app s WHERE s.usuario_id = p.id) AS primeira_atividade,
  (SELECT max(s.iniciada_em) AT TIME ZONE 'America/Sao_Paulo' FROM sessoes_app s WHERE s.usuario_id = p.id) AS ultima_atividade
FROM pesquisa_participantes p JOIN usuarios u ON u.id = p.id;

CREATE VIEW pesquisa_badges AS
SELECT p.participante, b.nome AS badge, b.tipo_criterio,
  ub.obtida_em AT TIME ZONE 'America/Sao_Paulo' AS obtida_em
FROM usuario_badges ub
JOIN pesquisa_participantes p ON p.id = ub.usuario_id
JOIN badges b ON b.id = ub.badge_id;
