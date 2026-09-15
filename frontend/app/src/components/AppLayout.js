import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import * as telemetry from '../lib/telemetry';

function AppLayout({ onLogout, children }) {
  const location = useLocation();

  useEffect(() => {
    telemetry.registrarEvento({ tipoEvento: 'tela_visualizada', tela: location.pathname });
  }, [location.pathname]);

  return (
    <div className="App has-header">
      <header className="app-header">
        <div className="header-content">
          <h1>🛡️ LGPD Learn</h1>
          <nav className="nav-links">
            <NavLink to="/aulas" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Aulas
            </NavLink>
            <NavLink to="/trivia" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Trivia
            </NavLink>
            <NavLink to="/badges" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Conquistas
            </NavLink>
            <NavLink to="/perfil" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Perfil
            </NavLink>
            <NavLink to="/estatisticas" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Estatísticas
            </NavLink>
            <NavLink to="/questoes" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Questões
            </NavLink>
          </nav>
          <button className="btn-logout" onClick={onLogout}>Sair</button>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}

export default AppLayout;
