import { useId } from 'react';

// Campo com label associado, ajuda e erro ligados por aria-describedby.
export function Campo({ label, erro, ajuda, multilinha, children, ...props }) {
  const id = useId();
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
  else controle = <input {...acessivel} />;

  return (
    <div className="campo">
      <label htmlFor={id}>{label}</label>
      {controle}
      {ajuda && (
        <span id={idAjuda} className="campo__ajuda">
          {ajuda}
        </span>
      )}
      {erro && (
        <span id={idErro} className="campo__erro">
          {erro}
        </span>
      )}
    </div>
  );
}
