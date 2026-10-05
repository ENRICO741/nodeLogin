// Definições pequenas no formato do GET /api/questionarios/:tipo, com cada tipo de item.
const E3 = ['Discordo', 'Neutro', 'Concordo'];

export const DEFINICAO_PRE = {
  tipo: 'pre',
  versao: 1,
  titulo: 'Boas-vindas à pesquisa',
  abertura: [
    'Obrigado por se inscrever na nossa pesquisa! Leva cerca de 10 minutos.',
    'Não existem respostas certas ou erradas.',
  ],
  blocos: [
    {
      id: 'perfil',
      titulo: 'Sobre você',
      itens: [
        { codigo: 'A1', texto: 'Qual é a sua faixa etária?', opcoes: ['18–24', '25–34'] },
        {
          codigo: 'A6',
          texto: 'Quais plataformas você já usou?',
          opcoes: ['Duolingo', 'Kahoot!', 'Nenhuma'],
          multipla: true,
          exclusiva: 2,
        },
        { codigo: 'C1', texto: 'Você já fez treinamento?', opcoes: ['Sim', 'Não', 'Não lembro'] },
        {
          codigo: 'C2',
          texto: 'Há quanto tempo?',
          opcoes: ['Menos de 6 meses', 'Mais de 6 meses'],
          se: { item: 'C1', igual: 0 },
        },
      ],
    },
    {
      id: 'ues',
      titulo: 'Sua experiência com esse treinamento',
      intro: 'Pense no treinamento mais recente.',
      escala: E3,
      se: { item: 'C1', igual: 0 },
      itens: [
        { codigo: 'FA1', texto: 'Fiquei envolvido(a).' },
        { codigo: 'FA2', texto: 'O tempo passou rápido.' },
      ],
    },
    {
      id: 'hexad',
      titulo: 'Como você é',
      aviso: 'Atenção: a partir daqui a escala tem 7 pontos.',
      escala: E3,
      aleatorio: true,
      itens: [
        { codigo: 'HX1', texto: 'Gosto de ajudar.' },
        { codigo: 'ATN', texto: 'Marque "Neutro" nesta frase.', meio: true },
        { codigo: 'HX2', texto: 'Gosto de equipes.' },
        { codigo: 'HX3', texto: 'Gosto de desafios.' },
      ],
    },
    {
      id: 'final',
      titulo: 'Para terminar',
      escala: E3,
      itens: [
        { codigo: 'GAM1', texto: 'As medalhas me motivaram.', naoUsei: 'Não vi / não usei esse recurso' },
        { codigo: 'ABR1', texto: 'Algo mais?', aberta: true, opcional: true, max: 2000 },
      ],
    },
  ],
};

export const DEFINICAO_POS = {
  tipo: 'pos',
  versao: 1,
  titulo: 'Questionário final',
  aviso: 'Você só pode responder este questionário uma vez.',
  abertura: ['Agradecemos pela sua participação na pesquisa!'],
  blocos: [
    {
      id: 'app',
      titulo: 'Sua experiência com o app',
      escala: E3,
      itens: [{ codigo: 'FA1', texto: 'Fiquei envolvido(a) no app.' }],
    },
  ],
};
