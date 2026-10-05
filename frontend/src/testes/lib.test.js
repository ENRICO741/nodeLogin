import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, definirAoSessaoExpirar, ErroApi, tokenSalvo } from '../lib/api';
import { MINIMO_SENHA, REQUISITOS_SENHA, senhaLongaDemais, temCaractereInvalido } from '../lib/senha';
import { servidorFalso, erroApi, sequencia } from './utils';

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
    expect(tokenSalvo.obter()).toBe('x'); // segue em memória
    expect(() => tokenSalvo.limpar()).not.toThrow();
    expect(tokenSalvo.obter()).toBeNull();
  });

  it('com localStorage bloqueado, o token definido vai nas requisições seguintes', async () => {
    const erro = () => {
      throw new Error('bloqueado');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(erro);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(erro);
    const servidor = servidorFalso({ 'GET /x': {} });
    tokenSalvo.definir('x');
    await api('/x');
    expect(servidor.mock.calls[0][1].headers.Authorization).toBe('Bearer x');
    tokenSalvo.limpar();
  });

  it('setItem lançando com getItem funcionando (Safari privado antigo) também guarda em memória', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cota');
    });
    tokenSalvo.definir('y');
    expect(tokenSalvo.obter()).toBe('y');
    tokenSalvo.limpar();
    expect(tokenSalvo.obter()).toBeNull();
  });

  it('com localStorage funcionando, ele é a fonte (memória não ressuscita token limpo em outra aba)', () => {
    tokenSalvo.definir('z');
    localStorage.removeItem('guardiao.token');
    expect(tokenSalvo.obter()).toBeNull();
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

  it('errosPorCampo fica com a primeira mensagem de cada campo', () => {
    const e = new ErroApi(400, {
      erro: {
        codigo: 'VALIDACAO',
        mensagem: 'Dados inválidos',
        detalhes: [
          { campo: 'senha', mensagem: 'A senha precisa de pelo menos 8 caracteres' },
          { campo: 'email', mensagem: 'E-mail inválido' },
          { campo: 'senha', mensagem: 'A senha precisa de uma letra maiúscula' },
        ],
      },
    });
    expect(e.errosPorCampo).toEqual({
      senha: 'A senha precisa de pelo menos 8 caracteres',
      email: 'E-mail inválido',
    });
    expect(e.detalhes).toHaveLength(3); // não altera os detalhes originais
    expect(new ErroApi(400, null).errosPorCampo).toEqual({});
  });
});

