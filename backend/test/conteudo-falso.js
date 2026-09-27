// Monta uma pasta conteudo/aulas temporária para testar o importador.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pergunta = ({
  chave = 'p1',
  pontos,
  correta = 1,
  alternativas,
  enunciado = 'Qual?',
  explicacao,
  extra = '',
} = {}) => {
  const itens = (alternativas ?? ['A', 'B', 'C', 'D'])
    .map((t, i) => `<li${i === correta ? ' data-correta' : ''}>${t}</li>`)
    .join('');
  return `<div data-pergunta="${chave}"${pontos === undefined ? '' : ` data-pontos="${pontos}"`}>
    ${enunciado === null ? '' : `<p data-enunciado>${enunciado}</p>`}${extra}<ol>${itens}</ol>
    ${explicacao ? `<p data-explicacao>${explicacao}</p>` : ''}</div>`;
};

const aulaHtml = ({
  titulo = 'Aula de teste',
  bonus,
  corpo = '<h2>Seção</h2><p>Texto.</p>',
  perguntas = [pergunta()],
} = {}) =>
  `<!doctype html><html><head>${titulo === null ? '' : `<title>${titulo}</title>`}
  ${bonus === undefined ? '' : `<meta name="aula:pontos-conclusao" content="${bonus}">`}
  <link rel="stylesheet" href="../../modelo/previa.css"></head>
  <body>${corpo}${perguntas === null ? '' : `<section data-perguntas>${perguntas.join('')}</section>`}</body></html>`;

// pastas: { '01-phishing': { html, imagens: ['x.png'] } }
function criarConteudo(pastas) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'conteudo-'));
  escreverConteudo(raiz, pastas);
  return raiz;
}

function escreverConteudo(raiz, pastas) {
  const aulas = path.join(raiz, 'aulas');
  fs.rmSync(aulas, { recursive: true, force: true });
  fs.mkdirSync(aulas, { recursive: true });
  for (const [nome, { html, imagens = [] }] of Object.entries(pastas)) {
    fs.mkdirSync(path.join(aulas, nome, 'imagens'), { recursive: true });
    if (html !== undefined) fs.writeFileSync(path.join(aulas, nome, 'aula.html'), html);
    for (const img of imagens) fs.writeFileSync(path.join(aulas, nome, 'imagens', img), 'x');
  }
}

module.exports = { pergunta, aulaHtml, criarConteudo, escreverConteudo };
