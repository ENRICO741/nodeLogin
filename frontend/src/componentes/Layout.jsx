import { useEffect, useRef, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Award, BookOpen, Moon, Star, Sun, Trophy, User, Zap } from 'lucide-react';
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

// O tema vem de public/tema.js (aplicado no <html> antes da pintura, e segue o SO sem escolha salva).
// O botão lê o próprio atributo, assim fica certo mesmo quando o SO troca o tema.
const assinarTema = (avisar) => {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributeFilter: ['data-theme'] });
  return () => observador.disconnect();
};
const temaEscuro = () => document.documentElement.dataset.theme === 'dark';

function BotaoTema() {
  const escuro = useSyncExternalStore(assinarTema, temaEscuro);

  function alternar() {
    const tema = escuro ? 'light' : 'dark';
    const aplicar = () => {
      document.documentElement.dataset.theme = tema;
    };
    // Esmaecimento nativo entre os temas; sem animação para quem pediu menos movimento.
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      document.startViewTransition(aplicar);
    else aplicar();
    try {
      localStorage.setItem('guardiao.tema', tema);
    } catch {
      /* vale só nesta sessão */
    }
  }

  const Icone = escuro ? Moon : Sun;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={escuro}
      aria-label="Tema escuro"
      className={styles.tema}
      onClick={alternar}
    >
      <span className={styles.trilho}>
        <span className={styles.bolinha}>
          <Icone aria-hidden="true" size={14} />
        </span>
      </span>
    </button>
  );
}

export function Layout() {
  const { usuario } = useAuth();
  const { pathname } = useLocation();
  const telaAnterior = useRef(null);

  // tela_anterior mostra o caminho de navegação (ex.: resultado da aula → ranking).
  useEffect(() => {
    registrarEvento({
      tipo_evento: 'tela_visualizada',
      tela: pathname,
      ...(telaAnterior.current && { metadata: { tela_anterior: telaAnterior.current } }),
    });
    telaAnterior.current = pathname;
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
        <span className={styles.acoes}>
          <span className={styles.pontos} aria-label={`${usuario.pontuacao_total} pontos`}>
            <Star aria-hidden="true" size={16} />
            {usuario.pontuacao_total}
          </span>
          <BotaoTema />
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
