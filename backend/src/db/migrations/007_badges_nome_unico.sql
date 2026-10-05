-- O seed insere as conquistas que faltam pelo nome. Sem índice único, duas execuções ao mesmo tempo
-- (npm run seed manual durante a subida da API) duplicavam conquistas.

-- Se já houver duplicatas, fica a mais antiga: quem tinha uma cópia passa a ter a original.
CREATE TEMP TABLE badges_duplicados ON COMMIT DROP AS
SELECT id, manter FROM (
  SELECT id, first_value(id) OVER (PARTITION BY nome ORDER BY criado_em, id) AS manter FROM badges
) b WHERE id <> manter;

INSERT INTO usuario_badges (usuario_id, badge_id, obtida_em)
SELECT ub.usuario_id, d.manter, ub.obtida_em
FROM usuario_badges ub JOIN badges_duplicados d ON d.id = ub.badge_id
ON CONFLICT (usuario_id, badge_id) DO NOTHING;

DELETE FROM badges WHERE id IN (SELECT id FROM badges_duplicados);

CREATE UNIQUE INDEX badges_nome_uk ON badges (nome);
