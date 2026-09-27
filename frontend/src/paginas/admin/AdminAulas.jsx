import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { Campo } from '../../componentes/Campo';
import { Aviso, Carregando, ErroCarregamento, Vazio } from '../../componentes/Estado';
import { FormQuestao } from './FormQuestao';
import { VoltarAdmin } from './Admin';
import styles from './Admin.module.css';

function FormAula({ aula = {}, aoEnviar, textoEnviar }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [salvo, setSalvo] = useState(false);
  const porCampo = erro?.errosPorCampo ?? {};

  async function enviar(evento) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget));
    setEnviando(true);
    setErro(null);
    setSalvo(false);
    try {
      await aoEnviar({
        ...dados,
        ordem: Number(dados.ordem),
        pontos_conclusao: Number(dados.pontos_conclusao),
      });
      setSalvo(true);
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao pilha" onSubmit={enviar} noValidate>
      <Aviso tipo="erro">{erro && !erro.detalhes.length ? erro.message : null}</Aviso>
      {salvo && aula.id && <Aviso tipo="sucesso">Aula salva.</Aviso>}
      <Campo label="Título" name="titulo" defaultValue={aula.titulo} erro={porCampo.titulo} />
      <div className="linha" style={{ alignItems: 'start' }}>
        <Campo
          label="Ordem"
          name="ordem"
          type="number"
          min={1}
          defaultValue={aula.ordem ?? 1}
          erro={porCampo.ordem}
        />
        <Campo
          label="Bônus de conclusão (pts)"
          name="pontos_conclusao"
          type="number"
          min={0}
          defaultValue={aula.pontos_conclusao ?? 20}
          erro={porCampo.pontos_conclusao}
        />
      </div>
      <Campo
        label="Conteúdo (HTML)"
        name="conteudo_html"
        multilinha
        rows={10}
        ajuda="Tags permitidas: títulos, parágrafos, listas, links e imagens https. Scripts e estilos são removidos."
        defaultValue={aula.conteudo_html}
        erro={porCampo.conteudo_html}
      />
      <button type="submit" className="botao" disabled={enviando}>
        {enviando ? 'Salvando…' : textoEnviar}
      </button>
    </form>
  );
}

