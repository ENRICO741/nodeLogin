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

  const questao = questoes[indice];

  async function responder(alternativa) {
    if (enviando || feedback) return; // trava clique duplo
    setEscolha(alternativa);
    setEnviando(true);
    setErro(null);
    try {
      const resultado = await enviarResposta(questao.id, alternativa);
      setFeedback(resultado);
      aoResponder?.(questao, resultado, Date.now() - exibidaEm.current);
    } catch (e) {
      setErro(e);
      setEscolha(null);
    } finally {
      setEnviando(false);
    }
  }

  function avancar() {
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
