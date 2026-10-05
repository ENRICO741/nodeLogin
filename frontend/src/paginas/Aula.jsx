import { useState } from 'react';
import { Link, useParams } from 'react-router';
import DOMPurify from 'dompurify';
import { ArrowLeft, CheckCircle2, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { registrarEvento } from '../lib/telemetria';
import { useApi } from '../hooks/useApi';
import { useQuiz } from '../hooks/useQuiz';
import { useLeitura } from '../hooks/useLeitura';
import { useAuth } from '../contexto/Auth';
import { Aviso, Carregando, ErroCarregamento, Vazio } from '../componentes/Estado';
import { QuestaoCard } from '../componentes/QuestaoCard';
import { CardResultado } from '../componentes/CardResultado';
import styles from './Aula.module.css';

function Quiz({ aula, visitaId, aoFinalizar }) {
  const { atualizarUsuario } = useAuth();
  const [erroFinal, setErroFinal] = useState(null);
  const [finalizando, setFinalizando] = useState(false);
  const tela = `/aulas/${aula.id}`;

  const quiz = useQuiz({
    questoes: aula.questoes,
    enviarResposta: (questao_id, alternativa) =>
      api(`/visitas/${visitaId}/respostas`, { metodo: 'POST', corpo: { questao_id, alternativa } }),
    aoResponder: (questao, resultado, duracao) => {
      atualizarUsuario({ pontuacao_total: resultado.pontuacao_total });
      registrarEvento({
        tipo_evento: 'quiz_respondido',
        tela,
        elemento: questao.id,
        duracao_ms: duracao,
        metadata: { correta: resultado.correta },
      });
    },
  });

  async function finalizar() {
    if (finalizando) return; // toque duplo não finaliza duas vezes
    setFinalizando(true);
    setErroFinal(null);
    try {
      const resultado = await api(`/visitas/${visitaId}/finalizar`, { metodo: 'POST' });
      atualizarUsuario({ pontuacao_total: resultado.pontuacao_total });
      registrarEvento({ tipo_evento: 'aula_concluida', tela, elemento: aula.id });
      aoFinalizar(resultado);
    } catch (e) {
      setErroFinal(e);
    } finally {
      setFinalizando(false);
    }
  }

  return (
    <div className="pilha">
      <QuestaoCard
        quiz={quiz}
        textoFinal={finalizando ? 'Concluindo…' : 'Concluir aula'}
        onFinal={finalizar}
        finalizando={finalizando}
      />
      <Aviso tipo="erro">{erroFinal?.message}</Aviso>
    </div>
  );
}

export function Aula() {
  const { id } = useParams();
  const { dados: aula, erro, carregando, recarregar } = useApi(`/aulas/${id}`);
  const [etapa, setEtapa] = useState('conteudo'); // conteudo | quiz | resultado
  const [visitaId, setVisitaId] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erroInicio, setErroInicio] = useState(null);
  const [iniciando, setIniciando] = useState(false);
  const concluirLeitura = useLeitura(id, Boolean(aula) && etapa === 'conteudo');

  if (carregando) return <Carregando texto="Carregando aula…" />;
  if (erro?.codigo === 'AULA_BLOQUEADA') {
    return (
      <div className="pagina">
        <Vazio icone={Lock} titulo={erro.message}>
          <Link to="/aulas" className="botao">
            Ver aulas
          </Link>
        </Vazio>
      </div>
    );
  }
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;

  async function iniciar() {
    if (iniciando) return; // toque duplo não abre duas visitas
    setIniciando(true);
    concluirLeitura('iniciou_perguntas');
    setErroInicio(null);
    try {
      const visita = await api(`/aulas/${id}/visitas`, { metodo: 'POST' });
      setVisitaId(visita.id);
      setEtapa('quiz');
      registrarEvento({ tipo_evento: 'aula_iniciada', tela: `/aulas/${id}`, elemento: id });
    } catch (e) {
      setErroInicio(e);
    } finally {
      setIniciando(false);
    }
  }

  function aoFinalizar(dados) {
    setResultado(dados);
    setEtapa('resultado');
  }

  return (
    <div className="pagina">
      <Link to="/aulas" className={styles.voltar}>
        <ArrowLeft aria-hidden="true" size={18} /> Aulas
      </Link>

      {etapa === 'conteudo' && (
        <article className="cartao pilha">
          {aula.concluida && (
            <span className="selo selo--sucesso">
              <CheckCircle2 aria-hidden="true" size={14} /> Você já concluiu esta aula
            </span>
          )}
          <h1>{aula.titulo}</h1>
          <div
            className={styles.conteudo}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(aula.conteudo_html) }}
          />
          <Aviso tipo="erro">{erroInicio?.message}</Aviso>
          {aula.questoes.length > 0 ? (
            <button type="button" className="botao botao--bloco" disabled={iniciando} onClick={iniciar}>
              {aula.concluida
                ? 'Refazer perguntas'
                : `Responder ${aula.questoes.length} ${aula.questoes.length === 1 ? 'pergunta' : 'perguntas'}`}
            </button>
          ) : (
            <Aviso>Esta aula ainda não tem perguntas.</Aviso>
          )}
        </article>
      )}

      {etapa === 'quiz' && <Quiz aula={aula} visitaId={visitaId} aoFinalizar={aoFinalizar} />}

      {etapa === 'resultado' && (
        <CardResultado
          titulo="Aula concluída!"
          acertos={resultado.acertos}
          total={resultado.total_questoes}
          pontosGanhos={resultado.pontos_questoes + resultado.bonus_conclusao}
          pontuacaoTotal={resultado.pontuacao_total}
          novosBadges={resultado.novos_badges}
        >
          <Link to="/aulas" className="botao botao--bloco">
            Ver outras aulas
          </Link>
          {resultado.trivia_liberada && (
            <Link to="/trivia" className="botao botao--secundario botao--bloco">
              Testar na trivia
            </Link>
          )}
        </CardResultado>
      )}
    </div>
  );
}
