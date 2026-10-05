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

const rotuloAula = (aula) => `${String(aula.ordem).padStart(2, '0')}. ${aula.titulo}`;

// Campos próprios da trivia: dificuldade e a aula de onde vem a questão (obrigatória: o sorteio só usa
// questões de aulas concluídas, e o erro aponta a aula para rever).
const camposTrivia = (questao, aulas) =>
  function CamposTrivia(porCampo) {
    return (
      <>
        <Campo
          label="Dificuldade"
          name="dificuldade"
          defaultValue={questao.dificuldade ?? 'facil'}
          erro={porCampo.dificuldade}
        >
          {DIFICULDADES.map(([v, rotulo]) => (
            <option key={v} value={v}>
              {rotulo}
            </option>
          ))}
        </Campo>
        <Campo
          label="Aula"
          name="aula_referencia_id"
          defaultValue={questao.aula_referencia_id ?? ''}
          ajuda="A questão cobra o conteúdo desta aula."
          erro={porCampo.aula_referencia_id}
        >
          <option value="">Escolha a aula</option>
          {aulas.map((a) => (
            <option key={a.id} value={a.id}>
              {rotuloAula(a)}
            </option>
          ))}
        </Campo>
      </>
    );
  };

function ItemTrivia({ questao, aulas, aoMudar }) {
  const [editando, setEditando] = useState(false);
  const [alternando, setAlternando] = useState(false);
  const [erro, setErro] = useState(null);
  const url = `/admin/questoes-trivia/${questao.id}`;
  const aula = aulas.find((a) => a.id === questao.aula_referencia_id);

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
          extras={camposTrivia(questao, aulas)}
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
          {aula ? ` · Aula ${rotuloAula(aula)}` : ' · sem aula'}
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
  const aulas = useApi('/admin/aulas');
  const [criando, setCriando] = useState(false);

  if (carregando || aulas.carregando) return <Carregando />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;
  if (aulas.erro) return <ErroCarregamento erro={aulas.erro} onTentarDeNovo={aulas.recarregar} />;

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
            extras={camposTrivia({}, aulas.dados)}
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
                  <ItemTrivia key={q.id} questao={q} aulas={aulas.dados} aoMudar={recarregar} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
