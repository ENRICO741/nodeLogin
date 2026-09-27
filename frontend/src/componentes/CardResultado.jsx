import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Award, PartyPopper } from 'lucide-react';
import { registrarEvento } from '../lib/telemetria';
import styles from './CardResultado.module.css';

export function CardResultado({
  titulo,
  acertos,
  total,
  pontosGanhos,
  pontuacaoTotal,
  novosBadges = [],
  children,
}) {
  const { pathname } = useLocation();

  // Exposição ao reforço da gamificação (pontos e conquistas mostrados ao terminar).
  useEffect(() => {
    registrarEvento({
      tipo_evento: 'resultado_visualizado',
      tela: pathname,
      metadata: { acertos, total, pontos: pontosGanhos, novos_badges: novosBadges.length },
    });
    // Um evento por resultado exibido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className={`cartao ${styles.cartao}`} aria-labelledby="titulo-resultado">
      <PartyPopper aria-hidden="true" size={40} className={styles.icone} />
      <h1 id="titulo-resultado">{titulo}</h1>
      <p className={styles.acertos}>
        Você acertou <strong>{acertos}</strong> de <strong>{total}</strong>
      </p>
      <div className={styles.numeros}>
        <div>
          <span className={styles.valor}>+{pontosGanhos}</span>
          <span className={styles.rotulo}>pontos nesta atividade</span>
        </div>
        <div>
          <span className={styles.valor}>{pontuacaoTotal}</span>
          <span className={styles.rotulo}>pontuação total</span>
        </div>
      </div>
      {pontosGanhos === 0 && (
        <p className={styles.nota}>Cada questão e cada bônus de conclusão pontuam só na primeira vez.</p>
      )}
      {novosBadges.length > 0 && (
        <div className={styles.badges}>
          <p>Nova conquista!</p>
          <ul>
            {novosBadges.map((badge) => (
              <li key={badge.id} className="selo selo--conquista">
                <Award aria-hidden="true" size={16} /> {badge.nome}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles.acoes}>{children}</div>
    </section>
  );
}