export function AdminAulas() {
  const navigate = useNavigate();
  const { dados: aulas, erro, carregando, recarregar } = useApi('/admin/aulas');
  const [criando, setCriando] = useState(false);

  if (carregando) return <Carregando />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;

  return (
    <div className="pagina">
      <VoltarAdmin />
      <header className="cabecalho-pagina linha" style={{ justifyContent: 'space-between' }}>
        <h1>Aulas</h1>
        {!criando && (
          <button type="button" className="botao" onClick={() => setCriando(true)}>
            <Plus aria-hidden="true" size={18} /> Nova aula
          </button>
        )}
      </header>

      {criando && (
        <div className="pilha" style={{ marginBottom: 'var(--esp-5)' }}>
          <h2>Nova aula</h2>
          <FormAula
            textoEnviar="Criar aula"
            aula={{ ordem: aulas.length + 1 }}
            aoEnviar={async (dados) => {
              const nova = await api('/admin/aulas', { metodo: 'POST', corpo: dados });
              navigate(`/admin/aulas/${nova.id}`);
            }}
          />
        </div>
      )}

      {aulas.length === 0 ? (
        <Vazio titulo="Nenhuma aula cadastrada" />
      ) : (
        <ul className="cartao" style={{ listStyle: 'none', margin: 0, paddingBlock: 'var(--esp-2)' }}>
          {aulas.map((a) => (
            <li key={a.id} className={`${styles.item} ${a.ativo ? '' : styles.inativo}`}>
              <span className={styles.itemTexto}>
                <strong>
                  {a.ordem}. {a.titulo}
                </strong>
                <span className={styles.itemMeta}>
                  {a.total_questoes} perguntas ativas · bônus {a.pontos_conclusao} pts
                </span>
              </span>
              {!a.ativo && <span className="selo">Inativa</span>}
              <Link to={`/admin/aulas/${a.id}`} className="botao botao--secundario">
                Editar
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemQuestao({ questao, aoMudar }) {
  const [editando, setEditando] = useState(false);
  const alternarAtivo = () =>
    (questao.ativo
      ? api(`/admin/questoes-aula/${questao.id}`, { metodo: 'DELETE' })
      : api(`/admin/questoes-aula/${questao.id}`, { metodo: 'PATCH', corpo: { ativo: true } })
    ).then(aoMudar);

  if (editando) {
    return (
      <li className={styles.item} style={{ display: 'block' }}>
        <FormQuestao
          questao={questao}
          aoCancelar={() => setEditando(false)}
          aoEnviar={async (dados) => {
            await api(`/admin/questoes-aula/${questao.id}`, { metodo: 'PATCH', corpo: dados });
            setEditando(false);
            aoMudar();
          }}
        />
      </li>
    );
  }
  return (
    <li className={`${styles.item} ${questao.ativo ? '' : styles.inativo}`}>
      <span className={styles.itemTexto}>
        {questao.enunciado}
        <span className={styles.itemMeta}>
          Resposta {questao.resposta_correta.toUpperCase()} · {questao.pontos} pts
        </span>
      </span>
      <button type="button" className="botao botao--secundario" onClick={() => setEditando(true)}>
        Editar
      </button>
      <button
        type="button"
        className={`botao ${questao.ativo ? 'botao--perigo' : 'botao--secundario'}`}
        onClick={alternarAtivo}
      >
        {questao.ativo ? 'Desativar' : 'Reativar'}
      </button>
    </li>
  );
}

export function AdminAula() {
  const { id } = useParams();
  const { dados: aula, erro, carregando, recarregar } = useApi(`/admin/aulas/${id}`);
  const [adicionando, setAdicionando] = useState(false);

  if (carregando) return <Carregando />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;

  const alternarAula = () =>
    (aula.ativo
      ? api(`/admin/aulas/${id}`, { metodo: 'DELETE' })
      : api(`/admin/aulas/${id}`, { metodo: 'PATCH', corpo: { ativo: true } })
    ).then(recarregar);

  return (
    <div className="pagina">
      <VoltarAdmin para="/admin/aulas" rotulo="Aulas" />
      <header className="cabecalho-pagina linha" style={{ justifyContent: 'space-between' }}>
        <h1>{aula.titulo}</h1>
        <button type="button" className={`botao ${aula.ativo ? 'botao--perigo' : ''}`} onClick={alternarAula}>
          {aula.ativo ? 'Desativar aula' : 'Reativar aula'}
        </button>
      </header>
      {!aula.ativo && <Aviso>Aula inativa: não aparece para os usuários.</Aviso>}

      <FormAula
        aula={aula}
        textoEnviar="Salvar aula"
        aoEnviar={(dados) => api(`/admin/aulas/${id}`, { metodo: 'PATCH', corpo: dados })}
      />

      <section style={{ marginTop: 'var(--esp-6)' }} aria-labelledby="titulo-perguntas">
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2 id="titulo-perguntas">Perguntas</h2>
          {!adicionando && (
            <button type="button" className="botao" onClick={() => setAdicionando(true)}>
              <Plus aria-hidden="true" size={18} /> Nova pergunta
            </button>
          )}
        </div>
        {adicionando && (
          <div className="cartao" style={{ marginBlock: 'var(--esp-3)' }}>
            <FormQuestao
              textoEnviar="Adicionar pergunta"
              aoCancelar={() => setAdicionando(false)}
              aoEnviar={async (dados) => {
                await api(`/admin/aulas/${id}/questoes`, { metodo: 'POST', corpo: dados });
                setAdicionando(false);
                recarregar();
              }}
            />
          </div>
        )}
        {aula.questoes.length === 0 ? (
          <Vazio titulo="Esta aula ainda não tem perguntas" />
        ) : (
          <ul className="cartao" style={{ listStyle: 'none', margin: 0, paddingBlock: 'var(--esp-2)' }}>
            {aula.questoes.map((q) => (
              <ItemQuestao key={q.id} questao={q} aoMudar={recarregar} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
