import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../contexto/Auth';
import { api } from '../lib/api';
import { Campo } from '../componentes/Campo';
import { CampoSenhaNova } from '../componentes/CampoSenhaNova';
import { Aviso } from '../componentes/Estado';
import styles from './Auth.module.css';

function TelaAuth({ titulo, subtitulo, children, rodape }) {
  return (
    <main className={styles.tela}>
      <div className={styles.marca}>
        <img src="/logo.svg" alt="" width="56" height="56" />
        <span>Guardião Impacta</span>
      </div>
      <section className={`cartao ${styles.cartao}`} aria-labelledby="titulo-auth">
        <h1 id="titulo-auth">{titulo}</h1>
        {subtitulo && <p className={styles.subtitulo}>{subtitulo}</p>}
        {children}
      </section>
      {rodape && <p className={styles.rodape}>{rodape}</p>}
    </main>
  );
}

// Envio de formulário com estado de envio e erros por campo vindos da API.
function useEnvio(acao) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  async function enviar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await acao(Object.fromEntries(new FormData(evento.currentTarget)));
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }
  return { enviando, erro, porCampo: erro?.errosPorCampo ?? {}, enviar };
}

export function Entrar() {
  const { entrar } = useAuth();
  // Depois do login, a RotaPublica redireciona (para a página de origem, se houver).
  const { enviando, erro, porCampo, enviar } = useEnvio(entrar);

  return (
    <TelaAuth
      titulo="Entrar"
      subtitulo="Aprenda a proteger você e a empresa, um passo de cada vez."
      rodape={
        <>
          Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
        </>
      }
    >
      <form className="pilha" onSubmit={enviar} noValidate>
        <Aviso tipo="erro">{erro && !erro.detalhes.length ? erro.message : null}</Aviso>
        <Campo
          label="E-mail ou apelido"
          name="identificador"
          autoComplete="username"
          required
          erro={porCampo.identificador}
        />
        <Campo
          label="Senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          erro={porCampo.senha}
        />
        <button type="submit" className="botao botao--bloco" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <Link to="/esqueci-senha" className={styles.link}>
          Esqueci minha senha
        </Link>
      </form>
    </TelaAuth>
  );
}

export function Cadastro() {
  const { cadastrar } = useAuth();
  const [erroConfirmacao, setErroConfirmacao] = useState(null);
  const [erroConsentimento, setErroConsentimento] = useState(null);
  // Checkbox marcado chega como "on" no FormData; a API espera booleano.
  const { enviando, erro, porCampo, enviar } = useEnvio(
    async ({ consentiu_pesquisa, confirmacao, ...dados }) => {
      const consentiu = consentiu_pesquisa === 'on';
      setErroConfirmacao(dados.senha === confirmacao ? null : 'As senhas não conferem');
      setErroConsentimento(consentiu ? null : 'É preciso aceitar para criar a conta');
      if (dados.senha !== confirmacao || !consentiu) return;
      await cadastrar({ ...dados, consentiu_pesquisa: true });
    },
  );

  return (
    <TelaAuth
      titulo="Criar conta"
      rodape={
        <>
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </>
      }
    >
      <form className="pilha" onSubmit={enviar} noValidate>
        <Aviso tipo="erro">{erro && !erro.detalhes.length ? erro.message : null}</Aviso>
        <Campo label="Nome" name="nome" autoComplete="name" required erro={porCampo.nome} />
        <Campo
          label="Apelido"
          name="apelido"
          autoComplete="nickname"
          required
          ajuda="Aparece no ranking. Use de 3 a 30 letras (acentos permitidos), números, ponto, hífen ou _."
          erro={porCampo.apelido}
        />
        <Campo label="E-mail" name="email" type="email" autoComplete="email" required erro={porCampo.email} />
        <CampoSenhaNova label="Senha" name="senha" erro={porCampo.senha} />
        <Campo
          label="Confirme a senha"
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          required
          erro={erroConfirmacao}
        />
        <label className="campo-check">
          <input
            type="checkbox"
            name="consentiu_pesquisa"
            required
            aria-invalid={erroConsentimento || porCampo.consentiu_pesquisa ? true : undefined}
            aria-describedby="consentimento-erro"
          />
          <span>Ao criar a conta, você participa de forma anônima da pesquisa do TCC.</span>
        </label>
        <span id="consentimento-erro" className="campo__erro" aria-live="polite">
          {erroConsentimento || porCampo.consentiu_pesquisa}
        </span>
        <button type="submit" className="botao botao--bloco" disabled={enviando}>
          {enviando ? 'Criando conta…' : 'Criar conta'}
        </button>
      </form>
    </TelaAuth>
  );
}

