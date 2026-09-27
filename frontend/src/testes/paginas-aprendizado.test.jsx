import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { erroApi, renderizarApp, sequencia } from './utils';

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
const AULAS = [
  { id: 'a1', titulo: 'Phishing', ordem: 1, pontos_conclusao: 20, total_questoes: 2, concluida: true },
  { id: 'a2', titulo: 'Senhas fortes', ordem: 2, pontos_conclusao: 20, total_questoes: 1, concluida: false },
];
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
const alternativa = (texto) => screen.getByRole('button', { name: new RegExp(`^${texto}`) });

describe('Aulas', () => {
  it('lista as aulas com progresso, status e link', async () => {
    await renderizarApp('/aulas', { rotas: { 'GET /aulas': AULAS } });
    expect(await screen.findByText('1 de 2 concluídas')).toBeInTheDocument();
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
      rotas: { 'POST /trivia/rodadas': { status: 201, corpo: RODADA }, 'GET /trivia/rodadas/r1': RODADA },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Média/ }));
    expect(await screen.findByText('Pergunta t1?')).toBeInTheDocument();
    expect(servidor.enviados('POST /trivia/rodadas')).toEqual([{ dificuldade: 'media' }]);
    expect(window.location.pathname).toBe('/trivia/r1');
  });

  it('sem questões na dificuldade mostra o erro e reabilita as opções', async () => {
    await renderizarApp('/trivia', {
      rotas: {
        'POST /trivia/rodadas': erroApi(409, 'SEM_QUESTOES', 'Ainda não há questões para esta dificuldade'),
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Difícil/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ainda não há questões');
    expect(screen.getByRole('button', { name: /Difícil/ })).toBeEnabled();
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

  it('erro ao finalizar a última pergunta aparece na tela', async () => {
    await renderizarApp('/trivia/r1', {
      rotas: {
        'GET /trivia/rodadas/r1': { ...RODADA, questoes: [RODADA.questoes[0]] },
        'POST /trivia/rodadas/r1/respostas': feedback(false),
        'POST /trivia/rodadas/r1/finalizar': erroApi(0, 'SEM_CONEXAO', 'Sem conexão'),
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /^t1-A/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ver resultado' }));
    expect(await screen.findByText('Sem conexão. Verifique sua internet')).toBeInTheDocument();
  });

  it('rodada de outro usuário (404) mostra o erro', async () => {
    await renderizarApp('/trivia/r9', {
      rotas: { 'GET /trivia/rodadas/r9': erroApi(404, 'NAO_ENCONTRADO', 'Rodada não encontrada') },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Rodada não encontrada');
  });
});
