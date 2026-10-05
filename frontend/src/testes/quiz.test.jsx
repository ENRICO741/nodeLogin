import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuiz } from '../hooks/useQuiz';
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
