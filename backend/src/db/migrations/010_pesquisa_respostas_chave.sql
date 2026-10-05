-- pesquisa_respostas ganha, no fim, a chave da questão de aula (data-pergunta do HTML). A análise
-- descarta a pergunta provisória "confirmacao-leitura" das aulas 02 a 15. Trivia não tem chave (NULL).
-- Resto igual à 002.
CREATE OR REPLACE VIEW pesquisa_respostas AS
SELECT p.participante, 'aula' AS tipo, a.titulo AS contexto, r.questao_id, r.correta, r.pontuou,
  r.respondido_em AT TIME ZONE 'America/Sao_Paulo' AS respondido_em,
  q.chave
FROM aula_respostas r
JOIN pesquisa_participantes p ON p.id = r.usuario_id
JOIN questoes_aula q ON q.id = r.questao_id
JOIN aulas a ON a.id = q.aula_id
UNION ALL
SELECT p.participante, 'trivia', q.dificuldade, r.questao_id, r.correta, r.pontuou,
  r.respondido_em AT TIME ZONE 'America/Sao_Paulo',
  NULL::varchar
FROM trivia_respostas r
JOIN pesquisa_participantes p ON p.id = r.usuario_id
JOIN questoes_trivia q ON q.id = r.questao_id;
