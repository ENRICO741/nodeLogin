import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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

describe('acesso à área admin', () => {
  it('usuário comum é mandado para as aulas', async () => {
    await renderizarApp('/admin/estatisticas', { usuario: USUARIO, rotas: { 'GET /aulas': [] } });
    expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
  });

  it('painel lista as três seções com links', async () => {
    await comoAdmin('/admin');
    expect(screen.getByRole('heading', { name: 'Administração' })).toBeInTheDocument();
    for (const [nome, href] of [
      [/Estatísticas/, '/admin/estatisticas'],
      [/Criar e editar aulas/, '/admin/aulas'],
      [/Questões de trivia/, '/admin/trivia'],
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
  const LISTA = [
    { ...QUESTAO, id: 't1', dificuldade: 'facil' },
    { ...QUESTAO, id: 't2', dificuldade: 'dificil', ativo: false, enunciado: 'Desativada?' },
  ];

  it('agrupa por dificuldade com contagem de ativas e nível vazio', async () => {
    await comoAdmin('/admin/trivia', { 'GET /admin/questoes-trivia': LISTA });
    const facil = await screen.findByRole('region', { name: /Fácil/ });
    expect(within(facil).getByText('1 ativas')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: /Média/ })).getByText('Nenhuma questão neste nível'),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /Difícil/ })).getByText(/inativa/)).toBeInTheDocument();
  });

  it('cria questão com dificuldade escolhida', async () => {
    const { servidor } = await comoAdmin('/admin/trivia', {
      'GET /admin/questoes-trivia': LISTA,
      'POST /admin/questoes-trivia': { status: 201, corpo: {} },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Nova questão/ }));
    await userEvent.selectOptions(screen.getByLabelText('Dificuldade'), 'media');
    await preencherQuestao();
    await userEvent.click(screen.getByRole('button', { name: 'Criar questão' }));
    await waitFor(() =>
      expect(servidor.enviados('POST /admin/questoes-trivia')[0]).toMatchObject({
        dificuldade: 'media',
        resposta_correta: 'c',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Criar questão' })).not.toBeInTheDocument(),
    );
  });

  it('cancelar criação fecha o formulário', async () => {
    await comoAdmin('/admin/trivia', { 'GET /admin/questoes-trivia': LISTA });
    await userEvent.click(await screen.findByRole('button', { name: /Nova questão/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: /Nova questão/ })).toBeInTheDocument();
  });

  it('edita, desativa e reativa', async () => {
    const { servidor } = await comoAdmin('/admin/trivia', {
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

  it('cancelar edição e erro de carregamento', async () => {
    await comoAdmin('/admin/trivia', { 'GET /admin/questoes-trivia': LISTA });
    const facil = await screen.findByRole('region', { name: /Fácil/ });
    await userEvent.click(within(facil).getByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(
      within(screen.getByRole('region', { name: /Fácil/ })).getByRole('button', { name: 'Editar' }),
    ).toBeInTheDocument();
  });

  it('erro de carregamento', async () => {
    await comoAdmin('/admin/trivia', { 'GET /admin/questoes-trivia': erroApi(500, 'E', 'Falhou') });
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
  });
});
