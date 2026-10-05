import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { Campo } from '../../componentes/Campo';
import { Aviso, Carregando, ErroCarregamento, Vazio } from '../../componentes/Estado';
import { FormQuestao } from './FormQuestao';
import { VoltarAdmin } from './Admin';
import styles from './Admin.module.css';

const DIFICULDADES = [
  ['facil', 'Fácil'],
  ['media', 'Média'],
  ['dificil', 'Difícil'],
];

const campoDificuldade = (valor) =>
  function CampoDificuldade(porCampo) {
    return (
      <Campo
        label="Dificuldade"
        name="dificuldade"
        defaultValue={valor ?? 'facil'}
        erro={porCampo.dificuldade}
      >
        {DIFICULDADES.map(([v, rotulo]) => (
          <option key={v} value={v}>
            {rotulo}
          </option>
        ))}
      </Campo>
    );
  };

function ItemTrivia({ questao, aoMudar }) {
  const [editando, setEditando] = useState(false);
  const [alternando, setAlternando] = useState(false);
  const [erro, setErro] = useState(null);
  const url = `/admin/questoes-trivia/${questao.id}`;

  async function alternarAtivo() {
    setAlternando(true);
    setErro(null);
    try {
      await (questao.ativo
        ? api(url, { metodo: 'DELETE' })
        : api(url, { metodo: 'PATCH', corpo: { ativo: true } }));
      aoMudar();
    } catch (e) {
      setErro(e);
    } finally {
      setAlternando(false);
    }
  }

  if (editando) {
    return (
      <li className={styles.item} style={{ display: 'block' }}>
        <FormQuestao
          questao={questao}
          extras={campoDificuldade(questao.dificuldade)}
          aoCancelar={() => setEditando(false)}
          aoEnviar={async (dados) => {
            await api(url, { metodo: 'PATCH', corpo: dados });
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
          {!questao.ativo && ' · inativa'}
        </span>
      </span>
      <button type="button" className="botao botao--secundario" onClick={() => setEditando(true)}>
        Editar
      </button>
      <button
        type="button"
        className={`botao ${questao.ativo ? 'botao--perigo' : 'botao--secundario'}`}
        disabled={alternando}
        onClick={alternarAtivo}
      >
        {questao.ativo ? 'Desativar' : 'Reativar'}
      </button>
      <Aviso tipo="erro">{erro?.message}</Aviso>
    </li>
  );
}

export function AdminTrivia() {
  const { dados: questoes, erro, carregando, recarregar } = useApi('/admin/questoes-trivia');
  const [criando, setCriando] = useState(false);

  if (carregando) return <Carregando />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;

  return (
    <div className="pagina">
      <VoltarAdmin />
      <header className="cabecalho-pagina linha" style={{ justifyContent: 'space-between' }}>
        <h1>Questões de trivia</h1>
        {!criando && (
          <button type="button" className="botao" onClick={() => setCriando(true)}>
            <Plus aria-hidden="true" size={18} /> Nova questão
          </button>
        )}
      </header>

      {criando && (
        <div className="cartao" style={{ marginBottom: 'var(--esp-5)' }}>
          <FormQuestao
            extras={campoDificuldade()}
            textoEnviar="Criar questão"
            aoCancelar={() => setCriando(false)}
            aoEnviar={async (dados) => {
              await api('/admin/questoes-trivia', { metodo: 'POST', corpo: dados });
              setCriando(false);
              recarregar();
            }}
          />
        </div>
      )}

      {DIFICULDADES.map(([valor, rotulo]) => {
        const doNivel = questoes.filter((q) => q.dificuldade === valor);
        return (
          <section key={valor} aria-labelledby={`nivel-${valor}`} style={{ marginBottom: 'var(--esp-5)' }}>
            <h2 id={`nivel-${valor}`}>
              {rotulo} <span className="selo">{doNivel.filter((q) => q.ativo).length} ativas</span>
            </h2>
            {doNivel.length === 0 ? (
              <Vazio titulo="Nenhuma questão neste nível" />
            ) : (
              <ul className="cartao" style={{ listStyle: 'none', margin: 0, paddingBlock: 'var(--esp-2)' }}>
                {doNivel.map((q) => (
                  <ItemTrivia key={q.id} questao={q} aoMudar={recarregar} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
