import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { Aviso } from './Estado';
import styles from './QuestaoCard.module.css';

const LETRAS = ['a', 'b', 'c', 'd'];

export function QuestaoCard({ quiz, textoFinal = 'Ver resultado', onFinal, finalizando = false }) {
  const { questao, indice, total, ultima, escolha, feedback, enviando, erro, responder, avancar } = quiz;
  const botaoProximaRef = useRef(null);

  // Depois da resposta, o foco vai para o botão de avançar (leitores de tela ouvem o feedback antes).
  useEffect(() => {
    if (feedback) botaoProximaRef.current?.focus();
  }, [feedback]);

  return (
    <section className={`cartao ${styles.cartao}`} aria-labelledby="enunciado">
      <div className={styles.topo}>
        <span className="selo selo--primaria">
          Pergunta {indice + 1} de {total}
        </span>
        <span className="selo">{questao.pontos} pts</span>
      </div>
      <div
        className="progresso"
        role="progressbar"
        aria-label="Progresso do quiz"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={indice + (feedback ? 1 : 0)}
      >
        <span style={{ width: `${((indice + (feedback ? 1 : 0)) / total) * 100}%` }} />
      </div>

      {questao.imagem_url && (
        <img className={styles.imagem} src={questao.imagem_url} alt="Imagem de apoio da pergunta" />
      )}
      <h2 id="enunciado" className={styles.enunciado}>
        {questao.enunciado}
      </h2>

      <div className={styles.alternativas}>
        {LETRAS.map((letra) => {
          const correta = feedback && letra === feedback.resposta_correta;
          const erradaEscolhida = feedback && letra === escolha && !feedback.correta;
          const estado = correta ? styles.correta : erradaEscolhida ? styles.errada : '';
          return (
            <button
              key={letra}
              type="button"
              className={`${styles.alternativa} ${letra === escolha ? styles.escolhida : ''} ${estado}`}
              aria-pressed={letra === escolha}
              disabled={Boolean(feedback) || enviando}
              onClick={() => responder(letra)}
            >
              <span className={styles.letra} aria-hidden="true">
                {letra.toUpperCase()}
              </span>
              <span className={styles.textoAlternativa}>{questao[`alternativa_${letra}`]}</span>
              {correta && <Check aria-label="Resposta correta" size={20} />}
              {erradaEscolhida && <X aria-label="Sua resposta, incorreta" size={20} />}
            </button>
          );
        })}
      </div>

      {erro && <Aviso tipo="erro">{erro.message} Toque em uma alternativa para tentar de novo.</Aviso>}

      <div aria-live="polite">
        {feedback && (
          <div className={`${styles.feedback} ${feedback.correta ? styles.feedbackOk : styles.feedbackErro}`}>
            <p className={styles.feedbackTitulo}>
              {feedback.correta ? <Check aria-hidden="true" size={20} /> : <X aria-hidden="true" size={20} />}
              {feedback.correta ? 'Resposta correta!' : 'Resposta incorreta'}
              {feedback.pontos_ganhos > 0 && (
                <span className="selo selo--conquista">+{feedback.pontos_ganhos} pts</span>
              )}
            </p>
            {feedback.explicacao && <p className={styles.explicacao}>{feedback.explicacao}</p>}
          </div>
        )}
      </div>

      {feedback && (
        <button
          ref={botaoProximaRef}
          type="button"
          className="botao botao--bloco"
          disabled={ultima && finalizando}
          onClick={ultima ? onFinal : avancar}
        >
          {ultima ? textoFinal : 'Próxima pergunta'}
        </button>
      )}
    </section>
  );
}
