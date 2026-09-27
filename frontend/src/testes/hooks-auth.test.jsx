import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useApi } from '../hooks/useApi';
import { useQuiz } from '../hooks/useQuiz';
import { AuthProvider, useAuth } from '../contexto/Auth';
import { erroApi, servidorFalso, USUARIO } from './utils';

describe('useApi', () => {
  it('começa carregando e entrega os dados', async () => {
    servidorFalso({ 'GET /aulas': [{ id: 1 }] });
    const { result } = renderHook(() => useApi('/aulas'));
    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.dados).toEqual([{ id: 1 }]);
    expect(result.current.erro).toBeNull();
  });

  it('entrega o erro da API', async () => {
    servidorFalso({ 'GET /aulas': erroApi(500, 'ERRO_INTERNO', 'Falhou') });
    const { result } = renderHook(() => useApi('/aulas'));
    await waitFor(() => expect(result.current.erro?.message).toBe('Falhou'));
    expect(result.current.dados).toBeNull();
  });

  it('recarregar busca de novo e limpa o erro anterior', async () => {
    const servidor = servidorFalso({
      'GET /x': vi
        .fn()
        .mockReturnValueOnce(erroApi(500, 'E', 'falhou'))
        .mockReturnValue({ ok: true }),
    });
    const { result } = renderHook(() => useApi('/x'));
    await waitFor(() => expect(result.current.erro).not.toBeNull());
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.dados).toEqual({ ok: true }));
    expect(result.current.erro).toBeNull();
    expect(servidor).toHaveBeenCalledTimes(2);
  });

  it('trocar o caminho cancela a requisição anterior (resposta velha é ignorada)', async () => {
    let liberarLenta;
    servidorFalso({
      'GET /lenta': () => new Promise((r) => (liberarLenta = () => r({ qual: 'lenta' }))),
      'GET /rapida': { qual: 'rapida' },
    });
    const sinais = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = vi.fn((url, opcoes) => {
      sinais.push(opcoes.signal);
      return fetchOriginal(url, opcoes);
    });
    const { result, rerender } = renderHook(({ caminho }) => useApi(caminho), {
      initialProps: { caminho: '/lenta' },
    });
    rerender({ caminho: '/rapida' });
    await waitFor(() => expect(result.current.dados).toEqual({ qual: 'rapida' }));
    expect(sinais[0].aborted).toBe(true);
    liberarLenta();
  });

  it('requisição cancelada (AbortError) não vira erro na tela', async () => {
    servidorFalso({ 'GET /x': new DOMException('cancelado', 'AbortError') });
    const { result } = renderHook(() => useApi('/x'));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.erro).toBeNull();
    expect(result.current.carregando).toBe(true);
  });

  it('desmontar cancela sem atualizar estado', async () => {
    servidorFalso({ 'GET /x': () => new Promise(() => {}) });
    const { unmount } = renderHook(() => useApi('/x'));
    expect(() => unmount()).not.toThrow();
  });
});

describe('useQuiz', () => {
  const questoes = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];

  it('começa no índice inicial informado (retomar rodada)', () => {
    const { result } = renderHook(() => useQuiz({ questoes, enviarResposta: vi.fn(), indiceInicial: 2 }));
    expect(result.current.questao.id).toBe('q3');
    expect(result.current.ultima).toBe(true);
    expect(result.current.total).toBe(3);
  });

  it('chama aoResponder com a questão, o resultado e o tempo gasto', async () => {
    const aoResponder = vi.fn();
    const { result } = renderHook(() =>
      useQuiz({ questoes, enviarResposta: async () => ({ correta: true }), aoResponder }),
    );
    await act(() => result.current.responder('a'));
    expect(aoResponder).toHaveBeenCalledWith(questoes[0], { correta: true }, expect.any(Number));
    expect(result.current.escolha).toBe('a');
  });

  it('ignora resposta nova depois do feedback e funciona sem aoResponder', async () => {
    const enviarResposta = vi.fn(async () => ({ correta: false }));
    const { result } = renderHook(() => useQuiz({ questoes, enviarResposta }));
    await act(() => result.current.responder('b'));
    await act(() => result.current.responder('c'));
    expect(enviarResposta).toHaveBeenCalledTimes(1);
    expect(result.current.escolha).toBe('b');
  });

  it('avançar limpa escolha, feedback e erro', async () => {
    const { result } = renderHook(() =>
      useQuiz({ questoes, enviarResposta: async () => ({ correta: true }) }),
    );
    await act(() => result.current.responder('a'));
    act(() => result.current.avancar());
    expect(result.current.indice).toBe(1);
    expect([result.current.escolha, result.current.feedback, result.current.erro]).toEqual([
      null,
      null,
      null,
    ]);
  });
});

