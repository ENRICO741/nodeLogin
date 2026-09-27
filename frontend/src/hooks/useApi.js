import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

// Carrega `caminho` com loading/erro e cancela a requisição anterior se o caminho mudar.
export function useApi(caminho) {
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: true });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    const controle = new AbortController();
    setEstado((atual) => ({ ...atual, erro: null, carregando: true }));
    api(caminho, { sinal: controle.signal }).then(
      (dados) => setEstado({ dados, erro: null, carregando: false }),
      (erro) => {
        if (erro.name !== 'AbortError') setEstado({ dados: null, erro, carregando: false });
      },
    );
    return () => controle.abort();
  }, [caminho, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { ...estado, recarregar };
}
