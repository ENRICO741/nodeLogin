import { useRef, useState } from 'react';
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
  const { usuario, atualizarUsuario } = useAuth();
  const aulas = useApi('/aulas');
  const [iniciando, setIniciando] = useState(null);
  const [erro, setErro] = useState(null);
  // Níveis que o servidor disse não ter questões suficientes (409 NIVEL_INDISPONIVEL) nesta visita à tela.
  const [indisponiveis, setIndisponiveis] = useState([]);
  // Trava síncrona: o disabled só chega no próximo render, e dois toques podem cair no mesmo.
  const emAndamento = useRef(false);

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
    if (emAndamento.current) return; // toque duplo não cria duas rodadas
    emAndamento.current = true;
    setIniciando(dificuldade);
    setErro(null);
    try {
      const rodada = await api('/trivia/rodadas', { metodo: 'POST', corpo: { dificuldade } });
      registrarEvento({ tipo_evento: 'trivia_iniciada', tela: '/trivia', elemento: dificuldade });
      navigate(`/trivia/${rodada.id}`);
    } catch (e) {
      setErro(e);
      if (e.codigo === 'NIVEL_INDISPONIVEL') setIndisponiveis((atual) => [...atual, dificuldade]);
      // Servidor barra quem ainda não respondeu o questionário inicial: a RotaProtegida leva a ele.
      if (e.codigo === 'QUESTIONARIO_PRE_PENDENTE')
        atualizarUsuario({ questionarios: { ...usuario.questionarios, pre_pendente: true } });
      setIniciando(null);
      emAndamento.current = false; // no sucesso a tela sai, e a trava fica até lá
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
            disabled={Boolean(iniciando) || indisponiveis.includes(valor)}
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
  const [finalizando, setFinalizando] = useState(false);
  const emAndamento = useRef(false); // trava síncrona: o disabled só chega no próximo render
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
    if (emAndamento.current) return; // toque duplo não finaliza duas vezes
    emAndamento.current = true;
    setFinalizando(true);
    setErroFinal(null);
    try {
      aoFinalizar(await api(`/trivia/rodadas/${rodada.id}/finalizar`, { metodo: 'POST' }));
    } catch (e) {
      setErroFinal(e);
    } finally {
      setFinalizando(false);
      emAndamento.current = false;
    }
  }

  return (
    <div className="pilha">
      <QuestaoCard
        quiz={quiz}
        textoFinal={finalizando ? 'Finalizando…' : 'Ver resultado'}
        onFinal={finalizar}
        finalizando={finalizando}
      />
      <Aviso tipo="erro">{erroFinal?.message}</Aviso>
    </div>
  );
}

export function TriviaRodada() {
  const { id } = useParams();
  const { dados: rodada, erro, carregando, recarregar } = useApi(`/trivia/rodadas/${id}`);
  const [resultado, setResultado] = useState(null);
  const [finalizando, setFinalizando] = useState(false);
  const emAndamento = useRef(false); // trava síncrona: o disabled só chega no próximo render

  if (carregando) return <Carregando texto="Carregando rodada…" />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;

  const todasRespondidas = rodada.questoes.every((q) => q.respondida);

  async function verResultado() {
    if (emAndamento.current) return; // toque duplo não finaliza duas vezes
    emAndamento.current = true;
    setFinalizando(true);
    try {
      setResultado(await api(`/trivia/rodadas/${id}/finalizar`, { metodo: 'POST' }));
    } catch {
      recarregar();
    } finally {
      setFinalizando(false);
      emAndamento.current = false;
    }
  }
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
          <button type="button" className="botao" disabled={finalizando} onClick={verResultado}>
            Ver resultado
          </button>
        </Vazio>
      ) : (
        <QuizRodada rodada={rodada} aoFinalizar={setResultado} />
      )}
    </div>
  );
}
