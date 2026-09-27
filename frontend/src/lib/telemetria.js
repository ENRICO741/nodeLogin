import { api, tokenSalvo } from './api';

const MAXIMO_PENDENTES = 50;

let sessaoId = null;
// Sessão encerrada ao ocultar o app; se ele voltar a tempo, o servidor a reabre (ver retomar).
let sessaoPausada = null;
let pendentes = [];

const enviar = (evento) =>
  api('/eventos', { metodo: 'POST', corpo: { ...evento, sessao_id: sessaoId } }).catch(() => {});

const liberarPendentes = () => pendentes.splice(0).forEach(enviar);

// App instalado (PWA) ou aberto no navegador, e largura da tela: contexto de cada sessão para a pesquisa.
const contexto = () => ({
  standalone:
    window.matchMedia?.('(display-mode: standalone)').matches === true || navigator.standalone === true,
  largura_tela: window.innerWidth,
});

export async function iniciarSessao() {
  if (sessaoId || !tokenSalvo.obter()) return;
  try {
    sessaoId = (await api('/sessoes', { metodo: 'POST', corpo: contexto() })).id;
    liberarPendentes();
  } catch {
    /* telemetria nunca atrapalha o uso do app */
  }
}

// Eventos antes da sessão existir ficam na fila (antes, a primeira tela vista era perdida).
export function registrarEvento(evento) {
  if (!tokenSalvo.obter()) return;
  if (sessaoId) enviar(evento);
  else if (pendentes.length < MAXIMO_PENDENTES) pendentes.push(evento);
}

// keepalive: a requisição sobrevive ao fechamento da aba. sendBeacon não serve porque não envia o header Authorization.
function encerrar(id) {
  const token = tokenSalvo.obter();
  if (!id || !token) return;
  fetch(`/api/sessoes/${id}/finalizar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => {});
}

export function finalizarSessao() {
  encerrar(sessaoId);
  sessaoId = null;
  sessaoPausada = null;
  pendentes = [];
}

// App foi para segundo plano: encerra já (se o sistema matar o app, o fim da sessão fica certo).
function pausar() {
  if (!sessaoId) return;
  encerrar(sessaoId);
  sessaoPausada = sessaoId;
  sessaoId = null;
}

// App voltou: o servidor reabre a sessão se ela acabou há pouco (30 min); senão, abre uma nova.
async function retomar() {
  const id = sessaoPausada;
  sessaoPausada = null;
  if (!id || !tokenSalvo.obter()) return iniciarSessao();
  try {
    await api(`/sessoes/${id}/retomar`, { metodo: 'POST' });
    sessaoId = id;
    liberarPendentes();
  } catch {
    await iniciarSessao();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pausar();
  else retomar();
});
window.addEventListener('pagehide', finalizarSessao);
window.addEventListener('pageshow', (e) => {
  if (e.persisted) iniciarSessao();
});
window.addEventListener('appinstalled', () => registrarEvento({ tipo_evento: 'app_instalado' }));
