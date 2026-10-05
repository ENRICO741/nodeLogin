import { useRef, useState } from 'react';

// Máquina de estado do quiz, compartilhada por aulas e trivia.
// `enviarResposta(questaoId, alternativa)` devolve o feedback do servidor.
export function useQuiz({ questoes, enviarResposta, aoResponder, indiceInicial = 0 }) {
  const [indice, setIndice] = useState(indiceInicial);
  const [escolha, setEscolha] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const exibidaEm = useRef(Date.now());
  // Alternativas cujo envio falhou por rede/5xx: o servidor pode ter gravado uma delas sem o retorno chegar.
  // Todas, não só a última: com a rede caindo, a gravada pode ter sido a primeira tentativa.
  const semRetorno = useRef(new Set());

  const questao = questoes[indice];

  async function responder(alternativa) {
    if (enviando || feedback) return; // trava clique duplo
    setEscolha(alternativa);
    setEnviando(true);
    setErro(null);
    let enviada = alternativa;
    try {
      let resultado;
      try {
        resultado = await enviarResposta(questao.id, enviada);
      } catch (e) {
        if (e.codigo !== 'JA_RESPONDIDA') throw e;
        // Recusada porque outra já foi gravada: reenvia as que ficaram sem retorno (o servidor aceita a
        // mesma de novo) até achar a que valeu, e mostra o resultado dela.
        let recusa = e;
        for (const anterior of semRetorno.current) {
          if (anterior === alternativa) continue;
          enviada = anterior;
          try {
            resultado = await enviarResposta(questao.id, anterior);
            break;
          } catch (outro) {
            if (outro.codigo !== 'JA_RESPONDIDA') throw outro;
            recusa = outro;
          }
        }
        if (!resultado) throw recusa;
        setEscolha(enviada);
      }
      semRetorno.current.clear();
      setFeedback(resultado);
      aoResponder?.(questao, resultado, Date.now() - exibidaEm.current);
    } catch (e) {
      if (e.status === 0 || e.status >= 500) semRetorno.current.add(enviada);
      setErro(e);
      setEscolha(null);
    } finally {
      setEnviando(false);
    }
  }

  function avancar() {
    semRetorno.current.clear();
    setIndice((i) => i + 1);
    setEscolha(null);
    setFeedback(null);
    setErro(null);
    exibidaEm.current = Date.now();
  }

  return {
    questao,
    indice,
    total: questoes.length,
    ultima: indice === questoes.length - 1,
    escolha,
    feedback,
    enviando,
    erro,
    responder,
    avancar,
  };
}
