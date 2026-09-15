import { useEffect, useState } from 'react';
import api from '../lib/api';
import '../styles/Badges.css';

function Badges({ userId }) {
  const [badges, setBadges] = useState([]);
  const [conquistadas, setConquistadas] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchBadges = async () => {
      try {
        setLoading(true);
        const [todasResponse, doUsuarioResponse] = await Promise.all([
          api.get('/badges'),
          api.get(`/usuarios/${userId}/badges`),
        ]);
        setBadges(todasResponse.data);
        setConquistadas(new Set(doUsuarioResponse.data.map((b) => b.id)));
        setError('');
      } catch (err) {
        console.error('Erro ao buscar badges:', err);
        setError('Erro ao carregar conquistas');
      } finally {
        setLoading(false);
      }
    };

    fetchBadges();
  }, [userId]);

  if (loading) return <div className="badges-page"><p>Carregando conquistas...</p></div>;
  if (error) return <div className="badges-page"><p className="error">{error}</p></div>;

  return (
    <div className="badges-page">
      <h1>Conquistas</h1>
      <p className="badges-subtitle">Complete aulas e rodadas de trivia para desbloquear novas conquistas.</p>

      <div className="badges-grid">
        {badges.map((badge) => {
          const earned = conquistadas.has(badge.id);
          return (
            <div key={badge.id} className={`badge-card ${earned ? 'earned' : 'locked'}`}>
              <img src={badge.imagem_url} alt={badge.nome} />
              <h2>{badge.nome}</h2>
              <p>{badge.descricao}</p>
              {!earned && <span className="badge-lock">🔒 Ainda não conquistada</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Badges;
