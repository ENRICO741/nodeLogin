import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexto/Auth';
import { Avatar } from '../../componentes/Avatar';
import { Campo } from '../../componentes/Campo';
import { Aviso, Carregando, ErroCarregamento, Vazio } from '../../componentes/Estado';
import { VoltarAdmin } from './Admin';
import styles from './Admin.module.css';

const MINIMO_SENHA = 8;

const FILTROS = [
  ['todos', 'Todos'],
  ['admin', 'Administradores'],
  ['usuario', 'Usuários padrão'],
];

function FormSenha({ usuario, aoCancelar, aoSalvar }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [erroConfirmacao, setErroConfirmacao] = useState(null);

  async function enviar(evento) {
    evento.preventDefault();
    const { senha, confirmacao } = Object.fromEntries(new FormData(evento.currentTarget));
    setErroConfirmacao(senha === confirmacao ? null : 'As senhas não conferem');
    if (senha !== confirmacao) return;
    if (
      !window.confirm(
        `Definir uma nova senha para ${usuario.nome}? A pessoa será desconectada de todos os aparelhos.`,
      )
    )
      return;
    setEnviando(true);
    setErro(null);
    try {
      await api(`/admin/usuarios/${usuario.id}/senha`, { metodo: 'PUT', corpo: { senha } });
      aoSalvar();
    } catch (e) {
      setErro(e);
      setEnviando(false);
    }
  }

  return (
    <form
      id={`form-senha-${usuario.id}`}
      className="pilha"
      onSubmit={enviar}
      noValidate
      aria-label={`Nova senha de ${usuario.nome}`}
    >
      <Aviso tipo="erro">{erro && !erro.detalhes.length ? erro.message : null}</Aviso>
      <Campo
        label="Nova senha"
        name="senha"
        type="password"
        autoComplete="new-password"
        autoFocus
        minLength={MINIMO_SENHA}
        required
        ajuda={`Pelo menos ${MINIMO_SENHA} caracteres.`}
        erro={erro?.errosPorCampo.senha}
      />
      <Campo
        label="Confirme a nova senha"
        name="confirmacao"
        type="password"
        autoComplete="new-password"
        required
        erro={erroConfirmacao}
      />
      <div className="linha">
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="botao botao--secundario" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function AdminUsuarios() {
  const { usuario: eu, sair } = useAuth();
  const { dados, erro, carregando, recarregar } = useApi('/admin/usuarios');
  const [filtro, setFiltro] = useState('todos');
  // Linhas alteradas, com a resposta da API, por cima da lista carregada.
  const [atualizados, setAtualizados] = useState({});
  const [ocupado, setOcupado] = useState(null);
  const [editandoSenha, setEditandoSenha] = useState(null);
  const [aviso, setAviso] = useState(null);

  async function alternarAdmin(u) {
    // Um envio por vez; a caixa não é desabilitada para não perder o foco do teclado.
    if (ocupado) return;
    const admin = u.papel !== 'admin';
    const pergunta = admin
      ? `Dar privilégio de administrador a ${u.nome} (${u.email})? Essa pessoa poderá editar o conteúdo e ver estatísticas e dados de todos os usuários.`
      : `Remover o privilégio de administrador de ${u.nome} (${u.email})?`;
    if (!window.confirm(pergunta)) return;
    setOcupado(u.id);
    setAviso(null);
    try {
      const novo = await api(`/admin/usuarios/${u.id}`, { metodo: 'PATCH', corpo: { admin } });
      setAtualizados((atual) => ({ ...atual, [u.id]: novo }));
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e.message });
    } finally {
      setOcupado(null);
    }
  }

  // Fecha o formulário só se ainda for o aberto, devolvendo o foco ao botão da linha.
  function fecharSenha(id) {
    if (document.getElementById(`form-senha-${id}`)) document.getElementById(`senha-${id}`)?.focus();
    setEditandoSenha((atual) => (atual === id ? null : atual));
  }

  function senhaRedefinida(u) {
    // A troca derruba as sessões da pessoa; se for a própria conta, a deste aparelho também.
    if (u.id === eu.id) return sair();
    fecharSenha(u.id);
    setAviso({
      tipo: 'sucesso',
      texto: `Senha de ${u.nome} redefinida. Informe a nova senha a essa pessoa.`,
    });
  }

  if (carregando) return <Carregando />;
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={recarregar} />;

  const usuarios = dados
    .map((u) => atualizados[u.id] ?? u)
    .filter((u) => filtro === 'todos' || u.papel === filtro);

  return (
    <div className="pagina pagina--larga">
      <VoltarAdmin />
      <header className="cabecalho-pagina">
        <h1>Usuários</h1>
        <p>Acesso de administrador e redefinição de senha.</p>
      </header>
      <div className="pilha">
        <Campo label="Mostrar" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          {FILTROS.map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </Campo>
        <Aviso tipo={aviso?.tipo}>{aviso?.texto}</Aviso>
        {usuarios.length === 0 ? (
          <Vazio titulo="Nenhum usuário neste filtro" />
        ) : (
          <div className={styles.tabelaRolagem}>
            <table className={styles.tabela}>
              <thead>
                <tr>
                  {['Foto', 'Nome', 'E-mail', 'Administrador', 'Senha'].map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.flatMap((u) => {
                  const proprio = u.id === eu.id;
                  const linha = (
                    <tr key={u.id}>
                      <td>
                        <Avatar url={u.foto_perfil_url} nome={u.nome} />
                      </td>
                      <td>{u.nome}</td>
                      <td style={{ overflowWrap: 'anywhere' }}>{u.email}</td>
                      <td>
                        <label className="campo-check">
                          <input
                            type="checkbox"
                            checked={u.papel === 'admin'}
                            disabled={proprio}
                            aria-disabled={ocupado !== null || undefined}
                            onChange={() => alternarAdmin(u)}
                            aria-label={`Administrador: ${u.nome}`}
                            aria-describedby={proprio ? `proprio-${u.id}` : undefined}
                          />
                          {proprio && (
                            <span id={`proprio-${u.id}`}>você (não pode alterar o próprio papel)</span>
                          )}
                        </label>
                      </td>
                      <td>
                        <button
                          type="button"
                          id={`senha-${u.id}`}
                          className="botao botao--secundario"
                          aria-label={`Redefinir senha de ${u.nome}`}
                          aria-expanded={editandoSenha === u.id}
                          onClick={() => {
                            setAviso(null);
                            setEditandoSenha(editandoSenha === u.id ? null : u.id);
                          }}
                        >
                          Redefinir senha
                        </button>
                      </td>
                    </tr>
                  );
                  if (editandoSenha !== u.id) return [linha];
                  return [
                    linha,
                    <tr key={`${u.id}-senha`}>
                      <td colSpan={5}>
                        <FormSenha
                          usuario={u}
                          aoCancelar={() => fecharSenha(u.id)}
                          aoSalvar={() => senhaRedefinida(u)}
                        />
                      </td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
