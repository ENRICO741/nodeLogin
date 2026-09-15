import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import '../styles/Aulas.css';

function AulasList({ userId }) {
  const [aulas, setAulas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAulas = async () => {
      try {
        setLoading(true);
        const response = await api.get('/aulas', { params: { usuarioId: userId } });
        setAulas(response.data);
        setError('');
      } catch (err) {
        console.error('Erro ao buscar aulas:', err);
        setError('Erro ao carregar aulas');
      } finally {
        setLoading(false);
      }
    };

    fetchAulas();
  }, [userId]);

  if (loading) return <div className="aulas-container"><p>Carregando aulas...</p></div>;
  if (error) return <div className="aulas-container"><p className="error">{error}</p></div>;

  const totalConcluidas = aulas.filter((aula) => aula.concluida).length;

  return (
    <div className="aulas-container">
      <h1>Aulas</h1>
      <p className="aulas-subtitle">Aprenda sobre LGPD e ganhe pontos concluindo as atividades.</p>
      {aulas.length > 0 && (
        <p className="aulas-progresso">
          {totalConcluidas} de {aulas.length} aulas concluídas
        </p>
      )}

      <div className="aulas-lista">
        {aulas.map((aula) => (
          <Link
            key={aula.id}
            to={`/aulas/${aula.id}`}
            className={`aula-card${aula.concluida ? ' concluida' : ''}`}
          >
            <span className="aula-ordem">{aula.ordem}</span>
            <div className="aula-info">
              <h2>{aula.titulo}</h2>
              <p>{aula.pontos_conclusao} pontos ao concluir</p>
            </div>
            {aula.concluida && <span className="aula-selo-concluida">✔ Concluída</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default AulasList;
