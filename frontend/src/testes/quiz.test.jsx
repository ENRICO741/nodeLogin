import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { embaralhar, useQuiz } from '../hooks/useQuiz';
import { QuestaoCard } from '../componentes/QuestaoCard';
import { ErroApi } from '../lib/api';

const QUESTOES = [1, 2].map((n) => ({
  id: `q${n}`,
  enunciado: `Pergunta ${n}?`,
  pontos: 10,
  alternativa_a: 'Opção A',
  alternativa_b: 'Opção B',
  alternativa_c: 'Opção C',
  alternativa_d: 'Opção D',
}));

function Quiz({ enviarResposta, onFinal = () => {} }) {
  const quiz = useQuiz({ questoes: QUESTOES, enviarResposta });
  return <QuestaoCard quiz={quiz} onFinal={onFinal} />;
}

const opcao = (letra) => screen.getByRole('button', { name: new RegExp(`^Opção ${letra}`) });

describe('quiz', () => {
  it('envia uma resposta só, mesmo com clique duplo, e anuncia o feedback', async () => {
    let resolver;
    const enviarResposta = vi.fn(() => new Promise((r) => (resolver = r)));
    render(<Quiz enviarResposta={enviarResposta} />);

    await userEvent.click(opcao('B'));
    await userEvent.click(opcao('C'));
    expect(enviarResposta).toHaveBeenCalledTimes(1);
    expect(enviarResposta).toHaveBeenCalledWith('q1', 'b');

    resolver({ correta: false, resposta_correta: 'c', explicacao: 'Porque C.', pontos_ganhos: 0 });
    expect(await screen.findByText('Resposta incorreta')).toBeInTheDocument();
    expect(screen.getByText('Porque C.')).toBeInTheDocument();
    expect(opcao('B')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Próxima pergunta' })).toHaveFocus();
  });

  it('mostra o erro e deixa tentar de novo quando a API falha', async () => {
    const enviarResposta = vi
      .fn()
      .mockRejectedValueOnce(new Error('Sem conexão.'))
      .mockResolvedValueOnce({ correta: true, resposta_correta: 'a', pontos_ganhos: 10 });
    render(<Quiz enviarResposta={enviarResposta} />);

    await userEvent.click(opcao('A'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.');
    await userEvent.click(opcao('A'));
    expect(await screen.findByText('Resposta correta!')).toBeInTheDocument();
    expect(screen.getByText('+10 pts')).toBeInTheDocument();
  });

  describe('resposta gravada sem o retorno chegar', () => {
    const semConexao = () => new ErroApi(0, { erro: { codigo: 'SEM_CONEXAO', mensagem: 'Sem conexão.' } });
    const jaRespondida = () =>
      new ErroApi(409, { erro: { codigo: 'JA_RESPONDIDA', mensagem: 'Você já respondeu esta pergunta' } });

    it('falha de rede e nova tentativa com a mesma alternativa mostra o feedback', async () => {
      const enviarResposta = vi
        .fn()
        .mockRejectedValueOnce(semConexao())
        .mockResolvedValueOnce({ correta: true, resposta_correta: 'a', pontos_ganhos: 10 });
      render(<Quiz enviarResposta={enviarResposta} />);
      await userEvent.click(opcao('A'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.');
      await userEvent.click(opcao('A'));
      expect(await screen.findByText('Resposta correta!')).toBeInTheDocument();
      expect(enviarResposta.mock.calls).toEqual([
        ['q1', 'a'],
        ['q1', 'a'],
      ]);
    });

    it('outra alternativa recusada com JA_RESPONDIDA reenvia a anterior e mostra o resultado dela', async () => {
      const enviarResposta = vi
        .fn()
        .mockRejectedValueOnce(semConexao())
        .mockRejectedValueOnce(jaRespondida())
        .mockResolvedValueOnce({ correta: false, resposta_correta: 'c', pontos_ganhos: 0 });
      render(<Quiz enviarResposta={enviarResposta} />);
      await userEvent.click(opcao('A'));
      await screen.findByRole('alert');
      await userEvent.click(opcao('B'));
      expect(await screen.findByText('Resposta incorreta')).toBeInTheDocument();
      expect(enviarResposta.mock.calls).toEqual([
        ['q1', 'a'],
        ['q1', 'b'],
        ['q1', 'a'],
      ]);
      expect(opcao('A')).toHaveAttribute('aria-pressed', 'true');
      expect(opcao('B')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('500 também fica sem retorno: outra alternativa recusada com JA_RESPONDIDA reenvia a anterior', async () => {
      const enviarResposta = vi
        .fn()
        .mockRejectedValueOnce(
          new ErroApi(500, { erro: { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno.' } }),
        )
        .mockRejectedValueOnce(jaRespondida())
        .mockResolvedValueOnce({ correta: false, resposta_correta: 'c', pontos_ganhos: 0 });
      render(<Quiz enviarResposta={enviarResposta} />);
      await userEvent.click(opcao('A'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno.');
      await userEvent.click(opcao('B'));
      expect(await screen.findByText('Resposta incorreta')).toBeInTheDocument();
      expect(enviarResposta.mock.calls.map(([, alt]) => alt)).toEqual(['a', 'b', 'a']);
    });

    it('duas falhas de rede seguidas: acha a gravada (a primeira) entre as que ficaram sem retorno', async () => {
      // A foi gravada sem o retorno chegar; B nem saiu; C é recusada; reenvia B (409) e então A (vale).
      const enviarResposta = vi.fn(async (_id, alternativa) => {
        if (enviarResposta.mock.calls.length <= 2) throw semConexao();
        if (alternativa !== 'a') throw jaRespondida();
        return { correta: true, resposta_correta: 'a', pontos_ganhos: 10 };
      });
      render(<Quiz enviarResposta={enviarResposta} />);
      await userEvent.click(opcao('A'));
      await screen.findByRole('alert');
      await userEvent.click(opcao('B'));
      await screen.findByRole('alert');
      await userEvent.click(opcao('C'));
      expect(await screen.findByText('Resposta correta!')).toBeInTheDocument();
      expect(enviarResposta.mock.calls.map(([, a]) => a)).toEqual(['a', 'b', 'c', 'a']);
      expect(opcao('A')).toHaveAttribute('aria-pressed', 'true');
    });

    it('nenhuma das sem retorno foi a gravada: mostra o 409 e continua tentando depois', async () => {
      const enviarResposta = vi
        .fn()
        .mockRejectedValueOnce(semConexao()) // A: não chegou
        .mockRejectedValueOnce(jaRespondida()) // B: recusada (a gravada é outra)
        .mockRejectedValueOnce(jaRespondida()); // reenvio de A
      render(<Quiz enviarResposta={enviarResposta} />);
      await userEvent.click(opcao('A'));
      await screen.findByRole('alert');
      await userEvent.click(opcao('B'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Você já respondeu esta pergunta');
      expect(opcao('B')).toBeEnabled();
      expect(enviarResposta).toHaveBeenCalledTimes(3);
    });

    it('JA_RESPONDIDA sem nada perdido (ou depois de erro que não é de rede) continua mostrando o erro', async () => {
      const enviarResposta = vi
        .fn()
        .mockRejectedValueOnce(new ErroApi(400, { erro: { codigo: 'VALIDACAO', mensagem: 'Inválida' } }))
        .mockRejectedValueOnce(jaRespondida());
      render(<Quiz enviarResposta={enviarResposta} />);
      await userEvent.click(opcao('A'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Inválida');
      await userEvent.click(opcao('B'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Você já respondeu esta pergunta');
      expect(enviarResposta).toHaveBeenCalledTimes(2);
    });

    it('se o reenvio da anterior também falhar, mostra o erro e deixa tentar de novo', async () => {
      const enviarResposta = vi
        .fn()
        .mockRejectedValueOnce(new ErroApi(503, null))
        .mockRejectedValueOnce(jaRespondida())
        .mockRejectedValueOnce(semConexao())
        .mockResolvedValueOnce({ correta: true, resposta_correta: 'a', pontos_ganhos: 10 });
      render(<Quiz enviarResposta={enviarResposta} />);
      await userEvent.click(opcao('A'));
      await screen.findByRole('alert');
      await userEvent.click(opcao('B'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.');
      await userEvent.click(opcao('A'));
      expect(await screen.findByText('Resposta correta!')).toBeInTheDocument();
      expect(enviarResposta.mock.calls.map(([, alt]) => alt)).toEqual(['a', 'b', 'a', 'a']);
    });
  });

  it('avança até a última pergunta e chama onFinal', async () => {
    const onFinal = vi.fn();
    const enviarResposta = vi
      .fn()
      .mockResolvedValue({ correta: true, resposta_correta: 'a', pontos_ganhos: 0 });
    render(<Quiz enviarResposta={enviarResposta} onFinal={onFinal} />);

    await userEvent.click(opcao('A'));
    await userEvent.click(await screen.findByRole('button', { name: 'Próxima pergunta' }));
    expect(screen.getByText('Pergunta 2?')).toBeInTheDocument();
    await userEvent.click(opcao('A'));
    await userEvent.click(await screen.findByRole('button', { name: 'Ver resultado' }));
    expect(onFinal).toHaveBeenCalledTimes(1);
  });
});

describe('embaralhar', () => {
  it('devolve as mesmas letras, sem mexer na lista original', () => {
    const letras = ['a', 'b', 'c', 'd'];
    const sorteadas = embaralhar(letras);
    expect([...sorteadas].sort()).toEqual(letras);
    expect(letras).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lista vazia ou de um item volta igual', () => {
    expect(embaralhar([])).toEqual([]);
    expect(embaralhar(['a'])).toEqual(['a']);
  });

  it('cada letra cai em cada posição com a mesma chance (~25%)', () => {
    const n = 24000;
    const contagem = { a: [0, 0, 0, 0], b: [0, 0, 0, 0], c: [0, 0, 0, 0], d: [0, 0, 0, 0] };
    for (let i = 0; i < n; i++) embaralhar(['a', 'b', 'c', 'd']).forEach((l, pos) => contagem[l][pos]++);
    // Desvio padrão de cada contagem ~67; 2 pontos percentuais (480) é folga de mais de 7 desvios.
    for (const posicoes of Object.values(contagem)) {
      for (const c of posicoes) expect(Math.abs(c / n - 0.25)).toBeLessThan(0.02);
    }
  });
});

describe('ordem das alternativas', () => {
  // Texto dos botões de alternativa, na ordem da tela.
  const naTela = () =>
    screen
      .getAllByRole('button')
      .filter((b) => b.textContent.includes('Opção'))
      .map((b) => b.textContent.slice(1, 8));
  const letrasNaTela = () =>
    screen
      .getAllByRole('button')
      .filter((b) => b.textContent.includes('Opção'))
      .map((b) => b.textContent[0]);

  it('sorteada: a letra da tela segue a posição, mas a resposta vai com a letra original', async () => {
    // Math.random sempre 0: o Fisher-Yates dá a ordem b, c, d, a.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const enviarResposta = vi
      .fn()
      .mockResolvedValue({ correta: false, resposta_correta: 'a', pontos_ganhos: 0 });
    try {
      render(<Quiz enviarResposta={enviarResposta} />);
      expect(naTela()).toEqual(['Opção B', 'Opção C', 'Opção D', 'Opção A']);
      expect(letrasNaTela()).toEqual(['A', 'B', 'C', 'D']);

      // Primeiro botão (letra "A" na tela) é a alternativa original b.
      await userEvent.click(screen.getAllByRole('button')[0]);
      expect(enviarResposta).toHaveBeenCalledWith('q1', 'b');
      // A correta (original a) aparece marcada na última posição; a ordem não muda depois da resposta.
      expect(await screen.findByLabelText('Resposta correta')).toBeInTheDocument();
      expect(opcao('A')).toContainElement(screen.getByLabelText('Resposta correta'));
      expect(opcao('B')).toContainElement(screen.getByLabelText('Sua resposta, incorreta'));
      expect(naTela()).toEqual(['Opção B', 'Opção C', 'Opção D', 'Opção A']);
    } finally {
      random.mockRestore();
    }
  });

  it('Math.random perto de 1 mantém a ordem original (caso de borda do sorteio)', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    try {
      render(<Quiz enviarResposta={vi.fn()} />);
      expect(naTela()).toEqual(['Opção A', 'Opção B', 'Opção C', 'Opção D']);
    } finally {
      random.mockRestore();
    }
  });

  it('cada tentativa sorteia de novo; na mesma tentativa a ordem fica', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const enviarResposta = vi
      .fn()
      .mockResolvedValue({ correta: true, resposta_correta: 'b', pontos_ganhos: 0 });
    try {
      const { unmount } = render(<Quiz enviarResposta={enviarResposta} />);
      expect(naTela()).toEqual(['Opção B', 'Opção C', 'Opção D', 'Opção A']);
      unmount();

      // Nova tentativa (quiz montado de novo) com outro sorteio.
      random.mockReturnValue(0.9999);
      render(<Quiz enviarResposta={enviarResposta} />);
      expect(naTela()).toEqual(['Opção A', 'Opção B', 'Opção C', 'Opção D']);
      // Mudar o Math.random no meio da tentativa não reordena: o sorteio é feito uma vez, ao abrir.
      random.mockReturnValue(0);
      await userEvent.click(opcao('B'));
      expect(await screen.findByText('Resposta correta!')).toBeInTheDocument();
      expect(naTela()).toEqual(['Opção A', 'Opção B', 'Opção C', 'Opção D']);
    } finally {
      random.mockRestore();
    }
  });

  it('erro da API não reordena: a nova tentativa de resposta usa a mesma ordem', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const enviarResposta = vi
      .fn()
      .mockRejectedValueOnce(new Error('Sem conexão.'))
      .mockResolvedValueOnce({ correta: true, resposta_correta: 'c', pontos_ganhos: 10 });
    try {
      render(<Quiz enviarResposta={enviarResposta} />);
      await userEvent.click(opcao('C'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.');
      expect(naTela()).toEqual(['Opção B', 'Opção C', 'Opção D', 'Opção A']);
      await userEvent.click(opcao('C'));
      expect(await screen.findByText('Resposta correta!')).toBeInTheDocument();
      expect(enviarResposta.mock.calls.map(([, alt]) => alt)).toEqual(['c', 'c']);
    } finally {
      random.mockRestore();
    }
  });
});
