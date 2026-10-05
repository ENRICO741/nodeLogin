import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, definirAoSessaoExpirar, tokenSalvo } from '../lib/api';
import { definirConsentimento, finalizarSessao, iniciarSessao } from '../lib/telemetria';

const AuthContexto = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(() => Boolean(tokenSalvo.obter()));
  const [erro, setErro] = useState(null);

  const sair = useCallback(() => {
    finalizarSessao();
    tokenSalvo.limpar();
    setUsuario(null);
  }, []);

  // Sem rede ou servidor fora do ar o token pode estar bom: guarda o erro em vez de deslogar.
  // 401 já passa por aoSessaoExpirar; outros 4xx seguem sem usuário.
  const buscarEu = useCallback(
    () =>
      api('/auth/me')
        .then(setUsuario, (e) => {
          if (e.status === 0 || e.status >= 500) setErro(e);
        })
        .finally(() => setCarregando(false)),
    [],
  );

  const tentarDeNovo = useCallback(() => {
    setErro(null);
    setCarregando(true);
    buscarEu();
  }, [buscarEu]);

  useEffect(() => {
    definirAoSessaoExpirar(() => {
      // Encerra a sessão de telemetria: senão o próximo login herdaria o id dela.
      finalizarSessao();
      tokenSalvo.limpar();
      setUsuario(null);
    });
    if (tokenSalvo.obter()) buscarEu();
  }, [buscarEu]);

  const iniciar = useCallback(({ token, usuario }) => {
    tokenSalvo.definir(token);
    setErro(null); // falha antiga do /auth/me não vale mais: senão a RotaProtegida mostraria o erro logado
    setUsuario(usuario);
  }, []);

  // Coleta segue o consentimento do usuário. Ele é obrigatório no cadastro e não se retira pelo app;
  // a checagem fica como defesa para conta sem ele (aí não abre sessão nem envia eventos).
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
      erro,
      tentarDeNovo,
      entrar: async (credenciais) =>
        iniciar(await api('/auth/login', { metodo: 'POST', corpo: credenciais })),
      cadastrar: async (dados) => iniciar(await api('/auth/cadastro', { metodo: 'POST', corpo: dados })),
      sair,
      // Mescla dados novos (ex.: pontuacao_total depois de uma resposta) sem recarregar /auth/me.
      atualizarUsuario: (parcial) => setUsuario((atual) => (atual ? { ...atual, ...parcial } : atual)),
    }),
    [usuario, carregando, erro, tentarDeNovo, iniciar, sair],
  );

  return <AuthContexto.Provider value={valor}>{children}</AuthContexto.Provider>;
}

export const useAuth = () => useContext(AuthContexto);