function Painel() {
  const auth = useAuth();
  if (auth.carregando) return <p>carregando</p>;
  return (
    <div>
      <p>usuario: {auth.usuario ? `${auth.usuario.apelido} ${auth.usuario.pontuacao_total}` : 'nenhum'}</p>
      <button onClick={() => auth.entrar({ identificador: 'maria', senha: 's' }).catch(() => {})}>
        entrar
      </button>
      <button onClick={() => auth.cadastrar({ nome: 'x' })}>cadastrar</button>
      <button onClick={() => auth.atualizarUsuario({ pontuacao_total: 99 })}>pontos</button>
      <button onClick={auth.sair}>sair</button>
    </div>
  );
}
const montar = () =>
  render(
    <AuthProvider>
      <Painel />
    </AuthProvider>,
  );

describe('AuthProvider', () => {
  it('sem token não chama a API e começa sem usuário', () => {
    const servidor = servidorFalso();
    montar();
    expect(screen.getByText('usuario: nenhum')).toBeInTheDocument();
    expect(servidor).not.toHaveBeenCalled();
  });

  it('com token carrega /auth/me e abre sessão de telemetria', async () => {
    localStorage.setItem('guardiao.token', 't');
    const servidor = servidorFalso({ 'GET /auth/me': USUARIO });
    montar();
    expect(screen.getByText('carregando')).toBeInTheDocument();
    expect(await screen.findByText('usuario: maria 40')).toBeInTheDocument();
    await waitFor(() => expect(servidor.enviados('POST /sessoes')).toHaveLength(1));
  });

  it('token inválido termina sem usuário', async () => {
    localStorage.setItem('guardiao.token', 't');
    servidorFalso({ 'GET /auth/me': erroApi(401, 'NAO_AUTENTICADO', 'x') });
    montar();
    expect(await screen.findByText('usuario: nenhum')).toBeInTheDocument();
    expect(localStorage.getItem('guardiao.token')).toBeNull();
  });

  it('entrar salva o token; sair limpa tudo', async () => {
    servidorFalso({ 'POST /auth/login': { token: 'novo', usuario: USUARIO } });
    montar();
    await userEvent.click(screen.getByText('entrar'));
    expect(await screen.findByText('usuario: maria 40')).toBeInTheDocument();
    expect(localStorage.getItem('guardiao.token')).toBe('novo');
    await userEvent.click(screen.getByText('sair'));
    expect(screen.getByText('usuario: nenhum')).toBeInTheDocument();
    expect(localStorage.getItem('guardiao.token')).toBeNull();
  });

  it('login recusado não salva token', async () => {
    servidorFalso({ 'POST /auth/login': erroApi(401, 'CREDENCIAIS_INVALIDAS', 'x') });
    montar();
    await userEvent.click(screen.getByText('entrar'));
    expect(screen.getByText('usuario: nenhum')).toBeInTheDocument();
    expect(localStorage.getItem('guardiao.token')).toBeNull();
  });

  it('cadastrar também inicia a sessão', async () => {
    servidorFalso({ 'POST /auth/cadastro': { status: 201, corpo: { token: 'c', usuario: USUARIO } } });
    montar();
    await userEvent.click(screen.getByText('cadastrar'));
    expect(await screen.findByText('usuario: maria 40')).toBeInTheDocument();
  });

  it('atualizarUsuario mescla campos; sem usuário não faz nada', async () => {
    servidorFalso({ 'POST /auth/login': { token: 'novo', usuario: USUARIO } });
    montar();
    await userEvent.click(screen.getByText('pontos'));
    expect(screen.getByText('usuario: nenhum')).toBeInTheDocument();
    await userEvent.click(screen.getByText('entrar'));
    await userEvent.click(await screen.findByText('pontos'));
    expect(screen.getByText('usuario: maria 99')).toBeInTheDocument();
  });

  it('401 em qualquer chamada depois do login derruba a sessão', async () => {
    localStorage.setItem('guardiao.token', 't');
    servidorFalso({ 'GET /auth/me': USUARIO, 'GET /x': erroApi(401, 'NAO_AUTENTICADO', 'x') });
    montar();
    await screen.findByText('usuario: maria 40');
    const { api } = await import('../lib/api');
    await act(() => api('/x').catch(() => {}));
    expect(screen.getByText('usuario: nenhum')).toBeInTheDocument();
  });
});
