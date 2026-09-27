const sanitizeHtml = require('sanitize-html');

// Conteúdo de aula (admin ou arquivo) é sanitizado na gravação; o front sanitiza de novo ao exibir.
// Permite a estrutura de uma aula estilo MS Learn: títulos, listas, tabelas, código, figuras e caixas
// <aside class="nota|dica|atencao">. Scripts, estilos, eventos e URLs que não sejam https são removidos.
function limparHtml(html) {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title'],
      aside: ['class'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
    },
    allowedClasses: { aside: ['nota', 'dica', 'atencao'] },
    allowedSchemes: ['https', 'mailto'],
  });
}

module.exports = { limparHtml };
