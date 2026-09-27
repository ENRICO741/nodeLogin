import { AlertCircle, CheckCircle2, Info, LoaderCircle, RotateCw } from 'lucide-react';
import styles from './Estado.module.css';

export function Carregando({ texto = 'Carregando…' }) {
  return (
    <div className={styles.centro} role="status">
      <LoaderCircle className={styles.girando} aria-hidden="true" size={28} />
      <span>{texto}</span>
    </div>
  );
}

export function ErroCarregamento({ erro, onTentarDeNovo }) {
  return (
    <div className={styles.centro} role="alert">
      <AlertCircle aria-hidden="true" size={32} className={styles.iconeErro} />
      <p>{erro?.message ?? 'Não foi possível carregar.'}</p>
      {onTentarDeNovo && (
        <button type="button" className="botao botao--secundario" onClick={onTentarDeNovo}>
          <RotateCw aria-hidden="true" size={18} /> Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Vazio({ icone: Icone = Info, titulo, children }) {
  return (
    <div className={styles.centro}>
      <Icone aria-hidden="true" size={32} className={styles.iconeVazio} />
      <p className={styles.titulo}>{titulo}</p>
      {children}
    </div>
  );
}

const ICONES_AVISO = { erro: AlertCircle, sucesso: CheckCircle2, info: Info };

export function Aviso({ tipo = 'info', children }) {
  if (!children) return null;
  const Icone = ICONES_AVISO[tipo];
  return (
    <div className={`aviso aviso--${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      <Icone aria-hidden="true" size={18} />
      <div>{children}</div>
    </div>
  );
}
