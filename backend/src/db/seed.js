const { pool, transacao } = require('./pool');
const logger = require('../lib/logger');

// As aulas vêm de conteudo/aulas (ver src/modulos/aulas/importador.js). Aqui ficam trivia e badges.
const TRIVIA_QUESTOES = [
  {
    dificuldade: 'facil',
    enunciado: 'O que significa a sigla LGPD?',
    alternativa_a: 'Lei Geral de Proteção de Dados',
    alternativa_b: 'Lei Geral de Privacidade Digital',
    alternativa_c: 'Lei Global de Proteção de Dados',
    alternativa_d: 'Lei Geral de Processamento de Dados',
    resposta_correta: 'a',
    explicacao: 'LGPD significa Lei Geral de Proteção de Dados.',
    pontos: 5,
  },
  {
    dificuldade: 'facil',
    enunciado: 'A LGPD entrou em vigor em qual ano?',
    alternativa_a: '2016',
    alternativa_b: '2018',
    alternativa_c: '2020',
    alternativa_d: '2022',
    resposta_correta: 'c',
    explicacao: 'Apesar de sancionada em 2018, a LGPD entrou em vigor em setembro de 2020.',
    pontos: 5,
  },
  {
    dificuldade: 'facil',
    enunciado: 'Quem é o "titular" na LGPD?',
    alternativa_a: 'A empresa que trata os dados',
    alternativa_b: 'A pessoa natural a quem os dados se referem',
    alternativa_c: 'O órgão fiscalizador',
    alternativa_d: 'O desenvolvedor do sistema',
    resposta_correta: 'b',
    explicacao: 'Titular é a pessoa natural a quem os dados pessoais se referem.',
    pontos: 5,
  },
  {
    dificuldade: 'media',
    enunciado: 'Qual é o órgão responsável por fiscalizar a aplicação da LGPD no Brasil?',
    alternativa_a: 'ANPD',
    alternativa_b: 'ANATEL',
    alternativa_c: 'CVM',
    alternativa_d: 'BACEN',
    resposta_correta: 'a',
    explicacao: 'A Autoridade Nacional de Proteção de Dados (ANPD) fiscaliza o cumprimento da LGPD.',
    pontos: 10,
  },
  {
    dificuldade: 'media',
    enunciado: 'O que é "consentimento" segundo a LGPD?',
    alternativa_a: 'Manifestação livre, informada e inequívoca do titular',
    alternativa_b: 'Autorização automática ao usar um site',
    alternativa_c: 'Aceite tácito por padrão',
    alternativa_d: 'Permissão dada pela empresa',
    resposta_correta: 'a',
    explicacao:
      'Consentimento é a manifestação livre, informada e inequívoca do titular sobre o tratamento de seus dados.',
    pontos: 10,
  },
  {
    dificuldade: 'media',
    enunciado: 'Qual das opções NÃO é uma base legal prevista na LGPD?',
    alternativa_a: 'Consentimento',
    alternativa_b: 'Cumprimento de obrigação legal',
    alternativa_c: 'Curiosidade do controlador',
    alternativa_d: 'Execução de contrato',
    resposta_correta: 'c',
    explicacao: '"Curiosidade do controlador" não é uma base legal válida prevista no art. 7º da LGPD.',
    pontos: 10,
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Em caso de vazamento de dados, em quanto tempo o incidente deve ser comunicado à ANPD, segundo orientação de "prazo razoável"?',
    alternativa_a: 'Não há necessidade de comunicação',
    alternativa_b: 'Em prazo razoável, sem prazo fixo definido em lei',
    alternativa_c: 'Exatamente 24 horas',
    alternativa_d: 'Exatamente 72 horas',
    resposta_correta: 'b',
    explicacao:
      'A LGPD exige comunicação em "prazo razoável", sem um prazo fixo estabelecido em lei (diferente do GDPR europeu).',
    pontos: 15,
  },
  {
    dificuldade: 'dificil',
    enunciado: 'O que caracteriza a figura do "encarregado" (DPO) na LGPD?',
    alternativa_a: 'É o titular dos dados',
    alternativa_b: 'É quem fiscaliza o mercado financeiro',
    alternativa_c: 'É o canal de comunicação entre controlador, titulares e ANPD',
    alternativa_d: 'É um cargo obrigatório apenas para bancos',
    resposta_correta: 'c',
    explicacao:
      'O encarregado (DPO) atua como canal de comunicação entre o controlador, os titulares dos dados e a ANPD.',
    pontos: 15,
  },
  {
    dificuldade: 'dificil',
    enunciado: 'Qual sanção NÃO está prevista na LGPD para infrações?',
    alternativa_a: 'Advertência',
    alternativa_b: 'Multa de até 2% do faturamento',
    alternativa_c: 'Pena de prisão para a empresa',
    alternativa_d: 'Bloqueio dos dados pessoais',
    resposta_correta: 'c',
    explicacao:
      'A LGPD não prevê pena de prisão para empresas; as sanções incluem advertência, multa, bloqueio e eliminação dos dados.',
    pontos: 15,
  },
  {
    dificuldade: 'dificil',
    enunciado: 'Qual é o limite percentual da multa simples prevista na LGPD?',
    alternativa_a: 'Até 2% do faturamento, limitado a R$ 50 milhões por infração',
    alternativa_b: 'Até 10% do faturamento, sem limite',
    alternativa_c: 'Valor fixo de R$ 1 milhão',
    alternativa_d: 'Até 20% do faturamento anual',
    resposta_correta: 'a',
    explicacao:
      'A multa simples pode chegar a 2% do faturamento da empresa, limitada a R$ 50 milhões por infração.',
    pontos: 15,
  },
];

