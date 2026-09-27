import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { erroApi, renderizarApp, USUARIO } from './utils';

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

describe('Cadastro', () => {
  const preencher = async () => {
    await userEvent.type(await screen.findByLabelText('Nome'), 'Maria Silva');
    await userEvent.type(screen.getByLabelText('Apelido'), 'maria');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@empresa.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte-123');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  };

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
      senha: 'senha-forte-123',
    });
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
    await preencher();
    expect(await screen.findByText('Use de 3 a 30 letras')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Nome')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    await preencher('nova-senha-1', 'nova-senha-1');
    expect(await screen.findByText('Senha alterada. Entre com a nova senha.')).toBeInTheDocument();
    expect(servidor.enviados('POST /auth/redefinir-senha')).toEqual([
      { token: 'abc123', senha: 'nova-senha-1' },
    ]);
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar');
  });

  it('senhas diferentes não chamam a API', async () => {
    const { servidor } = await abrir('?token=abc123', {});
    await preencher('nova-senha-1', 'outra-coisa');
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
    await preencher('nova-senha-1', 'nova-senha-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido ou expirado');
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
  });

  it('funciona mesmo com alguém logado (link aberto em outro aparelho)', async () => {
    await renderizarApp('/redefinir-senha?token=x', { usuario: USUARIO, rotas: {} }).catch(() => {});
    expect(await screen.findByRole('heading', { name: 'Nova senha' })).toBeInTheDocument();
  });
});
