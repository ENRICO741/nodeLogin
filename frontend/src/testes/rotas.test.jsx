import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { RotaAdmin, RotaProtegida } from '../componentes/Rotas';

const auth = vi.hoisted(() => ({ atual: {} }));
vi.mock('../contexto/Auth', () => ({ useAuth: () => auth.atual }));

function montar(caminho) {
  render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/entrar" element={<p>tela de login</p>} />
        <Route path="/aulas" element={<p>tela de aulas</p>} />
        <Route element={<RotaProtegida />}>
          <Route path="/perfil" element={<p>tela de perfil</p>} />
          <Route element={<RotaAdmin />}>
            <Route path="/admin" element={<p>tela de admin</p>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('rotas protegidas', () => {
  it('manda para o login quem não está autenticado', () => {
    auth.atual = { usuario: null, carregando: false };
    montar('/perfil');
    expect(screen.getByText('tela de login')).toBeInTheDocument();
  });

  it('não mostra a área admin para usuário comum', () => {
    auth.atual = { usuario: { papel: 'usuario' }, carregando: false };
    montar('/admin');
    expect(screen.getByText('tela de aulas')).toBeInTheDocument();
  });

  it('mostra a área admin para admin', () => {
    auth.atual = { usuario: { papel: 'admin' }, carregando: false };
    montar('/admin');
    expect(screen.getByText('tela de admin')).toBeInTheDocument();
  });
});