describe('regra de senha', () => {
  const atendidos = (s) => REQUISITOS_SENHA.filter((r) => r.atende(s)).map((r) => r.texto);
  const [tamanho, maiuscula, minuscula, numero, especial] = REQUISITOS_SENHA.map((r) => r.texto);

  it('cinco requisitos; vazio não atende nenhum e senha forte atende todos', () => {
    expect(MINIMO_SENHA).toBe(8);
    expect(REQUISITOS_SENHA).toHaveLength(5);
    expect(atendidos('')).toEqual([]);
    expect(atendidos('Senha-forte1')).toHaveLength(5);
  });

  it('cada requisito reconhece só o seu tipo', () => {
    expect(atendidos('A')).toEqual([maiuscula]);
    expect(atendidos('a')).toEqual([minuscula]);
    expect(atendidos('1')).toEqual([numero]);
    expect(atendidos('!')).toEqual([especial]);
  });

  it('tamanho mínimo: 7 não basta, 8 basta; espaço conta como caractere', () => {
    expect(atendidos('aaaaaaa')).not.toContain(tamanho);
    expect(atendidos('aaaaaaaa')).toContain(tamanho);
    expect(atendidos('       a')).toContain(tamanho);
  });

  it('acentos contam como letra (não como especial)', () => {
    expect(atendidos('É')).toEqual([maiuscula]);
    expect(atendidos('ç')).toEqual([minuscula]);
    expect(atendidos('ã')).toEqual([minuscula]);
  });

  it('aspas, aspas simples e barra invertida contam como especial e são aceitas', () => {
    for (const c of ['"', "'", '\\', '/', '`', '_', '-', '€']) {
      expect(atendidos(c), c).toEqual([especial]);
      expect(temCaractereInvalido(`Senha1${c}x`), c).toBe(false);
    }
  });

  it('espaço não é especial, mas é aceito', () => {
    expect(atendidos(' ')).toEqual([]);
    expect(temCaractereInvalido('Minha senha 1!')).toBe(false);
  });

  it('dígitos de outros alfabetos não contam como número', () => {
    expect(atendidos('٣')).not.toContain(numero);
  });

  it('recusa emoji, bandeira, tom de pele, ❤️, NUL, tab e caracteres invisíveis', () => {
    const invalidos = {
      emoji: 'Senha1!😀',
      cadeado: '🔒Senha1!',
      bandeira: 'Senha1!🇧🇷',
      'tom de pele': 'Senha1!🏽',
      coração: 'Senha1!❤️',
      'seletor de variação sozinho': 'Senha1!\uFE0F',
      NUL: 'Senha1!\0x',
      tab: 'Senha1!\tx',
      'quebra de linha': 'Senha1!\nx',
      'espaço de largura zero': 'Senha1!\u200Bx',
      'separador de linha': 'Senha1!\u2028x',
      'separador de parágrafo': 'Senha1!\u2029x',
    };
    for (const [nome, valor] of Object.entries(invalidos))
      expect(temCaractereInvalido(valor), nome).toBe(true);
  });

  it('aceita símbolos de teclado que o Unicode também lista como emoji de texto (© ® ™ ❤ sem seletor)', () => {
    for (const c of ['©', '®', '™', '❤', '§', '°', '€', '£', '¬'])
      expect(temCaractereInvalido(`Senha1${c}x`), c).toBe(false);
  });

  it('senhaLongaDemais conta bytes, não caracteres: limite exato de 72', () => {
    expect(senhaLongaDemais('Ab1!' + 'x'.repeat(68))).toBe(false);
    expect(senhaLongaDemais('Ab1!' + 'x'.repeat(69))).toBe(true);
    expect(senhaLongaDemais('Ab1!' + 'é'.repeat(34))).toBe(false);
    // 39 caracteres, mas 74 bytes.
    expect(senhaLongaDemais('Ab1!' + 'é'.repeat(35))).toBe(true);
    expect(senhaLongaDemais('')).toBe(false);
  });

  it('aceita a senha vazia e texto comum com acento', () => {
    expect(temCaractereInvalido('')).toBe(false);
    expect(temCaractereInvalido('Coração#2024')).toBe(false);
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

  it('401 de requisição feita com token antigo não expira o token novo', async () => {
    const aoExpirar = vi.fn();
    definirAoSessaoExpirar(aoExpirar);
    let responder;
    servidorFalso({ 'GET /x': () => new Promise((r) => (responder = r)) });
    tokenSalvo.definir('antigo');
    const pedido = api('/x').catch((e) => e);
    tokenSalvo.definir('novo'); // login novo enquanto a requisição antiga estava no ar
    responder(erroApi(401, 'NAO_AUTENTICADO', 'x'));
    expect((await pedido).status).toBe(401);
    expect(aoExpirar).not.toHaveBeenCalled();
    expect(tokenSalvo.obter()).toBe('novo');
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
    telemetria.definirConsentimento(true);
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

  it('sem consentimento não cria sessão, não envia evento e descarta a fila', async () => {
    localStorage.setItem('guardiao.token', 't');
    const servidor = servidorFalso();
    telemetria.definirConsentimento(null);
    telemetria.registrarEvento({ tipo_evento: 'antes' }); // ainda não se sabe: vai para a fila
    await telemetria.iniciarSessao();
    expect(servidor).not.toHaveBeenCalled();

    telemetria.definirConsentimento(false);
    telemetria.registrarEvento({ tipo_evento: 'recusado' });
    await telemetria.iniciarSessao();
    expect(servidor).not.toHaveBeenCalled();

    telemetria.definirConsentimento(true);
    await telemetria.iniciarSessao();
    telemetria.registrarEvento({ tipo_evento: 'depois' });
    expect(servidor.enviados('POST /sessoes')).toHaveLength(1);
    await vi.waitFor(() => expect(servidor.enviados('POST /eventos')).toHaveLength(1));
    expect(servidor.enviados('POST /eventos')[0].tipo_evento).toBe('depois');
  });

  it('com consentimento ainda não sabido, a fila espera e sai quando ele chega', async () => {
    localStorage.setItem('guardiao.token', 't');
    const servidor = servidorFalso();
    telemetria.definirConsentimento(null);
    telemetria.registrarEvento({ tipo_evento: 'primeira_tela' });
    telemetria.definirConsentimento(true);
    await telemetria.iniciarSessao();
    await vi.waitFor(() => expect(servidor.enviados('POST /eventos')).toHaveLength(1));
  });

  it('duas chamadas simultâneas de iniciarSessao criam uma sessão só', async () => {
    localStorage.setItem('guardiao.token', 't');
    const servidor = servidorFalso();
    await Promise.all([telemetria.iniciarSessao(), telemetria.iniciarSessao()]);
    expect(servidor.enviados('POST /sessoes')).toHaveLength(1);
    // Terminada a criação, uma nova chamada não abre outra.
    await telemetria.iniciarSessao();
    expect(servidor.enviados('POST /sessoes')).toHaveLength(1);
  });

  it('logout com o POST /sessoes em andamento: a resposta atrasada não vira a sessão do próximo login', async () => {
    localStorage.setItem('guardiao.token', 'token-a');
    let responderPrimeira;
    const servidor = servidorFalso({
      'POST /sessoes': sequencia(
        () => new Promise((r) => (responderPrimeira = () => r({ status: 201, corpo: { id: 'sessao-a' } }))),
        { status: 201, corpo: { id: 'sessao-b' } },
      ),
    });
    const primeira = telemetria.iniciarSessao();
    await vi.waitFor(() => expect(responderPrimeira).toBeDefined());
    telemetria.finalizarSessao(); // logout ou 401 de A
    localStorage.setItem('guardiao.token', 'token-b');
    await telemetria.iniciarSessao(); // login de B: não espera a criação de A
    responderPrimeira();
    await primeira;
    telemetria.registrarEvento({ tipo_evento: 'de_b' });
    expect(servidor.enviados('POST /sessoes')).toHaveLength(2);
    await vi.waitFor(() => expect(servidor.enviados('POST /eventos')).toHaveLength(1));
    expect(servidor.enviados('POST /eventos')[0].sessao_id).toBe('sessao-b');
  });

  it('204 ao criar sessão (consentimento retirado no servidor) não quebra nem envia eventos', async () => {
    localStorage.setItem('guardiao.token', 't');
    const servidor = servidorFalso({ 'POST /sessoes': { status: 204 } });
    telemetria.registrarEvento({ tipo_evento: 'x' });
    await expect(telemetria.iniciarSessao()).resolves.toBeUndefined();
    telemetria.registrarEvento({ tipo_evento: 'y' });
    expect(servidor.enviados('POST /eventos')).toEqual([]);
    // Sem sessão, a próxima chamada tenta de novo.
    await telemetria.iniciarSessao();
    expect(servidor.enviados('POST /sessoes')).toHaveLength(2);
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
