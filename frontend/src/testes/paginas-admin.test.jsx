import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN, erroApi, renderizarApp, sequencia, USUARIO } from './utils';

const comoAdmin = (caminho, rotas) => renderizarApp(caminho, { usuario: ADMIN, rotas });

const QUESTAO = {
  id: 'q1',
  enunciado: 'E-mail pede senha. O que fazer?',
  alternativa_a: 'Responder',
  alternativa_b: 'Reportar',
  alternativa_c: 'Ignorar',
  alternativa_d: 'Encaminhar',
  resposta_correta: 'b',
  explicacao: null,
  pontos: 10,
  imagem_url: null,
  ativo: true,
};
const AULA_ADMIN = {
  id: 'a1',
  titulo: 'Phishing',
  ordem: 1,
  conteudo_html: '<p>x</p>',
  pontos_conclusao: 20,
  ativo: true,
  questoes: [QUESTAO, { ...QUESTAO, id: 'q2', enunciado: 'Inativa?', ativo: false }],
};

async function preencherQuestao({ enunciado = 'Nova pergunta?', correta = 'c', imagem } = {}) {
  await userEvent.type(screen.getByLabelText('Enunciado'), enunciado);
  for (const letra of ['A', 'B', 'C', 'D'])
    await userEvent.type(screen.getByLabelText(`Alternativa ${letra}`), `Opção ${letra}`);
  await userEvent.selectOptions(screen.getByLabelText('Resposta correta'), correta);
  if (imagem) await userEvent.type(screen.getByLabelText('Imagem (opcional)'), imagem);
}

// Rota que só responde quando o teste chamar liberar(valor).
function pendente() {
  let liberar;
  const rota = () =>
    new Promise((resolver) => {
      liberar = resolver;
    });
  return { rota, liberar: (valor) => act(async () => liberar(valor)) };
}

describe('acesso à área admin', () => {
  it.each(['/admin/estatisticas', '/admin/usuarios'])(
    'usuário comum em %s é mandado para as aulas sem chamar a API de admin',
    async (caminho) => {
      const { servidor } = await renderizarApp(caminho, { usuario: USUARIO, rotas: { 'GET /aulas': [] } });
      expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
      expect(servidor.mock.calls.filter(([url]) => url.startsWith('/api/admin'))).toEqual([]);
    },
  );

  it('painel lista as seções com links', async () => {
    await comoAdmin('/admin');
    expect(screen.getByRole('heading', { name: 'Administração' })).toBeInTheDocument();
    for (const [nome, href] of [
      [/Estatísticas/, '/admin/estatisticas'],
      [/Criar e editar aulas/, '/admin/aulas'],
      [/Questões de trivia/, '/admin/trivia'],
      [/Acesso de administrador e redefinição/, '/admin/usuarios'],
    ]) {
      expect(screen.getByRole('link', { name: nome })).toHaveAttribute('href', href);
    }
    // voltar e a aba levam ao mesmo lugar
    for (const link of screen.getAllByRole('link', { name: 'Perfil' }))
      expect(link).toHaveAttribute('href', '/perfil');
  });
});

