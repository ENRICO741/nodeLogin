import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { CheckCircle2, Clock, LogOut } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { registrarEvento } from '../lib/telemetria';
import {
  alternarMultipla,
  blocosVisiveis,
  caracteres,
  excedidos,
  faltantes,
  itensDoBloco,
  montarEnvio,
  sortearOrdem,
} from '../lib/questionario';
import { Aviso, Carregando, ErroCarregamento } from '../componentes/Estado';
import styles from './Questionario.module.css';

// Rascunho no aparelho: quem sai no meio volta de onde parou (mesma ordem sorteada; 'inicio' marca que começou).
const chaveRascunho = (tipo, usuarioId) => `guardiao.questionario.${tipo}.${usuarioId}`;
const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const valorValido = (v) =>
  typeof v === 'number' || typeof v === 'string' || (Array.isArray(v) && v.every(Number.isInteger));
// Rascunho de outra versão ou malformado (editado, corrompido) é apagado: a pessoa recomeça, a tela não quebra.
function lerRascunho(chave, versao) {
  try {
    const s = JSON.parse(localStorage.getItem(chave));
    if (s === null) return null;
    if (
      objeto(s) &&
      s.versao === versao &&
      objeto(s.respostas) &&
      Object.values(s.respostas).every(valorValido) &&
      (s.ordem === null ||
        (objeto(s.ordem) &&
          Object.values(s.ordem).every((l) => Array.isArray(l) && l.every((c) => typeof c === 'string')))) &&
      Number.isInteger(s.passo) &&
      s.passo >= 0 &&
      (s.inicio === null || Number.isFinite(s.inicio))
    )
      return s;
  } catch {
    /* JSON inválido ou sem armazenamento */
  }
  gravarRascunho(chave, null);
  return null;
}
function gravarRascunho(chave, valor) {
  try {
    if (valor) localStorage.setItem(chave, JSON.stringify(valor));
    else localStorage.removeItem(chave);
  } catch {
    /* sem armazenamento: o rascunho vale só enquanto a tela está aberta */
  }
}

// Decide entre formulário, agradecimento ou sair da página (nada pendente).
export function Questionario({ tipo }) {
  const { usuario, sair, atualizarUsuario } = useAuth();
  const [fim, setFim] = useState(null); // { motivo: 'enviado' | 'ja-respondido' | 'encerrado', mensagem? }
  const pendente = usuario.questionarios?.[`${tipo}_pendente`];

  // 409 (já respondido) ou 410 (prazo do pós terminou): não há mais o que responder.
  function fechado(erro) {
    gravarRascunho(chaveRascunho(tipo, usuario.id), null);
    setFim(
      erro.status === 410 ? { motivo: 'encerrado', mensagem: erro.message } : { motivo: 'ja-respondido' },
    );
    atualizarUsuario({ questionarios: { ...usuario.questionarios, [`${tipo}_pendente`]: false } });
  }

  if (!pendente && !fim) return <Navigate to="/aulas" replace />;

  const conteudo = fim ? (
    <Fim tipo={tipo} fim={fim} />
  ) : (
    <Formulario tipo={tipo} onEnviado={() => setFim({ motivo: 'enviado' })} onFechado={fechado} />
  );
  if (tipo !== 'pre') return <div className="pagina">{conteudo}</div>;

  // O pré vem antes de tudo: tela cheia, sem as abas do app, com saída para quem quer voltar depois.
  return (
    <div className={styles.telaCheia}>
      <header className={styles.barra}>
        <span className={styles.marca}>
          <img src="/logo.svg" alt="" width="28" height="28" />
          Guardião Impacta
        </span>
        <button type="button" className={styles.sair} onClick={sair}>
          <LogOut aria-hidden="true" size={18} /> Sair
        </button>
      </header>
      <main className="pagina">{conteudo}</main>
    </div>
  );
}