export function EsqueciSenha() {
  const [mensagem, setMensagem] = useState(null);
  const { enviando, erro, porCampo, enviar } = useEnvio(async (dados) => {
    const resposta = await api('/auth/esqueci-senha', { metodo: 'POST', corpo: dados });
    setMensagem(resposta.mensagem);
  });

  return (
    <TelaAuth
      titulo="Esqueci minha senha"
      subtitulo="Informe o e-mail da sua conta. Vamos enviar um link para criar uma nova senha."
      rodape={<Link to="/entrar">Voltar para o login</Link>}
    >
      {mensagem ? (
        <Aviso tipo="sucesso">{mensagem}</Aviso>
      ) : (
        <form className="pilha" onSubmit={enviar} noValidate>
          <Aviso tipo="erro">{erro && !erro.detalhes.length ? erro.message : null}</Aviso>
          <Campo
            label="E-mail"
            name="email"
            type="email"
            autoComplete="email"
            required
            erro={porCampo.email}
          />
          <button type="submit" className="botao botao--bloco" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar link'}
          </button>
        </form>
      )}
    </TelaAuth>
  );
}

export function RedefinirSenha() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') ?? '');
  // Tira o token da URL: não fica no histórico nem vai no Referer.
  useEffect(() => {
    if (token) history.replaceState(null, '', '/redefinir-senha');
  }, [token]);
  const [concluido, setConcluido] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState(null);
  const { enviando, erro, porCampo, enviar } = useEnvio(async ({ senha, confirmacao }) => {
    setErroConfirmacao(senha === confirmacao ? null : 'As senhas não conferem');
    if (senha !== confirmacao) return;
    await api('/auth/redefinir-senha', { metodo: 'POST', corpo: { token, senha } });
    setConcluido(true);
  });

  return (
    <TelaAuth titulo="Nova senha" rodape={<Link to="/entrar">Voltar para o login</Link>}>
      {concluido ? (
        <div className="pilha">
          <Aviso tipo="sucesso">Senha alterada. Entre com a nova senha.</Aviso>
          <Link to="/entrar" className="botao botao--bloco">
            Entrar
          </Link>
        </div>
      ) : (
        <form className="pilha" onSubmit={enviar} noValidate>
          <Aviso tipo="erro">{erro && !erro.detalhes.length ? erro.message : null}</Aviso>
          {!token && <Aviso tipo="erro">Link incompleto. Abra o link do e-mail novamente.</Aviso>}
          {/* O token não tem campo na tela: o erro de validação dele vira este aviso. */}
          {porCampo.token && (
            <Aviso tipo="erro">
              Link inválido ou expirado. <Link to="/esqueci-senha">Peça um novo</Link>
            </Aviso>
          )}
          <CampoSenhaNova label="Nova senha" name="senha" erro={porCampo.senha} />
          <Campo
            label="Confirme a nova senha"
            name="confirmacao"
            type="password"
            autoComplete="new-password"
            required
            erro={erroConfirmacao}
          />
          <button type="submit" className="botao botao--bloco" disabled={enviando || !token}>
            {enviando ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      )}
    </TelaAuth>
  );
}
