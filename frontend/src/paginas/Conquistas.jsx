import {
  Award,
  BookCheck,
  Brain,
  GraduationCap,
  Lock,
  Repeat,
  Sparkles,
  Star,
  Target,
  Zap,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { Carregando, ErroCarregamento, Vazio } from '../componentes/Estado';
import styles from './Conquistas.module.css';

const ICONES = {
  aula_concluida: BookCheck,
  aulas_concluidas: GraduationCap,
  aulas_gabaritadas: Target,
  primeira_trivia: Zap,
  trivia_rodadas: Repeat,
  trivia_completa: Brain,
  rodada_perfeita: Sparkles,
  pontos: Star,
};
const formatarData = (iso) => new Date(iso).toLocaleDateString('pt-BR');

export function Conquistas() {
  const { dados: badges, erro, carregando, recarregar } = useApi('/badges');

  if (carregando) return <Carregando />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;

  const obtidas = badges.filter((b) => b.obtida_em).length;

  return (
    <div className="pagina">
      <header className="cabecalho-pagina">
        <h1>Conquistas</h1>
        <p>
          {obtidas} de {badges.length} desbloqueadas
        </p>
      </header>
      {badges.length === 0 ? (
        <Vazio icone={Award} titulo="Nenhuma conquista cadastrada ainda" />
      ) : (
        <ul className={styles.grade}>
          {badges.map((b) => {
            const Icone = b.obtida_em ? (ICONES[b.tipo_criterio] ?? Award) : Lock;
            return (
              <li
                key={b.id}
                className={`cartao ${styles.badge} ${b.obtida_em ? styles.obtida : styles.bloqueada}`}
              >
                {b.imagem_url && b.obtida_em ? (
                  <img src={b.imagem_url} alt="" className={styles.imagem} />
                ) : (
                  <span className={styles.icone}>
                    <Icone aria-hidden="true" size={28} />
                  </span>
                )}
                <h2 className={styles.nome}>{b.nome}</h2>
                <p className={styles.descricao}>{b.descricao}</p>
                <span className={`selo ${b.obtida_em ? 'selo--conquista' : ''}`}>
                  {b.obtida_em ? `Obtida em ${formatarData(b.obtida_em)}` : 'Bloqueada'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
