import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as telemetria from '../lib/telemetria';
import { baixarArquivo } from '../lib/api';
import { ADMIN, erroApi, PARTICIPANTE, renderizarApp, sequencia, servidorFalso, USUARIO } from './utils';

let visibilidade = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidade });
const mudarVisibilidade = (estado) => {
  visibilidade = estado;
  document.dispatchEvent(new Event('visibilitychange'));
};
const eventos = (servidor, tipo) => servidor.enviados('POST /eventos').filter((e) => e.tipo_evento === tipo);

beforeEach(() => {
  telemetria.finalizarSessao(); // zera o estado do módulo entre os testes
  visibilidade = 'visible';
});

describe('sessões de telemetria', () => {
  beforeEach(() => {
    localStorage.setItem('guardiao.token', 't');
    telemetria.definirConsentimento(true);
  });

  it('a sessão leva o contexto: PWA instalado ou navegador e largura da tela', async () => {
    const servidor = servidorFalso();
    window.matchMedia = vi.fn(() => ({ matches: true }));
    await telemetria.iniciarSessao();
    expect(servidor.enviados('POST /sessoes')[0]).toEqual({
      standalone: true,
      largura_tela: window.innerWidth,
    });
    delete window.matchMedia;
    telemetria.finalizarSessao();
    await telemetria.iniciarSessao();
    expect(servidor.enviados('POST /sessoes')[1].standalone).toBe(false);
  });

  it('oculto encerra a sessão; ao voltar a tempo o servidor retoma a mesma', async () => {
    const servidor = servidorFalso({
      'POST /sessoes/sessao-1/finalizar': { status: 204 },
      'POST /sessoes/sessao-1/retomar': { status: 204 },
    });
    await telemetria.iniciarSessao();
    mudarVisibilidade('hidden');
    expect(servidor.mock.calls.at(-1)[1]).toMatchObject({ method: 'POST', keepalive: true });
    telemetria.registrarEvento({ tipo_evento: 'enquanto_oculto' }); // vai para a fila

    mudarVisibilidade('visible');
    await waitFor(() => expect(servidor.enviados('POST /sessoes/sessao-1/retomar')).toHaveLength(1));
    await waitFor(() => expect(eventos(servidor, 'enquanto_oculto')[0].sessao_id).toBe('sessao-1'));
    expect(servidor.enviados('POST /sessoes')).toHaveLength(1);
  });

  it('se a sessão expirou (404 ao retomar), abre uma nova', async () => {
    const servidor = servidorFalso({
      'POST /sessoes': sequencia(
        { status: 201, corpo: { id: 'sessao-1' } },
        { status: 201, corpo: { id: 'sessao-2' } },
      ),
      'POST /sessoes/sessao-1/finalizar': { status: 204 },
      'POST /sessoes/sessao-1/retomar': erroApi(404, 'NAO_ENCONTRADO', 'Sessão expirada'),
    });
    await telemetria.iniciarSessao();
    mudarVisibilidade('hidden');
    mudarVisibilidade('visible');
    await waitFor(() => expect(servidor.enviados('POST /sessoes')).toHaveLength(2));
    telemetria.registrarEvento({ tipo_evento: 'depois' });
    await waitFor(() => expect(eventos(servidor, 'depois')[0].sessao_id).toBe('sessao-2'));
  });

  it('voltar sem sessão pausada abre uma sessão; ocultar sem sessão não faz nada', async () => {
    const servidor = servidorFalso();
    mudarVisibilidade('hidden');
    expect(servidor).not.toHaveBeenCalled();
    mudarVisibilidade('visible');
    await waitFor(() => expect(servidor.enviados('POST /sessoes')).toHaveLength(1));
  });

  it('se o login saiu enquanto oculto, não retoma', async () => {
    const servidor = servidorFalso({ 'POST /sessoes/sessao-1/finalizar': { status: 204 } });
    await telemetria.iniciarSessao();
    mudarVisibilidade('hidden');
    localStorage.clear();
    mudarVisibilidade('visible');
    await new Promise((r) => setTimeout(r, 10));
    expect(servidor.enviados('POST /sessoes/sessao-1/retomar')).toEqual([]);
  });

  it('sem consentimento, voltar ao app não retoma nem abre sessão', async () => {
    const servidor = servidorFalso({ 'POST /sessoes/sessao-1/finalizar': { status: 204 } });
    await telemetria.iniciarSessao();
    mudarVisibilidade('hidden');
    telemetria.definirConsentimento(false);
    mudarVisibilidade('visible');
    await new Promise((r) => setTimeout(r, 10));
    expect(servidor.enviados('POST /sessoes/sessao-1/retomar')).toEqual([]);
    expect(servidor.enviados('POST /sessoes')).toHaveLength(1);
  });

  it('instalar o PWA registra app_instalado', async () => {
    const servidor = servidorFalso();
    await telemetria.iniciarSessao();
    window.dispatchEvent(new Event('appinstalled'));
    await waitFor(() => expect(eventos(servidor, 'app_instalado')).toHaveLength(1));
  });
});

