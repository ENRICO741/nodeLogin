import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { erroApi, PARTICIPANTE, renderizarApp, sequencia, USUARIO } from './utils';

const questao = (id, extra = {}) => ({
  id,
  enunciado: `Pergunta ${id}?`,
  pontos: 10,
  imagem_url: null,
  alternativa_a: `${id}-A`,
  alternativa_b: `${id}-B`,
  alternativa_c: `${id}-C`,
  alternativa_d: `${id}-D`,
  ...extra,
});
const aula = (id, ordem, titulo, extra = {}) => ({
  id,
  titulo,
  ordem,
  pontos_conclusao: 20,
  total_questoes: 1,
  concluida: false,
  bloqueada: false,
  ...extra,
});
const AULAS = [
  aula('a1', 1, 'Phishing', { total_questoes: 2, concluida: true }),
  aula('a2', 2, 'Senhas fortes'),
  aula('a3', 3, 'Celular', { bloqueada: true }),
];
const AULAS_CONCLUIDAS = AULAS.map((a) => ({ ...a, concluida: true, bloqueada: false }));
const AULA = {
  id: 'a1',
  titulo: 'Phishing',
  ordem: 1,
  pontos_conclusao: 20,
  concluida: false,
  conteudo_html:
    '<h2>O que é</h2><p>Golpe por e-mail.</p><img src="x" onerror="window.hackeado=1"><script>window.hackeado=1</script>',
  questoes: [questao('q1'), questao('q2')],
};
const feedback = (correta, extra = {}) => ({
  correta,
  resposta_correta: 'b',
  explicacao: 'Sempre reporte.',
  pontos_ganhos: correta ? 10 : 0,
  pontuacao_total: 50,
  ...extra,
});
// Resposta que só chega quando o teste chamar liberar(): simula a rede lenta durante um toque duplo.
const pendente = (valor) => {
  const controle = {};
  controle.rota = () => new Promise((r) => (controle.liberar = () => r(valor)));
  return controle;
};
// Dois toques no MESMO render: com dois eventos separados o RTL re-renderiza entre eles e só o disabled já barraria.
const tocarDuasVezes = (botao) =>
  act(() => {
    botao.click();
    botao.click();
  });
const alternativa = (texto) => screen.getByRole('button', { name: new RegExp(`^${texto}`) });

