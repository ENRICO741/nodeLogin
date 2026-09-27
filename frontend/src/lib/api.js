const CHAVE_TOKEN = 'guardiao.token';

// localStorage pode lançar (modo privado, armazenamento bloqueado): o app segue sem sessão persistida.
export const tokenSalvo = {
  obter() {
    try {
      return localStorage.getItem(CHAVE_TOKEN);
    } catch {
      return null;
    }
  },
  definir(valor) {
    try {
      localStorage.setItem(CHAVE_TOKEN, valor);
    } catch {
      /* segue só em memória */
    }
  },
  limpar() {
    try {
      localStorage.removeItem(CHAVE_TOKEN);
    } catch {
      /* nada a limpar */
    }
  },
};

export class ErroApi extends Error {
  constructor(status, corpo) {
    super(corpo?.erro?.mensagem ?? 'Algo deu errado. Tente novamente');
    this.status = status;
    this.codigo = corpo?.erro?.codigo;
    this.detalhes = corpo?.erro?.detalhes ?? [];
  }

  // { campo: mensagem } para mostrar o erro junto de cada campo do formulário.
  get errosPorCampo() {
    return Object.fromEntries(this.detalhes.map((d) => [d.campo, d.mensagem]));
  }
}

let aoSessaoExpirar = () => {};
export const definirAoSessaoExpirar = (fn) => {
  aoSessaoExpirar = fn;
};

export async function api(caminho, { metodo = 'GET', corpo, sinal } = {}) {
  const token = tokenSalvo.obter();
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: sinal,
    });
  } catch (erro) {
    if (erro.name === 'AbortError') throw erro;
    throw new ErroApi(0, {
      erro: { codigo: 'SEM_CONEXAO', mensagem: 'Sem conexão. Verifique sua internet' },
    });
  }

  const dados = resposta.status === 204 ? null : await resposta.json().catch(() => null);
  if (!resposta.ok) {
    if (resposta.status === 401 && token) aoSessaoExpirar();
    throw new ErroApi(resposta.status, dados);
  }
  return dados;
}

// Baixa um arquivo de rota autenticada (um <a href> não mandaria o token).
export async function baixarArquivo(caminho, nomeArquivo) {
  const token = tokenSalvo.obter();
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ErroApi(0, {
      erro: { codigo: 'SEM_CONEXAO', mensagem: 'Sem conexão. Verifique sua internet' },
    });
  }
  if (!resposta.ok) throw new ErroApi(resposta.status, await resposta.json().catch(() => null));
  const url = URL.createObjectURL(await resposta.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: nomeArquivo });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
