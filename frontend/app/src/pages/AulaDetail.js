import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { apiBaseUrl } from '../lib/api';
import QuestionCard from '../components/QuestionCard';
import * as telemetry from '../lib/telemetry';
import '../styles/Aulas.css';

function resolverCaminhosDeImagem(html) {
  return html.replaceAll('src="/content-assets/', `src="${apiBaseUrl}/content-assets/`);
}

function AulaDetail({ userId }) {
  const { aulaId } = useParams();

  const [aula, setAula] = useState(null);
  const [conteudoTeorico, setConteudoTeorico] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [step, setStep] = useState('conteudo'); // conteudo | quiz | resultado
  const [visitaId, setVisitaId] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [resultado, setResultado] = useState(null);
  const perguntaExibidaEmRef = useRef(null);

  useEffect(() => {
    if (step === 'quiz') {
      perguntaExibidaEmRef.current = Date.now();
    }
  }, [step, currentIndex]);

  useEffect(() => {
    const fetchAula = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/aulas/${aulaId}`, { params: { usuarioId: userId } });
        setAula(response.data);
        setError('');
      } catch (err) {
        console.error('Erro ao buscar aula:', err);
        setError('Erro ao carregar aula');
      } finally {
        setLoading(false);
      }
    };

    fetchAula();
  }, [aulaId, userId]);

  useEffect(() => {
    if (!aula) return;

    const fetchConteudoTeorico = async () => {
      try {
        const response = await api.get(`/conteudos/${aula.ordem}`);
        setConteudoTeorico(response.data);
      } catch (err) {
        setConteudoTeorico(null);
      }
    };

    fetchConteudoTeorico();
  }, [aula]);

  const iniciarAtividade = async () => {
    try {
      const response = await api.post(`/aulas/${aulaId}/visitas`, { usuarioId: userId });
      setVisitaId(response.data.id);
      setStep('quiz');
      telemetry.registrarEvento({
        tipoEvento: 'aula_iniciada',
        tela: `/aulas/${aulaId}`,
        elemento: aula.titulo,
        metadata: { aulaId },
      });
    } catch (err) {
      console.error('Erro ao iniciar atividade:', err);
      setError('Erro ao iniciar atividade');
    }
  };

  const handleSelect = async (letra) => {
    setSelected(letra);
    const questao = aula.questoes[currentIndex];
    const duracaoMs = perguntaExibidaEmRef.current ? Date.now() - perguntaExibidaEmRef.current : null;

    try {
      const response = await api.post(`/visitas/${visitaId}/respostas`, {
        usuarioId: userId,
        questaoId: questao.id,
        alternativa: letra,
      });
      setFeedback(response.data);
      telemetry.registrarEvento({
        tipoEvento: 'quiz_respondido',
        tela: `/aulas/${aulaId}`,
        elemento: String(questao.id),
        duracaoMs,
        metadata: { correta: response.data.correta },
      });
    } catch (err) {
      console.error('Erro ao registrar resposta:', err);
    }
  };

  const handleNext = async () => {
    const isLast = currentIndex === aula.questoes.length - 1;

    if (!isLast) {
      setCurrentIndex((prev) => prev + 1);
      setSelected(null);
      setFeedback(null);
      return;
    }

    try {
      const response = await api.post(`/visitas/${visitaId}/finalizar`, { usuarioId: userId });
      setResultado(response.data);
      setStep('resultado');
      telemetry.registrarEvento({
        tipoEvento: 'aula_concluida',
        tela: `/aulas/${aulaId}`,
        elemento: aula.titulo,
        metadata: { aulaId, pontosGanhos: response.data.pontosGanhos },
      });
      response.data.novosBadges.forEach((badge) => {
        telemetry.registrarEvento({
          tipoEvento: 'badge_conquistada',
          tela: `/aulas/${aulaId}`,
          elemento: badge.nome,
          metadata: { badgeId: badge.id },
        });
      });
    } catch (err) {
      console.error('Erro ao finalizar atividade:', err);
    }
  };

  if (loading) return <div className="aulas-container"><p>Carregando aula...</p></div>;
  if (error) return <div className="aulas-container"><p className="error">{error}</p></div>;
  if (!aula) return null;

  return (
    <div className="aulas-container">
      <Link to="/aulas" className="aulas-voltar">← Voltar para aulas</Link>

      {step === 'conteudo' && (
        <div className="aula-conteudo-card">
          {aula.concluida && (
            <div className="aula-ja-concluida">✔ Você já concluiu esta aula</div>
          )}
          <h1>{aula.titulo}</h1>
          <div
            className="aula-conteudo-html"
            dangerouslySetInnerHTML={{
              __html: resolverCaminhosDeImagem(conteudoTeorico ? conteudoTeorico.conteudoHtml : aula.conteudo_html),
            }}
          />
          <button type="button" className="btn-iniciar" onClick={iniciarAtividade}>
            {aula.concluida ? 'Refazer atividade' : 'Iniciar atividade'}
          </button>
        </div>
      )}

      {step === 'quiz' && aula.questoes.length > 0 && (
        <>
          <p className="quiz-progresso">
            Pergunta {currentIndex + 1} de {aula.questoes.length}
          </p>
          <QuestionCard
            question={aula.questoes[currentIndex]}
            selected={selected}
            feedback={feedback}
            onSelect={handleSelect}
            onNext={handleNext}
            isLast={currentIndex === aula.questoes.length - 1}
          />
        </>
      )}

      {step === 'resultado' && resultado && (
        <div className="resultado-card">
          <h1>Atividade concluída!</h1>
          {resultado.pontosGanhos > 0 ? (
            <p>Você ganhou <strong>{resultado.pontosGanhos} pontos</strong> de bônus de conclusão.</p>
          ) : (
            <p>Você já havia concluído esta aula anteriormente — sem novos pontos de bônus.</p>
          )}
          <p>Pontuação total: <strong>{resultado.pontuacaoTotal}</strong></p>
          {resultado.novosBadges.length > 0 && (
            <div className="resultado-badges">
              <p>Novas conquistas desbloqueadas:</p>
              <ul>
                {resultado.novosBadges.map((badge) => (
                  <li key={badge.id}>{badge.nome}</li>
                ))}
              </ul>
            </div>
          )}
          <Link to="/aulas" className="btn-iniciar">Voltar para aulas</Link>
        </div>
      )}
    </div>
  );
}

export default AulaDetail;
