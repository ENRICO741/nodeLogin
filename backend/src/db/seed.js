const { pool, transacao } = require('./pool');
const logger = require('../lib/logger');

const AULAS = [
  {
    titulo: 'Introdução à LGPD',
    ordem: 1,
    conteudo_html:
      '<h2>O que é a LGPD?</h2><p>A Lei Geral de Proteção de Dados (Lei nº 13.709/2018) regula o tratamento de dados pessoais no Brasil, tanto no meio físico quanto digital.</p>',
    pontos_conclusao: 20,
    questoes: [
      {
        enunciado: 'Qual é o número da lei que instituiu a LGPD?',
        alternativa_a: 'Lei nº 12.965/2014',
        alternativa_b: 'Lei nº 13.709/2018',
        alternativa_c: 'Lei nº 8.078/1990',
        alternativa_d: 'Lei nº 13.853/2019',
        resposta_correta: 'b',
        explicacao: 'A LGPD foi instituída pela Lei nº 13.709/2018.',
        pontos: 10,
      },
      {
        enunciado: 'A LGPD se aplica apenas a empresas privadas?',
        alternativa_a: 'Sim, somente empresas privadas',
        alternativa_b: 'Não, também se aplica a órgãos públicos',
        alternativa_c: 'Apenas a empresas de tecnologia',
        alternativa_d: 'Apenas a bancos',
        resposta_correta: 'b',
        explicacao: 'A LGPD se aplica a agentes públicos e privados que tratam dados pessoais.',
        pontos: 10,
      },
    ],
  },
  {
    titulo: 'Dados Pessoais e Dados Sensíveis',
    ordem: 2,
    conteudo_html:
      '<h2>Tipos de dados</h2><p>Dado pessoal é qualquer informação relacionada a pessoa natural identificada ou identificável. Dado sensível envolve origem racial, saúde, vida sexual, dados biométricos, entre outros.</p>',
    pontos_conclusao: 20,
    questoes: [
      {
        enunciado: 'Qual das opções é considerada um dado pessoal sensível?',
        alternativa_a: 'Nome completo',
        alternativa_b: 'CEP',
        alternativa_c: 'Dado sobre saúde',
        alternativa_d: 'Profissão',
        resposta_correta: 'c',
        explicacao: 'Dados sobre saúde são classificados como dados sensíveis pela LGPD.',
        pontos: 10,
      },
      {
        enunciado: 'O que caracteriza um dado pessoal?',
        alternativa_a: 'Qualquer informação relacionada a pessoa identificada ou identificável',
        alternativa_b: 'Apenas o CPF',
        alternativa_c: 'Apenas dados financeiros',
        alternativa_d: 'Apenas dados públicos',
        resposta_correta: 'a',
        explicacao:
          'Dado pessoal é qualquer informação relacionada a pessoa natural identificada ou identificável.',
        pontos: 10,
      },
    ],
  },
  {
    titulo: 'Direitos do Titular de Dados',
    ordem: 3,
    conteudo_html:
      '<h2>Direitos garantidos</h2><p>O titular tem direito à confirmação de tratamento, acesso, correção, anonimização, portabilidade e eliminação dos dados, entre outros previstos no art. 18 da LGPD.</p>',
    pontos_conclusao: 20,
    questoes: [
      {
        enunciado: 'O titular dos dados pode solicitar a eliminação de seus dados pessoais?',
        alternativa_a: 'Não, isso nunca é permitido',
        alternativa_b: 'Sim, é um direito previsto na LGPD',
        alternativa_c: 'Somente com autorização judicial',
        alternativa_d: 'Somente para dados sensíveis',
        resposta_correta: 'b',
        explicacao: 'O direito à eliminação dos dados está previsto no art. 18 da LGPD.',
        pontos: 10,
      },
      {
        enunciado: 'Qual artigo da LGPD trata dos direitos do titular?',
        alternativa_a: 'Art. 5º',
        alternativa_b: 'Art. 10',
        alternativa_c: 'Art. 18',
        alternativa_d: 'Art. 46',
        resposta_correta: 'c',
        explicacao: 'O art. 18 da LGPD lista os direitos do titular dos dados.',
        pontos: 10,
      },
    ],
  },
];

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

// Popula o conteúdo inicial só em banco vazio. Tudo numa transação: falha parcial não deixa lixo.
async function semear() {
  const { rows } = await pool.query('SELECT EXISTS (SELECT 1 FROM aulas) AS tem_conteudo');
  if (rows[0].tem_conteudo) return;

  await transacao(async (c) => {
    const aulaIds = [];
    for (const aula of AULAS) {
      const {
        rows: [{ id }],
      } = await c.query(
        'INSERT INTO aulas (titulo, ordem, conteudo_html, pontos_conclusao) VALUES ($1, $2, $3, $4) RETURNING id',
        [aula.titulo, aula.ordem, aula.conteudo_html, aula.pontos_conclusao],
      );
      aulaIds.push(id);
      for (const questao of aula.questoes) {
        await c.query(
          `INSERT INTO questoes_aula (aula_id, ${COLUNAS_QUESTAO.join(', ')})
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [id, ...valoresQuestao(questao)],
        );
      }
    }

    for (const questao of TRIVIA_QUESTOES) {
      await c.query(
        `INSERT INTO questoes_trivia (dificuldade, ${COLUNAS_QUESTAO.join(', ')})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [questao.dificuldade, ...valoresQuestao(questao)],
      );
    }

    await c.query(
      `INSERT INTO badges (nome, descricao, tipo_criterio, aula_id) VALUES
        ('Primeiros Passos', 'Concluiu a primeira aula.', 'aula_concluida', $1),
        ('Curioso da Trivia', 'Terminou sua primeira rodada de trivia.', 'primeira_trivia', NULL),
        ('Guardião de Dados', 'Concluiu todas as aulas.', 'todas_aulas', NULL)`,
      [aulaIds[0]],
    );
  });

  logger.info('seed aplicado', { aulas: AULAS.length, trivia: TRIVIA_QUESTOES.length });
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
