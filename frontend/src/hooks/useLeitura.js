import { useEffect, useRef } from 'react';
import { registrarEvento } from '../lib/telemetria';

const visivel = () => document.visibilityState !== 'hidden';

// Tempo com a tela visível: o trecho em segundo plano (outra aba, tela bloqueada) não conta como leitura.
const tempoVisivel = (leitura) =>
  leitura.acumulado + (leitura.visivelDesde === null ? 0 : Date.now() - leitura.visivelDesde);

function enviar(aulaId, leitura, motivo) {
  if (!leitura || leitura.enviado) return;
  leitura.enviado = true;
  registrarEvento({
    tipo_evento: 'aula_conteudo_lido',
    tela: `/aulas/${aulaId}`,
    elemento: aulaId,
    duracao_ms: tempoVisivel(leitura),
    metadata: { rolagem_max: leitura.rolagem, motivo },
  });
}

// Mede a leitura do conteúdo (tempo visível na tela e até onde rolou, em %) enquanto `ativo`.
// Envia um evento só: ao chamar a função devolvida (ex.: "iniciou_perguntas") ou ao sair ("saiu").
export function useLeitura(aulaId, ativo) {
  const leitura = useRef(null);

  useEffect(() => {
    if (!ativo) return undefined;
    const atual = { acumulado: 0, visivelDesde: visivel() ? Date.now() : null, rolagem: 0, enviado: false };
    leitura.current = atual;
    const medir = () => {
      const altura = document.documentElement.scrollHeight - window.innerHeight;
      const pct = altura <= 0 ? 100 : Math.round((window.scrollY / altura) * 100);
      atual.rolagem = Math.max(atual.rolagem, Math.min(100, pct));
    };
    // Pausa ao ir para segundo plano e retoma ao voltar.
    const aoMudarVisibilidade = () => {
      if (!visivel() && atual.visivelDesde !== null) {
        atual.acumulado += Date.now() - atual.visivelDesde;
        atual.visivelDesde = null;
      } else if (visivel() && atual.visivelDesde === null) {
        atual.visivelDesde = Date.now();
      }
    };
    medir();
    window.addEventListener('scroll', medir, { passive: true });
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      window.removeEventListener('scroll', medir);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      enviar(aulaId, atual, 'saiu');
    };
  }, [aulaId, ativo]);

  return (motivo) => enviar(aulaId, leitura.current, motivo);
}
