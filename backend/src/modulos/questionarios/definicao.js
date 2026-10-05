// Textos dos questionários da pesquisa (única fonte: o front recebe tudo pelo GET /api/questionarios/:momento).
// Base: docs/questionario-pesquisa.txt. `versao` só invalida o rascunho salvo no aparelho: suba ao mudar
// texto, opção ou ordem de opção.
//
// Codificação gravada (questionario_respostas.valor): escala = 1..N (posição do rótulo); "Não vi / não usei" = 0;
// `opcoes` = 0..N-1 na ordem listada; aberta = o texto; múltipla escolha = uma linha por opção marcada.
// Final _R = item invertido (só na análise). Mudar a ordem de `opcoes` muda o significado dos dados já gravados.
// `se`: o bloco/item só aparece quando a resposta de `item` é `igual`. `sePre` (só no pós): a condição
// olha a resposta do pré; o servidor resolve antes de enviar a definição.

const E5 = [
  'Discordo totalmente',
  'Discordo',
  'Nem concordo nem discordo',
  'Concordo',
  'Concordo totalmente',
];
const E7 = [
  'Discordo totalmente',
  'Discordo',
  'Discordo parcialmente',
  'Nem concordo nem discordo',
  'Concordo parcialmente',
  'Concordo',
  'Concordo totalmente',
];
const NAO_LEMBRO = 'Não lembro';
const NAO_USEI = 'Não vi / não usei esse recurso';
const FEZ_TREINAMENTO = { item: 'C1', igual: 0 };

// Verificação de atenção: "Discordo totalmente" = 1 nas duas escalas.
const ATN = {
  codigo: 'ATN',
  texto: 'Para mostrar que está lendo com atenção, marque "Discordo totalmente" nesta frase.',
  meio: true,
};

// Mesmos itens no pré e no pós: a mudança entre os dois momentos é a medida.
const CONHECIMENTO = [
  { codigo: 'K1_R', texto: 'Posso informar minha senha ao suporte de TI se ele pedir por telefone.' },
  {
    codigo: 'K2_R',
    texto: 'Se um e-mail vem do endereço de um colega conhecido, posso clicar no link sem verificar.',
  },
  { codigo: 'K3_R', texto: 'Se aparece um cadeado ao lado do endereço do site, o site é confiável.' },
  {
    codigo: 'K4_R',
    texto: 'Não há problema em postar nas redes sociais uma foto em que aparece meu crachá da empresa.',
  },
  {
    codigo: 'K5_R',
    texto:
      'Uma rede Wi-Fi pública que pede senha (por exemplo, de um café) é segura para acessar o e-mail do trabalho.',
  },
  {
    codigo: 'K6',
    texto: 'Um pen drive achado em lugar público pode instalar vírus se for conectado a um computador.',
  },
  {
    codigo: 'K7',
    texto:
      'Se eu clicar sem querer em um link suspeito, devo avisar a TI mesmo que nada pareça ter acontecido.',
  },
];

