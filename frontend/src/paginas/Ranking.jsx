import { Trophy } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { Carregando, ErroCarregamento, Vazio } from '../componentes/Estado';
import { Avatar } from '../componentes/Avatar';
import styles from './Ranking.module.css';

export function Ranking() {
  const { dados, erro, carregando, recarregar } = useApi('/ranking');

  if (carregando) return <Carregando />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;

  const { lideres, minha_posicao: minhaPosicao, pontuacao_total: meusPontos } = dados;
  const estouNaLista = lideres.some((l) => l.eu);

  return (
    <div className="pagina">
      <header className="cabecalho-pagina">
        <h1>Ranking</h1>
        <p>Os 20 alunos com mais pontos. Acerte perguntas nas aulas e na trivia para subir.</p>
      </header>

      {minhaPosicao && (
        <div className={`cartao ${styles.minha}`}>
          <span className={styles.minhaPosicao}>{minhaPosicao}º</span>
          <span>
            <strong>Sua posição</strong>
            <br />
            <span className={styles.suave}>{meusPontos} pontos</span>
          </span>
        </div>
      )}

      {lideres.length === 0 ? (
        <Vazio icone={Trophy} titulo="Ninguém pontuou ainda. Seja o primeiro!" />
      ) : (
        <ol className={`cartao ${styles.lista}`}>
          {lideres.map((l) => (
            <li key={l.apelido} className={`${styles.item} ${l.eu ? styles.eu : ''}`}>
              <span className={`${styles.posicao} ${l.posicao <= 3 ? styles[`podio${l.posicao}`] : ''}`}>
                {l.posicao <= 3 ? <Trophy aria-hidden="true" size={18} /> : null}
                <span>{l.posicao}º</span>
              </span>
              <Avatar url={l.foto_perfil_url} nome={l.apelido} tamanho={36} />
              <span className={styles.apelido}>
                <span className={styles.nomeApelido}>{l.apelido}</span>
                {l.eu && <span className="selo selo--primaria">você</span>}
              </span>
              <span className={styles.pontos}>{l.pontuacao_total} pts</span>
            </li>
          ))}
        </ol>
      )}
      {minhaPosicao && !estouNaLista && (
        <p className={styles.suave}>Continue respondendo para entrar no top {lideres.length}.</p>
      )}
    </div>
  );
}
