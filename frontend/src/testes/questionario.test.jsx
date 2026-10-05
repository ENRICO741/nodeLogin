import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { finalizarSessao } from '../lib/telemetria';
import { ADMIN, erroApi, PARTICIPANTE, renderizarApp, sequencia, servidorFalso } from './utils';
import { DEFINICAO_POS, DEFINICAO_PRE } from './questionario-fixtures';

const SITUACAO_OK = { pre_pendente: false, pos_pendente: false };
const NOVO = { ...PARTICIPANTE, questionarios: { pre_pendente: true, pos_pendente: false } };
const LIBERADO = { ...PARTICIPANTE, questionarios: SITUACAO_OK };
const RASCUNHO = 'guardiao.questionario.pre.u1';
const ENVIADO = { status: 201, corpo: { questionarios: SITUACAO_OK } };
const eventos = (servidor, tipo) => servidor.enviados('POST /eventos').filter((e) => e.tipo_evento === tipo);
// Depois do envio a tela de Aulas confere /auth/me: o servidor já responde sem pendência.
const DEPOIS_DO_PRE = { 'GET /auth/me': sequencia(NOVO, LIBERADO) };
const LONGO = 'é'.repeat(1000) + '😀'.repeat(1000); // 2000 caracteres (.length 3000)

let visibilidade = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidade });
const mudarVisibilidade = (estado) => {
  visibilidade = estado;
  document.dispatchEvent(new Event('visibilitychange'));
};

// Armazenamento bloqueado só para os rascunhos (o token segue funcionando).
function armazenamentoQuebrado() {
  const erro = () => new DOMException('bloqueado', 'SecurityError');
  for (const metodo of ['getItem', 'setItem', 'removeItem']) {
    const original = Storage.prototype[metodo];
    vi.spyOn(Storage.prototype, metodo).mockImplementation(function (chave, ...resto) {
      if (String(chave).startsWith('guardiao.questionario.')) throw erro();
      return original.call(this, chave, ...resto);
    });
  }
  const keys = Object.keys;
  vi.spyOn(Object, 'keys').mockImplementation((o) => {
    if (o === localStorage) throw erro();
    return keys(o);
  });
}

beforeEach(() => {
  finalizarSessao(); // a telemetria guarda estado no módulo entre os testes
  visibilidade = 'visible';
});

// A tela do pré não tem as abas do app, então não dá para usar o renderizarApp (que espera a navegação).
function abrirPre(caminho = '/aulas', { usuario = NOVO, rotas = {} } = {}) {
  localStorage.setItem('guardiao.token', 'token-teste');
  const servidor = servidorFalso({
    'GET /auth/me': usuario,
    'GET /questionarios/pre': DEFINICAO_PRE,
    'GET /aulas': [],
    ...rotas,
  });
  window.history.pushState({}, '', caminho);
  render(<App />);
  return servidor;
}

const grupo = (pergunta) => screen.getByRole('group', { name: pergunta });
const marcar = (pergunta, opcao) =>
  userEvent.click(within(grupo(pergunta)).getByRole('radio', { name: opcao }));
const marcarCaixa = (pergunta, opcao) =>
  userEvent.click(within(grupo(pergunta)).getByRole('checkbox', { name: opcao }));
const continuar = () => userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

async function comecar() {
  await userEvent.click(await screen.findByRole('button', { name: 'Começar' }));
  await screen.findByRole('heading', { name: 'Sobre você' });
}

async function responderPerfil(c1 = 'Não') {
  await marcar('Qual é a sua faixa etária?', '25–34');
  await marcarCaixa('Quais plataformas você já usou?', 'Kahoot!');
  await marcar('Você já fez treinamento?', c1);
}

// Rascunho já no último passo, tudo respondido: para testar o envio direto.
function rascunhoCompleto(extra = {}) {
  localStorage.setItem(
    RASCUNHO,
    JSON.stringify({
      versao: 1,
      respostas: { A1: 0, A6: [2], C1: 1, HX1: 1, ATN: 2, HX2: 3, HX3: 3, GAM1: 2 },
      ordem: { hexad: ['HX1', 'ATN', 'HX2', 'HX3'] },
      passo: 2,
      inicio: Date.now() - 90_000,
      ...extra,
    }),
  );
}

