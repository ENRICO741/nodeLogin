import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider } from './contexto/Auth';
import { ErrorBoundary } from './componentes/ErrorBoundary';
import { AvisoAtualizacao } from './componentes/AvisoAtualizacao';
import { Layout } from './componentes/Layout';
import { RotaAdmin, RotaProtegida, RotaPublica } from './componentes/Rotas';
import { Cadastro, Entrar, EsqueciSenha, RedefinirSenha } from './paginas/Auth';
import { Aulas } from './paginas/Aulas';
import { Aula } from './paginas/Aula';
import { Trivia, TriviaRodada } from './paginas/Trivia';
import { Ranking } from './paginas/Ranking';
import { Conquistas } from './paginas/Conquistas';
import { Perfil } from './paginas/Perfil';
import { Questionario } from './paginas/Questionario';
import { PainelAdmin } from './paginas/admin/Admin';
import { Estatisticas } from './paginas/admin/Estatisticas';
import { AdminAula, AdminAulas } from './paginas/admin/AdminAulas';
import { AdminTrivia } from './paginas/admin/AdminTrivia';
import { AdminUsuarios } from './paginas/admin/AdminUsuarios';

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<RotaPublica />}>
              <Route path="/entrar" element={<Entrar />} />
              <Route path="/cadastro" element={<Cadastro />} />
              <Route path="/esqueci-senha" element={<EsqueciSenha />} />
            </Route>
            {/* Fora da RotaPublica: o link do e-mail funciona mesmo com outra conta logada. */}
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />

            <Route element={<RotaProtegida />}>
              <Route path="/questionario/pre" element={<Questionario tipo="pre" />} />
              <Route element={<Layout />}>
                <Route path="/aulas" element={<Aulas />} />
                <Route path="/aulas/:id" element={<Aula />} />
                <Route path="/trivia" element={<Trivia />} />
                <Route path="/trivia/:id" element={<TriviaRodada />} />
                <Route path="/ranking" element={<Ranking />} />
                <Route path="/conquistas" element={<Conquistas />} />
                <Route path="/perfil" element={<Perfil />} />
                <Route path="/questionario" element={<Questionario tipo="pos" />} />
                <Route path="/admin" element={<RotaAdmin />}>
                  <Route index element={<PainelAdmin />} />
                  <Route path="estatisticas" element={<Estatisticas />} />
                  <Route path="aulas" element={<AdminAulas />} />
                  <Route path="aulas/:id" element={<AdminAula />} />
                  <Route path="trivia" element={<AdminTrivia />} />
                  <Route path="usuarios" element={<AdminUsuarios />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/aulas" replace />} />
          </Routes>
        </BrowserRouter>
        <AvisoAtualizacao />
      </AuthProvider>
    </ErrorBoundary>
  );
}
