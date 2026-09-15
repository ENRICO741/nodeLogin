import { useEffect, useState } from 'react';
import api from '../lib/api';
import '../styles/Estatisticas.css';

function formatarDuracao(ms) {
  if (!ms && ms !== 0) return '—';
  const totalSegundos = Math.round(ms / 1000);
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${minutos}m ${segundos}s`;
}

function formatarPercentual(totalAcertos, totalRespostas) {
  if (!totalRespostas) return '—';
  return `${Math.round((totalAcertos / totalRespostas) * 100)}%`;
}

function TabelaPorAtividade({ itens, chaveNome, labelNome }) {
  return (
    <table className="estatisticas-tabela">
      <thead>
        <tr>
          <th>{labelNome}</th>
          <th>Tentativas</th>
          <th>Concluídas</th>
          <th>Tempo médio</th>
          <th>% de acerto</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((item) => (
          <tr key={item[chaveNome] ?? item.aulaId ?? item.dificuldade}>
            <td>{item[chaveNome]}</td>
            <td>{item.totalTentativas}</td>
            <td>{item.totalConcluidas}</td>
            <td>{formatarDuracao(item.duracaoMediaMs)}</td>
            <td>{formatarPercentual(item.totalAcertos, item.totalRespostas)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TabelaPorQuestao({ itens, chaveContexto, labelContexto }) {
  return (
    <table className="estatisticas-tabela">
      <thead>
        <tr>
          <th>Questão</th>
          <th>{labelContexto}</th>
          <th>Respostas</th>
          <th>Acertos</th>
          <th>% de acerto</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((item) => (
          <tr key={item.questaoId}>
            <td className="estatisticas-enunciado">{item.enunciado}</td>
            <td>{item[chaveContexto]}</td>
            <td>{item.totalRespostas}</td>
            <td>{item.totalAcertos || 0}</td>
            <td>{formatarPercentual(item.totalAcertos, item.totalRespostas)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TabelaPorUsuario({ itens, chaveContexto, labelContexto }) {
  return (
    <table className="estatisticas-tabela">
      <thead>
        <tr>
          <th>Usuário</th>
          <th>{labelContexto}</th>
          <th>Tentativas</th>
          <th>Tempo médio</th>
          <th>% de acerto</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((item) => (
          <tr key={`${item.usuarioId}-${item.aulaId ?? item.dificuldade}`}>
            <td>{item.username}</td>
            <td>{item[chaveContexto]}</td>
            <td>{item.totalTentativas}</td>
            <td>{formatarDuracao(item.duracaoMediaMs)}</td>
            <td>{formatarPercentual(item.totalAcertos, item.totalRespostas)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Vazio({ children }) {
  return <p className="estatisticas-vazio">{children}</p>;
}

function Estatisticas() {
  const [porAula, setPorAula] = useState([]);
  const [questoesAula, setQuestoesAula] = useState([]);
  const [usuariosAula, setUsuariosAula] = useState([]);
  const [porTrivia, setPorTrivia] = useState([]);
  const [questoesTrivia, setQuestoesTrivia] = useState([]);
  const [usuariosTrivia, setUsuariosTrivia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDados = async () => {
      try {
        setLoading(true);
        const [aula, qAula, uAula, trivia, qTrivia, uTrivia] = await Promise.all([
          api.get('/estatisticas/aulas'),
          api.get('/estatisticas/aulas/questoes'),
          api.get('/estatisticas/aulas/usuarios'),
          api.get('/estatisticas/trivia'),
          api.get('/estatisticas/trivia/questoes'),
          api.get('/estatisticas/trivia/usuarios'),
        ]);
        setPorAula(aula.data);
        setQuestoesAula(qAula.data);
        setUsuariosAula(uAula.data);
        setPorTrivia(trivia.data);
        setQuestoesTrivia(qTrivia.data);
        setUsuariosTrivia(uTrivia.data);
        setError('');
      } catch (err) {
        console.error('Erro ao buscar estatísticas:', err);
        setError('Erro ao carregar estatísticas');
      } finally {
        setLoading(false);
      }
    };

    fetchDados();
  }, []);

  if (loading) return <div className="estatisticas-container"><p>Carregando estatísticas...</p></div>;
  if (error) return <div className="estatisticas-container"><p className="error">{error}</p></div>;

  return (
    <div className="estatisticas-container">
      <h1>Estatísticas</h1>
      <p className="estatisticas-subtitle">Desempenho nas atividades de Aulas e Trivia.</p>

      <section className="estatisticas-secao">
        <h2>Aulas</h2>

        <h3>Por aula</h3>
        {porAula.length > 0 ? (
          <TabelaPorAtividade itens={porAula} chaveNome="titulo" labelNome="Aula" />
        ) : (
          <Vazio>Nenhuma tentativa registrada ainda.</Vazio>
        )}

        <h3>Por questão</h3>
        {questoesAula.length > 0 ? (
          <TabelaPorQuestao itens={questoesAula} chaveContexto="aulaTitulo" labelContexto="Aula" />
        ) : (
          <Vazio>Nenhuma resposta registrada ainda.</Vazio>
        )}

        <h3>Por usuário</h3>
        {usuariosAula.length > 0 ? (
          <TabelaPorUsuario itens={usuariosAula} chaveContexto="aulaTitulo" labelContexto="Aula" />
        ) : (
          <Vazio>Nenhuma tentativa registrada ainda.</Vazio>
        )}
      </section>

      <section className="estatisticas-secao">
        <h2>Trivia</h2>

        <h3>Por dificuldade</h3>
        {porTrivia.length > 0 ? (
          <TabelaPorAtividade itens={porTrivia} chaveNome="dificuldade" labelNome="Dificuldade" />
        ) : (
          <Vazio>Nenhuma rodada registrada ainda.</Vazio>
        )}

        <h3>Por questão</h3>
        {questoesTrivia.length > 0 ? (
          <TabelaPorQuestao itens={questoesTrivia} chaveContexto="dificuldade" labelContexto="Dificuldade" />
        ) : (
          <Vazio>Nenhuma resposta registrada ainda.</Vazio>
        )}

        <h3>Por usuário</h3>
        {usuariosTrivia.length > 0 ? (
          <TabelaPorUsuario itens={usuariosTrivia} chaveContexto="dificuldade" labelContexto="Dificuldade" />
        ) : (
          <Vazio>Nenhuma rodada registrada ainda.</Vazio>
        )}
      </section>
    </div>
  );
}

export default Estatisticas;
