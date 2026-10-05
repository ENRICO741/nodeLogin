import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, definirAoSessaoExpirar, tokenSalvo } from '../lib/api';
import { definirConsentimento, finalizarSessao, iniciarSessao } from '../lib/telemetria';

const AuthContexto = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(() => Boolean(tokenSalvo.obter()));

  const sair = useCallback(() => {
    finalizarSessao();
    tokenSalvo.limpar();
    setUsuario(null);
  }, []);

  useEffect(() => {
    definirAoSessaoExpirar(() => {
      // Encerra a sessão de telemetria: senão o próximo login herdaria o id dela.
      finalizarSessao();
      tokenSalvo.limpar();
      setUsuario(null);
    });
    if (!tokenSalvo.obter()) return;
    api('/auth/me')
      .then(setUsuario)
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  const iniciar = useCallback(({ token, usuario }) => {
    tokenSalvo.definir(token);
    setUsuario(usuario);
  }, []);

  // Coleta segue o consentimento do usuário: retirar ou reconceder no Perfil para ou retoma na hora.
  // null (sem usuário ainda) não faz nada, para não apagar a fila enquanto o /auth/me carrega.
  const coleta = usuario ? Boolean(usuario.consentiu_pesquisa_em) : null;
  useEffect(() => {
    definirConsentimento(coleta);
    if (coleta === true) iniciarSessao();
    else if (coleta === false) finalizarSessao();
  }, [coleta]);

  const valor = useMemo(
    () => ({
      usuario,
      carregando,
      entrar: async (credenciais) =>
        iniciar(await api('/auth/login', { metodo: 'POST', corpo: credenciais })),
      cadastrar: async (dados) => iniciar(await api('/auth/cadastro', { metodo: 'POST', corpo: dados })),
      sair,
      // Mescla dados novos (ex.: pontuacao_total depois de uma resposta) sem recarregar /auth/me.
      atualizarUsuario: (parcial) => setUsuario((atual) => (atual ? { ...atual, ...parcial } : atual)),
    }),
    [usuario, carregando, iniciar, sair],
  );

  return <AuthContexto.Provider value={valor}>{children}</AuthContexto.Provider>;
}

export const useAuth = () => useContext(AuthContexto);
