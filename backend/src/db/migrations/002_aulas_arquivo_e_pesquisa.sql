-- Aulas importadas de conteudo/aulas/ e dados para a pesquisa do TCC.

-- ---------- Aulas como arquivos ----------
-- slug = nome da pasta sem o número (identidade estável); NULL para aulas criadas no admin.
ALTER TABLE aulas ADD COLUMN slug varchar(80) UNIQUE;
-- Deferível: o importador pode trocar a ordem entre aulas dentro da mesma transação.
ALTER TABLE aulas DROP CONSTRAINT aulas_ordem_key;
ALTER TABLE aulas ADD CONSTRAINT aulas_ordem_key UNIQUE (ordem) DEFERRABLE INITIALLY DEFERRED;

-- chave = data-pergunta do HTML (identidade estável da questão importada).
ALTER TABLE questoes_aula ADD COLUMN chave varchar(80);
ALTER TABLE questoes_aula ADD COLUMN ordem smallint;
ALTER TABLE questoes_aula ADD CONSTRAINT questoes_aula_chave_uk UNIQUE (aula_id, chave);

-- ---------- Pesquisa ----------
ALTER TABLE usuarios ADD COLUMN consentiu_pesquisa_em timestamptz;

ALTER TABLE sessoes_app ADD COLUMN standalone boolean;
ALTER TABLE sessoes_app ADD COLUMN largura_tela integer CHECK (largura_tela > 0);

-- Cada crédito de pontos, para reconstruir a evolução da pontuação e do ranking no tempo.
CREATE TABLE pontuacao_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  origem varchar(20) NOT NULL CHECK (origem IN ('aula_questao', 'aula_conclusao', 'trivia_questao')),
  referencia_id uuid NOT NULL,
  pontos integer NOT NULL CHECK (pontos > 0),
  total_apos integer NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pontuacao_historico_usuario_idx ON pontuacao_historico (usuario_id, criado_em);

-- ---------- Visões para análise ----------
-- Só usuários comuns que consentiram. O id vira um pseudônimo com o segredo da sessão
-- (app.pesquisa_segredo, definido pela API a cada exportação). Horários em America/Sao_Paulo.
CREATE VIEW pesquisa_participantes AS
SELECT u.id,
  md5(u.id::text || current_setting('app.pesquisa_segredo')) AS participante,
  u.criado_em
FROM usuarios u
WHERE u.consentiu_pesquisa_em IS NOT NULL AND u.papel = 'usuario';

CREATE VIEW pesquisa_sessoes AS
SELECT p.participante,
  md5(s.id::text || current_setting('app.pesquisa_segredo')) AS sessao,
  s.iniciada_em AT TIME ZONE 'America/Sao_Paulo' AS iniciada_em,
  s.finalizada_em AT TIME ZONE 'America/Sao_Paulo' AS finalizada_em,
  round(extract(epoch FROM s.finalizada_em - s.iniciada_em))::int AS duracao_s,
  s.standalone,
  s.largura_tela
FROM sessoes_app s JOIN pesquisa_participantes p ON p.id = s.usuario_id;

CREATE VIEW pesquisa_eventos AS
SELECT p.participante,
  md5(e.sessao_id::text || current_setting('app.pesquisa_segredo')) AS sessao,
  e.tipo_evento, e.tela, e.elemento, e.duracao_ms, e.metadata,
  e.criado_em AT TIME ZONE 'America/Sao_Paulo' AS criado_em
FROM eventos e JOIN pesquisa_participantes p ON p.id = e.usuario_id;

CREATE VIEW pesquisa_respostas AS
SELECT p.participante, 'aula' AS tipo, a.titulo AS contexto, r.questao_id, r.correta, r.pontuou,
  r.respondido_em AT TIME ZONE 'America/Sao_Paulo' AS respondido_em
FROM aula_respostas r
JOIN pesquisa_participantes p ON p.id = r.usuario_id
JOIN questoes_aula q ON q.id = r.questao_id
JOIN aulas a ON a.id = q.aula_id
UNION ALL
SELECT p.participante, 'trivia', q.dificuldade, r.questao_id, r.correta, r.pontuou,
  r.respondido_em AT TIME ZONE 'America/Sao_Paulo'
FROM trivia_respostas r
JOIN pesquisa_participantes p ON p.id = r.usuario_id
JOIN questoes_trivia q ON q.id = r.questao_id;

CREATE VIEW pesquisa_pontos AS
SELECT p.participante, h.origem, h.pontos, h.total_apos,
  h.criado_em AT TIME ZONE 'America/Sao_Paulo' AS criado_em
FROM pontuacao_historico h JOIN pesquisa_participantes p ON p.id = h.usuario_id;

CREATE VIEW pesquisa_uso_diario AS
WITH s AS (
  SELECT (s.iniciada_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia, p.participante,
    extract(epoch FROM s.finalizada_em - s.iniciada_em) AS duracao
  FROM sessoes_app s JOIN pesquisa_participantes p ON p.id = s.usuario_id
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

CREATE VIEW pesquisa_engajamento_usuario AS
SELECT p.participante,
  p.criado_em AT TIME ZONE 'America/Sao_Paulo' AS cadastro,
  (SELECT count(DISTINCT (s.iniciada_em AT TIME ZONE 'America/Sao_Paulo')::date)::int
     FROM sessoes_app s WHERE s.usuario_id = p.id) AS dias_ativos,
  (SELECT count(*)::int FROM sessoes_app s WHERE s.usuario_id = p.id) AS sessoes,
  (SELECT COALESCE(round(sum(extract(epoch FROM s.finalizada_em - s.iniciada_em))), 0)::int
     FROM sessoes_app s WHERE s.usuario_id = p.id) AS tempo_total_s,
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

-- Retenção por coorte: semana do cadastro × semanas desde o cadastro com pelo menos uma sessão.
CREATE VIEW pesquisa_retencao AS
WITH p AS (
  SELECT id, participante, date_trunc('week', criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS coorte
  FROM pesquisa_participantes
), ativos AS (
  SELECT DISTINCT p.coorte, p.participante,
    ((s.iniciada_em AT TIME ZONE 'America/Sao_Paulo')::date - p.coorte) / 7 AS semana
  FROM sessoes_app s JOIN p ON p.id = s.usuario_id
)
SELECT a.coorte, a.semana, count(*)::int AS participantes_ativos,
  (SELECT count(*)::int FROM p p2 WHERE p2.coorte = a.coorte) AS tamanho_coorte
FROM ativos a
GROUP BY a.coorte, a.semana
ORDER BY a.coorte, a.semana;
