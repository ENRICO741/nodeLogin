import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Campo } from './Campo';
import { MINIMO_SENHA, REQUISITOS_SENHA, senhaLongaDemais, temCaractereInvalido } from '../lib/senha';

// Campo de senha nova com a lista de requisitos marcada (✓/✗) enquanto a pessoa digita.
export function CampoSenhaNova({ erro, ...props }) {
  const [senha, setSenha] = useState('');
  const requisitos = REQUISITOS_SENHA.map((r) => ({ ...r, ok: r.atende(senha) }));
  let invalido = null;
  if (temCaractereInvalido(senha))
    invalido =
      'Não use emoji nem caracteres invisíveis. Letras, números, espaço e símbolos do teclado são aceitos.';
  else if (senhaLongaDemais(senha)) invalido = 'Senha muito longa, considere diminuí-la um pouco';
  // O erro da API sai da tela quando a pessoa já corrigiu a senha.
  const erroApi = requisitos.every((r) => r.ok) ? null : erro;

  return (
    <Campo
      type="password"
      autoComplete="new-password"
      minLength={MINIMO_SENHA}
      required
      {...props}
      onChange={(e) => setSenha(e.target.value)}
      erro={invalido ?? erroApi}
      ajuda={
        <ul className="requisitos-senha">
          {requisitos.map(({ texto, ok }) => {
            const Icone = ok ? Check : X;
            return (
              <li key={texto} className={ok ? 'requisitos-senha__ok' : undefined}>
                <Icone size={16} aria-hidden="true" />
                {texto}
                <span className="sr-only">{ok ? ': atendido' : ': pendente'}</span>
              </li>
            );
          })}
        </ul>
      }
    />
  );
}
