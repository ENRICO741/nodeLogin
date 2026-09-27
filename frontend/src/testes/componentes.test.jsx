import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Campo } from '../componentes/Campo';
import { Aviso, Carregando, ErroCarregamento, Vazio } from '../componentes/Estado';
import { Avatar } from '../componentes/Avatar';
import { CardResultado } from '../componentes/CardResultado';
import { ErrorBoundary } from '../componentes/ErrorBoundary';
import { AvisoAtualizacao } from '../componentes/AvisoAtualizacao';
import { QuestaoCard } from '../componentes/QuestaoCard';

describe('Campo', () => {
  it('input com label associado', () => {
    render(<Campo label="E-mail" name="email" type="email" />);
    const input = screen.getByLabelText('E-mail');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('ajuda e erro ficam ligados por aria-describedby e marcam aria-invalid', () => {
    render(<Campo label="Senha" name="senha" ajuda="Mínimo 8" erro="Curta demais" />);
    const input = screen.getByLabelText('Senha');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Mínimo 8 Curta demais');
  });

  it('só ajuda: descrição sem aria-invalid', () => {
    render(<Campo label="Bio" name="bio" ajuda="Opcional" />);
    expect(screen.getByLabelText('Bio')).toHaveAccessibleDescription('Opcional');
    expect(screen.getByLabelText('Bio')).not.toHaveAttribute('aria-invalid');
  });

  it('multilinha vira textarea e children vira select', () => {
    render(
      <>
        <Campo label="Texto" name="t" multilinha />
        <Campo label="Opção" name="o" defaultValue="b">
          <option value="a">A</option>
          <option value="b">B</option>
        </Campo>
      </>,
    );
    expect(screen.getByLabelText('Texto').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Opção')).toHaveValue('b');
  });
});

describe('Estado', () => {
  it('Carregando tem role status e texto padrão ou personalizado', () => {
    const { rerender } = render(<Carregando />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    rerender(<Carregando texto="Buscando aulas" />);
    expect(screen.getByRole('status')).toHaveTextContent('Buscando aulas');
  });

  it('ErroCarregamento mostra a mensagem e o botão de tentar de novo só quando há ação', async () => {
    const tentar = vi.fn();
    const { rerender } = render(
      <ErroCarregamento erro={{ message: 'Sem conexão' }} onTentarDeNovo={tentar} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(tentar).toHaveBeenCalled();
    rerender(<ErroCarregamento />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('Vazio mostra título e conteúdo extra', () => {
    render(
      <Vazio titulo="Nada aqui">
        <button>ação</button>
      </Vazio>,
    );
    expect(screen.getByText('Nada aqui')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ação' })).toBeInTheDocument();
  });

  it('Aviso: erro usa role alert, outros usam status, sem conteúdo não renderiza', () => {
    const { rerender, container } = render(<Aviso tipo="erro">Falhou</Aviso>);
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
    rerender(<Aviso tipo="sucesso">Salvo</Aviso>);
    expect(screen.getByRole('status')).toHaveClass('aviso--sucesso');
    rerender(<Aviso>Info</Aviso>);
    expect(screen.getByRole('status')).toHaveClass('aviso--info');
    rerender(<Aviso tipo="erro">{null}</Aviso>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Avatar', () => {
  it('com foto mostra a imagem decorativa', () => {
    const { container } = render(<Avatar url="data:image/png;base64,AA" nome="Maria" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AA');
    expect(img).toHaveAttribute('alt', '');
  });

  it('sem foto mostra a inicial em maiúscula; sem nome não quebra', () => {
    const { container, rerender } = render(<Avatar nome="maria" tamanho={50} />);
    expect(container).toHaveTextContent('M');
    expect(container.firstChild).toHaveStyle({ width: '50px' });
    rerender(<Avatar />);
    expect(container.firstChild).toBeEmptyDOMElement();
  });
});

describe('CardResultado', () => {
  const base = { titulo: 'Fim!', acertos: 2, total: 3, pontuacaoTotal: 100 };

  it('mostra acertos, pontos e ações', () => {
    render(
      <CardResultado {...base} pontosGanhos={25}>
        <button>continuar</button>
      </CardResultado>,
    );
    expect(screen.getByRole('heading', { name: 'Fim!' })).toBeInTheDocument();
    expect(screen.getByText(/Você acertou/)).toHaveTextContent('Você acertou 2 de 3');
    expect(screen.getByText('+25')).toBeInTheDocument();
    expect(screen.queryByText(/pontuam só na primeira vez/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'continuar' })).toBeInTheDocument();
  });

  it('zero pontos explica a regra; badges novos aparecem', () => {
    render(
      <CardResultado {...base} pontosGanhos={0} novosBadges={[{ id: 'b1', nome: 'Primeiros Passos' }]} />,
    );
    expect(screen.getByText(/pontuam só na primeira vez/)).toBeInTheDocument();
    expect(screen.getByText('Nova conquista!')).toBeInTheDocument();
    expect(screen.getByText('Primeiros Passos')).toBeInTheDocument();
  });
});

describe('ErrorBoundary', () => {
  function Quebra() {
    throw new Error('bug');
  }

  it('mostra os filhos quando não há erro', () => {
    render(
      <ErrorBoundary>
        <p>ok</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('captura erro de renderização e mostra mensagem com opção de recarregar', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Quebra />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado nesta tela.');
    // jsdom não implementa reload (só registra aviso); aqui basta o clique não quebrar.
    expect(() => screen.getByRole('button', { name: 'Tentar de novo' }).click()).not.toThrow();
  });
});

describe('AvisoAtualizacao', () => {
  it('não aparece sem versão nova', () => {
    const { container } = render(<AvisoAtualizacao />);
    expect(container).toBeEmptyDOMElement();
  });

  it('com versão nova: Atualizar aplica, Depois esconde', async () => {
    const atualizar = vi.fn();
    const esconder = vi.fn();
    useRegisterSW.mockReturnValue({ needRefresh: [true, esconder], updateServiceWorker: atualizar });
    render(<AvisoAtualizacao />);
    expect(screen.getByRole('status')).toHaveTextContent('Nova versão disponível.');
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(atualizar).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(esconder).toHaveBeenCalledWith(false);
    useRegisterSW.mockReturnValue({ needRefresh: [false, vi.fn()], updateServiceWorker: vi.fn() });
  });
});

describe('QuestaoCard', () => {
  const questao = {
    id: 'q',
    enunciado: 'Qual é seguro?',
    pontos: 15,
    imagem_url: 'https://x.com/a.png',
    alternativa_a: 'A1',
    alternativa_b: 'B1',
    alternativa_c: 'C1',
    alternativa_d: 'D1',
  };
  const quiz = (extra) => ({
    questao,
    indice: 1,
    total: 4,
    ultima: false,
    escolha: null,
    feedback: null,
    enviando: false,
    erro: null,
    responder: vi.fn(),
    avancar: vi.fn(),
    ...extra,
  });

  it('mostra progresso, pontos, imagem com alt e enunciado', () => {
    render(<QuestaoCard quiz={quiz()} />);
    expect(screen.getByText('Pergunta 2 de 4')).toBeInTheDocument();
    expect(screen.getByText('15 pts')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Imagem de apoio da pergunta' })).toHaveAttribute(
      'src',
      questao.imagem_url,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('enquanto envia, as alternativas ficam desabilitadas', () => {
    render(<QuestaoCard quiz={quiz({ enviando: true, escolha: 'a' })} />);
    expect(screen.getByRole('button', { name: /A1/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /A1/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('acerto marca a correta e na última pergunta o botão chama onFinal', async () => {
    const onFinal = vi.fn();
    render(
      <QuestaoCard
        quiz={quiz({
          ultima: true,
          escolha: 'b',
          feedback: { correta: true, resposta_correta: 'b', pontos_ganhos: 0 },
        })}
        textoFinal="Concluir aula"
        onFinal={onFinal}
      />,
    );
    expect(screen.getByLabelText('Resposta correta')).toBeInTheDocument();
    expect(screen.queryByText(/\+\d+ pts/)).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    await userEvent.click(screen.getByRole('button', { name: 'Concluir aula' }));
    expect(onFinal).toHaveBeenCalled();
  });

  it('erro marca a escolhida como incorreta e mostra a certa', () => {
    render(
      <QuestaoCard
        quiz={quiz({ escolha: 'a', feedback: { correta: false, resposta_correta: 'c', pontos_ganhos: 0 } })}
      />,
    );
    expect(screen.getByLabelText('Sua resposta, incorreta')).toBeInTheDocument();
    expect(screen.getByLabelText('Resposta correta')).toBeInTheDocument();
    expect(screen.getByText('Resposta incorreta')).toBeInTheDocument();
  });
});