describe('eventos de navegação, leitura e resultado', () => {
  const AULA = {
    id: 'a1',
    titulo: 'Phishing',
    concluida: false,
    conteudo_html: '<h2>Seção</h2><aside class="nota"><p>Importante</p></aside>',
    pontos_conclusao: 20,
    questoes: [
      {
        id: 'q1',
        enunciado: 'P?',
        pontos: 10,
        alternativa_a: 'A',
        alternativa_b: 'B',
        alternativa_c: 'C',
        alternativa_d: 'D',
      },
    ],
  };
  const rotas = {
    'GET /aulas': [],
    'GET /aulas/a1': AULA,
    'POST /aulas/a1/visitas': { status: 201, corpo: { id: 'v1' } },
    'POST /visitas/v1/respostas': {
      correta: true,
      resposta_correta: 'a',
      pontos_ganhos: 10,
      pontuacao_total: 50,
    },
    'POST /visitas/v1/finalizar': {
      acertos: 1,
      total_questoes: 1,
      pontos_questoes: 10,
      bonus_conclusao: 20,
      pontuacao_total: 70,
      novos_badges: [{ id: 'b', nome: 'X' }],
    },
  };

  it('tela_visualizada leva a tela anterior (caminho de navegação)', async () => {
    const { servidor } = await renderizarApp('/aulas', {
      usuario: PARTICIPANTE,
      rotas: { ...rotas, 'GET /badges': [] },
    });
    await userEvent.click(screen.getByRole('link', { name: 'Conquistas' }));
    await screen.findByRole('heading', { name: 'Conquistas' });
    await waitFor(() => {
      const telas = eventos(servidor, 'tela_visualizada');
      expect(telas[0]).not.toHaveProperty('metadata');
      expect(telas.at(-1)).toMatchObject({ tela: '/conquistas', metadata: { tela_anterior: '/aulas' } });
    });
  });

  it('ao começar as perguntas registra a leitura (tempo e rolagem) e depois o resultado exibido', async () => {
    const { servidor } = await renderizarApp('/aulas/a1', { usuario: PARTICIPANTE, rotas });
    expect((await screen.findByText('Importante')).closest('aside')).toHaveClass('nota');
    await userEvent.click(screen.getByRole('button', { name: 'Responder 1 pergunta' }));
    await userEvent.click(await screen.findByRole('button', { name: 'A' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir aula' }));
    await screen.findByRole('heading', { name: 'Aula concluída!' });

    await waitFor(() => expect(eventos(servidor, 'resultado_visualizado')).toHaveLength(1));
    const [leitura, ...resto] = eventos(servidor, 'aula_conteudo_lido');
    expect(resto).toEqual([]); // um evento só, mesmo saindo da etapa de conteúdo
    expect(leitura).toMatchObject({
      tela: '/aulas/a1',
      elemento: 'a1',
      metadata: { rolagem_max: 100, motivo: 'iniciou_perguntas' },
    });
    expect(leitura.duracao_ms).toBeGreaterThanOrEqual(0);
    expect(eventos(servidor, 'resultado_visualizado')[0]).toMatchObject({
      tela: '/aulas/a1',
      metadata: { acertos: 1, total: 1, pontos: 30, novos_badges: 1 },
    });
  });

  it('sair da aula sem responder registra a leitura com motivo "saiu" e a rolagem máxima', async () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 3000 });
    const { servidor } = await renderizarApp('/aulas/a1', { usuario: PARTICIPANTE, rotas });
    await screen.findByRole('heading', { name: 'Phishing' });
    window.scrollY = 1100; // (1100 / (3000 - 768)) ≈ 49%
    window.dispatchEvent(new Event('scroll'));
    await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Aulas' }));
    await waitFor(() => expect(eventos(servidor, 'aula_conteudo_lido')).toHaveLength(1));
    expect(eventos(servidor, 'aula_conteudo_lido')[0].metadata).toEqual({ rolagem_max: 49, motivo: 'saiu' });
    delete document.documentElement.scrollHeight;
    window.scrollY = 0;
  });
});

