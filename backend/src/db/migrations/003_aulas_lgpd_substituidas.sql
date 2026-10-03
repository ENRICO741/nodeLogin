-- As aulas 02 e 03 de LGPD foram substituídas pela jornada de cibersegurança (aulas 02 a 15).
-- Apagar a pasta não tira a aula do banco: oculta as antigas e libera a ordem para as novas
-- (sem isso, a importação falha no UNIQUE de ordem). Respostas e pontos já dados continuam.
UPDATE aulas SET ativo = false, ordem = ordem + 1000, atualizado_em = now()
WHERE slug IN ('dados-pessoais-e-sensiveis', 'direitos-do-titular');
