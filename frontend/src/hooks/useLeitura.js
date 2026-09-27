import { useEffect, useRef } from 'react';
import { registrarEvento } from '../lib/telemetria';

function enviar(aulaId, leitura, motivo) {
  if (!leitura || leitura.enviado) return;
  leitura.enviado = true;
  registrarEvento({
    tipo_evento: 'aula_conteudo_lido',
    tela: `/aulas/${aulaId}`,
    elemento: aulaId,
    duracao_ms: Date.now() - leitura.inicio,
    metadata: { rolagem_max: leitura.rolagem, motivo },
  });
}

// Mede a leitura do conteúdo (tempo na tela e até onde rolou, em %) enquanto `ativo`.
// Envia um evento só: ao chamar a função devolvida (ex.: "iniciou_perguntas") ou ao sair ("saiu").
export function useLeitura(aulaId, ativo) {
  const leitura = useRef(null);

  useEffect(() => {
    if (!ativo) return undefined;
    const atual = { inicio: Date.now(), rolagem: 0, enviado: false };
    leitura.current = atual;
    const medir = () => {
      const altura = document.documentElement.scrollHeight - window.innerHeight;
      const pct = altura <= 0 ? 100 : Math.round((window.scrollY / altura) * 100);
      atual.rolagem = Math.max(atual.rolagem, Math.min(100, pct));
    };
    medir();
    window.addEventListener('scroll', medir, { passive: true });
    return () => {
      window.removeEventListener('scroll', medir);
      enviar(aulaId, atual, 'saiu');
    };
  }, [aulaId, ativo]);

  return (motivo) => enviar(aulaId, leitura.current, motivo);
}
