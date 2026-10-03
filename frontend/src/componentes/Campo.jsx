import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// Campo com label associado, ajuda e erro ligados por aria-describedby.
// Campo de senha ganha botão para mostrar/ocultar o que foi digitado.
export function Campo({ label, erro, ajuda, multilinha, children, ...props }) {
  const id = useId();
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const idAjuda = ajuda ? `${id}-ajuda` : undefined;
  const idErro = erro ? `${id}-erro` : undefined;
  const acessivel = {
    id,
    'aria-invalid': erro ? true : undefined,
    'aria-describedby': [idAjuda, idErro].filter(Boolean).join(' ') || undefined,
    ...props,
  };

  let controle;
  if (children) controle = <select {...acessivel}>{children}</select>;
  else if (multilinha) controle = <textarea {...acessivel} />;
  else if (props.type === 'password') {
    const Icone = senhaVisivel ? EyeOff : Eye;
    controle = (
      <div className="campo__senha">
        <input {...acessivel} type={senhaVisivel ? 'text' : 'password'} />
        <button
          type="button"
          aria-label="Mostrar senha"
          aria-pressed={senhaVisivel}
          aria-controls={id}
          onClick={() => setSenhaVisivel((v) => !v)}
        >
          <Icone size={20} aria-hidden="true" />
        </button>
      </div>
    );
  } else controle = <input {...acessivel} />;

  return (
    <div className="campo">
      <label htmlFor={id}>{label}</label>
      {controle}
      {ajuda && (
        <div id={idAjuda} className="campo__ajuda">
          {ajuda}
        </div>
      )}
      {/* Sempre montado: o leitor de tela anuncia o erro que aparece enquanto a pessoa digita. */}
      <span id={`${id}-erro`} className="campo__erro" aria-live="polite">
        {erro}
      </span>
    </div>
  );
}