function Fim({ tipo, fim }) {
  const titulo = useRef(null);
  useEffect(() => titulo.current?.focus(), []);
  const encerrado = fim.motivo === 'encerrado';
  return (
    <section className={`cartao ${styles.fim}`} aria-labelledby="titulo-fim">
      {encerrado ? (
        <Clock aria-hidden="true" size={40} />
      ) : (
        <CheckCircle2 aria-hidden="true" size={40} className={styles.iconeFim} />
      )}
      <h1 id="titulo-fim" ref={titulo} tabIndex={-1}>
        {encerrado
          ? 'Prazo encerrado'
          : fim.motivo === 'ja-respondido'
            ? 'Você já respondeu'
            : 'Respostas enviadas'}
      </h1>
      <p>
        {encerrado
          ? fim.mensagem
          : fim.motivo === 'ja-respondido'
            ? 'Este questionário já foi respondido nesta conta. Obrigado pela participação!'
            : tipo === 'pre'
              ? 'Obrigado por participar! Agora é só começar pelas aulas.'
              : 'Obrigado por participar da pesquisa! Suas respostas ajudam a avaliar o resultado do estudo.'}
      </p>
      <Link to="/aulas" className="botao">
        Ir para as aulas
      </Link>
    </section>
  );
}

const FECHADO = [409, 410];

