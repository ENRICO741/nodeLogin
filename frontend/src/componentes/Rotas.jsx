import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../contexto/Auth';
import { Carregando } from './Estado';

export function RotaProtegida() {
  const { usuario, carregando } = useAuth();
  const location = useLocation();
  if (carregando) return <Carregando />;
  if (!usuario) return <Navigate to="/entrar" replace state={{ de: location.pathname }} />;
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
