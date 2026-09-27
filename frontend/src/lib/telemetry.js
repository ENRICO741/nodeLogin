import api from './api';

const apiBaseUrl = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:4000`;

let sessaoId = null;
let usuarioId = null;
let beaconListenerRegistrado = false;

function finalizarViaBeacon() {
  if (!sessaoId || typeof navigator.sendBeacon !== 'function') return;
  try {
    navigator.sendBeacon(`${apiBaseUrl}/sessoes/${sessaoId}/finalizar`, new Blob([], { type: 'text/plain' }));
  } catch (err) {
    console.warn('Falha ao finalizar sessão via sendBeacon:', err);
  }
}

export async function iniciarSessao(userId) {
  try {
    const response = await api.post('/sessoes', { usuarioId: userId });
    sessaoId = response.data.id;
    usuarioId = userId;

    if (!beaconListenerRegistrado) {
      window.addEventListener('pagehide', finalizarViaBeacon);
      beaconListenerRegistrado = true;
    }
  } catch (err) {
    console.warn('Falha ao iniciar sessão de telemetria:', err);
  }
}

export async function finalizarSessaoAtual() {
  if (!sessaoId) return;
  const idParaFinalizar = sessaoId;
  sessaoId = null;
  usuarioId = null;

  try {
    await api.post(`/sessoes/${idParaFinalizar}/finalizar`);
  } catch (err) {
    console.warn('Falha ao finalizar sessão de telemetria:', err);
  }
}

export async function registrarEvento({ tipoEvento, tela, elemento, duracaoMs, metadata }) {
  if (!sessaoId || !usuarioId) return;

  try {
    await api.post('/eventos', {
      usuarioId,
      sessaoId,
      tipoEvento,
      tela,
      elemento,
      duracaoMs,
      metadata,
    });
  } catch (err) {
    console.warn('Falha ao registrar evento de telemetria:', err);
  }
}
