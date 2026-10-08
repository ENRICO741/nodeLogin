import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Campo } from '../componentes/Campo';
import { CampoSenhaNova } from '../componentes/CampoSenhaNova';
import { Aviso, Carregando, ErroCarregamento, Vazio } from '../componentes/Estado';
import { Avatar } from '../componentes/Avatar';
import { CardResultado } from '../componentes/CardResultado';
import { ErrorBoundary } from '../componentes/ErrorBoundary';
import { AvisoAtualizacao } from '../componentes/AvisoAtualizacao';
import { AvisoInstalar } from '../componentes/AvisoInstalar';
import { QuestaoCard } from '../componentes/QuestaoCard';
import { AuthProvider } from '../contexto/Auth';
import { ADMIN, USUARIO, servidorFalso } from './utils';

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

describe('CampoSenhaNova', () => {
  const AVISO = /Não use emoji nem caracteres invisíveis/;
  const renderizar = (props) => {
    render(<CampoSenhaNova label="Senha" name="senha" {...props} />);
    return screen.getByLabelText('Senha');
  };
  // Estado de cada requisito pelo texto sr-only, na ordem da lista.
  const estados = () => screen.getAllByRole('listitem').map((li) => li.textContent.split(': ').at(-1));
  const item = (texto) => screen.getByText(texto, { exact: false, selector: 'li' });

  it('começa com os 5 requisitos pendentes, sem aviso, e a lista descreve o input', () => {
    const input = renderizar();
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    expect(input).toBeRequired();
    expect(estados()).toEqual(['pendente', 'pendente', 'pendente', 'pendente', 'pendente']);
    expect(
      screen.getAllByRole('listitem').filter((li) => li.classList.contains('requisitos-senha__ok')),
    ).toEqual([]);
    expect(input).not.toHaveAttribute('aria-invalid');
    const lista = screen.getByRole('list');
    expect(input.getAttribute('aria-describedby').split(' ')).toContain(lista.parentElement.id);
    expect(input).toHaveAccessibleDescription(/Pelo menos 8 caracteres: pendente/);
  });

  it('cada tipo digitado marca o requisito como atendido', async () => {
    const input = renderizar();
    await userEvent.type(input, 'a');
    expect(item('Uma letra minúscula')).toHaveTextContent('Uma letra minúscula: atendido');
    expect(item('Uma letra minúscula')).toHaveClass('requisitos-senha__ok');
    expect(item('Uma letra maiúscula')).toHaveTextContent(': pendente');
    await userEvent.type(input, 'B');
    expect(item('Uma letra maiúscula')).toHaveTextContent(': atendido');
    await userEvent.type(input, '3');
    expect(item('Um número')).toHaveTextContent(': atendido');
    await userEvent.type(input, '#');
    expect(item('Um caractere especial')).toHaveTextContent(': atendido');
    expect(item('Pelo menos 8 caracteres')).toHaveTextContent(': pendente');
    await userEvent.type(input, 'xyzw');
    expect(estados()).toEqual(['atendido', 'atendido', 'atendido', 'atendido', 'atendido']);
    expect(input).toHaveAccessibleDescription(/Um número: atendido/);
  });

  it('apagar volta o requisito para pendente', async () => {
    const input = renderizar();
    await userEvent.type(input, 'A');
    expect(item('Uma letra maiúscula')).toHaveTextContent(': atendido');
    await userEvent.type(input, '{Backspace}');
    expect(estados()).toEqual(['pendente', 'pendente', 'pendente', 'pendente', 'pendente']);
  });

  it('aviso aparece só com emoji e some ao apagar', async () => {
    const input = renderizar();
    await userEvent.type(input, 'Senha1!');
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    await userEvent.type(input, '😀');
    expect(screen.getByText(AVISO)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(AVISO);
    await userEvent.clear(input);
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('caractere invisível (espaço de largura zero) também mostra o aviso', async () => {
    const input = renderizar();
    await userEvent.type(input, `Senha1!${String.fromCharCode(0x200b)}`);
    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it('aspas, aspas simples, barra invertida e espaço não mostram aviso', async () => {
    const input = renderizar();
    const valor = 'Se"nh\'a 1\\';
    await userEvent.type(input, valor);
    expect(input).toHaveValue(valor);
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(item('Um caractere especial')).toHaveTextContent(': atendido');
  });

  it('mostra o erro da API quando não há caractere inválido; o aviso de emoji tem prioridade', async () => {
    const input = renderizar({ erro: 'A senha precisa de uma letra maiúscula' });
    expect(screen.getByText('A senha precisa de uma letra maiúscula')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(input, 'a😀');
    expect(screen.getByText(AVISO)).toBeInTheDocument();
    expect(screen.queryByText('A senha precisa de uma letra maiúscula')).not.toBeInTheDocument();
    await userEvent.type(input, '{Backspace}{Backspace}');
    expect(screen.getByText('A senha precisa de uma letra maiúscula')).toBeInTheDocument();
  });

  it('erro da API some quando a senha passa a atender todos os requisitos', async () => {
    const input = renderizar({ erro: 'A senha precisa de uma letra maiúscula' });
    await userEvent.type(input, 'senha-forte-1');
    expect(screen.getByText('A senha precisa de uma letra maiúscula')).toBeInTheDocument();
    await userEvent.type(input, 'A');
    expect(screen.queryByText('A senha precisa de uma letra maiúscula')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('senha acima de 72 bytes mostra o aviso de tamanho; emoji tem prioridade', async () => {
    const LONGA = 'Senha muito longa, considere diminuí-la um pouco';
    const input = renderizar();
    await userEvent.click(input);
    await userEvent.paste('Ab1!' + 'é'.repeat(34));
    expect(screen.queryByText(LONGA)).not.toBeInTheDocument();
    await userEvent.paste('é');
    expect(screen.getByText(LONGA)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.paste('😀');
    expect(screen.getByText(AVISO)).toBeInTheDocument();
    expect(screen.queryByText(LONGA)).not.toBeInTheDocument();
  });

  it('o aviso fica numa região viva para o leitor de tela anunciar enquanto digita', async () => {
    const input = renderizar();
    const regiao = document.querySelector('.campo__erro');
    expect(regiao).toHaveAttribute('aria-live', 'polite');
    expect(regiao).toBeEmptyDOMElement();
    await userEvent.type(input, '😀');
    expect(regiao).toHaveTextContent(AVISO);
  });

  it('repassa props ao input (name, autoFocus) e mantém o botão de mostrar senha', async () => {
    const input = renderizar({ autoFocus: true });
    expect(input).toHaveAttribute('name', 'senha');
    expect(input).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input).toHaveAttribute('type', 'text');
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
      <MemoryRouter>
        <CardResultado {...base} pontosGanhos={25}>
          <button>continuar</button>
        </CardResultado>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Fim!' })).toBeInTheDocument();
    expect(screen.getByText(/Você acertou/)).toHaveTextContent('Você acertou 2 de 3');
    expect(screen.getByText('+25')).toBeInTheDocument();
    expect(screen.queryByText(/primeiro acerto/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'continuar' })).toBeInTheDocument();
  });

  it('zero pontos na aula: primeiro acerto e bônus de conclusão; badges novos aparecem', () => {
    render(
      <MemoryRouter initialEntries={['/aulas/a1']}>
        <CardResultado {...base} pontosGanhos={0} novosBadges={[{ id: 'b1', nome: 'Primeiros Passos' }]} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        'Cada pergunta pontua só no primeiro acerto, e o bônus de conclusão só na primeira vez.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Nova conquista!')).toBeInTheDocument();
    expect(screen.getByText('Primeiros Passos')).toBeInTheDocument();
  });

  it('zero pontos na trivia: só o primeiro acerto, sem falar em bônus', () => {
    render(
      <MemoryRouter initialEntries={['/trivia/r1']}>
        <CardResultado {...base} pontosGanhos={0} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Cada pergunta pontua só no primeiro acerto.')).toBeInTheDocument();
    expect(screen.queryByText(/bônus/)).not.toBeInTheDocument();
  });

  // Com pontos também: o aviso de admin não depende de ter feito zero.
  it.each([0, 10])(
    'admin vê o aviso de conta de admin (e nunca a regra de pontos) com %i pontos',
    async (pontos) => {
      localStorage.setItem('guardiao.token', 'token-teste');
      servidorFalso({ 'GET /auth/me': ADMIN });
      render(
        <AuthProvider>
          <MemoryRouter initialEntries={['/aulas/a1']}>
            <CardResultado {...base} pontosGanhos={pontos} />
          </MemoryRouter>
        </AuthProvider>,
      );
      expect(
        await screen.findByText(
          'Conta de admin: os pontos não contam e as conquistas aparecem só para conferência.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/primeiro acerto/)).not.toBeInTheDocument();
    },
  );
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

describe('AvisoInstalar', () => {
  const DIA = 24 * 60 * 60 * 1000;
  const disparar = () => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = vi.fn();
    act(() => window.dispatchEvent(e));
    return e;
  };
  const userAgent = (ua) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  const barra = () => document.querySelector('[aria-hidden="true"][class*="tempo"]');
  // Monta com sessão (ou sem) e espera o /auth/me responder.
  const abrir = async ({ logado = true } = {}) => {
    if (logado) localStorage.setItem('guardiao.token', 'token-teste');
    servidorFalso({ 'GET /auth/me': USUARIO });
    const r = render(
      <AuthProvider>
        <AvisoInstalar />
      </AuthProvider>,
    );
    await act(() => new Promise((ok) => setTimeout(ok, 0)));
    return r;
  };

  it('não aparece enquanto o navegador não diz que dá para instalar', async () => {
    await abrir();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('deslogado (tela de login): não aparece', async () => {
    await abrir({ logado: false });
    disparar();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('evento antes do login não se perde: aparece assim que a sessão carrega', async () => {
    localStorage.setItem('guardiao.token', 'token-teste');
    servidorFalso({ 'GET /auth/me': USUARIO });
    render(
      <AuthProvider>
        <AvisoInstalar />
      </AuthProvider>,
    );
    disparar();
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('convite com barra de tempo; Instalar app abre o diálogo e fecha o aviso', async () => {
    await abrir();
    const e = disparar();
    expect(e.defaultPrevented).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Você sabia que também pode instalar o Guardião?');
    expect(barra()).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Instalar app' }));
    expect(e.prompt).toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('fim da barra de tempo fecha sozinho', async () => {
    await abrir();
    disparar();
    // jsdom não tem AnimationEvent, então o React escuta a versão webkit; dispara as duas.
    fireEvent.animationEnd(barra());
    fireEvent(barra(), new Event('webkitAnimationEnd', { bubbles: true }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['Fechar', 'Agora não'])('%s fecha sem abrir o diálogo', async (nome) => {
    await abrir();
    const e = disparar();
    await userEvent.click(screen.getByRole('button', { name: nome }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(e.prompt).not.toHaveBeenCalled();
  });

  it('appinstalled esconde o aviso', async () => {
    await abrir();
    disparar();
    act(() => window.dispatchEvent(new Event('appinstalled')));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('periódico: some por 3 dias depois de mostrado e volta depois disso', async () => {
    const agora = vi.spyOn(Date, 'now').mockReturnValue(10 * DIA);
    const { unmount } = await abrir();
    disparar();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(localStorage.getItem('instalar-mostrado-em')).toBe(String(10 * DIA));
    unmount();

    agora.mockReturnValue(13 * DIA - 1);
    const segunda = await abrir();
    disparar();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    segunda.unmount();

    agora.mockReturnValue(13 * DIA);
    await abrir();
    disparar();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('já aberto como app instalado: nunca aparece', async () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    await abrir();
    disparar();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    delete window.matchMedia;
  });

  it('iPhone: sem API de instalação, ensina o caminho pelo Compartilhar', async () => {
    userAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    await abrir();
    expect(screen.getByRole('status')).toHaveTextContent('Adicionar à Tela de Início');
    expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument();
    expect(barra()).toBeInTheDocument();
  });

  it('iPhone deslogado: também não aparece', async () => {
    userAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    await abrir({ logado: false });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('iPad (se apresenta como Mac, mas tem toque) também recebe a instrução', async () => {
    userAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    await abrir();
    expect(screen.getByRole('status')).toHaveTextContent('Compartilhar');
    delete navigator.maxTouchPoints;
  });

  it('Mac de verdade (sem toque) não recebe instrução de iOS', async () => {
    userAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    await abrir();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // Falha só na chave do convite; o token da sessão continua funcionando.
  const quebrarStorage = (metodo) => {
    const original = Storage.prototype[metodo];
    vi.spyOn(Storage.prototype, metodo).mockImplementation(function (chave, ...resto) {
      if (chave === 'instalar-mostrado-em') throw new Error('bloqueado');
      return original.call(this, chave, ...resto);
    });
  };

  it('localStorage sem leitura: não quebra e não mostra', async () => {
    quebrarStorage('getItem');
    await abrir();
    disparar();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('localStorage sem gravação: mostra mesmo assim', async () => {
    quebrarStorage('setItem');
    await abrir();
    disparar();
    expect(screen.getByRole('status')).toBeInTheDocument();
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
