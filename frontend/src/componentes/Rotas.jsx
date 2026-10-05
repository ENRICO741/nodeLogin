import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../contexto/Auth';
import { Carregando, ErroCarregamento } from './Estado';

export function RotaProtegida() {
  const { usuario, carregando, erro, tentarDeNovo } = useAuth();
  const location = useLocation();
  if (carregando) return <Carregando />;
  // Falha de rede/servidor ao conferir a sessão: mandar para o login seria deslogar à toa.
  if (erro) return <ErroCarregamento erro={erro} onTentarDeNovo={tentarDeNovo} />;
  if (!usuario) return <Navigate to="/entrar" replace state={{ de: location.pathname }} />;
  // Participante sem o questionário inicial da pesquisa responde antes de usar o app.
  if (usuario.questionarios?.pre_pendente && location.pathname !== '/questionario/pre')
    return <Navigate to="/questionario/pre" replace />;
  return <Outlet />;
}

// Só esconde a UI: a proteção real é o exigirAdmin da API.
export function RotaAdmin() {
  const { usuario } = useAuth();
  return usuario?.papel === 'admin' ? <Outlet /> : <Navigate to="/aulas" replace />;
}

// Logado não vê login/cadastro: volta para a página que tentou abrir antes (RotaProtegida guarda em state.de).
export function RotaPublica() {
  const { usuario, carregando } = useAuth();
  const { state } = useLocation();
  if (carregando) return <Carregando />;
  return usuario ? <Navigate to={state?.de ?? '/aulas'} replace /> : <Outlet />;
}
