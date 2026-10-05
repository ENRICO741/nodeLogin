import { useState } from 'react';
import { Download } from 'lucide-react';
import { baixarArquivo } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { Aviso, Carregando, ErroCarregamento } from '../../componentes/Estado';
import { VoltarAdmin } from './Admin';
import styles from './Admin.module.css';

const NOMES_DIFICULDADE = { facil: 'Fácil', media: 'Média', dificil: 'Difícil' };

function duracao(ms) {
  if (ms == null) return '—';
  const segundos = Math.round(ms / 1000);
  return `${Math.floor(segundos / 60)}m ${segundos % 60}s`;
}
const percentual = (acertos, respostas) => (respostas ? `${Math.round((acertos / respostas) * 100)}%` : '—');

// Cada coluna: [título, função que formata a linha, é numérica?]
const COLUNAS = {
  aulas: [
    ['Aula', (l) => l.titulo],
    ['Tentativas', (l) => l.total_tentativas, true],
    ['Concluídas', (l) => l.total_concluidas, true],
    ['Tempo médio', (l) => duracao(l.duracao_media_ms), true],
    ['Acerto', (l) => percentual(l.total_acertos, l.total_respostas), true],
  ],
  questoesAula: [
    ['Questão', (l) => l.enunciado, false, true],
    ['Aula', (l) => l.aula_titulo],
    ['Respostas', (l) => l.total_respostas, true],
    ['Acerto', (l) => percentual(l.total_acertos, l.total_respostas), true],
  ],
  usuariosAula: [
    ['Apelido', (l) => l.apelido],
    ['Aula', (l) => l.aula_titulo],
    ['Tentativas', (l) => l.total_tentativas, true],
    ['Tempo médio', (l) => duracao(l.duracao_media_ms), true],
    ['Acerto', (l) => percentual(l.total_acertos, l.total_respostas), true],
  ],
  trivia: [
    ['Dificuldade', (l) => NOMES_DIFICULDADE[l.dificuldade]],
    ['Rodadas', (l) => l.total_tentativas, true],
    ['Finalizadas', (l) => l.total_concluidas, true],
    ['Tempo médio', (l) => duracao(l.duracao_media_ms), true],
    ['Acerto', (l) => percentual(l.total_acertos, l.total_respostas), true],
  ],
  questoesTrivia: [
    ['Questão', (l) => l.enunciado, false, true],
    ['Dificuldade', (l) => NOMES_DIFICULDADE[l.dificuldade]],
    ['Respostas', (l) => l.total_respostas, true],
    ['Acerto', (l) => percentual(l.total_acertos, l.total_respostas), true],
  ],
  usuariosTrivia: [
    ['Apelido', (l) => l.apelido],
    ['Dificuldade', (l) => NOMES_DIFICULDADE[l.dificuldade]],
    ['Rodadas', (l) => l.total_tentativas, true],
    ['Tempo médio', (l) => duracao(l.duracao_media_ms), true],
    ['Acerto', (l) => percentual(l.total_acertos, l.total_respostas), true],
  ],
};

const SECOES = [
  [
    'Aulas',
    [
      ['aulas', 'Por aula'],
      ['questoesAula', 'Por questão'],
      ['usuariosAula', 'Por usuário'],
    ],
  ],
  [
    'Trivia',
    [
      ['trivia', 'Por dificuldade'],
      ['questoesTrivia', 'Por questão'],
      ['usuariosTrivia', 'Por usuário'],
    ],
  ],
];

function Tabela({ titulo, colunas, linhas }) {
  return (
    <div className={styles.tabelaRolagem}>
      <table className={styles.tabela}>
        <caption>{titulo}</caption>
        <thead>
          <tr>
            {colunas.map(([nome, , numerica]) => (
              <th key={nome} scope="col" className={numerica ? styles.numero : undefined}>
                {nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 ? (
            <tr>
              <td colSpan={colunas.length}>Sem dados ainda.</td>
            </tr>
          ) : (
            linhas.map((linha, i) => (
              <tr key={i}>
                {colunas.map(([nome, valor, numerica, longo]) => (
                  <td key={nome} className={numerica ? styles.numero : longo ? styles.longo : undefined}>
                    {valor(linha)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// Exportação para a pesquisa do TCC: só quem consentiu, com pseudônimos no lugar de ids.
function DadosPesquisa() {
  const { dados, erro, carregando } = useApi('/admin/pesquisa');
  const [baixando, setBaixando] = useState(null);
  const [erroDownload, setErroDownload] = useState(null);

  async function baixar(id) {
    setBaixando(id);
    setErroDownload(null);
    try {
      await baixarArquivo(`/admin/pesquisa/${id}.csv`, `pesquisa-${id}.csv`);
    } catch (e) {
      setErroDownload(e);
    } finally {
      setBaixando(null);
    }
  }

  if (carregando) return <Carregando texto="Carregando dados da pesquisa…" />;
  if (erro) return <Aviso tipo="erro">{erro.message}</Aviso>;
  return (
    <section aria-labelledby="sec-pesquisa" className="pilha">
      <h2 id="sec-pesquisa">Dados da pesquisa</h2>
      <p className={styles.itemMeta}>
        {dados.participantes} participante(s) autorizaram o uso dos dados. Os arquivos CSV trazem só essas
        pessoas, identificadas por um pseudônimo (sem nome, e-mail ou apelido). Horários em Brasília.
      </p>
      <p className={styles.itemMeta}>
        Questionário inicial: {dados.questionarios.pre} resposta(s). Questionário final:{' '}
        {dados.questionarios.pos} resposta(s).
      </p>
      <Aviso tipo="erro">{erroDownload?.message}</Aviso>
      <ul className="cartao" style={{ listStyle: 'none', margin: 0, paddingBlock: 'var(--esp-2)' }}>
        {dados.visoes.map((v) => (
          <li key={v.id} className={styles.item}>
            <span className={styles.itemTexto}>
              <strong>{v.titulo}</strong>
              <span className={styles.itemMeta}>{v.descricao}</span>
            </span>
            <button
              type="button"
              className="botao botao--secundario"
              disabled={baixando !== null}
              onClick={() => baixar(v.id)}
              aria-label={`Baixar ${v.titulo} em CSV`}
            >
              <Download aria-hidden="true" size={18} /> {baixando === v.id ? 'Baixando…' : 'CSV'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Estatisticas() {
  const { dados, erro, carregando, recarregar } = useApi('/admin/estatisticas');

  if (carregando) return <Carregando />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;

  return (
    <div className="pagina pagina--larga">
      <VoltarAdmin />
      <header className="cabecalho-pagina">
        <h1>Estatísticas</h1>
        <p>Usuários aparecem só pelo apelido.</p>
      </header>
      {SECOES.map(([secao, tabelas]) => (
        <section key={secao} aria-labelledby={`sec-${secao}`}>
          <h2 id={`sec-${secao}`}>{secao}</h2>
          {tabelas.map(([chave, titulo]) => (
            <Tabela key={chave} titulo={titulo} colunas={COLUNAS[chave]} linhas={dados[chave]} />
          ))}
        </section>
      ))}
      <DadosPesquisa />
    </div>
  );
}
