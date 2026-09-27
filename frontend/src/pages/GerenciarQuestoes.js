import { useEffect, useState } from 'react';
import api from '../lib/api';
import '../styles/Questoes.css';

function agruparPor(itens, chave) {
  const grupos = new Map();
  itens.forEach((item) => {
    const valor = item[chave] || '—';
    if (!grupos.has(valor)) grupos.set(valor, []);
    grupos.get(valor).push(item);
  });
  return grupos;
}

function LinhaQuestao({ questao, onSalvar }) {
  const [valor, setValor] = useState(questao.imagem_url || '');
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState('');

  const alterado = valor !== (questao.imagem_url || '');

  const handleSalvar = async () => {
    try {
      setSalvando(true);
      setStatus('');
      await onSalvar(questao.id, valor);
      setStatus('Salvo!');
    } catch (err) {
      console.error('Erro ao salvar imagem da questão:', err);
      setStatus('Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="questao-linha">
      <div className="questao-preview">
        {questao.imagem_url ? (
          <img src={questao.imagem_url} alt="" />
        ) : (
          <span className="questao-sem-imagem">Sem imagem</span>
        )}
      </div>

      <div className="questao-info">
        <p className="questao-enunciado">{questao.enunciado}</p>
        <div className="questao-form">
          <input
            type="text"
            placeholder="URL da imagem (deixe vazio para remover)"
            value={valor}
            onChange={(e) => {
              setValor(e.target.value);
              setStatus('');
            }}
          />
          <button type="button" disabled={!alterado || salvando} onClick={handleSalvar}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
        {status && <span className={`questao-status ${status === 'Salvo!' ? 'ok' : 'erro'}`}>{status}</span>}
      </div>
    </div>
  );
}

function GerenciarQuestoes() {
  const [questoesAula, setQuestoesAula] = useState([]);
  const [questoesTrivia, setQuestoesTrivia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchQuestoes = async () => {
      try {
        setLoading(true);
        const [aulaRes, triviaRes] = await Promise.all([
          api.get('/questoes-aula'),
          api.get('/questoes-trivia'),
        ]);
        setQuestoesAula(aulaRes.data);
        setQuestoesTrivia(triviaRes.data);
        setError('');
      } catch (err) {
        console.error('Erro ao buscar questões:', err);
        setError('Erro ao carregar questões');
      } finally {
        setLoading(false);
      }
    };

    fetchQuestoes();
  }, []);

  const salvarImagemAula = async (questaoId, imagemUrl) => {
    await api.put(`/questoes-aula/${questaoId}`, { imagemUrl });
    setQuestoesAula((prev) => prev.map((q) => (q.id === questaoId ? { ...q, imagem_url: imagemUrl || null } : q)));
  };

  const salvarImagemTrivia = async (questaoId, imagemUrl) => {
    await api.put(`/questoes-trivia/${questaoId}`, { imagemUrl });
    setQuestoesTrivia((prev) => prev.map((q) => (q.id === questaoId ? { ...q, imagem_url: imagemUrl || null } : q)));
  };

  if (loading) return <div className="questoes-container"><p>Carregando questões...</p></div>;
  if (error) return <div className="questoes-container"><p className="error">{error}</p></div>;

  const gruposAula = agruparPor(questoesAula, 'aula_titulo');
  const gruposTrivia = agruparPor(questoesTrivia, 'dificuldade');

  return (
    <div className="questoes-container">
      <h1>Gerenciar Questões</h1>
      <p className="questoes-subtitle">Cadastre a imagem de cada questão de Aulas e Trivia.</p>

      <section className="questoes-secao">
        <h2>Questões de Aulas</h2>
        {[...gruposAula.entries()].map(([aulaTitulo, questoes]) => (
          <div key={aulaTitulo} className="questoes-grupo">
            <h3>{aulaTitulo}</h3>
            {questoes.map((questao) => (
              <LinhaQuestao key={questao.id} questao={questao} onSalvar={salvarImagemAula} />
            ))}
          </div>
        ))}
      </section>

      <section className="questoes-secao">
        <h2>Questões de Trivia</h2>
        {[...gruposTrivia.entries()].map(([dificuldade, questoes]) => (
          <div key={dificuldade} className="questoes-grupo">
            <h3>{dificuldade}</h3>
            {questoes.map((questao) => (
              <LinhaQuestao key={questao.id} questao={questao} onSalvar={salvarImagemTrivia} />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

export default GerenciarQuestoes;