describe('Estatísticas', () => {
  const vazio = {
    aulas: [],
    questoesAula: [],
    usuariosAula: [],
    trivia: [],
    questoesTrivia: [],
    usuariosTrivia: [],
  };

  it('formata duração e percentual; sem dados mostra aviso por tabela', async () => {
    await comoAdmin('/admin/estatisticas', {
      'GET /admin/estatisticas': {
        ...vazio,
        aulas: [
          {
            aula_id: 'a1',
            titulo: 'Phishing',
            total_tentativas: 4,
            total_concluidas: 3,
            duracao_media_ms: 125_000,
            total_respostas: 8,
            total_acertos: 6,
          },
          {
            aula_id: 'a2',
            titulo: 'Senhas',
            total_tentativas: 0,
            total_concluidas: 0,
            duracao_media_ms: null,
            total_respostas: 0,
            total_acertos: 0,
          },
        ],
        trivia: [
          {
            dificuldade: 'dificil',
            total_tentativas: 1,
            total_concluidas: 1,
            duracao_media_ms: 0,
            total_respostas: 3,
            total_acertos: 1,
          },
        ],
        usuariosTrivia: [
          {
            apelido: 'maria',
            dificuldade: 'media',
            total_tentativas: 2,
            duracao_media_ms: 61_000,
            total_respostas: 4,
            total_acertos: 4,
          },
        ],
      },
    });
    const porAula = await screen.findByRole('table', { name: 'Por aula' });
    const [, linha1, linha2] = within(porAula).getAllByRole('row');
    expect(
      within(linha1)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['Phishing', '4', '3', '2m 5s', '75%']);
    expect(
      within(linha2)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['Senhas', '0', '0', '—', '—']);

    const trivia = screen.getByRole('table', { name: 'Por dificuldade' });
    expect(within(trivia).getByText('Difícil')).toBeInTheDocument();
    expect(within(trivia).getByText('0m 0s')).toBeInTheDocument();
    expect(within(trivia).getByText('33%')).toBeInTheDocument();

    expect(
      within(screen.getAllByRole('table', { name: 'Por usuário' })[1]).getByText('100%'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Sem dados ainda.')).toHaveLength(3);
  });

  it('tabelas por questão e por usuário mostram enunciado, contexto e acerto', async () => {
    await comoAdmin('/admin/estatisticas', {
      'GET /admin/estatisticas': {
        ...vazio,
        questoesAula: [
          {
            questao_id: 'q1',
            enunciado: 'Pergunta longa?',
            aula_titulo: 'Phishing',
            total_respostas: 5,
            total_acertos: 2,
          },
        ],
        usuariosAula: [
          {
            apelido: 'maria',
            aula_titulo: 'Phishing',
            total_tentativas: 1,
            duracao_media_ms: 30_500,
            total_respostas: 2,
            total_acertos: 1,
          },
        ],
        questoesTrivia: [
          {
            questao_id: 't1',
            enunciado: 'Trivia?',
            dificuldade: 'facil',
            total_respostas: 0,
            total_acertos: 0,
          },
        ],
      },
    });
    const [qAula, qTrivia] = await screen.findAllByRole('table', { name: 'Por questão' });
    expect(
      within(qAula)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['Pergunta longa?', 'Phishing', '5', '40%']);
    expect(
      within(qTrivia)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['Trivia?', 'Fácil', '0', '—']);
    const [uAula] = screen.getAllByRole('table', { name: 'Por usuário' });
    expect(
      within(uAula)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['maria', 'Phishing', '1', '0m 31s', '50%']);
  });

  it('erro de carregamento', async () => {
    await comoAdmin('/admin/estatisticas', {
      'GET /admin/estatisticas': erroApi(403, 'PROIBIDO', 'Acesso não permitido'),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso não permitido');
  });
});

describe('Aulas (admin)', () => {
  it('lista com status inativa e cria aula nova indo para a edição', async () => {
    const { servidor } = await comoAdmin('/admin/aulas', {
      'GET /admin/aulas': [
        { id: 'a1', titulo: 'Phishing', ordem: 1, pontos_conclusao: 20, total_questoes: 2, ativo: true },
        { id: 'a2', titulo: 'Antiga', ordem: 2, pontos_conclusao: 10, total_questoes: 0, ativo: false },
      ],
      'POST /admin/aulas': { status: 201, corpo: { id: 'nova' } },
      'GET /admin/aulas/nova': { ...AULA_ADMIN, id: 'nova', titulo: 'Engenharia social', questoes: [] },
    });
    expect(await screen.findByText('Inativa')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Nova aula/ }));
    expect(screen.getByLabelText('Ordem')).toHaveValue(3);
    await userEvent.type(screen.getByLabelText('Título'), 'Engenharia social');
    await userEvent.type(screen.getByLabelText('Conteúdo (HTML)'), '<p>Cuidado</p>');
    await userEvent.click(screen.getByRole('button', { name: 'Criar aula' }));
    expect(await screen.findByRole('heading', { name: 'Engenharia social' })).toBeInTheDocument();
    expect(servidor.enviados('POST /admin/aulas')[0]).toEqual({
      titulo: 'Engenharia social',
      ordem: 3,
      pontos_conclusao: 20,
      conteudo_html: '<p>Cuidado</p>',
    });
  });

  it('lista vazia e erro de validação ao criar', async () => {
    await comoAdmin('/admin/aulas', {
      'GET /admin/aulas': [],
      'POST /admin/aulas': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
        { campo: 'titulo', mensagem: 'Título obrigatório' },
      ]),
    });
    expect(await screen.findByText('Nenhuma aula cadastrada')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Nova aula/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar aula' }));
    expect(await screen.findByText('Título obrigatório')).toBeInTheDocument();
  });

  it('erro ao carregar lista', async () => {
    await comoAdmin('/admin/aulas', { 'GET /admin/aulas': erroApi(500, 'E', 'Falhou') });
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
  });
});

describe('Editar aula (admin)', () => {
  const rotas = (extra = {}) => ({
    'GET /admin/aulas/a1': AULA_ADMIN,
    'PATCH /admin/aulas/a1': ({ corpo }) => ({ ...AULA_ADMIN, ...corpo }),
    ...extra,
  });

  it('salva a aula e mostra confirmação; ordem repetida mostra erro', async () => {
    const { servidor } = await comoAdmin(
      '/admin/aulas/a1',
      rotas({
        'PATCH /admin/aulas/a1': sequencia(
          ({ corpo }) => ({ ...AULA_ADMIN, ...corpo }),
          erroApi(409, 'CONFLITO', 'Já existe uma aula com essa ordem'),
        ),
      }),
    );
    const titulo = await screen.findByLabelText('Título');
    await userEvent.clear(titulo);
    await userEvent.type(titulo, 'Phishing 2.0');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar aula' }));
    expect(await screen.findByText('Aula salva.')).toBeInTheDocument();
    expect(servidor.enviados('PATCH /admin/aulas/a1')[0]).toMatchObject({
      titulo: 'Phishing 2.0',
      ordem: 1,
      pontos_conclusao: 20,
    });
    // O cabeçalho mostra o título salvo sem recarregar a página.
    expect(screen.getByRole('heading', { level: 1, name: 'Phishing 2.0' })).toBeInTheDocument();
    expect(servidor.enviados('GET /admin/aulas/a1')).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Salvar aula' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma aula com essa ordem');
    expect(screen.queryByText('Aula salva.')).not.toBeInTheDocument();
  });

  it('desativar e reativar a aula', async () => {
    const { servidor } = await comoAdmin(
      '/admin/aulas/a1',
      rotas({
        'GET /admin/aulas/a1': sequencia(AULA_ADMIN, { ...AULA_ADMIN, ativo: false }, AULA_ADMIN),
        'DELETE /admin/aulas/a1': { status: 204 },
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar aula' }));
    expect(await screen.findByText('Aula inativa: não aparece para os usuários.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reativar aula' }));
    await waitFor(() => expect(servidor.enviados('PATCH /admin/aulas/a1')).toEqual([{ ativo: true }]));
  });

  it('bônus vazio envia null e mostra o erro do campo vindo da API', async () => {
    const { servidor } = await comoAdmin(
      '/admin/aulas/a1',
      rotas({
        'PATCH /admin/aulas/a1': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
          { campo: 'pontos_conclusao', mensagem: 'Informe o bônus' },
        ]),
      }),
    );
    await userEvent.clear(await screen.findByLabelText('Bônus de conclusão (pts)'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar aula' }));
    expect(await screen.findByText('Informe o bônus')).toBeInTheDocument();
    expect(servidor.enviados('PATCH /admin/aulas/a1')[0].pontos_conclusao).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Phishing' })).toBeInTheDocument();
  });

  it('erro ao desativar a aula aparece e o botão fica desabilitado durante a chamada', async () => {
    const remover = pendente();
    await comoAdmin('/admin/aulas/a1', rotas({ 'DELETE /admin/aulas/a1': remover.rota }));
    const botao = await screen.findByRole('button', { name: 'Desativar aula' });
    await userEvent.click(botao);
    expect(botao).toBeDisabled();
    await remover.liberar(erroApi(500, 'ERRO_INTERNO', 'Falhou ao desativar'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou ao desativar');
    expect(botao).toBeEnabled();
  });

  it('adiciona pergunta com os tipos certos e recarrega', async () => {
    const { servidor } = await comoAdmin(
      '/admin/aulas/a1',
      rotas({ 'POST /admin/aulas/a1/questoes': { status: 201, corpo: QUESTAO } }),
    );
    await userEvent.click(await screen.findByRole('button', { name: /Nova pergunta/ }));
    await preencherQuestao({ imagem: 'https://x.com/a.png' });
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar pergunta' }));
    await waitFor(() => expect(servidor.enviados('POST /admin/aulas/a1/questoes')).toHaveLength(1));
    expect(servidor.enviados('POST /admin/aulas/a1/questoes')[0]).toEqual({
      enunciado: 'Nova pergunta?',
      alternativa_a: 'Opção A',
      alternativa_b: 'Opção B',
      alternativa_c: 'Opção C',
      alternativa_d: 'Opção D',
      resposta_correta: 'c',
      explicacao: null,
      pontos: 10,
      imagem_url: 'https://x.com/a.png',
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Adicionar pergunta' })).not.toBeInTheDocument(),
    );
    expect(servidor.enviados('GET /admin/aulas/a1')).toHaveLength(2);
  });

  it('cancelar nova pergunta fecha o formulário; erro de imagem aparece no campo', async () => {
    await comoAdmin(
      '/admin/aulas/a1',
      rotas({
        'POST /admin/aulas/a1/questoes': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
          { campo: 'imagem_url', mensagem: 'Use uma URL https://' },
        ]),
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: /Nova pergunta/ }));
    await preencherQuestao({ imagem: 'http://x.com/a.png' });
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar pergunta' }));
    expect(await screen.findByText('Use uma URL https://')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Enunciado')).not.toBeInTheDocument();
  });

  it('edita, desativa e reativa perguntas existentes', async () => {
    const { servidor } = await comoAdmin(
      '/admin/aulas/a1',
      rotas({
        'PATCH /admin/questoes-aula/q1': ({ corpo }) => ({ ...QUESTAO, ...corpo }),
        'DELETE /admin/questoes-aula/q1': { status: 204 },
        'PATCH /admin/questoes-aula/q2': { ...QUESTAO, id: 'q2' },
      }),
    );
    const [ativa, inativa] = within(await screen.findByRole('region', { name: 'Perguntas' })).getAllByRole(
      'listitem',
    );
    expect(within(ativa).getByText('Resposta B · 10 pts')).toBeInTheDocument();

    await userEvent.click(within(ativa).getByRole('button', { name: 'Editar' }));
    const pontos = screen.getByLabelText('Pontos');
    await userEvent.clear(pontos);
    await userEvent.type(pontos, '25');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar questão' }));
    await waitFor(() =>
      expect(servidor.enviados('PATCH /admin/questoes-aula/q1')[0]).toMatchObject({ pontos: 25 }),
    );

    const itens = within(screen.getByRole('region', { name: 'Perguntas' })).getAllByRole('listitem');
    await userEvent.click(within(itens[0]).getByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(servidor.enviados('DELETE /admin/questoes-aula/q1')).toHaveLength(1));
    await userEvent.click(within(inativa).getByRole('button', { name: 'Reativar' }));
    await waitFor(() =>
      expect(servidor.enviados('PATCH /admin/questoes-aula/q2')).toEqual([{ ativo: true }]),
    );
  });

  it('pontos vazio envia null e o erro do campo aparece', async () => {
    const { servidor } = await comoAdmin(
      '/admin/aulas/a1',
      rotas({
        'PATCH /admin/questoes-aula/q1': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
          { campo: 'pontos', mensagem: 'Informe os pontos' },
        ]),
      }),
    );
    const [ativa] = within(await screen.findByRole('region', { name: 'Perguntas' })).getAllByRole('listitem');
    await userEvent.click(within(ativa).getByRole('button', { name: 'Editar' }));
    await userEvent.clear(screen.getByLabelText('Pontos'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar questão' }));
    expect(await screen.findByText('Informe os pontos')).toBeInTheDocument();
    expect(servidor.enviados('PATCH /admin/questoes-aula/q1')[0].pontos).toBeNull();
  });

  it('erro ao desativar pergunta aparece no item; o botão fica desabilitado durante a chamada', async () => {
    const remover = pendente();
    await comoAdmin('/admin/aulas/a1', rotas({ 'DELETE /admin/questoes-aula/q1': remover.rota }));
    const [ativa] = within(await screen.findByRole('region', { name: 'Perguntas' })).getAllByRole('listitem');
    const botao = within(ativa).getByRole('button', { name: 'Desativar' });
    await userEvent.click(botao);
    expect(botao).toBeDisabled();
    await remover.liberar(erroApi(500, 'ERRO_INTERNO', 'Falhou ao desativar'));
    expect(await within(ativa).findByRole('alert')).toHaveTextContent('Falhou ao desativar');
    expect(botao).toBeEnabled();
  });

  it('cancelar edição de pergunta volta para a lista', async () => {
    await comoAdmin('/admin/aulas/a1', rotas());
    const [ativa] = within(await screen.findByRole('region', { name: 'Perguntas' })).getAllByRole('listitem');
    await userEvent.click(within(ativa).getByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(2);
  });

  it('aula sem perguntas e aula inexistente', async () => {
    await comoAdmin('/admin/aulas/a1', rotas({ 'GET /admin/aulas/a1': { ...AULA_ADMIN, questoes: [] } }));
    expect(await screen.findByText('Esta aula ainda não tem perguntas')).toBeInTheDocument();
  });

  it('aula inexistente mostra erro', async () => {
    await comoAdmin('/admin/aulas/zz', {
      'GET /admin/aulas/zz': erroApi(404, 'NAO_ENCONTRADO', 'Aula não encontrada'),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Aula não encontrada');
  });
});

describe('Questões de trivia (admin)', () => {
  const AULAS_TRIVIA = [
    { id: 'a1', ordem: 1, titulo: 'Introdução à LGPD', ativo: true },
    { id: 'a2', ordem: 2, titulo: 'O que estamos protegendo', ativo: true },
  ];
  const LISTA = [
    { ...QUESTAO, id: 't1', dificuldade: 'facil', aula_referencia_id: 'a1' },
    {
      ...QUESTAO,
      id: 't2',
      dificuldade: 'dificil',
      ativo: false,
      enunciado: 'Desativada?',
      aula_referencia_id: 'a2',
    },
  ];

  it('mostra a aula de cada questão e a edição já vem com ela escolhida', async () => {
    const { servidor } = await comoAdmin('/admin/trivia', {
      'GET /admin/aulas': AULAS_TRIVIA,
      'GET /admin/questoes-trivia': LISTA,
      'PATCH /admin/questoes-trivia/t1': {},
    });
    const facil = await screen.findByRole('region', { name: /Fácil/ });
    expect(within(facil).getByText(/Aula 01\. Introdução à LGPD/)).toBeInTheDocument();
    await userEvent.click(within(facil).getByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('Aula')).toHaveValue('a1');
    await userEvent.selectOptions(screen.getByLabelText('Aula'), 'a2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar questão' }));
    await waitFor(() =>
      expect(servidor.enviados('PATCH /admin/questoes-trivia/t1')[0]).toMatchObject({
        aula_referencia_id: 'a2',
      }),
    );
  });

  it('criar sem escolher a aula mostra o erro do campo vindo da API', async () => {
    const { servidor } = await comoAdmin('/admin/trivia', {
      'GET /admin/aulas': AULAS_TRIVIA,
      'GET /admin/questoes-trivia': LISTA,
      'POST /admin/questoes-trivia': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
        { campo: 'aula_referencia_id', mensagem: 'Escolha a aula da questão' },
      ]),
    });
    await userEvent.click(await screen.findByRole('button', { name: /Nova questão/ }));
    expect(screen.getByLabelText('Aula')).toHaveValue('');
    await preencherQuestao();
    await userEvent.click(screen.getByRole('button', { name: 'Criar questão' }));
    expect(await screen.findByText('Escolha a aula da questão')).toBeInTheDocument();
    expect(servidor.enviados('POST /admin/questoes-trivia')[0].aula_referencia_id).toBe('');
  });

  it('erro ao carregar as aulas mostra "Tentar de novo"', async () => {
    await comoAdmin('/admin/trivia', {
      'GET /admin/aulas': erroApi(500, 'ERRO_INTERNO', 'Falhou'),
      'GET /admin/questoes-trivia': LISTA,
    });
    expect(await screen.findByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument();
  });

  it('agrupa por dificuldade com contagem de ativas e nível vazio', async () => {
    await comoAdmin('/admin/trivia', {
      'GET /admin/aulas': AULAS_TRIVIA,
      'GET /admin/questoes-trivia': LISTA,
    });
    const facil = await screen.findByRole('region', { name: /Fácil/ });
    expect(within(facil).getByText('1 ativas')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: /Média/ })).getByText('Nenhuma questão neste nível'),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /Difícil/ })).getByText(/inativa/)).toBeInTheDocument();
  });

  it('cria questão com dificuldade e aula escolhidas ("NN. título")', async () => {
    const { servidor } = await comoAdmin('/admin/trivia', {
      'GET /admin/aulas': AULAS_TRIVIA,
      'GET /admin/questoes-trivia': LISTA,
      'POST /admin/questoes-trivia': { status: 201, corpo: {} },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Nova questão/ }));
    await userEvent.selectOptions(screen.getByLabelText('Dificuldade'), 'media');
    expect(screen.getByRole('option', { name: '02. O que estamos protegendo' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Aula'), 'a2');
    await preencherQuestao();
    await userEvent.click(screen.getByRole('button', { name: 'Criar questão' }));
    await waitFor(() =>
      expect(servidor.enviados('POST /admin/questoes-trivia')[0]).toMatchObject({
        dificuldade: 'media',
        aula_referencia_id: 'a2',
        resposta_correta: 'c',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Criar questão' })).not.toBeInTheDocument(),
    );
  });

  it('cancelar criação fecha o formulário', async () => {
    await comoAdmin('/admin/trivia', {
      'GET /admin/aulas': AULAS_TRIVIA,
      'GET /admin/questoes-trivia': LISTA,
    });
    await userEvent.click(await screen.findByRole('button', { name: /Nova questão/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: /Nova questão/ })).toBeInTheDocument();
  });

  it('edita, desativa e reativa', async () => {
    const { servidor } = await comoAdmin('/admin/trivia', {
      'GET /admin/aulas': AULAS_TRIVIA,
      'GET /admin/questoes-trivia': LISTA,
      'PATCH /admin/questoes-trivia/t1': {},
      'DELETE /admin/questoes-trivia/t1': { status: 204 },
      'PATCH /admin/questoes-trivia/t2': {},
    });
    const facil = await screen.findByRole('region', { name: /Fácil/ });
    await userEvent.click(within(facil).getByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('Dificuldade')).toHaveValue('facil');
    await userEvent.selectOptions(screen.getByLabelText('Dificuldade'), 'dificil');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar questão' }));
    await waitFor(() =>
      expect(servidor.enviados('PATCH /admin/questoes-trivia/t1')[0]).toMatchObject({
        dificuldade: 'dificil',
      }),
    );

    await userEvent.click(
      within(await screen.findByRole('region', { name: /Fácil/ })).getByRole('button', { name: 'Desativar' }),
    );
    await userEvent.click(
      within(screen.getByRole('region', { name: /Difícil/ })).getByRole('button', { name: 'Reativar' }),
    );
    await waitFor(() => {
      expect(servidor.enviados('DELETE /admin/questoes-trivia/t1')).toHaveLength(1);
      expect(servidor.enviados('PATCH /admin/questoes-trivia/t2')).toEqual([{ ativo: true }]);
    });
  });

  it('erro ao reativar aparece no item; o botão fica desabilitado durante a chamada', async () => {
    const reativar = pendente();
    await comoAdmin('/admin/trivia', {
      'GET /admin/aulas': AULAS_TRIVIA,
      'GET /admin/questoes-trivia': LISTA,
      'PATCH /admin/questoes-trivia/t2': reativar.rota,
    });
    const dificil = await screen.findByRole('region', { name: /Difícil/ });
    const botao = within(dificil).getByRole('button', { name: 'Reativar' });
    await userEvent.click(botao);
    expect(botao).toBeDisabled();
    await reativar.liberar(erroApi(500, 'ERRO_INTERNO', 'Falhou ao reativar'));
    expect(await within(dificil).findByRole('alert')).toHaveTextContent('Falhou ao reativar');
    expect(botao).toBeEnabled();
  });

  it('pontos vazio em questão de trivia envia null', async () => {
    const { servidor } = await comoAdmin('/admin/trivia', {
      'GET /admin/aulas': AULAS_TRIVIA,
      'GET /admin/questoes-trivia': LISTA,
      'PATCH /admin/questoes-trivia/t1': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
        { campo: 'pontos', mensagem: 'Informe os pontos' },
      ]),
    });
    const facil = await screen.findByRole('region', { name: /Fácil/ });
    await userEvent.click(within(facil).getByRole('button', { name: 'Editar' }));
    await userEvent.clear(screen.getByLabelText('Pontos'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar questão' }));
    expect(await screen.findByText('Informe os pontos')).toBeInTheDocument();
    expect(servidor.enviados('PATCH /admin/questoes-trivia/t1')[0].pontos).toBeNull();
  });

  it('cancelar edição e erro de carregamento', async () => {
    await comoAdmin('/admin/trivia', {
      'GET /admin/aulas': AULAS_TRIVIA,
      'GET /admin/questoes-trivia': LISTA,
    });
    const facil = await screen.findByRole('region', { name: /Fácil/ });
    await userEvent.click(within(facil).getByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(
      within(screen.getByRole('region', { name: /Fácil/ })).getByRole('button', { name: 'Editar' }),
    ).toBeInTheDocument();
  });

  it('erro de carregamento', async () => {
    await comoAdmin('/admin/trivia', {
      'GET /admin/aulas': AULAS_TRIVIA,
      'GET /admin/questoes-trivia': erroApi(500, 'E', 'Falhou'),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
  });
});

describe('Usuários (admin)', () => {
  const MARIA = {
    id: 'u1',
    nome: 'Maria Silva',
    email: 'maria@empresa.com',
    foto_perfil_url: null,
    papel: 'usuario',
  };
  const BRUNO = {
    id: 'b1',
    nome: 'Bruno Lima',
    email: 'bruno@empresa.com',
    foto_perfil_url: null,
    papel: 'admin',
  };
  // A primeira linha é a do admin logado (ADMIN, id a1).
  const LISTA = [
    {
      id: 'a1',
      nome: 'Ana Admin',
      email: 'ana@empresa.com',
      foto_perfil_url: 'https://x.com/ana.png',
      papel: 'admin',
    },
    BRUNO,
    MARIA,
  ];
  const nomes = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((tr) => within(tr).getAllByRole('cell')[1].textContent);
  const caixa = (nome) => screen.getByRole('checkbox', { name: `Administrador: ${nome}` });
  const linha = (nome) => screen.getByRole('cell', { name: nome }).closest('tr');
  const botaoSenha = (nome) => screen.getByRole('button', { name: `Redefinir senha de ${nome}` });
  const formSenha = (nome) => screen.queryByRole('form', { name: `Nova senha de ${nome}` });

  it('lista todos em tabela e filtra por papel', async () => {
    await comoAdmin('/admin/usuarios', { 'GET /admin/usuarios': LISTA });
    expect(await screen.findByText('maria@empresa.com')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Foto',
      'Nome',
      'E-mail',
      'Administrador',
      'Senha',
    ]);
    expect(nomes()).toEqual(['Ana Admin', 'Bruno Lima', 'Maria Silva']);
    expect(caixa('Bruno Lima')).toBeChecked();
    expect(caixa('Maria Silva')).not.toBeChecked();
    for (const th of screen.getAllByRole('columnheader')) expect(th).toHaveAttribute('scope', 'col');
    expect(document.querySelector('img[src="https://x.com/ana.png"]')).toBeInTheDocument();
    // sem foto: a inicial no lugar da imagem
    const linhaMaria = linha('Maria Silva');
    expect(linhaMaria.querySelector('img')).toBeNull();
    expect(within(linhaMaria).getAllByRole('cell')[0].textContent).toBe('M');

    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'admin');
    expect(nomes()).toEqual(['Ana Admin', 'Bruno Lima']);
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'usuario');
    expect(nomes()).toEqual(['Maria Silva']);
  });

  it('a própria linha fica desabilitada, com explicação', async () => {
    await comoAdmin('/admin/usuarios', { 'GET /admin/usuarios': LISTA });
    await screen.findByText('maria@empresa.com');
    expect(caixa('Ana Admin')).toBeDisabled();
    expect(caixa('Ana Admin')).toHaveAccessibleDescription(/não pode alterar o próprio papel/);
    expect(caixa('Maria Silva')).toBeEnabled();
  });

  it('marcar e confirmar dá privilégio de admin', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { servidor } = await comoAdmin('/admin/usuarios', {
      'GET /admin/usuarios': LISTA,
      'PATCH /admin/usuarios/u1': { ...MARIA, papel: 'admin' },
    });
    await screen.findByText('maria@empresa.com');
    await userEvent.click(caixa('Maria Silva'));
    expect(confirmar).toHaveBeenCalledWith(
      'Dar privilégio de administrador a Maria Silva (maria@empresa.com)? Essa pessoa poderá editar o conteúdo e ver estatísticas e dados de todos os usuários.',
    );
    await waitFor(() => expect(caixa('Maria Silva')).toBeChecked());
    expect(servidor.enviados('PATCH /admin/usuarios/u1')).toEqual([{ admin: true }]);
  });

  it('cancelar a confirmação não muda a caixa nem chama a API', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { servidor } = await comoAdmin('/admin/usuarios', { 'GET /admin/usuarios': LISTA });
    await screen.findByText('maria@empresa.com');
    await userEvent.click(caixa('Maria Silva'));
    expect(caixa('Maria Silva')).not.toBeChecked();
    expect(servidor.enviados('PATCH /admin/usuarios/u1')).toHaveLength(0);
  });

  it('desmarcar e confirmar remove o privilégio', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { servidor } = await comoAdmin('/admin/usuarios', {
      'GET /admin/usuarios': LISTA,
      'PATCH /admin/usuarios/b1': { ...BRUNO, papel: 'usuario' },
    });
    await screen.findByText('maria@empresa.com');
    await userEvent.click(caixa('Bruno Lima'));
    expect(confirmar).toHaveBeenCalledWith(
      'Remover o privilégio de administrador de Bruno Lima (bruno@empresa.com)?',
    );
    await waitFor(() => expect(caixa('Bruno Lima')).not.toBeChecked());
    expect(servidor.enviados('PATCH /admin/usuarios/b1')).toEqual([{ admin: false }]);
  });

  it('erro da API mostra aviso e a caixa volta ao estado real', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await comoAdmin('/admin/usuarios', {
      'GET /admin/usuarios': LISTA,
      'PATCH /admin/usuarios/b1': erroApi(409, 'ULTIMO_ADMIN', 'É preciso manter ao menos um administrador'),
    });
    await screen.findByText('maria@empresa.com');
    await userEvent.click(caixa('Bruno Lima'));
    expect(await screen.findByRole('alert')).toHaveTextContent('É preciso manter ao menos um administrador');
    expect(caixa('Bruno Lima')).toBeChecked();
    expect(caixa('Bruno Lima')).toBeEnabled();
  });

  it('enquanto um papel é salvo, as caixas ficam aria-disabled e outro clique não envia nada', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const patch = pendente();
    const { servidor } = await comoAdmin('/admin/usuarios', {
      'GET /admin/usuarios': LISTA,
      'PATCH /admin/usuarios/u1': patch.rota,
      'PATCH /admin/usuarios/b1': { ...BRUNO, papel: 'usuario' },
    });
    await screen.findByText('maria@empresa.com');
    await userEvent.click(caixa('Maria Silva'));
    await waitFor(() => expect(caixa('Bruno Lima')).toHaveAttribute('aria-disabled', 'true'));
    expect(caixa('Maria Silva')).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(caixa('Bruno Lima'));
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(servidor.enviados('PATCH /admin/usuarios/b1')).toHaveLength(0);
    expect(caixa('Bruno Lima')).toBeChecked();

    await patch.liberar({ ...MARIA, papel: 'admin' });
    expect(caixa('Maria Silva')).toBeChecked();
    expect(caixa('Maria Silva')).not.toHaveAttribute('aria-disabled');
    expect(caixa('Bruno Lima')).not.toHaveAttribute('aria-disabled');
    expect(servidor.enviados('PATCH /admin/usuarios/u1')).toEqual([{ admin: true }]);
  });

  it('promovido some do filtro de usuários padrão e aparece entre os administradores', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await comoAdmin('/admin/usuarios', {
      'GET /admin/usuarios': LISTA,
      'PATCH /admin/usuarios/u1': { ...MARIA, papel: 'admin' },
    });
    await screen.findByText('maria@empresa.com');
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'usuario');
    await userEvent.click(caixa('Maria Silva'));
    expect(await screen.findByText('Nenhum usuário neste filtro')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'admin');
    expect(nomes()).toEqual(['Ana Admin', 'Bruno Lima', 'Maria Silva']);
    expect(caixa('Maria Silva')).toBeChecked();
  });

  it('um novo envio de papel apaga o erro anterior', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await comoAdmin('/admin/usuarios', {
      'GET /admin/usuarios': LISTA,
      'PATCH /admin/usuarios/b1': sequencia(erroApi(500, 'E', 'Falhou'), { ...BRUNO, papel: 'usuario' }),
    });
    await screen.findByText('maria@empresa.com');
    await userEvent.click(caixa('Bruno Lima'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
    await userEvent.click(caixa('Bruno Lima'));
    await waitFor(() => expect(caixa('Bruno Lima')).not.toBeChecked());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  async function abrirSenha(rotas = {}) {
    const resultado = await comoAdmin('/admin/usuarios', { 'GET /admin/usuarios': LISTA, ...rotas });
    await userEvent.click(await screen.findByRole('button', { name: 'Redefinir senha de Maria Silva' }));
    return resultado;
  }
  const preencherSenha = async (senha, confirmacao = senha) => {
    await userEvent.type(screen.getByLabelText('Nova senha'), senha);
    await userEvent.type(screen.getByLabelText('Confirme a nova senha'), confirmacao);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  };

  it('redefinir senha: senhas diferentes mostram erro sem chamar a API', async () => {
    const confirmar = vi.spyOn(window, 'confirm');
    const { servidor } = await abrirSenha();
    await preencherSenha('Senha-nova-1', 'Senha-nova-2');
    expect(screen.getByText('As senhas não conferem')).toBeInTheDocument();
    expect(confirmar).not.toHaveBeenCalled();
    expect(servidor.enviados('PUT /admin/usuarios/u1/senha')).toHaveLength(0);
  });

  it('redefinir senha: cancelar a confirmação não chama a API', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { servidor } = await abrirSenha();
    await preencherSenha('Senha-nova-1');
    expect(servidor.enviados('PUT /admin/usuarios/u1/senha')).toHaveLength(0);
    expect(screen.getByLabelText('Nova senha')).toBeInTheDocument();
  });

  it('redefinir senha: erro de campo aparece no campo; sucesso envia a senha e mostra aviso', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { servidor } = await abrirSenha({
      'PUT /admin/usuarios/u1/senha': sequencia(
        erroApi(400, 'VALIDACAO', 'Dados inválidos', [
          { campo: 'senha', mensagem: 'A senha deve ter pelo menos 8 caracteres' },
        ]),
        { status: 204 },
      ),
    });
    await preencherSenha('curta');
    expect(await screen.findByText('A senha deve ter pelo menos 8 caracteres')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Nova senha'));
    await userEvent.clear(screen.getByLabelText('Confirme a nova senha'));
    await preencherSenha('Senha-nova-1');
    expect(confirmar).toHaveBeenLastCalledWith(
      'Definir uma nova senha para Maria Silva? A pessoa será desconectada de todos os aparelhos.',
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Senha de Maria Silva redefinida. Informe a nova senha a essa pessoa.',
    );
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
    expect(servidor.enviados('PUT /admin/usuarios/u1/senha')).toEqual([
      { senha: 'curta' },
      { senha: 'Senha-nova-1' },
    ]);
  });

  it('redefinir senha: mostra os requisitos marcados e avisa sobre emoji', async () => {
    await abrirSenha();
    const form = formSenha('Maria Silva');
    const senha = within(form).getByLabelText('Nova senha');
    expect(senha).toHaveAccessibleDescription(/Uma letra maiúscula: pendente/);
    expect(within(form).getAllByText(': pendente')).toHaveLength(5);
    await userEvent.type(senha, 'Senha-nova-1');
    expect(within(form).getAllByText(': atendido')).toHaveLength(5);
    expect(within(form).queryByText(/Não use emoji/)).not.toBeInTheDocument();
    await userEvent.type(senha, '❤️');
    expect(within(form).getByText(/Não use emoji/)).toBeInTheDocument();
    expect(senha).toHaveAttribute('aria-invalid', 'true');
  });

  it('redefinir senha: corrigir a confirmação apaga o erro e envia uma vez', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const put = pendente();
    const { servidor } = await abrirSenha({ 'PUT /admin/usuarios/u1/senha': put.rota });
    await preencherSenha('Senha-nova-1', 'Senha-nova-2');
    expect(screen.getByText('As senhas não conferem')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Confirme a nova senha'));
    await userEvent.type(screen.getByLabelText('Confirme a nova senha'), 'Senha-nova-1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    // o form segue aberto enquanto o PUT não volta: o erro sumiu de fato, não por desmontar
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeInTheDocument();
    expect(screen.queryByText('As senhas não conferem')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Confirme a nova senha')).not.toHaveAttribute('aria-invalid');
    expect(servidor.enviados('PUT /admin/usuarios/u1/senha')).toEqual([{ senha: 'Senha-nova-1' }]);
    await put.liberar({ status: 204 });
  });

  it('redefinir senha: enquanto salva, o botão fica desabilitado e Enter não reenvia', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const put = pendente();
    const { servidor } = await abrirSenha({ 'PUT /admin/usuarios/u1/senha': put.rota });
    await preencherSenha('Senha-nova-1');
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Confirme a nova senha'), '{Enter}');
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(servidor.enviados('PUT /admin/usuarios/u1/senha')).toHaveLength(1);

    await put.liberar({ status: 204 });
    expect(screen.getByRole('status')).toHaveTextContent('Senha de Maria Silva redefinida');
  });

  it('redefinir senha: erro sem detalhes aparece no form, que volta a aceitar envio', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await abrirSenha({
      'PUT /admin/usuarios/u1/senha': erroApi(404, 'NAO_ENCONTRADO', 'Usuário não encontrado'),
    });
    await preencherSenha('Senha-nova-1');
    const form = formSenha('Maria Silva');
    expect(await within(form).findByRole('alert')).toHaveTextContent('Usuário não encontrado');
    expect(screen.getByLabelText('Nova senha')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Confirme a nova senha')).not.toHaveAttribute('aria-invalid');
    expect(within(form).getByRole('button', { name: 'Salvar' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('redefinir senha: abre com foco no campo; cancelar devolve o foco e descarta o digitado', async () => {
    await abrirSenha();
    const botao = botaoSenha('Maria Silva');
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Nova senha')).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Nova senha'), 'Senha-nova-1');
    await userEvent.type(screen.getByLabelText('Confirme a nova senha'), 'Senha-nova-1');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(formSenha('Maria Silva')).not.toBeInTheDocument();
    expect(botao).toHaveFocus();
    expect(botao).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(botao);
    expect(screen.getByLabelText('Nova senha')).toHaveValue('');
    expect(screen.getByLabelText('Confirme a nova senha')).toHaveValue('');
  });

  it('redefinir senha: só um formulário aberto por vez', async () => {
    await abrirSenha();
    await userEvent.click(botaoSenha('Bruno Lima'));
    expect(formSenha('Maria Silva')).not.toBeInTheDocument();
    expect(formSenha('Bruno Lima')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Nova senha')).toHaveLength(1);
    expect(botaoSenha('Maria Silva')).toHaveAttribute('aria-expanded', 'false');
    expect(botaoSenha('Bruno Lima')).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(botaoSenha('Bruno Lima'));
    expect(formSenha('Bruno Lima')).not.toBeInTheDocument();
    expect(botaoSenha('Bruno Lima')).toHaveAttribute('aria-expanded', 'false');
  });

  it('redefinir senha: a resposta atrasada de uma pessoa não fecha o form de outra', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const put = pendente();
    await abrirSenha({ 'PUT /admin/usuarios/u1/senha': put.rota });
    await preencherSenha('Senha-nova-1');
    await userEvent.click(botaoSenha('Bruno Lima'));
    const campoBruno = within(formSenha('Bruno Lima')).getByLabelText('Nova senha');
    await userEvent.type(campoBruno, 'abc');
    expect(campoBruno).toHaveFocus();

    await put.liberar({ status: 204 });
    expect(screen.getByRole('status')).toHaveTextContent('Senha de Maria Silva redefinida');
    expect(formSenha('Bruno Lima')).toBeInTheDocument();
    expect(campoBruno).toHaveFocus();
    expect(campoBruno).toHaveValue('abc');
  });

  it('abrir outro formulário de senha apaga o aviso anterior', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await abrirSenha({ 'PUT /admin/usuarios/u1/senha': { status: 204 } });
    await preencherSenha('Senha-nova-1');
    expect(await screen.findByRole('status')).toHaveTextContent('Senha de Maria Silva redefinida');
    await userEvent.click(botaoSenha('Bruno Lima'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('redefinir a própria senha encerra a sessão', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await comoAdmin('/admin/usuarios', {
      'GET /admin/usuarios': LISTA,
      'PUT /admin/usuarios/a1/senha': { status: 204 },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Redefinir senha de Ana Admin' }));
    await preencherSenha('Senha-nova-1');
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('erro de carregamento', async () => {
    await comoAdmin('/admin/usuarios', { 'GET /admin/usuarios': erroApi(500, 'E', 'Falhou') });
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
  });
});
