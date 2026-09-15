import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import QuestionCard from '../components/QuestionCard';
import * as telemetry from '../lib/telemetry';
import '../styles/Trivia.css';

function TriviaRodada() {
  const { rodadaId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const rodada = location.state?.rodada;
  const questoes = location.state?.questoes;
  const userId = rodada?.usuarioId;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [resultado, setResultado] = useState(null);
  const perguntaExibidaEmRef = useRef(Date.now());

  useEffect(() => {
    if (!rodada || !questoes) {
      navigate('/trivia', { replace: true });
    }
  }, [rodada, questoes, navigate]);

  useEffect(() => {
    perguntaExibidaEmRef.current = Date.now();
  }, [currentIndex]);

  if (!rodada || !questoes) {
    return null;
  }

  const handleSelect = async (letra) => {
    setSelected(letra);
    const questao = questoes[currentIndex];
    const duracaoMs = perguntaExibidaEmRef.current ? Date.now() - perguntaExibidaEmRef.current : null;

    try {
      const response = await api.post(`/rodadas/${rodadaId}/respostas`, {
        usuarioId: userId,
        questaoId: questao.id,
        alternativa: letra,
      });
      setFeedback(response.data);
      telemetry.registrarEvento({
        tipoEvento: 'quiz_respondido',
        tela: `/trivia/${rodadaId}`,
        elemento: String(questao.id),
        duracaoMs,
        metadata: { correta: response.data.correta, dificuldade: rodada.dificuldade },
      });
    } catch (err) {
      console.error('Erro ao registrar resposta de trivia:', err);
    }
  };

  const handleNext = async () => {
    const isLast = currentIndex === questoes.length - 1;

    if (!isLast) {
      setCurrentIndex((prev) => prev + 1);
      setSelected(null);
      setFeedback(null);
      return;
    }

    try {
      const response = await api.post(`/rodadas/${rodadaId}/finalizar`, { usuarioId: userId });
      setResultado(response.data);
      telemetry.registrarEvento({
        tipoEvento: 'trivia_concluida',
        tela: `/trivia/${rodadaId}`,
        elemento: rodada.dificuldade,
        metadata: { rodadaId, pontosGanhos: response.data.pontosGanhos },
      });
    } catch (err) {
      console.error('Erro ao finalizar rodada de trivia:', err);
    }
  };

  if (resultado) {
    return (
      <div className="trivia-container">
        <div className="resultado-card">
          <h1>Rodada concluída!</h1>
          <p>Você ganhou <strong>{resultado.pontosGanhos} pontos</strong> nesta rodada.</p>
          <p>Pontuação total: <strong>{resultado.pontuacaoTotal}</strong></p>
          <Link to="/trivia" className="btn-iniciar">Jogar novamente</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="trivia-container">
      <p className="quiz-progresso">
        Pergunta {currentIndex + 1} de {questoes.length} — dificuldade: {rodada.dificuldade}
      </p>
      <QuestionCard
        question={questoes[currentIndex]}
        selected={selected}
        feedback={feedback}
        onSelect={handleSelect}
        onNext={handleNext}
        isLast={currentIndex === questoes.length - 1}
      />
    </div>
  );
}

export default TriviaRodada;
