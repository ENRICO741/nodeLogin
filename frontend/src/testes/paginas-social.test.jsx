import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN, erroApi, PARTICIPANTE, renderizarApp, USUARIO } from './utils';

describe('Ranking', () => {
  const lider = (apelido, pontos, posicao, eu = false) => ({
    apelido,
    pontuacao_total: pontos,
    posicao,
    eu,
    foto_perfil_url: null,
  });

  it('mostra minha posição, pódio e destaca o próprio usuário', async () => {
    await renderizarApp('/ranking', {
      rotas: {
        'GET /ranking': {
          lideres: [
            lider('ana', 90, 1),
            lider('bia', 90, 1),
            lider('maria', 40, 3, true),
            lider('caio', 10, 4),
          ],
          minha_posicao: 3,
          pontuacao_total: 40,
        },
      },
    });
    expect(await screen.findByText('3º', { selector: 'span[class*=minhaPosicao]' })).toBeInTheDocument();
    expect(
      screen.getByText('Os 20 alunos com mais pontos. Acerte perguntas nas aulas e na trivia para subir.'),
    ).toBeInTheDocument();
    const linhas = screen.getAllByRole('listitem');
    expect(linhas).toHaveLength(4);
    expect(within(linhas[2]).getByText('você')).toBeInTheDocument();
    expect(within(linhas[3]).queryByText('você')).not.toBeInTheDocument();
    expect(screen.queryByText(/Continue respondendo/)).not.toBeInTheDocument();
  });

  it('fora do top mostra incentivo', async () => {
    await renderizarApp('/ranking', {
      rotas: { 'GET /ranking': { lideres: [lider('ana', 90, 1)], minha_posicao: 25, pontuacao_total: 1 } },
    });
    expect(await screen.findByText('Continue respondendo para entrar no top 1.')).toBeInTheDocument();
  });

  it('ranking vazio e admin sem posição', async () => {
    await renderizarApp('/ranking', {
      usuario: ADMIN,
      rotas: { 'GET /ranking': { lideres: [], minha_posicao: null, pontuacao_total: 0 } },
    });
    expect(await screen.findByText('Ninguém pontuou ainda. Seja o primeiro!')).toBeInTheDocument();
    expect(screen.queryByText('Sua posição')).not.toBeInTheDocument();
  });

  it('erro de carregamento', async () => {
    await renderizarApp('/ranking', { rotas: { 'GET /ranking': erroApi(500, 'E', 'Falhou') } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
  });
});

describe('Conquistas', () => {
  it('mostra obtidas com data e bloqueadas com texto (não só cor)', async () => {
    await renderizarApp('/conquistas', {
      rotas: {
        'GET /badges': [
          {
            id: 'b1',
            nome: 'Primeiros Passos',
            descricao: 'd1',
            tipo_criterio: 'aula_concluida',
            obtida_em: '2026-03-05T12:00:00Z',
            imagem_url: null,
          },
          {
            id: 'b2',
            nome: 'Curioso',
            descricao: 'd2',
            tipo_criterio: 'primeira_trivia',
            obtida_em: null,
            imagem_url: null,
          },
          {
            id: 'b3',
            nome: 'Com imagem',
            descricao: 'd3',
            tipo_criterio: 'outro',
            obtida_em: '2026-03-06T12:00:00Z',
            imagem_url: 'https://x.com/b.png',
          },
        ],
      },
    });
    expect(await screen.findByText('2 de 3 desbloqueadas')).toBeInTheDocument();
    const [b1, b2, b3] = screen.getAllByRole('listitem');
    expect(within(b1).getByText(/Obtida em \d{2}\/\d{2}\/2026/)).toBeInTheDocument();
    expect(within(b2).getByText('Bloqueada')).toBeInTheDocument();
    expect(b3.querySelector('img')).toHaveAttribute('src', 'https://x.com/b.png');
  });

  it('sem badges mostra estado vazio; erro mostra alerta', async () => {
    await renderizarApp('/conquistas', { rotas: { 'GET /badges': [] } });
    expect(await screen.findByText('Nenhuma conquista cadastrada ainda')).toBeInTheDocument();
  });

  it('erro mostra alerta', async () => {
    await renderizarApp('/conquistas', { rotas: { 'GET /badges': erroApi(500, 'E', 'Falhou') } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou');
  });
});

describe('Perfil', () => {
  const COMPLETO = { ...USUARIO, bio: 'Analista\nde segurança', profissao: 'Analista', empresa: 'ACME' };

  it('mostra os dados do usuário e não mostra o link de admin para usuário comum', async () => {
    await renderizarApp('/perfil', { usuario: COMPLETO });
    expect(screen.getByRole('heading', { name: 'Maria Silva' })).toBeInTheDocument();
    expect(screen.getByText('@maria')).toBeInTheDocument();
    expect(screen.getByText('Analista', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('ACME')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /administrador/ })).not.toBeInTheDocument();
  });

  it('perfil sem profissão, empresa e bio esconde essas partes', async () => {
    await renderizarApp('/perfil');
    expect(screen.queryByText('ACME')).not.toBeInTheDocument();
  });

  it('admin vê o link para a área do administrador', async () => {
    await renderizarApp('/perfil', { usuario: ADMIN });
    expect(screen.getByRole('link', { name: /Área do administrador/ })).toHaveAttribute('href', '/admin');
  });

  it('editar e salvar atualiza a tela e mostra confirmação', async () => {
    const { servidor } = await renderizarApp('/perfil', {
      usuario: COMPLETO,
      rotas: { 'PATCH /perfil': ({ corpo }) => ({ ...COMPLETO, ...corpo }) },
    });
    await userEvent.click(screen.getByRole('button', { name: /Editar perfil/ }));
    const nome = screen.getByLabelText('Nome');
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Maria Souza');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Perfil atualizado.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Maria Souza' })).toBeInTheDocument();
    expect(servidor.enviados('PATCH /perfil')[0]).toEqual({
      nome: 'Maria Souza',
      apelido: 'maria',
      profissao: 'Analista',
      empresa: 'ACME',
      bio: 'Analista\nde segurança',
      foto_perfil_url: null,
    });
  });

  it('cancelar volta sem salvar', async () => {
    const { servidor } = await renderizarApp('/perfil');
    await userEvent.click(screen.getByRole('button', { name: /Editar perfil/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: /Editar perfil/ })).toBeInTheDocument();
    expect(servidor.enviados('PATCH /perfil')).toEqual([]);
  });

  it('erros por campo e erro geral', async () => {
    await renderizarApp('/perfil', {
      rotas: {
        'PATCH /perfil': vi
          .fn()
          .mockReturnValueOnce(
            erroApi(400, 'VALIDACAO', 'Dados inválidos', [
              { campo: 'apelido', mensagem: 'Apelido inválido' },
            ]),
          )
          .mockReturnValueOnce(erroApi(409, 'CONFLITO', 'Este apelido já está em uso')),
      },
    });
    await userEvent.click(screen.getByRole('button', { name: /Editar perfil/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Apelido inválido')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este apelido já está em uso');
  });

  it('foto: redimensiona no navegador, mostra prévia, pode remover', async () => {
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 800, height: 600 }));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,AAAA');
    const { servidor } = await renderizarApp('/perfil', {
      rotas: { 'PATCH /perfil': ({ corpo }) => ({ ...USUARIO, ...corpo }) },
    });
    await userEvent.click(screen.getByRole('button', { name: /Editar perfil/ }));
    await userEvent.upload(screen.getByLabelText('Foto'), new File(['x'], 'eu.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remover foto' })).toBeInTheDocument());
    // recorte central quadrado: 800x600 → sai de x=100
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 600, 600, 0, 0, 256, 256);

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(servidor.enviados('PATCH /perfil')[0].foto_perfil_url).toBe('data:image/webp;base64,AAAA'),
    );
    expect(servidor.enviados('PATCH /perfil')[0].arquivo_foto).toBeUndefined();
    // Com WebP disponível não gera JPEG à toa.
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: /Editar perfil/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Remover foto' }));
    expect(screen.queryByRole('button', { name: 'Remover foto' })).not.toBeInTheDocument();
  });

  it('foto: navegador sem WebP (Safari no iPhone devolve PNG) envia JPEG', async () => {
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 300, height: 300 }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockImplementation((tipo) =>
        tipo === 'image/jpeg' ? 'data:image/jpeg;base64,JJJJ' : 'data:image/png;base64,PPPP',
      );
    const { servidor } = await renderizarApp('/perfil', {
      rotas: { 'PATCH /perfil': ({ corpo }) => ({ ...USUARIO, ...corpo }) },
    });
    await userEvent.click(screen.getByRole('button', { name: /Editar perfil/ }));
    await userEvent.upload(screen.getByLabelText('Foto'), new File(['x'], 'eu.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remover foto' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(servidor.enviados('PATCH /perfil')[0].foto_perfil_url).toBe('data:image/jpeg;base64,JJJJ'),
    );
    expect(toDataURL.mock.calls).toEqual([
      ['image/webp', 0.85],
      ['image/jpeg', 0.85],
    ]);
  });

  it('foto ilegível mostra erro no campo; cancelar a seleção não muda nada', async () => {
    globalThis.createImageBitmap = vi.fn(async () => {
      throw new Error('formato');
    });
    await renderizarApp('/perfil');
    await userEvent.click(screen.getByRole('button', { name: /Editar perfil/ }));
    const campo = screen.getByLabelText('Foto');
    await userEvent.upload(campo, new File(['x'], 'ruim.png', { type: 'image/png' }));
    expect(
      await screen.findByText('Não foi possível ler esta imagem. Tente outro arquivo.'),
    ).toBeInTheDocument();
    await userEvent.upload(campo, []);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
  });

  it('sair encerra a sessão e volta para o login', async () => {
    await renderizarApp('/perfil', { rotas: { 'POST /sessoes/sessao-1/finalizar': { status: 204 } } });
    await userEvent.click(screen.getByRole('button', { name: /Sair/ }));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(localStorage.getItem('guardiao.token')).toBeNull();
  });
});