const COLUNAS_QUESTAO = [
  'enunciado',
  'alternativa_a',
  'alternativa_b',
  'alternativa_c',
  'alternativa_d',
  'resposta_correta',
  'explicacao',
  'pontos',
];
const valoresQuestao = (q) => COLUNAS_QUESTAO.map((coluna) => q[coluna]);

// [nome, descricao, tipo_criterio, quantidade, dificuldade]
const BADGES = [
  ['Aprendiz Dedicado', 'Concluiu 5 aulas.', 'aulas_concluidas', 5, null],
  ['Sentinela', 'Concluiu 10 aulas.', 'aulas_concluidas', 10, null],
  ['Graduado', 'Concluiu 15 aulas.', 'aulas_concluidas', 15, null],
  ['Aluno Nota 10', 'Acertou todas as perguntas de todas as aulas.', 'aulas_gabaritadas', null, null],
  ['Curioso da Trivia', 'Terminou sua primeira rodada de trivia.', 'primeira_trivia', null, null],
  ['Frequentador da Trivia', 'Terminou 10 rodadas de trivia.', 'trivia_rodadas', 10, null],
  ['Recruta da Trivia', 'Acertou todas as questões fáceis da trivia.', 'trivia_completa', null, 'facil'],
  ['Agente da Trivia', 'Acertou todas as questões médias da trivia.', 'trivia_completa', null, 'media'],
  ['Elite da Trivia', 'Acertou todas as questões difíceis da trivia.', 'trivia_completa', null, 'dificil'],
  [
    'Mestre da Trivia',
    'Acertou todas as questões da trivia, nos três níveis.',
    'trivia_completa',
    null,
    null,
  ],
  ['Rodada Perfeita', 'Acertou todas as questões de uma rodada de trivia.', 'rodada_perfeita', null, null],
  ['Centena', 'Chegou a 100 pontos.', 'pontos', 100, null],
  ['Pontuação de Elite', 'Chegou a 300 pontos.', 'pontos', 300, null],
];

// Popula a trivia só em banco vazio, numa transação. Badges: insere a cada subida os que faltam (por nome),
// assim bancos já semeados também recebem os novos. Roda depois da importação das aulas,
// para o badge "Primeiros Passos" apontar para a aula de menor ordem.
// Chave do lock: duas execuções ao mesmo tempo (npm run seed durante a subida da API) rodam uma depois da
// outra, e a segunda já vê a trivia populada.
const LOCK_SEED = 4_242_001;

async function semear() {
  await transacao(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK_SEED]);
    const { rows } = await c.query('SELECT EXISTS (SELECT 1 FROM questoes_trivia) AS tem_conteudo');
    if (!rows[0].tem_conteudo) {
      for (const questao of TRIVIA_QUESTOES) {
        await c.query(
          // Todas de LGPD: ligadas à aula 01 (o seed roda depois da importação das aulas).
          `INSERT INTO questoes_trivia (dificuldade, ${COLUNAS_QUESTAO.join(', ')}, aula_referencia_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT id FROM aulas WHERE slug = 'introducao-lgpd'))`,
          [questao.dificuldade, ...valoresQuestao(questao)],
        );
      }
      logger.info('seed aplicado', { trivia: TRIVIA_QUESTOES.length });
    }

    // Nome único (badges_nome_uk, migration 007): a conquista que já existe fica como está.
    await c.query(
      `INSERT INTO badges (nome, descricao, tipo_criterio, aula_id)
       SELECT 'Primeiros Passos', 'Concluiu a primeira aula.', 'aula_concluida', id FROM aulas
       ORDER BY ordem LIMIT 1
       ON CONFLICT (nome) DO NOTHING`,
    );
    for (const badge of BADGES) {
      await c.query(
        `INSERT INTO badges (nome, descricao, tipo_criterio, quantidade, dificuldade)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (nome) DO NOTHING`,
        badge,
      );
    }
  });
}

module.exports = { semear };

if (require.main === module) {
  semear()
    .then(() => pool.end())
    .catch((erro) => {
      logger.error('falha no seed', { erro });
      process.exit(1);
    });
}
