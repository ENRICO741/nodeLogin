-- Novos critérios de conquista. quantidade: limiar de aulas concluídas, pontos ou rodadas.
-- dificuldade: nível da trivia completa (NULL = todos os níveis).
ALTER TABLE badges
  ADD COLUMN quantidade integer CHECK (quantidade > 0),
  ADD COLUMN dificuldade varchar(10) CHECK (dificuldade IN ('facil', 'media', 'dificil'));

ALTER TABLE badges DROP CONSTRAINT badges_tipo_criterio_check;

-- "Guardião de Dados" (todas as aulas) vira "Graduado" (15 aulas). Mesmo id: quem já tinha continua com ela.
UPDATE badges SET nome = 'Graduado', descricao = 'Concluiu 15 aulas.',
  tipo_criterio = 'aulas_concluidas', quantidade = 15
WHERE tipo_criterio = 'todas_aulas';

ALTER TABLE badges ADD CONSTRAINT badges_tipo_criterio_check CHECK (tipo_criterio IN (
  'aula_concluida', 'aulas_concluidas', 'aulas_gabaritadas', 'primeira_trivia',
  'trivia_rodadas', 'trivia_completa', 'rodada_perfeita', 'pontos'));
ALTER TABLE badges ADD CHECK (
  tipo_criterio NOT IN ('aulas_concluidas', 'trivia_rodadas', 'pontos') OR quantidade IS NOT NULL);