const pre = {
  tipo: 'pre',
  versao: 1,
  titulo: 'Boas-vindas à pesquisa',
  // Sem falar de gamificação, pontos ou ranking: o pré não pode sugerir o que se espera do app.
  abertura: [
    'Antes de continuar, responda a um questionário de até 40 perguntas. Leva cerca de 10 minutos.',
    'Não existem respostas certas ou erradas. Suas respostas são usadas só nesta pesquisa e analisadas sem o seu nome.',
  ],
  blocos: [
    {
      id: 'sobre-voce',
      titulo: 'Sobre você',
      itens: [
        {
          codigo: 'A1',
          texto: 'Qual é a sua faixa etária?',
          opcoes: ['18–24', '25–34', '35–44', '45–54', '55 ou mais'],
        },
        {
          codigo: 'A2',
          texto: 'Qual é o seu gênero?',
          opcoes: ['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'],
        },
        {
          codigo: 'A3',
          texto: 'Qual é a sua escolaridade?',
          opcoes: [
            'Até o ensino médio (completo ou não)',
            'Superior incompleto',
            'Superior completo',
            'Pós-graduação',
          ],
        },
        {
          codigo: 'A4',
          texto: 'Em qual área você trabalha?',
          opcoes: [
            'Administrativo',
            'Financeiro ou contábil',
            'Recursos humanos',
            'Comercial ou vendas',
            'Marketing ou comunicação',
            'Jurídico',
            'Atendimento ao cliente',
            'Operações ou logística',
            'Outra',
          ],
        },
        {
          codigo: 'A5',
          texto: 'Com que frequência você joga jogos digitais (celular, computador ou console)?',
          opcoes: [
            'Nunca',
            'Raramente (menos de 1 vez por mês)',
            'Algumas vezes por mês',
            'Algumas vezes por semana',
            'Todos os dias',
          ],
        },
        {
          codigo: 'A6',
          texto:
            'Quais destas plataformas de ensino com pontos, medalhas ou ranking você já usou? Marque todas as que se aplicam.',
          multipla: true,
          exclusiva: 6,
          opcoes: [
            'Duolingo',
            'Kahoot!',
            'Quizizz',
            'Khan Academy',
            'Treinamento da empresa com pontos, medalhas ou ranking',
            'Outra',
            'Nenhuma',
          ],
        },
      ],
    },
    {
      id: 'treinamentos',
      titulo: 'Treinamentos anteriores',
      itens: [
        {
          codigo: 'C1',
          texto:
            'Você já fez algum treinamento de segurança da informação (sobre senhas, golpes por e-mail, proteção de dados etc.), no trabalho, na faculdade ou por conta própria?',
          opcoes: ['Sim', 'Não', NAO_LEMBRO],
        },
        {
          codigo: 'C2',
          texto: 'Há quanto tempo você fez o treinamento mais recente?',
          se: FEZ_TREINAMENTO,
          opcoes: [
            'Menos de 6 meses',
            'Entre 6 meses e 1 ano',
            'Entre 1 e 2 anos',
            'Mais de 2 anos',
            NAO_LEMBRO,
          ],
        },
        {
          codigo: 'C3',
          texto: 'Qual era o formato principal desse treinamento?',
          se: FEZ_TREINAMENTO,
          opcoes: [
            'Vídeo ou curso online',
            'Palestra ou aula presencial',
            'Material para leitura',
            'Simulação de e-mail falso (phishing)',
            'Jogo ou quiz com pontos ou ranking',
            'Outro',
          ],
        },
        {
          codigo: 'C4',
          texto: 'Esse treinamento era obrigatório?',
          se: FEZ_TREINAMENTO,
          opcoes: ['Sim', 'Não', NAO_LEMBRO],
        },
      ],
    },
    {
      id: 'experiencia-treinamento',
      titulo: 'Sua experiência com esse treinamento',
      intro:
        'Pense no treinamento de segurança da informação mais recente que você fez. Nas frases sobre aparência, considere o visual de slides, vídeos, telas ou materiais.',
      se: FEZ_TREINAMENTO,
      escala: E5,
      aleatorio: true,
      itens: [
        {
          codigo: 'FA1',
          texto: 'Fiquei tão envolvido(a) nesse treinamento que esqueci o que acontecia ao meu redor.',
        },
        { codigo: 'FA2', texto: 'Enquanto fazia esse treinamento, o tempo passou sem eu perceber.' },
        { codigo: 'FA3', texto: 'Fiquei totalmente concentrado(a) nesse treinamento.' },
        { codigo: 'PU1_R', texto: 'Eu me senti frustrado(a) durante esse treinamento.' },
        { codigo: 'PU2_R', texto: 'Achei confuso acompanhar esse treinamento.' },
        { codigo: 'PU3_R', texto: 'Fazer esse treinamento foi desgastante.' },
        { codigo: 'AE1', texto: 'O visual desse treinamento era atraente.' },
        { codigo: 'AE2', texto: 'Esse treinamento tinha uma aparência bonita.' },
        { codigo: 'AE3', texto: 'A apresentação desse treinamento (imagens, cores) era agradável.' },
        { codigo: 'RW1', texto: 'Fazer esse treinamento valeu a pena.' },
        { codigo: 'RW2', texto: 'Minha experiência com esse treinamento foi gratificante.' },
        { codigo: 'RW3', texto: 'Eu me senti interessado(a) nesse treinamento.' },
      ],
    },
    {
      id: 'conhecimento',
      titulo: 'Segurança no dia a dia',
      intro: 'Indique o quanto você concorda com cada frase.',
      escala: E5,
      aleatorio: true,
      itens: CONHECIMENTO,
    },
    {
      id: 'como-voce-e',
      titulo: 'Como você é',
      aviso: 'Atenção: a partir daqui a escala tem 7 pontos.',
      intro: 'Indique o quanto você concorda que cada frase descreve você.',
      escala: E7,
      aleatorio: true,
      itens: [
        { codigo: 'HXP1', texto: 'Sinto-me feliz se sou capaz de ajudar os outros.' },
        { codigo: 'HXP4', texto: 'O bem-estar dos demais é importante para mim.' },
        { codigo: 'HXS2', texto: 'Gosto de fazer parte de uma equipe.' },
        { codigo: 'HXS4', texto: 'Gosto de atividades em grupo.' },
        { codigo: 'HXA2', texto: 'Gosto de dominar tarefas difíceis.' },
        ATN,
        { codigo: 'HXA4', texto: 'Gosto de sair vitorioso(a) de circunstâncias difíceis.' },
        { codigo: 'HXR2', texto: 'Recompensas são uma ótima forma de me motivar.' },
        { codigo: 'HXR4', texto: 'Se a recompensa for suficiente, farei o esforço.' },
        { codigo: 'HXF1', texto: 'É importante para mim seguir meu próprio caminho.' },
        { codigo: 'HXF3', texto: 'Ser independente é importante para mim.' },
      ],
    },
  ],
};

