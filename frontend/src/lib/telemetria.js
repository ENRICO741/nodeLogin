import { api, tokenSalvo } from './api';

const MAXIMO_PENDENTES = 50;

let sessaoId = null;
let pendentes = [];

const enviar = (evento) =>
  api('/eventos', { metodo: 'POST', corpo: { ...evento, sessao_id: sessaoId } }).catch(() => {});

export async function iniciarSessao() {
  if (sessaoId || !tokenSalvo.obter()) return;
  try {
    sessaoId = (await api('/sessoes', { metodo: 'POST' })).id;
    pendentes.splice(0).forEach(enviar);
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
export function finalizarSessao() {
  const token = tokenSalvo.obter();
  if (!sessaoId || !token) return;
  fetch(`/api/sessoes/${sessaoId}/finalizar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => {});
  sessaoId = null;
  pendentes = [];
}

window.addEventListener('pagehide', finalizarSessao);
window.addEventListener('pageshow', (e) => {
  if (e.persisted) iniciarSessao();
});
