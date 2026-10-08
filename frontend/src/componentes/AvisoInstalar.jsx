import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../contexto/Auth';
import styles from './AvisoInstalar.module.css';

const CHAVE = 'instalar-mostrado-em';
const INTERVALO = 3 * 24 * 60 * 60 * 1000; // 3 dias entre um convite e outro

const jaInstalado = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

// iPadOS se apresenta como Mac; o toque denuncia.
const ehIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// O navegador decide quando o app é instalável. Chrome/Edge/Samsung avisam por
// beforeinstallprompt e deixam a gente abrir o diálogo; o Safari do iOS não tem
// API nenhuma, então só dá para ensinar o caminho pelo menu Compartilhar.
// O convite só aparece logado, no máximo a cada INTERVALO, e some sozinho quando a
// barra de tempo acaba. Fica montado fora das rotas porque o Chrome dispara o
// evento uma vez por carregamento, em geral ainda na tela de login.
export function AvisoInstalar() {
  const { usuario } = useAuth();
  const [evento, setEvento] = useState(null);
  const [visivel, setVisivel] = useState(() => {
    try {
      return !jaInstalado() && Date.now() - Number(localStorage.getItem(CHAVE)) >= INTERVALO;
    } catch {
      return false;
    }
  });
  const mostrar = visivel && Boolean(usuario) && (evento !== null || ehIOS());

  useEffect(() => {
    const guardar = (e) => {
      e.preventDefault();
      setEvento(e);
    };
    const instalado = () => setVisivel(false);
    window.addEventListener('beforeinstallprompt', guardar);
    window.addEventListener('appinstalled', instalado);
    return () => {
      window.removeEventListener('beforeinstallprompt', guardar);
      window.removeEventListener('appinstalled', instalado);
    };
  }, []);

  useEffect(() => {
    if (!mostrar) return;
    try {
      localStorage.setItem(CHAVE, String(Date.now()));
    } catch {
      // Sem storage o convite volta na próxima visita.
    }
  }, [mostrar]);

  const fechar = () => setVisivel(false);
  const instalar = () => {
    evento.prompt();
    fechar();
  };

  if (!mostrar) return null;
  return (
    <div className={styles.aviso} role="status">
      <button type="button" className={styles.fechar} aria-label="Fechar" onClick={fechar}>
        <X size={18} aria-hidden="true" />
      </button>
      {evento ? (
        <>
          <span>
            Você sabia que também pode instalar o Guardião? Ele abre direto da tela inicial, como um app.
          </span>
          <button type="button" className="botao" onClick={instalar}>
            Instalar app
          </button>
        </>
      ) : (
        <span>
          Você sabia que também pode instalar o Guardião? Toque em Compartilhar e depois em “Adicionar à Tela
          de Início”.
        </span>
      )}
      <button type="button" className="botao botao--texto" onClick={fechar}>
        Agora não
      </button>
      <div className={styles.tempo} aria-hidden="true" onAnimationEnd={fechar} />
    </div>
  );
}