function Formulario({ tipo, onEnviado, onFechado }) {
  const { dados, erro, carregando, recarregar } = useApi(`/questionarios/${tipo}`);
  const fechado = FECHADO.includes(erro?.status);
  useEffect(() => {
    if (fechado) onFechado(erro);
  }, [fechado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (carregando || fechado) return <Carregando />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;
  return <Etapas tipo={tipo} definicao={dados} onEnviado={onEnviado} onFechado={onFechado} />;
}

const NOVO = { respostas: {}, ordem: null, passo: 0, inicio: null };

function Etapas({ tipo, definicao, onEnviado, onFechado }) {
  const { usuario, atualizarUsuario } = useAuth();
  const chave = chaveRascunho(tipo, usuario.id);
  const [rascunho, setRascunho] = useState(
    () => lerRascunho(chave, definicao.versao) ?? { ...NOVO, versao: definicao.versao },
  );
  const [retomado, setRetomado] = useState(() => rascunho.inicio != null);
  const [erros, setErros] = useState({});
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState(null);
  // Pós: depois do último passo, uma tela confirma o envio (não dá para alterar depois).
  const comConfirmacao = tipo !== 'pre';
  const [confirmando, setConfirmando] = useState(false);
  const titulo = useRef(null);

  const { respostas, ordem, inicio } = rascunho;
  const iniciado = inicio != null;
  const passos = blocosVisiveis(definicao, respostas);
  const passo = Math.min(rascunho.passo, passos.length - 1);
  const bloco = passos[passo];
  const itens = itensDoBloco(bloco, respostas, ordem ?? {});
  const ultimo = passo === passos.length - 1;

  useEffect(() => {
    if (iniciado) gravarRascunho(chave, rascunho);
  }, [chave, rascunho, iniciado]);

  // Troca de passo: foco no título (leitor de tela anuncia a parte nova) e a tela volta ao topo.
  useEffect(() => {
    titulo.current?.focus();
    titulo.current?.scrollIntoView?.({ block: 'start' });
  }, [passo, iniciado, confirmando]);

  const mudar = (parcial) => setRascunho((atual) => ({ ...atual, ...parcial }));

  function responder(codigo, valor) {
    setRascunho((atual) => ({ ...atual, respostas: { ...atual.respostas, [codigo]: valor } }));
    if (erros[codigo]) {
      const { [codigo]: _, ...resto } = erros;
      setErros(resto);
      if (Object.keys(resto).length === 0) setMensagem('');
    }
  }

  function irPara(indice) {
    setRetomado(false);
    setMensagem('');
    setErroEnvio(null);
    mudar({ passo: indice });
  }

  function marcarFaltantes(porCodigo, texto) {
    setErros(porCodigo);
    setMensagem(texto);
    const primeiro = Object.keys(porCodigo)[0];
    // Depois da renderização: o item pode estar em outro passo.
    setTimeout(() => document.querySelector(`#item-${primeiro} :is(input, textarea)`)?.focus());
  }

  async function enviar() {
    setEnviando(true);
    setErroEnvio(null);
    try {
      const resultado = await api(`/questionarios/${tipo}`, {
        metodo: 'POST',
        corpo: montarEnvio(definicao, respostas),
      });
      gravarRascunho(chave, null);
      registrarEvento({ tipo_evento: 'questionario_concluido', metadata: { momento: tipo } });
      onEnviado();
      atualizarUsuario({ questionarios: resultado.questionarios });
    } catch (e) {
      setEnviando(false);
      if (FECHADO.includes(e.status)) return onFechado(e);
      // 400 da API: volta ao passo do primeiro item recusado e marca os itens.
      const porCampo = e.status === 400 ? e.errosPorCampo : {};
      const indice = passos.findIndex((b) =>
        itensDoBloco(b, respostas, ordem ?? {}).some((it) => it.codigo in porCampo),
      );
      if (indice < 0) return setErroEnvio(e);
      const doPasso = itensDoBloco(passos[indice], respostas, ordem ?? {})
        .filter((it) => it.codigo in porCampo)
        .map((it) => [it.codigo, porCampo[it.codigo]]);
      setConfirmando(false);
      mudar({ passo: indice });
      marcarFaltantes(Object.fromEntries(doPasso), 'Algumas respostas precisam ser revisadas.');
    }
  }

  function continuar(evento) {
    evento.preventDefault();
    const faltam = faltantes(itens, respostas);
    const longos = excedidos(itens, respostas);
    if (faltam.length) {
      const n = faltam.length;
      marcarFaltantes(
        Object.fromEntries(faltam.map((c) => [c, 'Responda esta pergunta.'])),
        n === 1 ? 'Falta responder 1 pergunta desta parte.' : `Faltam responder ${n} perguntas desta parte.`,
      );
    } else if (longos.length) {
      const max = (c) => itens.find((it) => it.codigo === c).max;
      marcarFaltantes(
        Object.fromEntries(longos.map((c) => [c, `Use no máximo ${max(c)} caracteres.`])),
        'Há resposta com texto longo demais. Encurte para continuar.',
      );
    } else if (!ultimo) irPara(passo + 1);
    else if (comConfirmacao) setConfirmando(true);
    else enviar();
  }

  if (!iniciado)
    return (
      <section className={`cartao pilha ${styles.abertura}`} aria-labelledby="titulo-questionario">
        <h1 id="titulo-questionario" ref={titulo} tabIndex={-1}>
          {definicao.titulo}
        </h1>
        {definicao.aviso && <Aviso>{definicao.aviso}</Aviso>}
        {definicao.abertura.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <button
          type="button"
          className="botao"
          onClick={() => {
            // Só aqui: quem retoma o rascunho já passou por este botão.
            registrarEvento({ tipo_evento: 'questionario_iniciado', metadata: { momento: tipo } });
            mudar({ inicio: Date.now(), ordem: sortearOrdem(definicao), passo: 0 });
          }}
        >
          Começar
        </button>
      </section>
    );

  if (confirmando)
    return (
      <section className={`cartao pilha ${styles.abertura}`} aria-labelledby="titulo-confirmacao">
        <h1 id="titulo-confirmacao" ref={titulo} tabIndex={-1}>
          Enviar respostas?
        </h1>
        <p>Depois de enviar, não dá para alterar as respostas. Se quiser, volte para revisar antes.</p>
        <div aria-live="polite" className={styles.mensagens}>
          {erroEnvio && <Aviso tipo="erro">{erroEnvio.message}</Aviso>}
        </div>
        <div className={styles.navegacao}>
          <button
            type="button"
            className="botao botao--secundario"
            onClick={() => {
              setErroEnvio(null);
              setConfirmando(false);
            }}
            disabled={enviando}
          >
            Voltar para revisar
          </button>
          <button type="button" className="botao" onClick={enviar} disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar respostas'}
          </button>
        </div>
      </section>
    );

  return (
    <form className={styles.formulario} onSubmit={continuar} noValidate>
      <p className={styles.nome}>{definicao.titulo}</p>
      {retomado && <Aviso>Você continua de onde parou.</Aviso>}
      <div className={styles.progressoTopo}>
        <span className="selo selo--primaria">
          Parte {passo + 1} de {passos.length}
        </span>
        <div
          className="progresso"
          role="progressbar"
          aria-label="Progresso do questionário"
          aria-valuemin={0}
          aria-valuemax={passos.length}
          aria-valuenow={passo}
          aria-valuetext={`Parte ${passo + 1} de ${passos.length}`}
        >
          <span style={{ width: `${(passo / passos.length) * 100}%` }} />
        </div>
      </div>

      <section className={`cartao ${styles.bloco}`} aria-labelledby="titulo-bloco">
        <h2 id="titulo-bloco" ref={titulo} tabIndex={-1} className={styles.tituloBloco}>
          {bloco.titulo}
        </h2>
        {bloco.aviso && <p className={styles.atencao}>{bloco.aviso}</p>}
        {bloco.intro && <p className={styles.intro}>{bloco.intro}</p>}
        {itens.map((item) => (
          <Item
            key={item.codigo}
            item={item}
            escala={bloco.escala}
            valor={respostas[item.codigo]}
            erro={erros[item.codigo]}
            onResponder={(valor) => responder(item.codigo, valor)}
          />
        ))}
      </section>

      <div aria-live="polite" className={styles.mensagens}>
        {mensagem && <Aviso tipo="erro">{mensagem}</Aviso>}
        {erroEnvio && <Aviso tipo="erro">{erroEnvio.message}</Aviso>}
      </div>

      <div className={styles.navegacao}>
        {passo > 0 && (
          <button
            type="button"
            className="botao botao--secundario"
            onClick={() => irPara(passo - 1)}
            disabled={enviando}
          >
            Voltar
          </button>
        )}
        <button type="submit" className="botao" disabled={enviando}>
          {ultimo && !comConfirmacao ? (enviando ? 'Enviando…' : 'Enviar respostas') : 'Continuar'}
        </button>
      </div>
    </form>
  );
}

function Item({ item, escala, valor, erro, onResponder }) {
  const idErro = `erro-${item.codigo}`;
  const erroTexto = (
    <span id={idErro} className="campo__erro">
      {erro}
    </span>
  );

  if (item.aberta) {
    const idContador = `contador-${item.codigo}`;
    const usados = caracteres(valor);
    return (
      <div id={`item-${item.codigo}`} className={`campo ${styles.item}`}>
        <label htmlFor={`campo-${item.codigo}`} className={styles.pergunta}>
          {item.texto}
          {item.opcional && <span className={styles.opcional}> (opcional)</span>}
        </label>
        <textarea
          id={`campo-${item.codigo}`}
          rows={4}
          value={valor ?? ''}
          onChange={(e) => onResponder(e.target.value)}
          aria-invalid={erro || usados > item.max ? true : undefined}
          aria-describedby={erro ? `${idErro} ${idContador}` : idContador}
        />
        {/* Sem maxLength: ele conta UTF-16 e cortaria emoji antes do limite que a API aceita. */}
        <span id={idContador} className={usados > item.max ? 'campo__erro' : 'campo__ajuda'}>
          {usados}/{item.max} caracteres
        </span>
        {erroTexto}
      </div>
    );
  }

  const usaEscala = !item.opcoes;
  const opcoes = usaEscala ? escala.map((t, i) => [i + 1, t]) : item.opcoes.map((t, i) => [i, t]);
  const tipoCampo = item.multipla ? 'checkbox' : 'radio';

  return (
    <fieldset
      id={`item-${item.codigo}`}
      className={`${styles.item} ${erro ? styles.comErro : ''}`}
      aria-describedby={erro ? idErro : undefined}
    >
      <legend className={styles.pergunta}>{item.texto}</legend>
      <div
        className={`${styles.opcoes} ${usaEscala ? styles.escala : ''}`}
        style={usaEscala ? { '--pontos': opcoes.length } : undefined}
      >
        {opcoes.map(([v, texto]) => (
          <label key={v} className={styles.opcao}>
            <input
              type={tipoCampo}
              name={item.codigo}
              value={v}
              checked={item.multipla ? (valor ?? []).includes(v) : valor === v}
              onChange={(e) =>
                onResponder(item.multipla ? alternarMultipla(item, valor, v, e.target.checked) : v)
              }
            />
            <span>{texto}</span>
          </label>
        ))}
      </div>
      {item.naoUsei && (
        <label className={`${styles.opcao} ${styles.naoUsei}`}>
          <input
            type="radio"
            name={item.codigo}
            value={0}
            checked={valor === 0}
            onChange={() => onResponder(0)}
          />
          <span>{item.naoUsei}</span>
        </label>
      )}
      {erroTexto}
    </fieldset>
  );
}
