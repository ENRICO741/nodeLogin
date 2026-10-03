const { query } = require('../../db/pool');

// Duração em ms de uma visita/rodada finalizada; NULL enquanto aberta (avg ignora).
const duracaoMs = (inicio, fim) => `round(avg(extract(epoch FROM ${fim} - ${inicio}) * 1000))::int`;
const ORDEM_DIFICULDADE = `array_position(ARRAY['facil', 'media', 'dificil']::varchar[], dificuldade)`;
// Atividade de admins (testes da equipe) fica fora das métricas, como no ranking e na pesquisa.
const deUsuario = (t) => `${t}.usuario_id IN (SELECT id FROM usuarios WHERE papel = 'usuario')`;

const SQL = {
  aulas: `
    WITH v AS (
      SELECT aula_id, count(*)::int AS total_tentativas, count(finalizada_em)::int AS total_concluidas,
        ${duracaoMs('iniciada_em', 'finalizada_em')} AS duracao_media_ms
      FROM aula_visitas WHERE ${deUsuario('aula_visitas')} GROUP BY aula_id
    ), r AS (
      SELECT v.aula_id, count(*)::int AS total_respostas, count(*) FILTER (WHERE r.correta)::int AS total_acertos
      FROM aula_respostas r JOIN aula_visitas v ON v.id = r.visita_id WHERE ${deUsuario('r')} GROUP BY v.aula_id
    )
    SELECT a.id AS aula_id, a.titulo,
      COALESCE(v.total_tentativas, 0) AS total_tentativas, COALESCE(v.total_concluidas, 0) AS total_concluidas,
      v.duracao_media_ms, COALESCE(r.total_respostas, 0) AS total_respostas, COALESCE(r.total_acertos, 0) AS total_acertos
    FROM aulas a LEFT JOIN v ON v.aula_id = a.id LEFT JOIN r ON r.aula_id = a.id
    ORDER BY a.ordem`,

  questoesAula: `
    SELECT q.id AS questao_id, q.enunciado, a.titulo AS aula_titulo,
      count(r.id)::int AS total_respostas, count(*) FILTER (WHERE r.correta)::int AS total_acertos
    FROM questoes_aula q JOIN aulas a ON a.id = q.aula_id
    LEFT JOIN aula_respostas r ON r.questao_id = q.id AND ${deUsuario('r')}
    GROUP BY q.id, a.titulo, a.ordem ORDER BY a.ordem, q.criado_em`,

  usuariosAula: `
    WITH v AS (
      SELECT usuario_id, aula_id, count(*)::int AS total_tentativas,
        ${duracaoMs('iniciada_em', 'finalizada_em')} AS duracao_media_ms
      FROM aula_visitas WHERE ${deUsuario('aula_visitas')} GROUP BY usuario_id, aula_id
    ), r AS (
      SELECT v.usuario_id, v.aula_id, count(*)::int AS total_respostas,
        count(*) FILTER (WHERE r.correta)::int AS total_acertos
      FROM aula_respostas r JOIN aula_visitas v ON v.id = r.visita_id GROUP BY v.usuario_id, v.aula_id
    )
    SELECT u.apelido, a.titulo AS aula_titulo, v.total_tentativas, v.duracao_media_ms,
      COALESCE(r.total_respostas, 0) AS total_respostas, COALESCE(r.total_acertos, 0) AS total_acertos
    FROM v JOIN usuarios u ON u.id = v.usuario_id JOIN aulas a ON a.id = v.aula_id
    LEFT JOIN r USING (usuario_id, aula_id)
    ORDER BY u.apelido, a.ordem`,

  trivia: `
    WITH v AS (
      SELECT dificuldade, count(*)::int AS total_tentativas, count(finalizada_em)::int AS total_concluidas,
        ${duracaoMs('iniciada_em', 'finalizada_em')} AS duracao_media_ms
      FROM trivia_rodadas WHERE ${deUsuario('trivia_rodadas')} GROUP BY dificuldade
    ), r AS (
      SELECT rd.dificuldade, count(*)::int AS total_respostas, count(*) FILTER (WHERE r.correta)::int AS total_acertos
      FROM trivia_respostas r JOIN trivia_rodadas rd ON rd.id = r.rodada_id WHERE ${deUsuario('r')} GROUP BY rd.dificuldade
    )
    SELECT v.dificuldade, v.total_tentativas, v.total_concluidas, v.duracao_media_ms,
      COALESCE(r.total_respostas, 0) AS total_respostas, COALESCE(r.total_acertos, 0) AS total_acertos
    FROM v LEFT JOIN r USING (dificuldade)
    ORDER BY ${ORDEM_DIFICULDADE}`,

  questoesTrivia: `
    SELECT q.id AS questao_id, q.enunciado, q.dificuldade,
      count(r.id)::int AS total_respostas, count(*) FILTER (WHERE r.correta)::int AS total_acertos
    FROM questoes_trivia q LEFT JOIN trivia_respostas r ON r.questao_id = q.id AND ${deUsuario('r')}
    GROUP BY q.id ORDER BY ${ORDEM_DIFICULDADE}, q.criado_em`,

  usuariosTrivia: `
    WITH v AS (
      SELECT usuario_id, dificuldade, count(*)::int AS total_tentativas,
        ${duracaoMs('iniciada_em', 'finalizada_em')} AS duracao_media_ms
      FROM trivia_rodadas WHERE ${deUsuario('trivia_rodadas')} GROUP BY usuario_id, dificuldade
    ), r AS (
      SELECT rd.usuario_id, rd.dificuldade, count(*)::int AS total_respostas,
        count(*) FILTER (WHERE r.correta)::int AS total_acertos
      FROM trivia_respostas r JOIN trivia_rodadas rd ON rd.id = r.rodada_id GROUP BY rd.usuario_id, rd.dificuldade
    )
    SELECT u.apelido, v.dificuldade, v.total_tentativas, v.duracao_media_ms,
      COALESCE(r.total_respostas, 0) AS total_respostas, COALESCE(r.total_acertos, 0) AS total_acertos
    FROM v JOIN usuarios u ON u.id = v.usuario_id LEFT JOIN r USING (usuario_id, dificuldade)
    ORDER BY u.apelido, ${ORDEM_DIFICULDADE}`,
};

// LGPD: as visões por usuário mostram apenas o apelido.
async function obterEstatisticas() {
  const entradas = await Promise.all(
    Object.entries(SQL).map(async ([chave, sql]) => [chave, (await query(sql)).rows]),
  );
  return Object.fromEntries(entradas);
}

module.exports = { obterEstatisticas };
