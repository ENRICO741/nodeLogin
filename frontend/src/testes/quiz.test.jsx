import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuiz } from '../hooks/useQuiz';
import { QuestaoCard } from '../componentes/QuestaoCard';

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