describe('consentimento no perfil', () => {
  it('marcar e desmarcar chama a API e mostra o estado', async () => {
    const { servidor } = await renderizarApp('/perfil', {
      rotas: {
        'PATCH /perfil': ({ corpo }) => ({
          ...USUARIO,
          consentiu_pesquisa_em: corpo.consentiu_pesquisa ? '2026-05-10T12:00:00Z' : null,
        }),
      },
    });
    const caixa = screen.getByRole('checkbox', { name: /Autorizo o uso anônimo/ });
    expect(caixa).not.toBeChecked();
    expect(screen.getByText('Não autorizado: seus dados ficam fora da pesquisa.')).toBeInTheDocument();
    await userEvent.click(caixa);
    expect(await screen.findByText(/Autorizado em \d{2}\/\d{2}\/2026/)).toBeInTheDocument();
    expect(caixa).toBeChecked();
    await userEvent.click(caixa);
    expect(await screen.findByText(/Não autorizado/)).toBeInTheDocument();
    expect(servidor.enviados('PATCH /perfil')).toEqual([
      { consentiu_pesquisa: true },
      { consentiu_pesquisa: false },
    ]);
  });

  it('erro ao salvar aparece e a caixa não muda', async () => {
    await renderizarApp('/perfil', { rotas: { 'PATCH /perfil': erroApi(500, 'E', 'Falhou') } });
    await userEvent.click(screen.getByRole('checkbox', { name: /Autorizo o uso anônimo/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
    expect(screen.getByRole('checkbox', { name: /Autorizo o uso anônimo/ })).not.toBeChecked();
  });
});

describe('admin: aula vinda de arquivo', () => {
  const AULA_ARQUIVO = {
    id: 'a1',
    slug: 'phishing',
    titulo: 'Phishing',
    ordem: 4,
    conteudo_html: '<p>x</p>',
    pontos_conclusao: 20,
    ativo: true,
    questoes: [
      {
        id: 'q1',
        chave: 'remetente-falso',
        enunciado: 'Qual?',
        resposta_correta: 'b',
        pontos: 10,
        ativo: true,
        alternativa_a: 'a',
        alternativa_b: 'b',
        alternativa_c: 'c',
        alternativa_d: 'd',
      },
      { id: 'q2', chave: 'antiga', enunciado: 'Velha?', resposta_correta: 'a', pontos: 5, ativo: false },
    ],
  };

  it('mostra de qual pasta vem, sem formulário nem edição de perguntas; ocultar continua liberado', async () => {
    const { servidor } = await renderizarApp('/admin/aulas/a1', {
      usuario: ADMIN,
      rotas: { 'GET /admin/aulas/a1': AULA_ARQUIVO, 'DELETE /admin/aulas/a1': { status: 204 } },
    });
    expect(await screen.findByText('conteudo/aulas/04-phishing')).toBeInTheDocument();
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nova pergunta/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.getByText(/remetente-falso/)).toBeInTheDocument();
    expect(screen.getByText(/removida do arquivo/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver como o usuário vê' })).toHaveAttribute('href', '/aulas/a1');
    await userEvent.click(screen.getByRole('button', { name: 'Desativar aula' }));
    await waitFor(() => expect(servidor.enviados('DELETE /admin/aulas/a1')).toHaveLength(1));
  });

  it('a lista marca as aulas de arquivo', async () => {
    await renderizarApp('/admin/aulas', {
      usuario: ADMIN,
      rotas: {
        'GET /admin/aulas': [
          {
            id: 'a1',
            slug: 'phishing',
            titulo: 'Phishing',
            ordem: 1,
            pontos_conclusao: 20,
            total_questoes: 2,
            ativo: true,
          },
          {
            id: 'a2',
            slug: null,
            titulo: 'Manual',
            ordem: 2,
            pontos_conclusao: 0,
            total_questoes: 0,
            ativo: true,
          },
        ],
      },
    });
    const [arquivo, manual] = await screen.findAllByRole('listitem');
    expect(within(arquivo).getByText('Arquivo')).toBeInTheDocument();
    expect(within(manual).queryByText('Arquivo')).not.toBeInTheDocument();
  });
});

describe('admin: dados da pesquisa', () => {
  const VAZIO = {
    aulas: [],
    questoesAula: [],
    usuariosAula: [],
    trivia: [],
    questoesTrivia: [],
    usuariosTrivia: [],
  };
  const PESQUISA = {
    participantes: 12,
    visoes: [
      { id: 'uso-diario', titulo: 'Uso diário', descricao: 'DAU por dia' },
      { id: 'engajamento', titulo: 'Engajamento por participante', descricao: 'Uma linha por pessoa' },
    ],
  };

  afterEach(() => {
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });

  it('lista as visões e baixa o CSV com o token', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:csv');
    URL.revokeObjectURL = vi.fn();
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { servidor } = await renderizarApp('/admin/estatisticas', {
      usuario: ADMIN,
      rotas: {
        'GET /admin/estatisticas': VAZIO,
        'GET /admin/pesquisa': PESQUISA,
        'GET /admin/pesquisa/uso-diario.csv': 'dia\n',
      },
    });
    expect(await screen.findByText(/12 participante\(s\) autorizaram/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Baixar Uso diário em CSV' }));
    await waitFor(() => expect(clique).toHaveBeenCalled());
    const [url, opcoes] = servidor.mock.calls.find(([u]) => u.endsWith('.csv'));
    expect(url).toBe('/api/admin/pesquisa/uso-diario.csv');
    expect(opcoes.headers.Authorization).toBe('Bearer token-teste');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    expect(clique.mock.contexts[0].download).toBe('pesquisa-uso-diario.csv');
  });

  it('erro no download aparece e reabilita os botões', async () => {
    await renderizarApp('/admin/estatisticas', {
      usuario: ADMIN,
      rotas: {
        'GET /admin/estatisticas': VAZIO,
        'GET /admin/pesquisa': PESQUISA,
        'GET /admin/pesquisa/engajamento.csv': erroApi(500, 'ERRO_INTERNO', 'Erro interno. Tente novamente'),
      },
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Baixar Engajamento por participante em CSV' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
    expect(screen.getByRole('button', { name: 'Baixar Uso diário em CSV' })).toBeEnabled();
  });

  it('erro ao carregar a lista de visões não derruba as estatísticas', async () => {
    await renderizarApp('/admin/estatisticas', {
      usuario: ADMIN,
      rotas: {
        'GET /admin/estatisticas': VAZIO,
        'GET /admin/pesquisa': erroApi(500, 'E', 'Sem dados da pesquisa'),
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem dados da pesquisa');
    expect(screen.getByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
  });

  it('baixarArquivo: sem conexão vira SEM_CONEXAO; sem token não manda Authorization', async () => {
    servidorFalso({ 'GET /x.csv': new TypeError('rede') });
    await expect(baixarArquivo('/x.csv', 'x.csv')).rejects.toMatchObject({ codigo: 'SEM_CONEXAO' });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const servidor = servidorFalso({ 'GET /y.csv': 'a,b' });
    await baixarArquivo('/y.csv', 'y.csv');
    expect(servidor.mock.calls[0][1].headers).toEqual({});
  });
});
