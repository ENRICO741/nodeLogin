import { useEffect } from 'react';
import { Link } from 'react-router';
import { BookOpen, CheckCircle2, ChevronRight, Lock } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import { useApi } from '../hooks/useApi';
import { prazoPos } from '../lib/questionario';
import { Carregando, ErroCarregamento, Vazio } from '../componentes/Estado';
import styles from './Aulas.module.css';

export function Aulas() {
  const { dados: aulas, erro, carregando, recarregar } = useApi('/aulas');
  const { usuario, atualizarSituacao } = useAuth();
  const pos = usuario.questionarios;
  // O pós abre no dia 14 sem a pessoa sair do app: confere a situação a cada abertura da tela.
  useEffect(() => {
    atualizarSituacao();
  }, [atualizarSituacao]);

  if (carregando) return <Carregando />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;

  const concluidas = aulas.filter((a) => a.concluida).length;

  return (
    <div className="pagina">
      <header className="cabecalho-pagina">
        <h1>Aulas</h1>
        <p>Leia o conteúdo e responda às perguntas para ganhar pontos.</p>
      </header>

      {/* Convite ao pós: opcional, sem pontos; some quando é enviado ou o prazo termina. */}
      {pos?.pos_pendente && (
        <section className={`cartao pilha ${styles.pesquisa}`} aria-labelledby="titulo-pos">
          <h2 id="titulo-pos">Questionário final disponível</h2>
          <p>
            Agradecemos pela sua participação na pesquisa. Responda ao questionário final para avaliarmos o
            resultado. Leva cerca de 10 minutos. Participação voluntária.
          </p>
          {pos.pos_fecha_em && <p className={styles.prazo}>{prazoPos(pos.pos_fecha_em)}</p>}
          <Link to="/questionario" className="botao">
            Responder
          </Link>
        </section>
      )}

      {aulas.length === 0 ? (
        <Vazio icone={BookOpen} titulo="Nenhuma aula disponível ainda" />
      ) : (
        <>
          <div className={`cartao ${styles.resumo}`}>
            <div className="linha">
              <strong>Seu progresso</strong>
              <span className={styles.contagem}>
                {concluidas} de {aulas.length} concluídas
              </span>
            </div>
            <div
              className="progresso"
              role="progressbar"
              aria-label="Aulas concluídas"
              aria-valuemin={0}
              aria-valuemax={aulas.length}
              aria-valuenow={concluidas}
            >
              <span style={{ width: `${(concluidas / aulas.length) * 100}%` }} />
            </div>
          </div>

          <ol className={styles.lista}>
            {aulas.map((aula, i) => (
              <li key={aula.id}>
                {aula.bloqueada ? (
                  <div className={`cartao ${styles.item} ${styles.bloqueada}`}>
                    <span className={styles.numero} aria-hidden="true">
                      {aula.ordem}
                    </span>
                    <span className={styles.info}>
                      <span className={styles.titulo}>{aula.titulo}</span>
                      <span className={styles.meta}>Conclua a aula {aulas[i - 1].ordem} para continuar</span>
                    </span>
                    <Lock aria-label="Bloqueada" size={20} className={styles.seta} />
                  </div>
                ) : (
                  <Link to={`/aulas/${aula.id}`} className={`cartao ${styles.item}`}>
                    <span className={styles.numero} aria-hidden="true">
                      {aula.concluida ? <CheckCircle2 size={22} /> : aula.ordem}
                    </span>
                    <span className={styles.info}>
                      <span className={styles.titulo}>{aula.titulo}</span>
                      <span className={styles.meta}>
                        {aula.total_questoes} {aula.total_questoes === 1 ? 'pergunta' : 'perguntas'} · bônus
                        de {aula.pontos_conclusao} pts
                      </span>
                    </span>
                    {aula.concluida && <span className="selo selo--sucesso">Concluída</span>}
                    <ChevronRight aria-hidden="true" size={20} className={styles.seta} />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
