-- Toda questão da trivia é ligada a uma aula: o sorteio só usa as de aulas concluídas e o feedback do
-- erro aponta a aula para rever. As questões do seed são todas de LGPD (aula 01).
-- Sem NOT NULL no banco: a obrigatoriedade fica na API do admin. Em banco novo esta migration roda
-- antes da importação das aulas (o UPDATE não acha nada) e o seed grava a referência.
UPDATE questoes_trivia
SET aula_referencia_id = (SELECT id FROM aulas WHERE slug = 'introducao-lgpd')
WHERE aula_referencia_id IS NULL;
