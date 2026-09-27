import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import * as telemetry from '../lib/telemetry';
import '../styles/Trivia.css';

const DIFICULDADES = [
  { valor: 'facil', label: 'Fácil' },
  { valor: 'media', label: 'Média' },
  { valor: 'dificil', label: 'Difícil' },
];

function TriviaDificuldade({ userId }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const iniciarRodada = async (dificuldade) => {
    try {
      setLoading(true);
      setError('');
      const [rodadaResponse, questoesResponse] = await Promise.all([
        api.post('/trivia/rodadas', { usuarioId: userId, dificuldade }),
        api.get('/trivia/questoes', { params: { dificuldade } }),
      ]);

      const rodada = rodadaResponse.data;
      const questoes = questoesResponse.data;

      telemetry.registrarEvento({
        tipoEvento: 'trivia_iniciada',
        tela: '/trivia',
        elemento: dificuldade,
        metadata: { rodadaId: rodada.id, dificuldade },
      });

      navigate(`/trivia/${rodada.id}`, { state: { rodada, questoes } });
    } catch (err) {
      console.error('Erro ao iniciar rodada de trivia:', err);
      setError('Erro ao iniciar rodada de trivia');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="trivia-container">
      <h1>Trivia</h1>
      <p className="trivia-subtitle">Escolha a dificuldade e teste seus conhecimentos sobre LGPD.</p>

      <div className="dificuldade-lista">
        {DIFICULDADES.map((d) => (
          <button
            key={d.valor}
            type="button"
            className="dificuldade-card"
            disabled={loading}
            onClick={() => iniciarRodada(d.valor)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default TriviaDificuldade;
