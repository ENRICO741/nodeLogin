import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { App } from '../App';

export const USUARIO = {
  id: 'u1',
  nome: 'Maria Silva',
  apelido: 'maria',
  email: 'maria@empresa.com',
  papel: 'usuario',
  pontuacao_total: 40,
  foto_perfil_url: null,
  bio: null,
  profissao: null,
  empresa: null,
};
// Quem autorizou a pesquisa: só ele gera sessões e eventos de telemetria.
export const PARTICIPANTE = { ...USUARIO, consentiu_pesquisa_em: '2026-05-01T12:00:00Z' };
export const ADMIN = { ...USUARIO, id: 'a1', nome: 'Ana Admin', apelido: 'ana', papel: 'admin' };

const SEQUENCIA = Symbol('sequencia');
export const sequencia = (...valores) => ({ [SEQUENCIA]: valores });

const resposta = (status, corpo) =>
  new Response(status === 204 ? null : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Servidor falso: chaves "MÉTODO /caminho". O valor pode ser o corpo (200), { status, corpo },
// uma função (req) => valor, ou sequencia(a, b, ...) (uma resposta por chamada, a última se repete).
export function servidorFalso(rotas = {}) {
  const tabela = {
    'POST /sessoes': { status: 201, corpo: { id: 'sessao-1' } },
    'POST /eventos': { status: 204 },
    ...rotas,
  };
  const contagem = {};
  const fetchFalso = vi.fn(async (url, opcoes = {}) => {
    const metodo = opcoes.method ?? 'GET';
    const caminho = url.replace(/^\/api/, '');
    const chave = `${metodo} ${caminho}`;
    let valor = tabela[chave];
    if (valor === undefined)
      return resposta(404, { erro: { codigo: 'NAO_ENCONTRADO', mensagem: `sem rota ${chave}` } });
    if (valor?.[SEQUENCIA]) {
      const lista = valor[SEQUENCIA];
      contagem[chave] = (contagem[chave] ?? 0) + 1;
      valor = lista[Math.min(contagem[chave], lista.length) - 1];
    }
    if (typeof valor === 'function')
      valor = await valor({ corpo: opcoes.body && JSON.parse(opcoes.body), opcoes });
    if (valor instanceof Error || valor instanceof DOMException) throw valor;
    const ehResposta =
      valor &&
      typeof valor === 'object' &&
      'status' in valor &&
      Object.keys(valor).every((k) => ['status', 'corpo'].includes(k));
    return ehResposta ? resposta(valor.status, valor.corpo) : resposta(200, valor);
  });
  globalThis.fetch = fetchFalso;

  // Corpos enviados para uma rota, na ordem.
  fetchFalso.enviados = (chave) =>
    fetchFalso.mock.calls
      .filter(([url, o = {}]) => `${o.method ?? 'GET'} ${url.replace(/^\/api/, '')}` === chave)
      .map(([, o = {}]) => (o.body ? JSON.parse(o.body) : undefined));
  return fetchFalso;
}

export const erroApi = (status, codigo, mensagem, detalhes) => ({
  status,
  corpo: { erro: { codigo, mensagem, ...(detalhes && { detalhes }) } },
});

// Renderiza o App inteiro numa rota, já logado como `usuario` (ou deslogado com null).
export async function renderizarApp(caminho, { usuario = USUARIO, rotas = {} } = {}) {
  if (usuario) localStorage.setItem('guardiao.token', 'token-teste');
  const servidor = servidorFalso({
    'GET /auth/me': usuario ?? erroApi(401, 'NAO_AUTENTICADO', 'x'),
    ...rotas,
  });
  window.history.pushState({}, '', caminho);
  const resultado = render(<App />);
  if (usuario) await screen.findByRole('navigation', { name: 'Navegação principal' });
  return { ...resultado, servidor };
}
