const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const CONTEUDO_DIR = path.resolve(__dirname, '..', '..', 'content', 'aulas');

function extrairOrdemDoNome(nomeArquivo) {
  const match = nomeArquivo.match(/aula-?0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function reescreverCaminhosDeImagem(html) {
  return html.replace(/(<img[^>]+src=")(?!https?:\/\/|data:|\/)([^"]+)(")/gi, '$1/content-assets/$2$3');
}

function extrairBody(html) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = match ? match[1].trim() : html.trim();
  return reescreverCaminhosDeImagem(body);
}

function extrairTitulo(bodyHtml, fallback) {
  const h2 = bodyHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (h2) return h2[1].replace(/<[^>]+>/g, '').trim();

  const h1 = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return h1[1].replace(/<[^>]+>/g, '').trim();

  return fallback;
}

function listarArquivos() {
  if (!fs.existsSync(CONTEUDO_DIR)) return [];
  return fs.readdirSync(CONTEUDO_DIR).filter((nome) => nome.toLowerCase().endsWith('.html'));
}

function listarConteudos() {
  const arquivos = listarArquivos();

  const conteudos = arquivos
    .map((nomeArquivo) => {
      const ordem = extrairOrdemDoNome(nomeArquivo);
      if (ordem === null) return null;

      try {
        const html = fs.readFileSync(path.join(CONTEUDO_DIR, nomeArquivo), 'utf8');
        const body = extrairBody(html);
        const fallback = path.basename(nomeArquivo, '.html');
        return { ordem, titulo: extrairTitulo(body, fallback) };
      } catch (err) {
        logger.error(`Erro ao ler conteúdo de aula (${nomeArquivo}):`, err);
        return null;
      }
    })
    .filter(Boolean);

  conteudos.sort((a, b) => a.ordem - b.ordem);
  return conteudos;
}

function getConteudoPorOrdem(ordem) {
  const arquivos = listarArquivos();
  const nomeArquivo = arquivos.find((nome) => extrairOrdemDoNome(nome) === Number(ordem));
  if (!nomeArquivo) return null;

  try {
    const html = fs.readFileSync(path.join(CONTEUDO_DIR, nomeArquivo), 'utf8');
    const body = extrairBody(html);
    const fallback = path.basename(nomeArquivo, '.html');
    return { ordem: Number(ordem), titulo: extrairTitulo(body, fallback), conteudoHtml: body };
  } catch (err) {
    logger.error(`Erro ao ler conteúdo de aula (${nomeArquivo}):`, err);
    return null;
  }
}

module.exports = {
  listarConteudos,
  getConteudoPorOrdem,
};
