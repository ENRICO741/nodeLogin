import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { erroApi, renderizarApp, sequencia, USUARIO } from './utils';

const SESSAO = { token: 'novo-token', usuario: USUARIO };
const rotasLogado = { 'GET /aulas': [] };

describe('Entrar', () => {
  it('rota desconhecida sem login leva para /entrar', async () => {
    await renderizarApp('/qualquer', { usuario: null });
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/entrar');
  });

  it('login com sucesso salva o token e abre as aulas', async () => {
    const { servidor } = await renderizarApp('/entrar', {
      usuario: null,
      rotas: { 'POST /auth/login': SESSAO, ...rotasLogado },
    });
    await userEvent.type(await screen.findByLabelText('E-mail ou apelido'), 'maria');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
    expect(servidor.enviados('POST /auth/login')).toEqual([{ identificador: 'maria', senha: 'senha-forte' }]);
    expect(localStorage.getItem('guardiao.token')).toBe('novo-token');
  });

  it('volta para a página que o usuário tentou abrir antes do login', async () => {
    await renderizarApp('/ranking', {
      usuario: null,
      rotas: {
        'POST /auth/login': SESSAO,
        'GET /ranking': { lideres: [], minha_posicao: 1, pontuacao_total: 0 },
      },
    });
    await userEvent.type(await screen.findByLabelText('E-mail ou apelido'), 'maria');
    await userEvent.type(screen.getByLabelText('Senha'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Ranking' })).toBeInTheDocument();
  });

  it('credenciais erradas mostram o erro e reabilitam o botão', async () => {
    await renderizarApp('/entrar', {
      usuario: null,
      rotas: { 'POST /auth/login': erroApi(401, 'CREDENCIAIS_INVALIDAS', 'Usuário ou senha incorretos') },
    });
    await userEvent.type(await screen.findByLabelText('E-mail ou apelido'), 'x');
    await userEvent.type(screen.getByLabelText('Senha'), 'y');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha incorretos');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('logado não vê a tela de login', async () => {
    await renderizarApp('/entrar', { rotas: rotasLogado });
    expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
  });
});

describe('sessão salva com o servidor fora do ar', () => {
  const abrir = (eu) => {
    localStorage.setItem('guardiao.token', 'token-teste');
    return renderizarApp('/aulas', { usuario: null, rotas: { 'GET /auth/me': eu, ...rotasLogado } });
  };

  it('503 no /auth/me mostra "Tentar de novo" sem ir para o login; tentar com sucesso entra', async () => {
    const { servidor } = await abrir(
      sequencia(erroApi(503, 'INDISPONIVEL', 'Servidor indisponível'), USUARIO),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor indisponível');
    expect(window.location.pathname).toBe('/aulas');
    expect(localStorage.getItem('guardiao.token')).toBe('token-teste');
    await userEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
    expect(servidor.enviados('GET /auth/me')).toHaveLength(2);
  });

  it('sem rede no /auth/me também não desloga; nova falha continua na tela de erro', async () => {
    await abrir(new TypeError('Failed to fetch'));
    expect(await screen.findByText('Sem conexão. Verifique sua internet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
    expect(await screen.findByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/aulas');
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('falha antiga do /auth/me some depois de entrar pela tela de login', async () => {
    localStorage.setItem('guardiao.token', 'token-teste');
    await renderizarApp('/entrar', {
      usuario: null,
      rotas: {
        'GET /auth/me': erroApi(503, 'INDISPONIVEL', 'Servidor indisponível'),
        'POST /auth/login': SESSAO,
        ...rotasLogado,
      },
    });
    await userEvent.type(await screen.findByLabelText('E-mail ou apelido'), 'maria');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tentar de novo/ })).not.toBeInTheDocument();
  });

  it('401 no /auth/me continua levando ao login', async () => {
    await abrir(erroApi(401, 'NAO_AUTENTICADO', 'x'));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.getItem('guardiao.token')).toBeNull();
  });
});

describe('Cadastro', () => {
  it('apelido aceita acento: a ajuda avisa e o apelido vai como digitado', async () => {
    const { servidor } = await renderizarApp('/cadastro', {
      usuario: null,
      rotas: { 'POST /auth/cadastro': erroApi(409, 'CONFLITO', 'Este apelido já está em uso') },
    });
    const campo = await screen.findByLabelText('Apelido');
    expect(campo).toHaveAccessibleDescription(
      'Aparece no ranking. Use de 3 a 30 letras (acentos permitidos), números, ponto, hífen ou _.',
    );
    await userEvent.type(screen.getByLabelText('Nome'), 'João Silva');
    await userEvent.type(campo, 'joão.silva');
    await userEvent.type(screen.getByLabelText('E-mail'), 'joao@empresa.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'Senha-forte-123');
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'Senha-forte-123');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este apelido já está em uso');
    expect(servidor.enviados('POST /auth/cadastro')[0].apelido).toBe('joão.silva');
  });

  const preencher = async (confirmacao = 'Senha-forte-123', senha = 'Senha-forte-123', consentir = true) => {
    await userEvent.type(await screen.findByLabelText('Nome'), 'Maria Silva');
    await userEvent.type(screen.getByLabelText('Apelido'), 'maria');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@empresa.com');
    await userEvent.type(screen.getByLabelText('Senha'), senha);
    await userEvent.type(screen.getByLabelText('Confirme a senha'), confirmacao);
    if (consentir)
      await userEvent.click(screen.getByRole('checkbox', { name: /participa de forma anônima da pesquisa/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  };

  it('senhas diferentes não chamam a API', async () => {
    const { servidor } = await renderizarApp('/cadastro', { usuario: null, rotas: {} });
    await preencher('outra-coisa');
    expect(await screen.findByText('As senhas não conferem')).toBeInTheDocument();
    expect(servidor.enviados('POST /auth/cadastro')).toEqual([]);
  });

  it('botão do olho mostra e oculta a senha', async () => {
    await renderizarApp('/cadastro', { usuario: null });
    const senha = await screen.findByLabelText('Senha');
    const [olho] = screen.getAllByRole('button', { name: 'Mostrar senha' });
    expect(senha).toHaveAttribute('type', 'password');
    await userEvent.click(olho);
    expect(senha).toHaveAttribute('type', 'text');
    expect(olho).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(olho);
    expect(senha).toHaveAttribute('type', 'password');
  });

  it('cria a conta e entra', async () => {
    const { servidor } = await renderizarApp('/cadastro', {
      usuario: null,
      rotas: { 'POST /auth/cadastro': { status: 201, corpo: SESSAO }, ...rotasLogado },
    });
    await preencher();
    expect(await screen.findByRole('heading', { name: 'Aulas' })).toBeInTheDocument();
    expect(servidor.enviados('POST /auth/cadastro')[0]).toEqual({
      nome: 'Maria Silva',
      apelido: 'maria',
      email: 'maria@empresa.com',
      senha: 'Senha-forte-123',
      consentiu_pesquisa: true,
    });
  });

  it('sem aceitar o uso dos dados não chama a API', async () => {
    const { servidor } = await renderizarApp('/cadastro', { usuario: null, rotas: {} });
    await preencher(undefined, undefined, false);
    expect(await screen.findByText('É preciso aceitar para criar a conta')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /participa de forma anônima da pesquisa/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(servidor.enviados('POST /auth/cadastro')).toEqual([]);
  });

  it('erro de consentimento vindo da API aparece junto do checkbox', async () => {
    await renderizarApp('/cadastro', {
      usuario: null,
      rotas: {
        'POST /auth/cadastro': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
          { campo: 'consentiu_pesquisa', mensagem: 'É preciso aceitar o uso anônimo' },
        ]),
      },
    });
    await preencher();
    expect(await screen.findByText('É preciso aceitar o uso anônimo')).toBeInTheDocument();
  });

  it('erros de validação aparecem junto de cada campo, sem aviso geral', async () => {
    await renderizarApp('/cadastro', {
      usuario: null,
      rotas: {
        'POST /auth/cadastro': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
          { campo: 'apelido', mensagem: 'Use de 3 a 30 letras' },
          { campo: 'senha', mensagem: 'A senha precisa de pelo menos 8 caracteres' },
        ]),
      },
    });
    await preencher('Curta-1', 'Curta-1');
    expect(await screen.findByText('Use de 3 a 30 letras')).toBeInTheDocument();
    expect(screen.getByText('A senha precisa de pelo menos 8 caracteres')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nome')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra os requisitos da senha e marca os atendidos enquanto digita', async () => {
    await renderizarApp('/cadastro', { usuario: null });
    const senha = await screen.findByLabelText('Senha');
    expect(senha).toHaveAccessibleDescription(/Pelo menos 8 caracteres: pendente/);
    expect(screen.getAllByText(': pendente')).toHaveLength(5);
    await userEvent.type(senha, 'Senha-forte-123');
    expect(screen.getAllByText(': atendido')).toHaveLength(5);
    expect(screen.queryByText(/Não use emoji/)).not.toBeInTheDocument();
  });

  it('emoji na senha mostra aviso no campo, que some ao apagar', async () => {
    const { servidor } = await renderizarApp('/cadastro', { usuario: null });
    await userEvent.type(await screen.findByLabelText('Senha'), 'Senha-forte-1😀');
    expect(screen.getByText(/Não use emoji/)).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(screen.getByLabelText('Senha'));
    expect(screen.queryByText(/Não use emoji/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).not.toHaveAttribute('aria-invalid');
    expect(servidor.enviados('POST /auth/cadastro')).toEqual([]);
  });

  it('e-mail já cadastrado mostra aviso geral', async () => {
    await renderizarApp('/cadastro', {
      usuario: null,
      rotas: { 'POST /auth/cadastro': erroApi(409, 'CONFLITO', 'Este e-mail já está cadastrado') },
    });
    await preencher();
    expect(await screen.findByRole('alert')).toHaveTextContent('Este e-mail já está cadastrado');
  });

  it('links entre login e cadastro funcionam', async () => {
    await renderizarApp('/cadastro', { usuario: null });
    await userEvent.click(await screen.findByRole('link', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Criar conta' }));
    expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeInTheDocument();
  });
});

describe('Esqueci minha senha', () => {
  it('mostra a mensagem neutra da API e esconde o formulário', async () => {
    const { servidor } = await renderizarApp('/esqueci-senha', {
      usuario: null,
      rotas: {
        'POST /auth/esqueci-senha': { mensagem: 'Se o e-mail estiver cadastrado, você receberá um link' },
      },
    });
    await userEvent.type(await screen.findByLabelText('E-mail'), 'maria@empresa.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Se o e-mail estiver cadastrado');
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
    expect(servidor.enviados('POST /auth/esqueci-senha')).toEqual([{ email: 'maria@empresa.com' }]);
  });

  it('e-mail inválido mostra erro no campo; limite excedido mostra aviso', async () => {
    const { servidor } = await renderizarApp('/esqueci-senha', {
      usuario: null,
      rotas: {
        'POST /auth/esqueci-senha': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
          { campo: 'email', mensagem: 'E-mail inválido' },
        ]),
      },
    });
    await userEvent.type(await screen.findByLabelText('E-mail'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument();
    expect(servidor).toHaveBeenCalled();
  });

  it('rate limit (429) aparece como aviso', async () => {
    await renderizarApp('/esqueci-senha', {
      usuario: null,
      rotas: { 'POST /auth/esqueci-senha': erroApi(429, 'MUITAS_REQUISICOES', 'Muitas tentativas') },
    });
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas');
  });
});

describe('Redefinir senha', () => {
  const abrir = (query, rotas) => renderizarApp(`/redefinir-senha${query}`, { usuario: null, rotas });
  const preencher = async (senha, confirmacao) => {
    await userEvent.type(await screen.findByLabelText('Nova senha', { selector: 'input' }), senha);
    await userEvent.type(screen.getByLabelText('Confirme a nova senha'), confirmacao);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
  };

  it('com token válido troca a senha e oferece entrar', async () => {
    const { servidor } = await abrir('?token=abc123', { 'POST /auth/redefinir-senha': { status: 204 } });
    await preencher('Nova-senha-1', 'Nova-senha-1');
    expect(await screen.findByText('Senha alterada. Entre com a nova senha.')).toBeInTheDocument();
    expect(servidor.enviados('POST /auth/redefinir-senha')).toEqual([
      { token: 'abc123', senha: 'Nova-senha-1' },
    ]);
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar');
  });

  it('senhas diferentes não chamam a API', async () => {
    const { servidor } = await abrir('?token=abc123', {});
    await preencher('Nova-senha-1', 'outra-coisa');
    expect(await screen.findByText('As senhas não conferem')).toBeInTheDocument();
    expect(servidor.enviados('POST /auth/redefinir-senha')).toEqual([]);
  });

  it('sem token avisa e desabilita o envio', async () => {
    await abrir('', {});
    expect(await screen.findByText('Link incompleto. Abra o link do e-mail novamente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeDisabled();
  });

  it('token expirado mostra o erro da API', async () => {
    await abrir('?token=velho', {
      'POST /auth/redefinir-senha': erroApi(400, 'TOKEN_INVALIDO', 'Link inválido ou expirado. Peça um novo'),
    });
    await preencher('Nova-senha-1', 'Nova-senha-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido ou expirado');
  });

  it('token com tamanho inválido (erro de validação do campo token) mostra o aviso de link inválido', async () => {
    await abrir('?token=curto', {
      'POST /auth/redefinir-senha': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
        { campo: 'token', mensagem: 'Too small' },
      ]),
    });
    await preencher('Nova-senha-1', 'Nova-senha-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido ou expirado. Peça um novo');
    expect(screen.getByRole('link', { name: 'Peça um novo' })).toHaveAttribute('href', '/esqueci-senha');
    expect(screen.queryByText('Too small')).not.toBeInTheDocument();
  });

  it('senha fraca mostra erro no campo', async () => {
    await abrir('?token=abc', {
      'POST /auth/redefinir-senha': erroApi(400, 'VALIDACAO', 'Dados inválidos', [
        { campo: 'senha', mensagem: 'Curta' },
      ]),
    });
    await preencher('123', '123');
    await waitFor(() =>
      expect(screen.getByLabelText('Nova senha', { selector: 'input' })).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(screen.getByText('Curta')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra os requisitos da nova senha; emoji gera aviso, aspas e barra não', async () => {
    await abrir('?token=abc', {});
    const senha = await screen.findByLabelText('Nova senha', { selector: 'input' });
    expect(screen.getAllByText(': pendente')).toHaveLength(5);
    await userEvent.type(senha, 'Ab1"/x');
    expect(screen.getAllByText(': atendido')).toHaveLength(4);
    expect(screen.queryByText(/Não use emoji/)).not.toBeInTheDocument();
    await userEvent.type(senha, '🇧🇷');
    expect(screen.getByText(/Não use emoji/)).toBeInTheDocument();
  });

  it('funciona mesmo com alguém logado (link aberto em outro aparelho)', async () => {
    await renderizarApp('/redefinir-senha?token=x', { usuario: USUARIO, rotas: {} }).catch(() => {});
    expect(await screen.findByRole('heading', { name: 'Nova senha' })).toBeInTheDocument();
  });
});
