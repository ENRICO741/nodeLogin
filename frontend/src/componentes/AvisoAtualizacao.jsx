import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './AvisoAtualizacao.module.css';

export function AvisoAtualizacao() {
  const {
    needRefresh: [temAtualizacao, setTemAtualizacao],
    updateServiceWorker,
  } = useRegisterSW();

  if (!temAtualizacao) return null;
  return (
    <div className={styles.aviso} role="status">
      <span>Nova versão disponível.</span>
      <button type="button" className="botao" onClick={() => updateServiceWorker(true)}>
        Atualizar
      </button>
      <button type="button" className="botao botao--texto" onClick={() => setTemAtualizacao(false)}>
        Depois
      </button>
    </div>
  );
}
