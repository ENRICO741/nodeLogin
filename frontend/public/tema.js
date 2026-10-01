// Aplica o tema antes da primeira pintura (evita flash do tema errado). Fica em arquivo próprio
// porque a CSP do Caddy (script-src 'self') bloqueia script inline. Escolha salva vence o SO.
var tema;
try {
  tema = localStorage.getItem('guardiao.tema');
} catch (e) {
  /* armazenamento bloqueado: segue o SO */
}
if (tema === 'light' || tema === 'dark') document.documentElement.dataset.theme = tema;
else {
  // Sem escolha salva: segue o SO, inclusive quando ele troca de tema com a página aberta.
  var so = matchMedia('(prefers-color-scheme: dark)');
  var seguirSo = function () {
    var salvo = null;
    try {
      salvo = localStorage.getItem('guardiao.tema');
    } catch (e) {
      /* idem */
    }
    if (!salvo) document.documentElement.dataset.theme = so.matches ? 'dark' : 'light';
  };
  seguirSo();
  so.addEventListener('change', seguirSo);
}