describe('navegação', () => {
  it('a tab bar leva a cada seção e registra a tela vista', async () => {
    const { servidor } = await renderizarApp('/aulas', {
      usuario: PARTICIPANTE,
      rotas: {
        'GET /aulas': [],
        'GET /ranking': { lideres: [], minha_posicao: 1, pontuacao_total: 0 },
        'GET /badges': [],
      },
    });
    await userEvent.click(screen.getByRole('link', { name: 'Trivia' }));
    expect(await screen.findByRole('heading', { name: 'Trivia' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Ranking' }));
    expect(await screen.findByRole('heading', { name: 'Ranking' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Conquistas' }));
    expect(await screen.findByRole('heading', { name: 'Conquistas' })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        servidor
          .enviados('POST /eventos')
          .filter((e) => e.tipo_evento === 'tela_visualizada')
          .map((e) => e.tela),
      ).toEqual(expect.arrayContaining(['/aulas', '/trivia', '/ranking', '/conquistas'])),
    );
  });

  it('link "Pular para o conteúdo" aponta para o main', async () => {
    await renderizarApp('/aulas', { rotas: { 'GET /aulas': [] } });
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute('href', '#conteudo');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'conteudo');
  });

  it('switch de tema alterna claro/escuro no <html> e guarda a escolha', async () => {
    document.documentElement.dataset.theme = 'light';
    await renderizarApp('/aulas', { rotas: { 'GET /aulas': [] } });
    const chave = screen.getByRole('switch', { name: 'Tema escuro' });
    expect(chave).not.toBeChecked();

    await userEvent.click(chave);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('guardiao.tema')).toBe('dark');
    expect(chave).toBeChecked();

    // Teclado: Espaço e Enter acionam o switch (comportamento nativo do <button>).
    chave.focus();
    await userEvent.keyboard(' ');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('guardiao.tema')).toBe('light');
    expect(chave).not.toBeChecked();
    await userEvent.keyboard('{Enter}');
    expect(chave).toBeChecked();
    await userEvent.keyboard('{Enter}');

    // Troca vinda de fora (tema.js seguindo o SO): o switch acompanha.
    document.documentElement.dataset.theme = 'dark';
    await waitFor(() => expect(chave).toBeChecked());
    expect(chave).toHaveAccessibleName('Tema escuro');
    delete document.documentElement.dataset.theme;
  });
});
