// Foto do usuário ou, sem foto, a inicial do nome (o placeholder externo antigo não existe mais).
export function Avatar({ url, nome, tamanho = 40 }) {
  const estilo = {
    width: tamanho,
    height: tamanho,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
  };
  if (url) return <img src={url} alt="" style={estilo} />;
  return (
    <span
      aria-hidden="true"
      style={{
        ...estilo,
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: tamanho * 0.42,
        background: 'var(--cor-primaria-suave)',
        color: 'var(--cor-sobre-primaria-suave)',
      }}
    >
      {nome?.[0]?.toUpperCase()}
    </span>
  );
}
