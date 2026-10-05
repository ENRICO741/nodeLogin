import { useState } from 'react';
import { Link } from 'react-router';
import { Briefcase, Building2, LogOut, Pencil, Settings, Star } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexto/Auth';
import { Campo } from '../componentes/Campo';
import { Aviso } from '../componentes/Estado';
import { Avatar } from '../componentes/Avatar';
import styles from './Perfil.module.css';

const LADO_FOTO = 256;

// Recorta no centro, reduz para 256 px e converte em WebP: a foto cabe no limite de 200 KB da API.
// Safari no iPhone não gera WebP e devolve PNG (pesado demais): nesse caso usa JPEG.
async function prepararFoto(arquivo) {
  const imagem = await createImageBitmap(arquivo);
  const lado = Math.min(imagem.width, imagem.height);
  const canvas = document.createElement('canvas');
  canvas.width = LADO_FOTO;
  canvas.height = LADO_FOTO;
  canvas
    .getContext('2d')
    .drawImage(
      imagem,
      (imagem.width - lado) / 2,
      (imagem.height - lado) / 2,
      lado,
      lado,
      0,
      0,
      LADO_FOTO,
      LADO_FOTO,
    );
  const webp = canvas.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}

function FormPerfil({ usuario, aoSalvar, aoCancelar }) {
  const [foto, setFoto] = useState(usuario.foto_perfil_url);
  const [erroFoto, setErroFoto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const porCampo = erro?.errosPorCampo ?? {};

  async function escolherFoto(evento) {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;
    setErroFoto(null);
    try {
      setFoto(await prepararFoto(arquivo));
    } catch {
      setErroFoto('Não foi possível ler esta imagem. Tente outro arquivo.');
    }
  }

  async function salvar(evento) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget));
    delete dados.arquivo_foto;
    setEnviando(true);
    setErro(null);
    try {
      aoSalvar(await api('/perfil', { metodo: 'PATCH', corpo: { ...dados, foto_perfil_url: foto } }));
    } catch (e) {
      setErro(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="cartao pilha" onSubmit={salvar} noValidate>
      <h2>Editar perfil</h2>
      <Aviso tipo="erro">{erro && !erro.detalhes.length ? erro.message : null}</Aviso>
      <div className={styles.foto}>
        <Avatar url={foto} nome={usuario.nome} tamanho={72} />
        <div className="pilha">
          <Campo
            label="Foto"
            name="arquivo_foto"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={escolherFoto}
            erro={erroFoto ?? porCampo.foto_perfil_url}
          />
          {foto && (
            <button type="button" className="botao botao--texto" onClick={() => setFoto(null)}>
              Remover foto
            </button>
          )}
        </div>
      </div>
      <Campo label="Nome" name="nome" defaultValue={usuario.nome} autoComplete="name" erro={porCampo.nome} />
      <Campo
        label="Apelido"
        name="apelido"
        defaultValue={usuario.apelido}
        autoComplete="nickname"
        ajuda="Aparece no ranking. Use de 3 a 30 letras (acentos permitidos), números, ponto, hífen ou _."
        erro={porCampo.apelido}
      />
      <Campo
        label="Profissão"
        name="profissao"
        defaultValue={usuario.profissao ?? ''}
        autoComplete="organization-title"
        erro={porCampo.profissao}
      />
      <Campo
        label="Empresa"
        name="empresa"
        defaultValue={usuario.empresa ?? ''}
        autoComplete="organization"
        erro={porCampo.empresa}
      />
      <Campo
        label="Bio"
        name="bio"
        multilinha
        maxLength={500}
        defaultValue={usuario.bio ?? ''}
        erro={porCampo.bio}
      />
      <div className={styles.acoes}>
        <button type="button" className="botao botao--secundario" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

// Consentimento para a pesquisa do TCC: pode ser dado ou retirado a qualquer momento (LGPD).
function ConsentimentoPesquisa({ usuario, aoMudar }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const consentiu = Boolean(usuario.consentiu_pesquisa_em);

  async function alternar(evento) {
    setSalvando(true);
    setErro(null);
    try {
      aoMudar(
        await api('/perfil', { metodo: 'PATCH', corpo: { consentiu_pesquisa: evento.target.checked } }),
      );
    } catch (e) {
      setErro(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="cartao pilha" aria-labelledby="titulo-pesquisa">
      <h2 id="titulo-pesquisa" className={styles.tituloSecao}>
        Pesquisa acadêmica
      </h2>
      <label className="campo-check">
        <input type="checkbox" checked={consentiu} disabled={salvando} onChange={alternar} />
        <span>
          Autorizo o uso anônimo dos meus dados de uso do app na pesquisa do TCC. Seu nome, e-mail e apelido
          nunca são exportados.
        </span>
      </label>
      <p className={styles.estadoConsentimento}>
        {consentiu
          ? `Autorizado em ${new Date(usuario.consentiu_pesquisa_em).toLocaleDateString('pt-BR')}.`
          : 'Não autorizado: seus dados ficam fora da pesquisa.'}
      </p>
      <Aviso tipo="erro">{erro?.message}</Aviso>
    </section>
  );
}

export function Perfil() {
  const { usuario, atualizarUsuario, sair } = useAuth();
  const [editando, setEditando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  function aoSalvar(perfil) {
    atualizarUsuario(perfil);
    setEditando(false);
    setSalvo(true);
  }

  return (
    <div className="pagina pilha">
      <h1 className="sr-only">Perfil</h1>
      {salvo && !editando && <Aviso tipo="sucesso">Perfil atualizado.</Aviso>}

      {editando ? (
        <FormPerfil usuario={usuario} aoSalvar={aoSalvar} aoCancelar={() => setEditando(false)} />
      ) : (
        <section className={`cartao ${styles.cartao}`}>
          <Avatar url={usuario.foto_perfil_url} nome={usuario.nome} tamanho={88} />
          <h2 className={styles.nome}>{usuario.nome}</h2>
          <p className={styles.apelido}>@{usuario.apelido}</p>
          <span className={styles.pontos}>
            <Star aria-hidden="true" size={18} /> {usuario.pontuacao_total} pontos
          </span>
          {(usuario.profissao || usuario.empresa) && (
            <div className={styles.detalhes}>
              {usuario.profissao && (
                <span>
                  <Briefcase aria-hidden="true" size={16} /> {usuario.profissao}
                </span>
              )}
              {usuario.empresa && (
                <span>
                  <Building2 aria-hidden="true" size={16} /> {usuario.empresa}
                </span>
              )}
            </div>
          )}
          {usuario.bio && <p className={styles.bio}>{usuario.bio}</p>}
          <button
            type="button"
            className="botao botao--secundario botao--bloco"
            onClick={() => {
              setSalvo(false);
              setEditando(true);
            }}
          >
            <Pencil aria-hidden="true" size={18} /> Editar perfil
          </button>
        </section>
      )}

      <ConsentimentoPesquisa usuario={usuario} aoMudar={atualizarUsuario} />

      {usuario.papel === 'admin' && (
        <Link to="/admin" className="botao botao--secundario botao--bloco">
          <Settings aria-hidden="true" size={18} /> Área do administrador
        </Link>
      )}
      <button type="button" className="botao botao--perigo botao--bloco" onClick={sair}>
        <LogOut aria-hidden="true" size={18} /> Sair
      </button>
    </div>
  );
}
