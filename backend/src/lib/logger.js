// Uma linha JSON por evento: fácil de ler com `docker compose logs` e de filtrar com jq.
function registrar(nivel, mensagem, extra = {}) {
  if (process.env.NODE_ENV === 'test' && nivel !== 'error') return;
  if (extra.erro instanceof Error) extra = { ...extra, erro: extra.erro.stack };
  const linha = JSON.stringify({ t: new Date().toISOString(), nivel, mensagem, ...extra });
  (nivel === 'error' ? console.error : console.log)(linha);
}

module.exports = {
  info: (mensagem, extra) => registrar('info', mensagem, extra),
  warn: (mensagem, extra) => registrar('warn', mensagem, extra),
  error: (mensagem, extra) => registrar('error', mensagem, extra),
};