const pos = {
  tipo: 'pos',
  versao: 1,
  titulo: 'Questionário final',
  // Aviso de resposta única, mostrado em destaque na abertura (antes de começar).
  aviso:
    'Você só pode responder este questionário uma vez. Responda quando já tiver usado o app o suficiente para dar sua opinião. Sua resposta ajuda muito a pesquisa.',
  abertura: [
    'Agradecemos pela sua participação na pesquisa! Falta só o questionário final: com ele avaliamos o resultado do estudo.',
    'São cerca de 30 perguntas e leva uns 10 minutos.',
    'Não existem respostas certas ou erradas, e críticas ajudam tanto quanto elogios. Suas respostas são usadas só nesta pesquisa e analisadas sem o seu nome.',
  ],
  blocos: [
    {
      id: 'experiencia-app',
      titulo: 'Sua experiência com o app',
      intro:
        'Pense nas vezes em que usou o Guardião Impacta nas últimas semanas. Nas frases sobre aparência, considere o visual das telas. Se usou pouco, responda pelo que viu.',
      escala: E5,
      aleatorio: true,
      itens: [
        { codigo: 'FA1', texto: 'Fiquei tão envolvido(a) no app que esqueci o que acontecia ao meu redor.' },
        { codigo: 'FA2', texto: 'Enquanto usava o app, o tempo passou sem eu perceber.' },
        { codigo: 'FA3', texto: 'Fiquei totalmente concentrado(a) usando o app.' },
        { codigo: 'PU1_R', texto: 'Eu me senti frustrado(a) usando o app.' },
        { codigo: 'PU2_R', texto: 'Achei confuso usar o app.' },
        { codigo: 'PU3_R', texto: 'Usar o app foi desgastante.' },
        { codigo: 'AE1', texto: 'O visual do app era atraente.' },
        { codigo: 'AE2', texto: 'O app tinha uma aparência bonita.' },
        { codigo: 'AE3', texto: 'A apresentação do app (imagens, cores) era agradável.' },
        { codigo: 'RW1', texto: 'Usar o app valeu a pena.' },
        { codigo: 'RW2', texto: 'Minha experiência com o app foi gratificante.' },
        { codigo: 'RW3', texto: 'Eu me senti interessado(a) usando o app.' },
      ],
    },
    {
      id: 'recursos',
      titulo: 'Sobre os recursos do app',
      intro:
        'Indique o quanto você concorda com cada frase. Se não viu ou não usou o recurso, marque essa opção.',
      escala: E5,
      aleatorio: true,
      itens: [
        { codigo: 'GAM1', texto: 'Os pontos me motivaram a responder mais perguntas.', naoUsei: NAO_USEI },
        { codigo: 'GAM2', texto: 'O ranking me fez querer voltar ao app.', naoUsei: NAO_USEI },
        {
          codigo: 'GAM3',
          texto: 'As conquistas me deram vontade de completar mais aulas.',
          naoUsei: NAO_USEI,
        },
        { codigo: 'GAM4', texto: 'As explicações depois de cada resposta me ajudaram a aprender.' },
        ATN,
        {
          codigo: 'GAM5',
          texto: 'Comparar minha pontuação com a dos colegas me deixou desconfortável.',
          naoUsei: NAO_USEI,
        },
        {
          codigo: 'GAM6_R',
          texto: 'Pontos, conquistas e ranking não fizeram diferença na forma como usei o app.',
        },
        { codigo: 'EXT', texto: 'Usei o app mais pela pontuação do que pelo conteúdo.' },
        {
          codigo: 'APR1',
          texto: 'Depois de usar o app, eu me sinto mais preparado(a) para reconhecer golpes digitais.',
        },
      ],
    },
    {
      id: 'motivacao',
      titulo: 'O que mais motivou você',
      itens: [
        {
          codigo: 'MOT',
          texto: 'Qual destes recursos mais motivou você a usar o app?',
          opcoes: [
            'Pontos',
            'Conquistas',
            'Ranking',
            'Trivia',
            'Explicações depois das respostas',
            'Nenhum deles',
          ],
        },
      ],
    },
    {
      id: 'conhecimento',
      titulo: 'Segurança no dia a dia',
      intro:
        'Estas frases são as mesmas do início, de propósito: queremos ver se algo mudou. Responda pelo que você pensa hoje.',
      escala: E5,
      aleatorio: true,
      itens: CONHECIMENTO,
    },
    {
      // Só para quem disse "Sim" em C1 no pré. Fica depois da UES e do conhecimento para não ancorá-los.
      id: 'comparacao',
      titulo: 'Comparação',
      sePre: FEZ_TREINAMENTO,
      itens: [
        {
          codigo: 'CMP',
          texto:
            'No geral, comparando com o treinamento de segurança da informação mais recente que você fez antes (curso online, palestra sobre golpes ou senhas etc.), o Guardião Impacta foi:',
          opcoes: [
            'Muito pior',
            'Pior',
            'Igual',
            'Melhor',
            'Muito melhor',
            'Não lembro o suficiente para comparar',
          ],
        },
      ],
    },
    {
      id: 'para-terminar',
      titulo: 'Para terminar (opcional)',
      intro: 'Não escreva nomes, e-mails ou outros dados que identifiquem você ou outras pessoas.',
      // max em caracteres (code points: emoji conta 1).
      itens: [
        { codigo: 'ABR2', texto: 'O que você mudaria no app?', aberta: true, opcional: true, max: 2000 },
        { codigo: 'ABR1', texto: 'O que você mais gostou no app?', aberta: true, opcional: true, max: 2000 },
      ],
    },
  ],
};

module.exports = { pre, pos };
