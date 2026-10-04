import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Gauge, Lock, Signal, SignalLow, SignalMedium } from 'lucide-react';
import { api } from '../lib/api';
import { registrarEvento } from '../lib/telemetria';
import { useApi } from '../hooks/useApi';
import { useQuiz } from '../hooks/useQuiz';
import { useAuth } from '../contexto/Auth';
import { Aviso, Carregando, ErroCarregamento, Vazio } from '../componentes/Estado';
import { QuestaoCard } from '../componentes/QuestaoCard';
import { CardResultado } from '../componentes/CardResultado';
import styles from './Trivia.module.css';

const DIFICULDADES = [
  { valor: 'facil', rotulo: 'Fácil', descricao: 'Conceitos básicos do dia a dia', Icone: SignalLow },
  { valor: 'media', rotulo: 'Média', descricao: 'Situações comuns no trabalho', Icone: SignalMedium },
  {
    valor: 'dificil',
    rotulo: 'Difícil',
    descricao: 'Detalhes de lei e resposta a incidentes',
    Icone: Signal,
  },
];

export function Trivia() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const aulas = useApi('/aulas');
  const [iniciando, setIniciando] = useState(null);
  const [erro, setErro] = useState(null);

  if (aulas.carregando) return <Carregando />;
  if (aulas.erro) return <ErroCarregamento erro={aulas.erro} onTentarDeNovo={aulas.recarregar} />;
  // O backend também barra (TRIVIA_BLOQUEADA); aqui só evita mostrar botões que não funcionam.
  // Admin entra liberado para conferir as perguntas (sem pontuar).
  if (usuario?.papel !== 'admin' && !aulas.dados.every((a) => a.concluida)) {
    return (
      <div className="pagina">
        <header className="cabecalho-pagina">
          <h1>Trivia</h1>
        </header>
        <Vazio icone={Lock} titulo="Conclua todas as aulas para liberar a trivia">
          <Link to="/aulas" className="botao">
            Ir para as aulas
          </Link>
        </Vazio>
      </div>
    );
  }

  async function iniciar(dificuldade) {
    setIniciando(dificuldade);
    setErro(null);
    try {
      const rodada = await api('/trivia/rodadas', { metodo: 'POST', corpo: { dificuldade } });
      registrarEvento({ tipo_evento: 'trivia_iniciada', tela: '/trivia', elemento: dificuldade });
      navigate(`/trivia/${rodada.id}`);
    } catch (e) {
      setErro(e);
      setIniciando(null);
    }
  }

  return (
    <div className="pagina">
      <header className="cabecalho-pagina">
        <h1>Trivia</h1>
        <p>Escolha a dificuldade. Cada pergunta pontua só no seu primeiro acerto.</p>
      </header>
      <div className="pilha">
        <Aviso tipo="erro">{erro?.message}</Aviso>
        {DIFICULDADES.map(({ valor, rotulo, descricao, Icone }) => (
          <button
            key={valor}
            type="button"
            className={`cartao ${styles.opcao}`}
            disabled={Boolean(iniciando)}
            onClick={() => iniciar(valor)}
          >
            <Icone aria-hidden="true" size={28} className={styles.icone} />
            <span className={styles.textos}>
              <span className={styles.rotulo}>{rotulo}</span>
              <span className={styles.descricao}>{descricao}</span>
            </span>
            {iniciando === valor && <span className="selo">Sorteando…</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuizRodada({ rodada, aoFinalizar }) {
  const { atualizarUsuario } = useAuth();
  const [erroFinal, setErroFinal] = useState(null);
  const pendente = rodada.questoes.findIndex((q) => !q.respondida);

  const quiz = useQuiz({
    questoes: rodada.questoes,
    indiceInicial: pendente,
    enviarResposta: (questao_id, alternativa) =>
      api(`/trivia/rodadas/${rodada.id}/respostas`, { metodo: 'POST', corpo: { questao_id, alternativa } }),
    aoResponder: (questao, resultado, duracao) => {
      atualizarUsuario({ pontuacao_total: resultado.pontuacao_total });
      registrarEvento({
        tipo_evento: 'quiz_respondido',
        tela: '/trivia',
        elemento: questao.id,
        duracao_ms: duracao,
        metadata: { correta: resultado.correta, dificuldade: rodada.dificuldade },
      });
    },
  });

  async function finalizar() {
    setErroFinal(null);
    try {
      aoFinalizar(await api(`/trivia/rodadas/${rodada.id}/finalizar`, { metodo: 'POST' }));
    } catch (e) {
      setErroFinal(e);
    }
  }

  return (
    <div className="pilha">
      <QuestaoCard quiz={quiz} onFinal={finalizar} />
      <Aviso tipo="erro">{erroFinal?.message}</Aviso>
    </div>
  );
}

export function TriviaRodada() {
  const { id } = useParams();
  const { dados: rodada, erro, carregando, recarregar } = useApi(`/trivia/rodadas/${id}`);
  const [resultado, setResultado] = useState(null);

  if (carregando) return <Carregando texto="Carregando rodada…" />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;

  const todasRespondidas = rodada.questoes.every((q) => q.respondida);
  const acoes = (
    <>
      <Link to="/trivia" className="botao botao--bloco">
        Jogar outra rodada
      </Link>
      <Link to="/ranking" className="botao botao--secundario botao--bloco">
        Ver ranking
      </Link>
    </>
  );

  if (resultado) {
    return (
      <div className="pagina">
        <CardResultado
          titulo="Rodada finalizada!"
          acertos={resultado.acertos}
          total={resultado.total_questoes}
          pontosGanhos={resultado.pontos_ganhos}
          pontuacaoTotal={resultado.pontuacao_total}
          novosBadges={resultado.novos_badges}
        >
          {acoes}
        </CardResultado>
      </div>
    );
  }

  return (
    <div className="pagina">
      <Link to="/trivia" className={styles.voltar}>
        <ArrowLeft aria-hidden="true" size={18} /> Trivia
      </Link>
      {rodada.finalizada_em ? (
        <Vazio icone={Gauge} titulo="Esta rodada já terminou">
          <p>Você fez {rodada.pontos_ganhos} pontos nela.</p>
          <div className="pilha">{acoes}</div>
        </Vazio>
      ) : todasRespondidas ? (
        // Todas respondidas mas não finalizada (ex.: recarregou antes de ver o resultado).
        <Vazio icone={Gauge} titulo="Você respondeu todas as perguntas">
          <button
            type="button"
            className="botao"
            onClick={() =>
              api(`/trivia/rodadas/${id}/finalizar`, { metodo: 'POST' }).then(setResultado, recarregar)
            }
          >
            Ver resultado
          </button>
        </Vazio>
      ) : (
        <QuizRodada rodada={rodada} aoFinalizar={setResultado} />
      )}
    </div>
  );
}
