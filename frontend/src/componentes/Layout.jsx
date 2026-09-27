import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Award, BookOpen, Star, Trophy, User, Zap } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import { registrarEvento } from '../lib/telemetria';
import styles from './Layout.module.css';

const ABAS = [
  { para: '/aulas', rotulo: 'Aulas', Icone: BookOpen },
  { para: '/trivia', rotulo: 'Trivia', Icone: Zap },
  { para: '/ranking', rotulo: 'Ranking', Icone: Trophy },
  { para: '/conquistas', rotulo: 'Conquistas', Icone: Award },
  { para: '/perfil', rotulo: 'Perfil', Icone: User },
];

export function Layout() {
  const { usuario } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    registrarEvento({ tipo_evento: 'tela_visualizada', tela: pathname });
  }, [pathname]);

  return (
    <div className={styles.app}>
      <a href="#conteudo" className={styles.pular}>
        Pular para o conteúdo
      </a>
      <header className={styles.cabecalho}>
        <span className={styles.marca}>
          <img src="/logo.svg" alt="" width="28" height="28" />
          Guardião Digital
        </span>
        <span className={styles.pontos} aria-label={`${usuario.pontuacao_total} pontos`}>
          <Star aria-hidden="true" size={16} />
          {usuario.pontuacao_total}
        </span>
      </header>

      <main id="conteudo" className={styles.conteudo}>
        <Outlet />
      </main>

      <nav className={styles.abas} aria-label="Navegação principal">
        {ABAS.map(({ para, rotulo, Icone }) => (
          <NavLink
            key={para}
            to={para}
            className={({ isActive }) => `${styles.aba} ${isActive ? styles.ativa : ''}`}
          >
            <Icone aria-hidden="true" size={22} />
            <span>{rotulo}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
