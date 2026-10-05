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
  // Alternativa cujo envio falhou por rede/5xx: o servidor pode tê-la gravado sem o retorno chegar.
  const semRetorno = useRef(null);

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
        // Outra alternativa recusada porque a anterior foi gravada: reenvia a anterior (o servidor aceita
        // a mesma de novo) para mostrar o resultado que de fato valeu.
        const anterior = semRetorno.current;
        if (e.codigo !== 'JA_RESPONDIDA' || !anterior || anterior === enviada) throw e;
        enviada = anterior;
        setEscolha(anterior);
        resultado = await enviarResposta(questao.id, anterior);
      }
      semRetorno.current = null;
      setFeedback(resultado);
      aoResponder?.(questao, resultado, Date.now() - exibidaEm.current);
    } catch (e) {
      if (e.status === 0 || e.status >= 500) semRetorno.current = enviada;
      setErro(e);
      setEscolha(null);
    } finally {
      setEnviando(false);
    }
  }

  function avancar() {
    semRetorno.current = null;
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
