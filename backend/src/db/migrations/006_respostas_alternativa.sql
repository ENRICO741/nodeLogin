-- Alternativa escolhida em cada resposta. Torna o reenvio idempotente: se a resposta foi gravada mas o
-- retorno se perdeu na rede, reenviar a mesma alternativa devolve o resultado gravado em vez de 409.
-- Linhas antigas ficam com NULL (o reenvio delas continua recusado).
ALTER TABLE aula_respostas ADD COLUMN alternativa char(1) CHECK (alternativa IN ('a', 'b', 'c', 'd'));
ALTER TABLE trivia_respostas ADD COLUMN alternativa char(1) CHECK (alternativa IN ('a', 'b', 'c', 'd'));