describe('questionário inicial (pré)', () => {
  it('conta nova vai direto para o questionário, sem as abas do app', async () => {
    abrirPre('/ranking');
    expect(await screen.findByRole('heading', { name: 'Boas-vindas à pesquisa' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/questionario/pre');
    expect(screen.getByText(/cerca de 10 minutos/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument();
    expect(localStorage.getItem(RASCUNHO)).toBeNull(); // nada salvo antes de "Começar"
  });

  it('fluxo completo: múltipla com exclusiva, ordem sorteada, envio e agradecimento', async () => {
    const servidor = abrirPre('/aulas', { rotas: { 'POST /questionarios/pre': ENVIADO, ...DEPOIS_DO_PRE } });
    await comecar();
    expect(screen.getByText('Parte 1 de 3')).toBeInTheDocument();
    const progresso = screen.getByRole('progressbar', { name: 'Progresso do questionário' });
    expect(progresso).toHaveAttribute('aria-valuetext', 'Parte 1 de 3');
    expect(screen.getByRole('heading', { name: 'Sobre você' })).toHaveFocus();

    await marcar('Qual é a sua faixa etária?', '25–34');
    const a6 = within(grupo('Quais plataformas você já usou?'));
    await marcarCaixa('Quais plataformas você já usou?', 'Duolingo');
    await marcarCaixa('Quais plataformas você já usou?', 'Kahoot!');
    await marcarCaixa('Quais plataformas você já usou?', 'Nenhuma');
    expect(a6.getByRole('checkbox', { name: 'Nenhuma' })).toBeChecked();
    expect(a6.getByRole('checkbox', { name: 'Duolingo' })).not.toBeChecked();
    expect(a6.getByRole('checkbox', { name: 'Kahoot!' })).not.toBeChecked();
    await marcarCaixa('Quais plataformas você já usou?', 'Kahoot!');
    expect(a6.getByRole('checkbox', { name: 'Nenhuma' })).not.toBeChecked();
    await marcar('Você já fez treinamento?', 'Não');
    expect(screen.queryByRole('group', { name: 'Há quanto tempo?' })).not.toBeInTheDocument();
    await continuar();

    expect(await screen.findByRole('heading', { name: 'Como você é' })).toHaveFocus();
    expect(screen.getByText('Parte 2 de 3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Parte 2 de 3');
    expect(screen.getByText('Atenção: a partir daqui a escala tem 7 pontos.')).toBeInTheDocument();
    const perguntas = screen.getAllByRole('group').map((g) => g.querySelector('legend').textContent);
    expect(perguntas[1]).toBe('Marque "Neutro" nesta frase.'); // verificação de atenção no meio
    for (const p of perguntas) await marcar(p, p.startsWith('Marque') ? 'Neutro' : 'Concordo');
    await continuar();

    await screen.findByRole('heading', { name: 'Para terminar' });
    await marcar('As medalhas me motivaram.', 'Não vi / não usei esse recurso');
    const aberta = screen.getByLabelText(/Algo mais\?/);
    expect(aberta).not.toHaveAttribute('maxlength'); // contaria UTF-16 e cortaria emoji
    expect(aberta).toHaveAccessibleDescription('0/2000 caracteres');
    await userEvent.type(aberta, '  ótimo  ');
    expect(aberta).toHaveAccessibleDescription('5/2000 caracteres'); // conta como a API: sem espaços nas pontas
    // O pré envia direto do último passo, sem tela de confirmação.
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }));

    expect(await screen.findByRole('heading', { name: 'Respostas enviadas' })).toBeInTheDocument();
    expect(servidor.enviados('POST /questionarios/pre')).toEqual([
      { respostas: { A1: 1, A6: [1], C1: 1, HX1: 3, ATN: 2, HX2: 3, HX3: 3, GAM1: 0, ABR1: 'ótimo' } },
    ]);
    expect(localStorage.getItem(RASCUNHO)).toBeNull();

    await userEvent.click(screen.getByRole('link', { name: 'Ir para as aulas' }));
    expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
  });

  it('C1 = Sim mostra a pergunta seguinte e a parte sobre o treinamento; Voltar mantém as respostas', async () => {
    abrirPre();
    await comecar();
    await responderPerfil('Sim');
    expect(grupo('Há quanto tempo?')).toBeInTheDocument();
    expect(screen.getByText('Parte 1 de 4')).toBeInTheDocument();

    await continuar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta responder 1 pergunta desta parte.');
    await marcar('Há quanto tempo?', 'Mais de 6 meses');
    await continuar();
    expect(
      await screen.findByRole('heading', { name: 'Sua experiência com esse treinamento' }),
    ).toBeVisible();
    expect(screen.getByText('Pense no treinamento mais recente.')).toBeInTheDocument();
    expect(screen.getByText('Parte 2 de 4')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await screen.findByRole('heading', { name: 'Sobre você' });
    expect(within(grupo('Há quanto tempo?')).getByRole('radio', { name: 'Mais de 6 meses' })).toBeChecked();
    // Mudar C1 esconde de novo a pergunta e a parte condicionada.
    await marcar('Você já fez treinamento?', 'Não lembro');
    expect(screen.queryByRole('group', { name: 'Há quanto tempo?' })).not.toBeInTheDocument();
    expect(screen.getByText('Parte 1 de 3')).toBeInTheDocument();
  });

  it('Continuar sem responder marca as perguntas, foca a primeira e limpa ao responder', async () => {
    abrirPre();
    await comecar();
    await continuar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Faltam responder 3 perguntas desta parte.');
    expect(grupo('Qual é a sua faixa etária?')).toHaveAccessibleDescription('Responda esta pergunta.');
    expect(grupo('Você já fez treinamento?')).toHaveAccessibleDescription('Responda esta pergunta.');
    await waitFor(() =>
      expect(within(grupo('Qual é a sua faixa etária?')).getByRole('radio', { name: '18–24' })).toHaveFocus(),
    );
    expect(screen.getByText('Parte 1 de 3')).toBeInTheDocument();

    await marcar('Qual é a sua faixa etária?', '18–24');
    expect(grupo('Qual é a sua faixa etária?')).not.toHaveAccessibleDescription();
    expect(screen.getByRole('alert')).toBeInTheDocument(); // ainda faltam as outras
  });

  it('rascunho guarda o andamento e volta no mesmo passo e ordem', async () => {
    abrirPre();
    await comecar();
    await responderPerfil();
    const salvo = JSON.parse(localStorage.getItem(RASCUNHO));
    expect(salvo).toMatchObject({ versao: 1, passo: 0, respostas: { A1: 1, A6: [1], C1: 1 } });
    expect(salvo.ordem.hexad).toHaveLength(4);
    expect(salvo.inicio).toEqual(expect.any(Number));

    cleanup();
    localStorage.setItem(
      RASCUNHO,
      JSON.stringify({ ...salvo, passo: 1, ordem: { hexad: ['HX3', 'ATN', 'HX2', 'HX1'] } }),
    );
    abrirPre();
    expect(await screen.findByRole('heading', { name: 'Como você é' })).toBeInTheDocument();
    expect(screen.getByText('Você continua de onde parou.')).toBeInTheDocument();
    expect(screen.getAllByRole('group').map((g) => g.querySelector('legend').textContent)).toEqual([
      'Gosto de desafios.',
      'Marque "Neutro" nesta frase.',
      'Gosto de equipes.',
      'Gosto de ajudar.',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await screen.findByRole('heading', { name: 'Sobre você' });
    expect(screen.queryByText('Você continua de onde parou.')).not.toBeInTheDocument();
    expect(within(grupo('Qual é a sua faixa etária?')).getByRole('radio', { name: '25–34' })).toBeChecked();
  });

  const BASE = { versao: 1, respostas: {}, ordem: null, passo: 0, inicio: 1 };
  it.each([
    ['outra versão', { ...BASE, versao: 0 }],
    ['JSON inválido', '{quebrado'],
    ['lista', []],
    ['texto', 'oi'],
    ['respostas lista', { ...BASE, respostas: [] }],
    ['respostas texto', { ...BASE, respostas: 'x' }],
    ['resposta objeto', { ...BASE, respostas: { A1: { x: 1 } } }],
    ['resposta múltipla com texto', { ...BASE, respostas: { A6: ['a'] } }],
    ['passo negativo', { ...BASE, passo: -1 }],
    ['passo texto', { ...BASE, passo: '2' }],
    ['passo fracionado', { ...BASE, passo: 1.5 }],
    ['sem passo', { ...BASE, passo: undefined }],
    ['ordem lista', { ...BASE, ordem: [] }],
    ['ordem com texto', { ...BASE, ordem: { hexad: 'HX1' } }],
    ['ordem com número', { ...BASE, ordem: { hexad: [1] } }],
    ['inicio texto', { ...BASE, inicio: 'ontem' }],
  ])('rascunho inválido (%s) é descartado e a tela abre normal', async (_, rascunho) => {
    localStorage.setItem(RASCUNHO, typeof rascunho === 'string' ? rascunho : JSON.stringify(rascunho));
    abrirPre();
    expect(await screen.findByRole('button', { name: 'Começar' })).toBeInTheDocument();
    expect(localStorage.getItem(RASCUNHO)).toBeNull();
  });

  it('aberta: 2000 caracteres com acento e emoji vão para a API; 2001 bloqueia sem chamar a API', async () => {
    rascunhoCompleto({
      respostas: { A1: 0, A6: [2], C1: 1, HX1: 1, ATN: 2, HX2: 3, HX3: 3, GAM1: 2, ABR1: LONGO + '😀' },
    });
    const servidor = abrirPre('/aulas', { rotas: { 'POST /questionarios/pre': ENVIADO, ...DEPOIS_DO_PRE } });
    const aberta = await screen.findByLabelText(/Algo mais\?/);
    expect(aberta).toHaveAccessibleDescription('2001/2000 caracteres');
    expect(aberta).toHaveAttribute('aria-invalid', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Encurte para continuar.');
    expect(aberta).toHaveAccessibleDescription('Use no máximo 2000 caracteres. 2001/2000 caracteres');
    await waitFor(() => expect(aberta).toHaveFocus());
    expect(servidor.enviados('POST /questionarios/pre')).toHaveLength(0);

    await userEvent.clear(aberta);
    await userEvent.paste(LONGO);
    expect(aberta).toHaveAccessibleDescription('2000/2000 caracteres');
    expect(aberta).not.toHaveAttribute('aria-invalid');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }));
    await screen.findByRole('heading', { name: 'Respostas enviadas' });
    expect(servidor.enviados('POST /questionarios/pre')[0].respostas.ABR1).toBe(LONGO);
  });

  it('botão de envio fica desabilitado enquanto envia (sem envio duplicado)', async () => {
    rascunhoCompleto();
    let liberar;
    const servidor = abrirPre('/aulas', {
      rotas: {
        'POST /questionarios/pre': () => new Promise((r) => (liberar = () => r(ENVIADO))),
        ...DEPOIS_DO_PRE,
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar respostas' }));
    const botao = await screen.findByRole('button', { name: 'Enviando…' });
    expect(botao).toBeDisabled();
    await userEvent.click(botao);
    expect(servidor.enviados('POST /questionarios/pre')).toHaveLength(1);
    await act(async () => liberar());
    expect(await screen.findByRole('heading', { name: 'Respostas enviadas' })).toBeInTheDocument();
  });

  it('sessão expirada (401) apaga os rascunhos do aparelho e leva ao login', async () => {
    rascunhoCompleto();
    localStorage.setItem('guardiao.questionario.pos.outra-conta', '{}');
    abrirPre('/aulas', { rotas: { 'POST /questionarios/pre': erroApi(401, 'NAO_AUTENTICADO', 'x') } });
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar respostas' }));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.getItem(RASCUNHO)).toBeNull();
    expect(localStorage.getItem('guardiao.questionario.pos.outra-conta')).toBeNull();
  });

  it('armazenamento que lança exceção: a tela abre, segue em memória e envia', async () => {
    armazenamentoQuebrado();
    const servidor = abrirPre('/aulas', { rotas: { 'POST /questionarios/pre': ENVIADO, ...DEPOIS_DO_PRE } });
    await comecar();
    await responderPerfil();
    await continuar();
    await screen.findByRole('heading', { name: 'Como você é' });
    for (const g of screen.getAllByRole('group')) {
      const p = g.querySelector('legend').textContent;
      await marcar(p, p.startsWith('Marque') ? 'Neutro' : 'Concordo');
    }
    await continuar();
    await marcar('As medalhas me motivaram.', 'Concordo');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }));
    expect(await screen.findByRole('heading', { name: 'Respostas enviadas' })).toBeInTheDocument();
    expect(servidor.enviados('POST /questionarios/pre')).toHaveLength(1);
  });

  it.each([
    ['o Sair', {}, () => userEvent.click(screen.getByRole('button', { name: 'Sair' }))],
    ['a sessão expirada (401)', { 'GET /questionarios/pre': erroApi(401, 'NAO_AUTENTICADO', 'x') }, () => {}],
  ])('armazenamento que lança exceção não impede %s', async (_, rotas, acao) => {
    armazenamentoQuebrado();
    abrirPre('/aulas', { rotas });
    await screen.findByRole('button', { name: 'Sair' });
    await acao();
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.getItem('guardiao.token')).toBeNull();
  });

  it('envio a partir do rascunho manda só as respostas (aberta em branco fica de fora)', async () => {
    rascunhoCompleto();
    const servidor = abrirPre('/aulas', { rotas: { 'POST /questionarios/pre': ENVIADO } });
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar respostas' }));
    await screen.findByRole('heading', { name: 'Respostas enviadas' });
    expect(servidor.enviados('POST /questionarios/pre')).toEqual([
      { respostas: { A1: 0, A6: [2], C1: 1, HX1: 1, ATN: 2, HX2: 3, HX3: 3, GAM1: 2 } },
    ]);
  });

  it('eventos: iniciado ao começar; concluído só depois do envio aceito', async () => {
    const servidor = abrirPre();
    await comecar();
    await waitFor(() =>
      expect(eventos(servidor, 'questionario_iniciado')).toEqual([
        expect.objectContaining({ metadata: { momento: 'pre' } }),
      ]),
    );
    expect(eventos(servidor, 'questionario_concluido')).toHaveLength(0);
    cleanup();

    // Retomar o rascunho não repete o "iniciado"; erro no envio não gera "concluído".
    rascunhoCompleto();
    const outro = abrirPre('/aulas', {
      rotas: {
        'POST /questionarios/pre': sequencia(erroApi(500, 'ERRO_INTERNO', 'Algo deu errado'), ENVIADO),
      },
    });
    const enviar = await screen.findByRole('button', { name: 'Enviar respostas' });
    await userEvent.click(enviar);
    await screen.findByText('Algo deu errado');
    expect(eventos(outro, 'questionario_concluido')).toHaveLength(0);
    await userEvent.click(enviar);
    await screen.findByRole('heading', { name: 'Respostas enviadas' });
    await waitFor(() =>
      expect(eventos(outro, 'questionario_concluido')).toEqual([
        expect.objectContaining({ metadata: { momento: 'pre' } }),
      ]),
    );
    expect(eventos(outro, 'questionario_iniciado')).toHaveLength(0);
  });

  it('400 com detalhes volta ao passo do item recusado e mostra a mensagem da API', async () => {
    rascunhoCompleto();
    abrirPre('/aulas', {
      rotas: {
        'POST /questionarios/pre': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
          { campo: 'A1', mensagem: 'Escolha uma das opções' },
          { campo: 'ZZ9', mensagem: 'desconhecido' },
        ]),
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar respostas' }));
    await screen.findByRole('heading', { name: 'Sobre você' });
    expect(screen.getByRole('alert')).toHaveTextContent('Algumas respostas precisam ser revisadas.');
    expect(grupo('Qual é a sua faixa etária?')).toHaveAccessibleDescription('Escolha uma das opções');
    expect(localStorage.getItem(RASCUNHO)).not.toBeNull();
  });

  it('400 sem item conhecido e 500 mostram o erro e deixam tentar de novo', async () => {
    rascunhoCompleto();
    const servidor = abrirPre('/aulas', {
      rotas: {
        'POST /questionarios/pre': sequencia(
          erroApi(400, 'VALIDACAO', 'Dados inválidos', [{ campo: 'respostas', mensagem: 'x' }]),
          erroApi(500, 'ERRO_INTERNO', 'Algo deu errado. Tente novamente'),
          ENVIADO,
        ),
      },
    });
    const enviar = await screen.findByRole('button', { name: 'Enviar respostas' });
    await userEvent.click(enviar);
    expect(await screen.findByRole('alert')).toHaveTextContent('Dados inválidos');
    await userEvent.click(enviar);
    expect(await screen.findByText('Algo deu errado. Tente novamente')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Para terminar' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }));
    await screen.findByRole('heading', { name: 'Respostas enviadas' });
    expect(servidor.enviados('POST /questionarios/pre')).toHaveLength(3);
  });

  it('409 no envio: avisa que já respondeu, limpa o rascunho e libera o app', async () => {
    rascunhoCompleto();
    abrirPre('/aulas', {
      rotas: {
        'POST /questionarios/pre': erroApi(409, 'QUESTIONARIO_RESPONDIDO', 'Questionário já respondido'),
        ...DEPOIS_DO_PRE,
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar respostas' }));
    expect(await screen.findByRole('heading', { name: 'Você já respondeu' })).toBeInTheDocument();
    expect(localStorage.getItem(RASCUNHO)).toBeNull();
    await userEvent.click(screen.getByRole('link', { name: 'Ir para as aulas' }));
    expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
  });

  it('409 ao carregar também avisa que já respondeu', async () => {
    abrirPre('/aulas', {
      rotas: {
        'GET /questionarios/pre': erroApi(409, 'QUESTIONARIO_RESPONDIDO', 'Questionário já respondido'),
      },
    });
    expect(await screen.findByRole('heading', { name: 'Você já respondeu' })).toBeInTheDocument();
  });

  it('falha ao carregar mostra "Tentar de novo"', async () => {
    const servidor = abrirPre('/aulas', {
      rotas: {
        'GET /questionarios/pre': sequencia(
          erroApi(503, 'INDISPONIVEL', 'Servidor indisponível'),
          DEFINICAO_PRE,
        ),
      },
    });
    expect(await screen.findByText('Servidor indisponível')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(await screen.findByRole('button', { name: 'Começar' })).toBeInTheDocument();
    expect(servidor.enviados('GET /questionarios/pre')).toHaveLength(2);
  });

  it('"Sair" encerra a sessão, apaga os rascunhos do aparelho e leva ao login', async () => {
    localStorage.setItem('guardiao.questionario.pos.outra-conta', '{}');
    localStorage.setItem('guardiao.tema', 'dark');
    abrirPre();
    await userEvent.click(await screen.findByRole('button', { name: 'Começar' }));
    await marcar('Qual é a sua faixa etária?', '18–24');
    expect(localStorage.getItem(RASCUNHO)).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.getItem('guardiao.token')).toBeNull();
    expect(localStorage.getItem(RASCUNHO)).toBeNull();
    expect(localStorage.getItem('guardiao.questionario.pos.outra-conta')).toBeNull();
    expect(localStorage.getItem('guardiao.tema')).toBe('dark');
  });

  it('sem pendência (já respondeu, admin ou sem consentimento) não acessa o questionário inicial', async () => {
    abrirPre('/questionario/pre', { usuario: LIBERADO });
    expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/aulas');
  });
});

describe('bloqueio pelo servidor (403 QUESTIONARIO_PRE_PENDENTE)', () => {
  const PENDENTE = erroApi(
    403,
    'QUESTIONARIO_PRE_PENDENTE',
    'Responda ao questionário inicial para continuar',
  );
  const AULA = {
    id: 'a1',
    titulo: 'Phishing',
    concluida: false,
    pontos_conclusao: 20,
    conteudo_html: '<p>Golpe por e-mail.</p>',
    questoes: [{ id: 'q1', enunciado: 'P?', pontos: 10, alternativa_a: 'A', alternativa_b: 'B' }],
  };

  it('iniciar aula leva ao questionário inicial', async () => {
    await renderizarApp('/aulas/a1', {
      usuario: LIBERADO,
      rotas: {
        'GET /aulas/a1': AULA,
        'POST /aulas/a1/visitas': PENDENTE,
        'GET /questionarios/pre': DEFINICAO_PRE,
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Responder 1 pergunta' }));
    expect(await screen.findByRole('heading', { name: 'Boas-vindas à pesquisa' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/questionario/pre');
  });

  it('iniciar rodada de trivia leva ao questionário inicial', async () => {
    await renderizarApp('/trivia', {
      usuario: LIBERADO,
      rotas: {
        'GET /aulas': [{ ...AULA, concluida: true }],
        'POST /trivia/rodadas': PENDENTE,
        'GET /questionarios/pre': DEFINICAO_PRE,
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Fácil/ }));
    expect(await screen.findByRole('heading', { name: 'Boas-vindas à pesquisa' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/questionario/pre');
  });

  it('outro 403 só mostra a mensagem, sem levar ao questionário', async () => {
    await renderizarApp('/aulas/a1', {
      usuario: LIBERADO,
      rotas: {
        'GET /aulas/a1': AULA,
        'POST /aulas/a1/visitas': erroApi(403, 'PROIBIDO', 'Sem permissão'),
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Responder 1 pergunta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão');
    expect(window.location.pathname).toBe('/aulas/a1');
  });
});

describe('questionário final (pós)', () => {
  const FECHA = '2026-11-09T03:00:00.000Z'; // 00:00 de SP do dia 09: o último dia aceito é 08/11
  const POS = {
    ...PARTICIPANTE,
    questionarios: { pre_pendente: false, pos_pendente: true, pos_fecha_em: FECHA },
  };
  const RASCUNHO_POS = 'guardiao.questionario.pos.u1';
  const ENVIADO_POS = { status: 201, corpo: { questionarios: SITUACAO_OK } };
  const ENCERRADO = erroApi(410, 'QUESTIONARIO_ENCERRADO', 'O prazo para responder terminou');
  const PERGUNTA = 'Fiquei envolvido(a) no app.';
  const CARD = 'Questionário final disponível';
  // Depois de enviar/encerrar, a tela de Aulas confere /auth/me: o servidor já responde sem pendência.
  const DEPOIS = { 'GET /auth/me': sequencia(POS, LIBERADO) };
  const rascunhoPos = () =>
    localStorage.setItem(
      RASCUNHO_POS,
      JSON.stringify({ versao: 1, respostas: { FA1: 3 }, ordem: {}, passo: 0, inicio: Date.now() }),
    );
  const abrirPos = (caminho, rotas = {}, usuario = POS) =>
    renderizarApp(caminho, {
      usuario,
      rotas: { 'GET /aulas': [], 'GET /questionarios/pos': DEFINICAO_POS, ...rotas },
    });
  async function irParaAulasSemCard() {
    await userEvent.click(screen.getByRole('link', { name: 'Ir para as aulas' }));
    await screen.findByRole('heading', { name: 'Aulas' });
    expect(screen.queryByText(CARD)).not.toBeInTheDocument();
  }

  it('card na tela inicial mostra o prazo e leva ao questionário, com o aviso de resposta única', async () => {
    await abrirPos('/aulas');
    const card = await screen.findByRole('region', { name: CARD });
    expect(card).toHaveTextContent('Disponível até 08/11');
    expect(card).toHaveTextContent('Participação voluntária.');
    expect(card).not.toHaveTextContent(/satisfeit|necessário/i);
    await userEvent.click(within(card).getByRole('link', { name: 'Responder' }));
    expect(await screen.findByRole('heading', { name: 'Questionário final' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/questionario');
    expect(screen.getByText(DEFINICAO_POS.aviso)).toBeVisible();
  });

  it.each([
    ['menos de 24h', 2 * 3_600_000, /^Disponível (hoje|amanhã) até \d\d:\d\d$/],
    ['mais de 24h', 30 * 3_600_000, /^Disponível até \d\d\/\d\d$/],
  ])('card com %s para fechar', async (_, falta, texto) => {
    const fecha = new Date(Date.now() + falta).toISOString();
    await abrirPos('/aulas', {}, { ...POS, questionarios: { ...POS.questionarios, pos_fecha_em: fecha } });
    const card = await screen.findByRole('region', { name: CARD });
    expect(within(card).getByText(/^Disponível/).textContent).toMatch(texto);
  });

  it('abrir Aulas e voltar do segundo plano atualizam o card; falha de rede não mostra erro', async () => {
    let eu = LIBERADO;
    const { servidor } = await abrirPos('/aulas', { 'GET /auth/me': () => eu }, LIBERADO);
    await screen.findByRole('heading', { name: 'Aulas' });
    // Uma da sessão e uma da abertura da tela.
    await waitFor(() => expect(servidor.enviados('GET /auth/me')).toHaveLength(2));
    expect(screen.queryByText(CARD)).not.toBeInTheDocument();

    eu = POS; // chegou o dia 14
    mudarVisibilidade('hidden');
    expect(servidor.enviados('GET /auth/me')).toHaveLength(2);
    mudarVisibilidade('visible');
    expect(await screen.findByRole('region', { name: CARD })).toBeInTheDocument();

    eu = new TypeError('Failed to fetch');
    mudarVisibilidade('visible');
    await waitFor(() => expect(servidor.enviados('GET /auth/me')).toHaveLength(4));
    expect(screen.getByRole('region', { name: CARD })).toBeInTheDocument();
    expect(screen.queryByText('Sem conexão. Verifique sua internet')).not.toBeInTheDocument();

    eu = { status: 200, corpo: null }; // portal cativo: 200 sem JSON
    mudarVisibilidade('visible');
    await waitFor(() => expect(servidor.enviados('GET /auth/me')).toHaveLength(5));
    expect(screen.getByRole('region', { name: CARD })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
  });

  it('card sem pos_fecha_em não mostra a data', async () => {
    await abrirPos('/aulas', {}, { ...POS, questionarios: { pre_pendente: false, pos_pendente: true } });
    const card = await screen.findByRole('region', { name: CARD });
    expect(card).not.toHaveTextContent('Disponível até');
  });

  it('sem pendência: sem card, sem aba, e /questionario volta para as aulas', async () => {
    await abrirPos('/questionario', {}, LIBERADO);
    expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/aulas');
    expect(screen.queryByText(CARD)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Questionário' })).not.toBeInTheDocument();
  });

  it('admin também não vê nada da pesquisa', async () => {
    await renderizarApp('/aulas', {
      usuario: { ...ADMIN, questionarios: SITUACAO_OK },
      rotas: { 'GET /aulas': [] },
    });
    await screen.findByRole('heading', { name: 'Aulas' });
    expect(screen.queryByText(CARD)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Questionário' })).not.toBeInTheDocument();
  });

  it('último passo leva à confirmação; "Voltar para revisar" mantém as respostas; envio tira o card', async () => {
    const { servidor } = await abrirPos('/questionario', {
      'POST /questionarios/pos': ENVIADO_POS,
      ...DEPOIS,
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Começar' }));
    await screen.findByRole('heading', { name: 'Sua experiência com o app' });
    expect(screen.queryByRole('button', { name: 'Enviar respostas' })).not.toBeInTheDocument();
    await marcar(PERGUNTA, 'Concordo');
    await continuar();

    expect(await screen.findByRole('heading', { name: 'Enviar respostas?' })).toHaveFocus();
    expect(screen.getByText(/não dá para alterar/)).toBeInTheDocument();
    expect(servidor.enviados('POST /questionarios/pos')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Voltar para revisar' }));
    await screen.findByRole('heading', { name: 'Sua experiência com o app' });
    expect(within(grupo(PERGUNTA)).getByRole('radio', { name: 'Concordo' })).toBeChecked();

    await continuar();
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar respostas' }));
    expect(await screen.findByRole('heading', { name: 'Respostas enviadas' })).toBeInTheDocument();
    expect(servidor.enviados('POST /questionarios/pos')).toEqual([{ respostas: { FA1: 3 } }]);
    expect(localStorage.getItem(RASCUNHO_POS)).toBeNull();
    await irParaAulasSemCard();
  });

  it('na confirmação: 400 volta ao item recusado; 500 mostra o erro e deixa tentar de novo', async () => {
    rascunhoPos();
    const { servidor } = await abrirPos('/questionario', {
      'POST /questionarios/pos': sequencia(
        erroApi(400, 'VALIDACAO', 'Dados inválidos', [{ campo: 'FA1', mensagem: 'Escolha uma das opções' }]),
        erroApi(500, 'ERRO_INTERNO', 'Algo deu errado'),
        ENVIADO_POS,
      ),
    });
    await screen.findByRole('heading', { name: 'Sua experiência com o app' });
    await continuar();
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar respostas' }));
    await screen.findByRole('heading', { name: 'Sua experiência com o app' });
    expect(grupo(PERGUNTA)).toHaveAccessibleDescription('Escolha uma das opções');

    await continuar();
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar respostas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado');
    expect(screen.getByRole('heading', { name: 'Enviar respostas?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respostas' }));
    await screen.findByRole('heading', { name: 'Respostas enviadas' });
    expect(servidor.enviados('POST /questionarios/pos')).toHaveLength(3);
  });

  it('410 ao carregar: mostra a mensagem do servidor, limpa o rascunho e tira o card', async () => {
    rascunhoPos();
    await abrirPos('/questionario', { 'GET /questionarios/pos': ENCERRADO, ...DEPOIS });
    expect(await screen.findByRole('heading', { name: 'Prazo encerrado' })).toBeInTheDocument();
    expect(screen.getByText('O prazo para responder terminou')).toBeInTheDocument();
    expect(localStorage.getItem(RASCUNHO_POS)).toBeNull();
    await irParaAulasSemCard();
  });

  it.each([
    ['410', ENCERRADO, 'Prazo encerrado', 'O prazo para responder terminou'],
    [
      '409',
      erroApi(409, 'QUESTIONARIO_RESPONDIDO', 'Questionário já respondido'),
      'Você já respondeu',
      'Este questionário já foi respondido nesta conta. Obrigado pela participação!',
    ],
  ])('%s no envio encerra, limpa o rascunho e tira o card', async (_, erro, titulo, texto) => {
    rascunhoPos();
    await abrirPos('/questionario', { 'POST /questionarios/pos': erro, ...DEPOIS });
    await screen.findByRole('heading', { name: 'Sua experiência com o app' });
    await continuar();
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar respostas' }));
    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument();
    expect(screen.getByText(texto)).toBeInTheDocument();
    expect(localStorage.getItem(RASCUNHO_POS)).toBeNull();
    await irParaAulasSemCard();
  });

  it('404 (ainda indisponível) mostra a mensagem do servidor', async () => {
    await abrirPos('/questionario', {
      'GET /questionarios/pos': erroApi(404, 'NAO_ENCONTRADO', 'Questionário não disponível'),
    });
    expect(await screen.findByText('Questionário não disponível')).toBeInTheDocument();
  });
});