describe('Aulas', () => {
  it('lista as aulas com progresso, status e link', async () => {
    await renderizarApp('/aulas', { rotas: { 'GET /aulas': AULAS } });
    expect(await screen.findByText('1 de 3 concluídas')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Aulas concluídas' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
    const itens = screen.getAllByRole('listitem');
    expect(within(itens[0]).getByText('Concluída')).toBeInTheDocument();
    expect(within(itens[1]).getByText(/1 pergunta ·/)).toBeInTheDocument();
    expect(within(itens[0]).getByText(/2 perguntas ·/)).toBeInTheDocument();
    expect(within(itens[1]).getByRole('link')).toHaveAttribute('href', '/aulas/a2');
  });

  it('aula bloqueada não tem link e diz qual concluir antes', async () => {
    await renderizarApp('/aulas', { rotas: { 'GET /aulas': AULAS } });
    const bloqueada = (await screen.findAllByRole('listitem'))[2];
    expect(within(bloqueada).getByText('Conclua a aula 2 para continuar')).toBeInTheDocument();
    expect(within(bloqueada).getByLabelText('Bloqueada')).toBeInTheDocument();
    expect(within(bloqueada).queryByRole('link')).toBeNull();
  });

  it('sem aulas mostra estado vazio', async () => {
    await renderizarApp('/aulas', { rotas: { 'GET /aulas': [] } });
    expect(await screen.findByText('Nenhuma aula disponível ainda')).toBeInTheDocument();
  });

  it('erro de carregamento permite tentar de novo', async () => {
    await renderizarApp('/aulas', {
      rotas: {
        'GET /aulas': sequencia(erroApi(500, 'ERRO_INTERNO', 'Erro interno. Tente novamente'), AULAS),
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Phishing')).toBeInTheDocument();
  });

  it('a raiz / leva para /aulas e o header mostra os pontos', async () => {
    await renderizarApp('/', { rotas: { 'GET /aulas': AULAS } });
    expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
    expect(screen.getByLabelText('40 pontos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aulas' })).toHaveClass(/ativa/);
  });
});

describe('Aula', () => {
  const rotasAula = (extra = {}) => ({
    'GET /aulas/a1': AULA,
    'POST /aulas/a1/visitas': { status: 201, corpo: { id: 'v1' } },
    ...extra,
  });

  it('sanitiza o HTML do conteúdo antes de mostrar', async () => {
    await renderizarApp('/aulas/a1', { rotas: rotasAula() });
    expect(await screen.findByRole('heading', { name: 'O que é' })).toBeInTheDocument();
    const artigo = screen.getByRole('article');
    expect(artigo.querySelector('script')).toBeNull();
    expect(artigo.querySelector('img').getAttribute('onerror')).toBeNull();
    expect(window.hackeado).toBeUndefined();
  });

  it('fluxo completo: conteúdo → perguntas → resultado com pontos e badge', async () => {
    const { servidor } = await renderizarApp('/aulas/a1', {
      usuario: PARTICIPANTE,
      rotas: rotasAula({
        'POST /visitas/v1/respostas': sequencia(feedback(true), feedback(false, { pontuacao_total: 50 })),
        'POST /visitas/v1/finalizar': {
          acertos: 1,
          total_questoes: 2,
          pontos_questoes: 10,
          bonus_conclusao: 20,
          pontuacao_total: 70,
          novos_badges: [{ id: 'b1', nome: 'Primeiros Passos' }],
        },
      }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Responder 2 perguntas' }));

    await userEvent.click(alternativa('q1-B'));
    expect(await screen.findByText('Resposta correta!')).toBeInTheDocument();
    expect(screen.getByText('+10 pts')).toBeInTheDocument();
    expect(screen.getByLabelText('50 pontos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Próxima pergunta' }));

    await userEvent.click(alternativa('q2-A'));
    expect(await screen.findByText('Resposta incorreta')).toBeInTheDocument();
    expect(screen.getByText('Sempre reporte.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Concluir aula' }));

    expect(await screen.findByRole('heading', { name: 'Aula concluída!' })).toBeInTheDocument();
    expect(screen.getByText('+30')).toBeInTheDocument();
    expect(screen.getByText('Primeiros Passos')).toBeInTheDocument();
    expect(screen.getByLabelText('70 pontos')).toBeInTheDocument();
    // Trivia só abre ao fim da trilha: sem trivia_liberada, sem atalho para ela.
    expect(screen.queryByRole('link', { name: 'Testar na trivia' })).toBeNull();
    expect(servidor.enviados('POST /visitas/v1/respostas')).toEqual([
      { questao_id: 'q1', alternativa: 'b' },
      { questao_id: 'q2', alternativa: 'a' },
    ]);
    await waitFor(() =>
      expect(servidor.enviados('POST /eventos').map((e) => e.tipo_evento)).toEqual(
        expect.arrayContaining(['aula_iniciada', 'quiz_respondido', 'aula_concluida']),
      ),
    );
  });

  it('aula já concluída oferece refazer', async () => {
    await renderizarApp('/aulas/a1', { rotas: rotasAula({ 'GET /aulas/a1': { ...AULA, concluida: true } }) });
    expect(await screen.findByText('Você já concluiu esta aula')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refazer perguntas' })).toBeInTheDocument();
  });

  it('aula sem perguntas não mostra botão de iniciar', async () => {
    await renderizarApp('/aulas/a1', { rotas: rotasAula({ 'GET /aulas/a1': { ...AULA, questoes: [] } }) });
    expect(await screen.findByText('Esta aula ainda não tem perguntas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Responder/ })).not.toBeInTheDocument();
  });

  it('falha ao iniciar mostra erro e mantém o conteúdo', async () => {
    await renderizarApp('/aulas/a1', {
      rotas: rotasAula({ 'POST /aulas/a1/visitas': erroApi(0, 'SEM_CONEXAO', 'Sem conexão') }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Responder 2 perguntas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão');
    expect(screen.getByRole('heading', { name: 'Phishing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Responder 2 perguntas' })).toBeEnabled();
  });

  it('toque duplo em iniciar abre uma visita só', async () => {
    const visita = pendente({ status: 201, corpo: { id: 'v1' } });
    const { servidor } = await renderizarApp('/aulas/a1', {
      rotas: rotasAula({ 'POST /aulas/a1/visitas': visita.rota }),
    });
    const botao = await screen.findByRole('button', { name: 'Responder 2 perguntas' });
    tocarDuasVezes(botao);
    expect(botao).toBeDisabled();
    visita.liberar();
    expect(await screen.findByText('Pergunta q1?')).toBeInTheDocument();
    expect(servidor.enviados('POST /aulas/a1/visitas')).toHaveLength(1);
  });

  it('toque duplo em concluir finaliza uma vez só', async () => {
    const fim = pendente({
      acertos: 1,
      total_questoes: 1,
      pontos_questoes: 10,
      bonus_conclusao: 20,
      pontuacao_total: 80,
      novos_badges: [],
    });
    const { servidor } = await renderizarApp('/aulas/a1', {
      rotas: rotasAula({
        'GET /aulas/a1': { ...AULA, questoes: [questao('q1')] },
        'POST /visitas/v1/respostas': feedback(true),
        'POST /visitas/v1/finalizar': fim.rota,
      }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Responder 1 pergunta' }));
    await userEvent.click(alternativa('q1-B'));
    tocarDuasVezes(await screen.findByRole('button', { name: 'Concluir aula' }));
    expect(screen.getByRole('button', { name: 'Concluindo…' })).toBeDisabled();
    fim.liberar();
    expect(await screen.findByRole('heading', { name: 'Aula concluída!' })).toBeInTheDocument();
    expect(servidor.enviados('POST /visitas/v1/finalizar')).toHaveLength(1);
  });

  it('falha ao responder mostra erro e deixa tentar de novo', async () => {
    await renderizarApp('/aulas/a1', {
      rotas: rotasAula({
        'POST /visitas/v1/respostas': sequencia(
          erroApi(500, 'ERRO_INTERNO', 'Erro interno.'),
          feedback(true),
        ),
      }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Responder 2 perguntas' }));
    await userEvent.click(alternativa('q1-B'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno.');
    expect(alternativa('q1-B')).toBeEnabled();
    await userEvent.click(alternativa('q1-B'));
    expect(await screen.findByText('Resposta correta!')).toBeInTheDocument();
  });

  it('ao concluir a última aula da trilha, o resultado oferece a trivia', async () => {
    await renderizarApp('/aulas/a1', {
      rotas: rotasAula({
        'GET /aulas/a1': { ...AULA, questoes: [questao('q1')] },
        'POST /visitas/v1/respostas': feedback(true),
        'POST /visitas/v1/finalizar': {
          acertos: 1,
          total_questoes: 1,
          pontos_questoes: 10,
          bonus_conclusao: 20,
          pontuacao_total: 80,
          novos_badges: [],
          trivia_liberada: true,
        },
      }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Responder 1 pergunta' }));
    await userEvent.click(alternativa('q1-B'));
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir aula' }));
    expect(await screen.findByRole('link', { name: 'Testar na trivia' })).toHaveAttribute('href', '/trivia');
  });

  it('falha ao concluir mostra erro e mantém a última pergunta', async () => {
    await renderizarApp('/aulas/a1', {
      rotas: rotasAula({
        'GET /aulas/a1': { ...AULA, questoes: [questao('q1')] },
        'POST /visitas/v1/respostas': feedback(true),
        'POST /visitas/v1/finalizar': erroApi(409, 'QUESTOES_PENDENTES', 'Responda todas as questões'),
      }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Responder 1 pergunta' }));
    await userEvent.click(alternativa('q1-B'));
    await userEvent.click(await screen.findByRole('button', { name: 'Concluir aula' }));
    expect(await screen.findByText('Responda todas as questões')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Concluir aula' })).toBeInTheDocument();
  });

  it('aula bloqueada (403) mostra o aviso e o caminho de volta', async () => {
    await renderizarApp('/aulas/a3', {
      rotas: { 'GET /aulas/a3': erroApi(403, 'AULA_BLOQUEADA', 'Conclua a aula 2 para continuar') },
    });
    expect(await screen.findByText('Conclua a aula 2 para continuar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Ver aulas' })).toHaveAttribute('href', '/aulas');
  });

  it('aula inexistente mostra o erro', async () => {
    await renderizarApp('/aulas/zzz', {
      rotas: { 'GET /aulas/zzz': erroApi(404, 'NAO_ENCONTRADO', 'Aula não encontrada') },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Aula não encontrada');
  });
});

const RODADA = {
  id: 'r1',
  dificuldade: 'facil',
  finalizada_em: null,
  pontos_ganhos: 0,
  questoes: [questao('t1', { respondida: false }), questao('t2', { respondida: false })],
};

describe('Trivia', () => {
  it('escolher a dificuldade cria a rodada e abre as perguntas', async () => {
    const { servidor } = await renderizarApp('/trivia', {
      rotas: {
        'GET /aulas': AULAS_CONCLUIDAS,
        'POST /trivia/rodadas': { status: 201, corpo: RODADA },
        'GET /trivia/rodadas/r1': RODADA,
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Média/ }));
    expect(await screen.findByText('Pergunta t1?')).toBeInTheDocument();
    expect(servidor.enviados('POST /trivia/rodadas')).toEqual([{ dificuldade: 'media' }]);
    expect(window.location.pathname).toBe('/trivia/r1');
  });

  it('toque duplo ao escolher a dificuldade cria uma rodada só e trava todos os níveis', async () => {
    const criar = pendente({ status: 201, corpo: RODADA });
    const { servidor } = await renderizarApp('/trivia', {
      rotas: {
        'GET /aulas': AULAS_CONCLUIDAS,
        'POST /trivia/rodadas': criar.rota,
        'GET /trivia/rodadas/r1': RODADA,
      },
    });
    tocarDuasVezes(await screen.findByRole('button', { name: /Média/ }));
    for (const nivel of [/Fácil/, /Média/, /Difícil/])
      expect(screen.getByRole('button', { name: nivel })).toBeDisabled();
    criar.liberar();
    expect(await screen.findByText('Pergunta t1?')).toBeInTheDocument();
    expect(servidor.enviados('POST /trivia/rodadas')).toHaveLength(1);
  });

  it('nível sem questões suficientes mostra a mensagem e fica desabilitado; os outros seguem', async () => {
    const { servidor } = await renderizarApp('/trivia', {
      rotas: {
        'GET /aulas': AULAS_CONCLUIDAS,
        'POST /trivia/rodadas': erroApi(
          409,
          'NIVEL_INDISPONIVEL',
          'Este nível ainda não tem questões suficientes',
        ),
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Difícil/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este nível ainda não tem questões suficientes',
    );
    expect(screen.getByRole('button', { name: /Difícil/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Fácil/ })).toBeEnabled();
    expect(servidor.enviados('POST /trivia/rodadas')).toEqual([{ dificuldade: 'dificil' }]);
  });

  it('outro erro ao criar a rodada (rede) mostra a mensagem e não desabilita o nível', async () => {
    await renderizarApp('/trivia', {
      rotas: { 'GET /aulas': AULAS_CONCLUIDAS, 'POST /trivia/rodadas': new TypeError('Failed to fetch') },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Difícil/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão');
    expect(screen.getByRole('button', { name: /Difícil/ })).toBeEnabled();
  });

  it('sem concluir todas as aulas, não mostra as dificuldades e manda para as aulas', async () => {
    const { servidor } = await renderizarApp('/trivia', { rotas: { 'GET /aulas': AULAS } });
    expect(await screen.findByText('Conclua todas as aulas para liberar a trivia')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fácil/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Ir para as aulas' })).toHaveAttribute('href', '/aulas');
    expect(servidor.enviados('POST /trivia/rodadas')).toEqual([]);
  });

  it('admin vê as dificuldades mesmo sem concluir as aulas', async () => {
    await renderizarApp('/trivia', {
      usuario: { ...USUARIO, papel: 'admin' },
      rotas: { 'GET /aulas': AULAS },
    });
    expect(await screen.findByRole('button', { name: /Fácil/ })).toBeInTheDocument();
    expect(screen.queryByText('Conclua todas as aulas para liberar a trivia')).toBeNull();
  });

  it('erro ao checar as aulas permite tentar de novo', async () => {
    await renderizarApp('/trivia', {
      rotas: { 'GET /aulas': sequencia(erroApi(500, 'ERRO_INTERNO', 'Erro interno'), AULAS_CONCLUIDAS) },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('button', { name: /Fácil/ })).toBeInTheDocument();
  });
});

describe('TriviaRodada', () => {
  it('joga até o fim e mostra o resultado', async () => {
    await renderizarApp('/trivia/r1', {
      rotas: {
        'GET /trivia/rodadas/r1': RODADA,
        'POST /trivia/rodadas/r1/respostas': feedback(true, { pontos_ganhos: 5 }),
        'POST /trivia/rodadas/r1/finalizar': {
          acertos: 2,
          total_questoes: 2,
          pontos_ganhos: 10,
          pontuacao_total: 50,
          novos_badges: [],
        },
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /^t1-A/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Próxima pergunta' }));
    await userEvent.click(alternativa('t2-A'));
    await userEvent.click(await screen.findByRole('button', { name: 'Ver resultado' }));
    expect(await screen.findByRole('heading', { name: 'Rodada finalizada!' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jogar outra rodada' })).toHaveAttribute('href', '/trivia');
  });

  it('erro na trivia mostra o link "Rever na aula N — título"; acerto não mostra', async () => {
    const aulaReferencia = { id: 'a7', ordem: 7, titulo: 'Senhas' };
    await renderizarApp('/trivia/r1', {
      rotas: {
        'GET /trivia/rodadas/r1': RODADA,
        'POST /trivia/rodadas/r1/respostas': sequencia(
          feedback(false, { aula_referencia: aulaReferencia }),
          feedback(true, { pontos_ganhos: 5, aula_referencia: aulaReferencia }),
        ),
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /^t1-A/ }));
    expect(await screen.findByRole('link', { name: 'Rever na aula 7 — Senhas' })).toHaveAttribute(
      'href',
      '/aulas/a7',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Próxima pergunta' }));
    await userEvent.click(alternativa('t2-A'));
    expect(await screen.findByText('Resposta correta!')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Rever na aula/ })).toBeNull();
  });

  it('ao recarregar, retoma da primeira pergunta não respondida', async () => {
    const meio = { ...RODADA, questoes: [{ ...RODADA.questoes[0], respondida: true }, RODADA.questoes[1]] };
    await renderizarApp('/trivia/r1', { rotas: { 'GET /trivia/rodadas/r1': meio } });
    expect(await screen.findByText('Pergunta t2?')).toBeInTheDocument();
    expect(screen.getByText('Pergunta 2 de 2')).toBeInTheDocument();
  });

  it('rodada já finalizada mostra os pontos feitos', async () => {
    await renderizarApp('/trivia/r1', {
      rotas: { 'GET /trivia/rodadas/r1': { ...RODADA, finalizada_em: '2026-01-01', pontos_ganhos: 15 } },
    });
    expect(await screen.findByText('Esta rodada já terminou')).toBeInTheDocument();
    expect(screen.getByText('Você fez 15 pontos nela.')).toBeInTheDocument();
  });

  it('todas respondidas mas sem finalizar: botão Ver resultado finaliza', async () => {
    const respondida = { ...RODADA, questoes: RODADA.questoes.map((q) => ({ ...q, respondida: true })) };
    await renderizarApp('/trivia/r1', {
      rotas: {
        'GET /trivia/rodadas/r1': respondida,
        'POST /trivia/rodadas/r1/finalizar': {
          acertos: 1,
          total_questoes: 2,
          pontos_ganhos: 5,
          pontuacao_total: 45,
          novos_badges: [],
        },
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Ver resultado' }));
    expect(await screen.findByRole('heading', { name: 'Rodada finalizada!' })).toBeInTheDocument();
  });

  it('toque duplo em "Ver resultado" (todas respondidas) finaliza uma vez só', async () => {
    const respondida = { ...RODADA, questoes: RODADA.questoes.map((q) => ({ ...q, respondida: true })) };
    const fim = pendente({
      acertos: 1,
      total_questoes: 2,
      pontos_ganhos: 5,
      pontuacao_total: 45,
      novos_badges: [],
    });
    const { servidor } = await renderizarApp('/trivia/r1', {
      rotas: { 'GET /trivia/rodadas/r1': respondida, 'POST /trivia/rodadas/r1/finalizar': fim.rota },
    });
    const botao = await screen.findByRole('button', { name: 'Ver resultado' });
    tocarDuasVezes(botao);
    expect(botao).toBeDisabled();
    fim.liberar();
    expect(await screen.findByRole('heading', { name: 'Rodada finalizada!' })).toBeInTheDocument();
    expect(servidor.enviados('POST /trivia/rodadas/r1/finalizar')).toHaveLength(1);
  });

  it('toque duplo ao finalizar a última pergunta finaliza uma vez só', async () => {
    const fim = pendente({
      acertos: 1,
      total_questoes: 1,
      pontos_ganhos: 5,
      pontuacao_total: 45,
      novos_badges: [],
    });
    const { servidor } = await renderizarApp('/trivia/r1', {
      rotas: {
        'GET /trivia/rodadas/r1': { ...RODADA, questoes: [RODADA.questoes[0]] },
        'POST /trivia/rodadas/r1/respostas': feedback(true),
        'POST /trivia/rodadas/r1/finalizar': fim.rota,
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /^t1-A/ }));
    tocarDuasVezes(await screen.findByRole('button', { name: 'Ver resultado' }));
    expect(screen.getByRole('button', { name: 'Finalizando…' })).toBeDisabled();
    fim.liberar();
    expect(await screen.findByRole('heading', { name: 'Rodada finalizada!' })).toBeInTheDocument();
    expect(servidor.enviados('POST /trivia/rodadas/r1/finalizar')).toHaveLength(1);
  });

  it('se finalizar falhar nesse caso, recarrega a rodada', async () => {
    const respondida = { ...RODADA, questoes: RODADA.questoes.map((q) => ({ ...q, respondida: true })) };
    const { servidor } = await renderizarApp('/trivia/r1', {
      rotas: {
        'GET /trivia/rodadas/r1': sequencia(respondida, { ...respondida, finalizada_em: '2026-01-01' }),
        'POST /trivia/rodadas/r1/finalizar': erroApi(409, 'RODADA_FINALIZADA', 'Já finalizada'),
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Ver resultado' }));
    expect(await screen.findByText('Esta rodada já terminou')).toBeInTheDocument();
    expect(servidor.enviados('GET /trivia/rodadas/r1')).toHaveLength(2);
  });

  it('se finalizar falhar e a rodada seguir aberta, "Ver resultado" volta habilitado', async () => {
    const respondida = { ...RODADA, questoes: RODADA.questoes.map((q) => ({ ...q, respondida: true })) };
    const { servidor } = await renderizarApp('/trivia/r1', {
      rotas: {
        'GET /trivia/rodadas/r1': sequencia(respondida, respondida),
        'POST /trivia/rodadas/r1/finalizar': sequencia(new TypeError('Failed to fetch'), {
          acertos: 1,
          total_questoes: 2,
          pontos_ganhos: 5,
          pontuacao_total: 45,
          novos_badges: [],
        }),
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Ver resultado' }));
    await waitFor(() => expect(servidor.enviados('GET /trivia/rodadas/r1')).toHaveLength(2));
    const botao = await screen.findByRole('button', { name: 'Ver resultado' });
    expect(botao).toBeEnabled();
    await userEvent.click(botao);
    expect(await screen.findByRole('heading', { name: 'Rodada finalizada!' })).toBeInTheDocument();
    expect(servidor.enviados('POST /trivia/rodadas/r1/finalizar')).toHaveLength(2);
  });

  it('erro ao finalizar a última pergunta aparece na tela e deixa tentar de novo', async () => {
    const { servidor } = await renderizarApp('/trivia/r1', {
      rotas: {
        'GET /trivia/rodadas/r1': { ...RODADA, questoes: [RODADA.questoes[0]] },
        'POST /trivia/rodadas/r1/respostas': feedback(false),
        'POST /trivia/rodadas/r1/finalizar': sequencia(new TypeError('Failed to fetch'), {
          acertos: 0,
          total_questoes: 1,
          pontos_ganhos: 0,
          pontuacao_total: 40,
          novos_badges: [],
        }),
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /^t1-A/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ver resultado' }));
    expect(await screen.findByText('Sem conexão. Verifique sua internet')).toBeInTheDocument();
    const botao = screen.getByRole('button', { name: 'Ver resultado' });
    expect(botao).toBeEnabled();
    await userEvent.click(botao);
    expect(await screen.findByRole('heading', { name: 'Rodada finalizada!' })).toBeInTheDocument();
    expect(servidor.enviados('POST /trivia/rodadas/r1/finalizar')).toHaveLength(2);
  });

  it('rodada de outro usuário (404) mostra o erro', async () => {
    await renderizarApp('/trivia/r9', {
      rotas: { 'GET /trivia/rodadas/r9': erroApi(404, 'NAO_ENCONTRADO', 'Rodada não encontrada') },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Rodada não encontrada');
  });
});
