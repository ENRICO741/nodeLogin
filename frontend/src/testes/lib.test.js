import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, definirAoSessaoExpirar, ErroApi, tokenSalvo } from '../lib/api';
import { servidorFalso, erroApi } from './utils';

describe('tokenSalvo', () => {
  it('guarda, lê e limpa o token', () => {
    tokenSalvo.definir('abc');
    expect(tokenSalvo.obter()).toBe('abc');
    tokenSalvo.limpar();
    expect(tokenSalvo.obter()).toBeNull();
  });

  it('não quebra quando o localStorage lança (modo privado)', () => {
    const erro = () => {
      throw new Error('bloqueado');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(erro);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(erro);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(erro);
    expect(tokenSalvo.obter()).toBeNull();
    expect(() => tokenSalvo.definir('x')).not.toThrow();
    expect(() => tokenSalvo.limpar()).not.toThrow();
  });
});

describe('ErroApi', () => {
  it('usa a mensagem e o código da API', () => {
    const e = new ErroApi(409, { erro: { codigo: 'DUP', mensagem: 'Duplicado' } });
    expect(e).toBeInstanceOf(Error);
    expect([e.status, e.codigo, e.message]).toEqual([409, 'DUP', 'Duplicado']);
    expect(e.detalhes).toEqual([]);
  });

  it('tem mensagem padrão quando o corpo não é o formato esperado', () => {
    expect(new ErroApi(500, null).message).toBe('Algo deu errado. Tente novamente');
    expect(new ErroApi(502, { outro: 1 }).codigo).toBeUndefined();
  });

  it('errosPorCampo transforma detalhes num mapa campo → mensagem', () => {
    const e = new ErroApi(400, {
      erro: {
        codigo: 'VALIDACAO',
        mensagem: 'Dados inválidos',
        detalhes: [
          { campo: 'email', mensagem: 'E-mail inválido' },
          { campo: 'senha', mensagem: 'Curta' },
        ],
      },
    });
    expect(e.errosPorCampo).toEqual({ email: 'E-mail inválido', senha: 'Curta' });
  });
});

describe('api()', () => {
  beforeEach(() => definirAoSessaoExpirar(() => {}));

  it('GET devolve o JSON e prefixa /api', async () => {
    const servidor = servidorFalso({ 'GET /aulas': [{ id: 1 }] });
    await expect(api('/aulas')).resolves.toEqual([{ id: 1 }]);
    expect(servidor.mock.calls[0][0]).toBe('/api/aulas');
  });

  it('envia o token quando existe e não envia quando não existe', async () => {
    const servidor = servidorFalso({ 'GET /x': {} });
    await api('/x');
    expect(servidor.mock.calls[0][1].headers.Authorization).toBeUndefined();
    tokenSalvo.definir('tok');
    await api('/x');
    expect(servidor.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
  });

  it('POST serializa o corpo com Content-Type JSON; sem corpo não manda Content-Type', async () => {
    const servidor = servidorFalso({ 'POST /a': {}, 'POST /b': {} });
    await api('/a', { metodo: 'POST', corpo: { x: 1 } });
    await api('/b', { metodo: 'POST' });
    expect(servidor.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: '{"x":1}',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(servidor.mock.calls[1][1].body).toBeUndefined();
    expect(servidor.mock.calls[1][1].headers['Content-Type']).toBeUndefined();
  });

  it('204 devolve null', async () => {
    servidorFalso({ 'DELETE /a': { status: 204 } });
    await expect(api('/a', { metodo: 'DELETE' })).resolves.toBeNull();
  });

  it('erro HTTP vira ErroApi com status, código e detalhes', async () => {
    servidorFalso({
      'POST /a': erroApi(400, 'VALIDACAO', 'Dados inválidos', [{ campo: 'x', mensagem: 'y' }]),
    });
    const erro = await api('/a', { metodo: 'POST', corpo: {} }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect([erro.status, erro.codigo, erro.errosPorCampo]).toEqual([400, 'VALIDACAO', { x: 'y' }]);
  });

  it('erro com corpo que não é JSON usa a mensagem padrão', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>502</html>', { status: 502 }));
    const erro = await api('/x').catch((e) => e);
    expect(erro.status).toBe(502);
    expect(erro.message).toBe('Algo deu errado. Tente novamente');
  });

  it('falha de rede vira SEM_CONEXAO com status 0', async () => {
    servidorFalso({ 'GET /x': new TypeError('Failed to fetch') });
    const erro = await api('/x').catch((e) => e);
    expect([erro.status, erro.codigo, erro.message]).toEqual([
      0,
      'SEM_CONEXAO',
      'Sem conexão. Verifique sua internet',
    ]);
  });

  it('cancelamento (AbortError) é repassado como está', async () => {
    const abort = new DOMException('cancelado', 'AbortError');
    servidorFalso({ 'GET /x': abort });
    await expect(api('/x')).rejects.toBe(abort);
  });

  it('401 com token avisa que a sessão expirou; sem token, não', async () => {
    const aoExpirar = vi.fn();
    definirAoSessaoExpirar(aoExpirar);
    servidorFalso({ 'GET /x': erroApi(401, 'NAO_AUTENTICADO', 'x') });
    await api('/x').catch(() => {});
    expect(aoExpirar).not.toHaveBeenCalled();
    tokenSalvo.definir('tok');
    await api('/x').catch(() => {});
    expect(aoExpirar).toHaveBeenCalledTimes(1);
  });

  it('passa o sinal de cancelamento para o fetch', async () => {
    const servidor = servidorFalso({ 'GET /x': {} });
    const controle = new AbortController();
    await api('/x', { sinal: controle.signal });
    expect(servidor.mock.calls[0][1].signal).toBe(controle.signal);
  });
});

describe('telemetria', () => {
  let telemetria;
  beforeEach(async () => {
    vi.resetModules();
    telemetria = await import('../lib/telemetria');
  });

  it('sem login não faz nada', async () => {
    const servidor = servidorFalso();
    await telemetria.iniciarSessao();
    telemetria.registrarEvento({ tipo_evento: 'x' });
    telemetria.finalizarSessao();
    expect(servidor).not.toHaveBeenCalled();
  });

  it('eventos antes da sessão ficam na fila e saem com o id da sessão', async () => {
    localStorage.setItem('guardiao.token', 't');
    const servidor = servidorFalso();
    telemetria.registrarEvento({ tipo_evento: 'tela_visualizada', tela: '/aulas' });
    expect(servidor).not.toHaveBeenCalled();
    await telemetria.iniciarSessao();
    await vi.waitFor(() => expect(servidor.enviados('POST /eventos')).toHaveLength(1));
    expect(servidor.enviados('POST /eventos')[0]).toEqual({
      tipo_evento: 'tela_visualizada',
      tela: '/aulas',
      sessao_id: 'sessao-1',
    });
  });

  it('com sessão ativa envia na hora; iniciar de novo não cria outra sessão', async () => {
    localStorage.setItem('guardiao.token', 't');
    const servidor = servidorFalso();
    await telemetria.iniciarSessao();
    await telemetria.iniciarSessao();
    telemetria.registrarEvento({ tipo_evento: 'clique' });
    expect(servidor.enviados('POST /sessoes')).toHaveLength(1);
    expect(servidor.enviados('POST /eventos')).toHaveLength(1);
  });

  it('a fila tem limite de 50 eventos', async () => {
    localStorage.setItem('guardiao.token', 't');
    const servidor = servidorFalso();
    for (let i = 0; i < 60; i++) telemetria.registrarEvento({ tipo_evento: 'x' });
    await telemetria.iniciarSessao();
    await vi.waitFor(() => expect(servidor.enviados('POST /eventos')).toHaveLength(50));
  });

  it('falha ao criar sessão não lança nem trava o app', async () => {
    localStorage.setItem('guardiao.token', 't');
    servidorFalso({ 'POST /sessoes': erroApi(500, 'ERRO_INTERNO', 'x') });
    await expect(telemetria.iniciarSessao()).resolves.toBeUndefined();
  });

  it('falha ao enviar evento é ignorada', async () => {
    localStorage.setItem('guardiao.token', 't');
    servidorFalso({ 'POST /eventos': new TypeError('rede') });
    await telemetria.iniciarSessao();
    expect(() => telemetria.registrarEvento({ tipo_evento: 'x' })).not.toThrow();
  });

  it('finalizarSessao usa keepalive com o token e zera a sessão', async () => {
    localStorage.setItem('guardiao.token', 't');
    const servidor = servidorFalso({ 'POST /sessoes/sessao-1/finalizar': { status: 204 } });
    await telemetria.iniciarSessao();
    telemetria.finalizarSessao();
    const [url, opcoes] = servidor.mock.calls.at(-1);
    expect(url).toBe('/api/sessoes/sessao-1/finalizar');
    expect(opcoes).toMatchObject({ method: 'POST', keepalive: true, headers: { Authorization: 'Bearer t' } });
    telemetria.finalizarSessao();
    expect(servidor.enviados('POST /sessoes/sessao-1/finalizar')).toHaveLength(1);
  });

  it('finalizar sem sessão não chama a API', async () => {
    localStorage.setItem('guardiao.token', 't');
    const servidor = servidorFalso();
    telemetria.finalizarSessao();
    expect(servidor).not.toHaveBeenCalled();
  });

  it('falha de rede ao finalizar é ignorada', async () => {
    localStorage.setItem('guardiao.token', 't');
    servidorFalso({ 'POST /sessoes/sessao-1/finalizar': new TypeError('rede') });
    await telemetria.iniciarSessao();
    expect(() => telemetria.finalizarSessao()).not.toThrow();
  });

  it('pagehide finaliza e pageshow vindo do cache (bfcache) reabre a sessão', async () => {
    localStorage.setItem('guardiao.token', 't');
    const servidor = servidorFalso({ 'POST /sessoes/sessao-1/finalizar': { status: 204 } });
    await telemetria.iniciarSessao();
    window.dispatchEvent(new Event('pagehide'));
    expect(servidor.enviados('POST /sessoes/sessao-1/finalizar').length).toBeGreaterThanOrEqual(1);

    const antes = servidor.enviados('POST /sessoes').length;
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(servidor.enviados('POST /sessoes')).toHaveLength(antes);
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await vi.waitFor(() => expect(servidor.enviados('POST /sessoes').length).toBeGreaterThan(antes));
  });
});
