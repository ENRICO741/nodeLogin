// Lê as aulas de conteudo/aulas/<NN-slug>/aula.html, valida e grava no banco (formato em conteudo/README.md).
// Não depende do banco para ler/validar: `lerAulas` roda sozinho na CI (npm run importar-aulas -- --validar).
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('node-html-parser');
const { limparHtml } = require('../../lib/html');

const PASTA_VALIDA = /^(\d{1,3})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const CHAVE_VALIDA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXTENSOES_IMAGEM = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const PONTOS_PADRAO = 10;
const BONUS_PADRAO = 20;
const LETRAS = ['a', 'b', 'c', 'd'];

const inteiro = (valor, padrao) =>
  valor === undefined ? padrao : /^\d+$/.test(valor.trim()) ? Number(valor) : NaN;

// Confere a imagem (alt, caminho relativo dentro da pasta, arquivo existe) e devolve a URL pública.
function urlDaImagem(img, pastaAula, nomePasta, erros, onde) {
  const src = img.getAttribute('src') ?? '';
  if (!img.hasAttribute('alt'))
    erros.push(`${onde}: imagem "${src}" sem atributo alt (use alt="" se for decorativa)`);
  if (/^[a-z]+:|^\/\//i.test(src) || src.startsWith('/')) {
    erros.push(`${onde}: imagem "${src}" deve ser um arquivo da pasta da aula (ex.: imagens/foto.png)`);
    return null;
  }
  const arquivo = path.resolve(pastaAula, src);
  if (!arquivo.startsWith(pastaAula + path.sep)) {
    erros.push(`${onde}: imagem "${src}" aponta para fora da pasta da aula`);
    return null;
  }
  if (!EXTENSOES_IMAGEM.has(path.extname(arquivo).toLowerCase())) {
    erros.push(`${onde}: imagem "${src}" tem formato não suportado (use png, jpg, webp, gif ou svg)`);
  } else if (!fs.existsSync(arquivo)) {
    erros.push(`${onde}: imagem "${src}" não encontrada`);
  }
  return `/api/conteudo/aulas/${nomePasta}/${src.split(path.sep).join('/').replace(/^\.\//, '')}`;
}

function lerPergunta(el, i, contexto) {
  const { erros, onde, pastaAula, nomePasta } = contexto;
  const chave = (el.getAttribute('data-pergunta') ?? '').trim();
  const aqui = `${onde}: pergunta ${chave ? `"${chave}"` : `nº ${i + 1}`}`;
  if (!CHAVE_VALIDA.test(chave)) {
    erros.push(
      `${aqui}: data-pergunta deve ter só letras minúsculas, números e hífen (ex.: "remetente-falso")`,
    );
  }

  const pontos = inteiro(el.getAttribute('data-pontos'), PONTOS_PADRAO);
  if (!(pontos >= 0 && pontos <= 100)) erros.push(`${aqui}: data-pontos deve ser um inteiro de 0 a 100`);

  const enunciado = el.querySelector('[data-enunciado]')?.text.trim();
  if (!enunciado) erros.push(`${aqui}: falta o enunciado (<p data-enunciado>)`);

  const itens = el.querySelectorAll('ol > li');
  if (itens.length !== 4)
    erros.push(`${aqui}: precisa de exatamente 4 alternativas em <ol>, tem ${itens.length}`);
  const corretas = itens
    .map((li, idx) => (li.hasAttribute('data-correta') ? idx : -1))
    .filter((idx) => idx >= 0);
  if (corretas.length !== 1) {
    erros.push(`${aqui}: precisa de exatamente 1 alternativa com data-correta, tem ${corretas.length}`);
  }
  itens.forEach((li, idx) => {
    if (!li.text.trim()) erros.push(`${aqui}: alternativa ${LETRAS[idx]?.toUpperCase() ?? idx + 1} vazia`);
  });

  const img = el.querySelector('img');
  return {
    chave,
    ordem: i + 1,
    enunciado,
    imagem_url: img ? urlDaImagem(img, pastaAula, nomePasta, erros, aqui) : null,
    alternativas: itens.map((li) => li.text.trim()),
    resposta_correta: LETRAS[corretas[0]],
    explicacao: el.querySelector('[data-explicacao]')?.text.trim() || null,
    pontos,
  };
}

function lerAula(pastaAula, nomePasta, erros) {
  const [, numero, slug] = nomePasta.match(PASTA_VALIDA);
  const onde = `${nomePasta}/aula.html`;
  const arquivo = path.join(pastaAula, 'aula.html');
  if (!fs.existsSync(arquivo)) {
    erros.push(`${nomePasta}: falta o arquivo aula.html`);
    return null;
  }

  const raiz = parse(fs.readFileSync(arquivo, 'utf8'));
  const titulo = raiz.querySelector('title')?.text.trim();
  if (!titulo) erros.push(`${onde}: falta o <title> com o título da aula`);
  if (titulo && titulo.length > 160) erros.push(`${onde}: título com mais de 160 caracteres`);

  const bonus = inteiro(
    raiz.querySelector('meta[name="aula:pontos-conclusao"]')?.getAttribute('content'),
    BONUS_PADRAO,
  );
  if (!(bonus >= 0 && bonus <= 1000))
    erros.push(`${onde}: aula:pontos-conclusao deve ser um inteiro de 0 a 1000`);

  const corpo = raiz.querySelector('body') ?? raiz;
  if (corpo.querySelector('h1'))
    erros.push(`${onde}: não use <h1> no conteúdo (o título vem do <title>); comece em <h2>`);

  const blocos = corpo.querySelectorAll('[data-perguntas]');
  if (blocos.length > 1) erros.push(`${onde}: use um único <section data-perguntas>`);
  const contexto = { erros, onde, pastaAula, nomePasta };
  const questoes = (blocos[0]?.querySelectorAll('[data-pergunta]') ?? []).map((el, i) =>
    lerPergunta(el, i, contexto),
  );
  blocos.forEach((b) => b.remove());

  const chaves = questoes.map((q) => q.chave).filter(Boolean);
  for (const repetida of new Set(chaves.filter((c, i) => chaves.indexOf(c) !== i))) {
    erros.push(`${onde}: data-pergunta "${repetida}" repetido`);
  }

  for (const img of corpo.querySelectorAll('img')) {
    const url = urlDaImagem(img, pastaAula, nomePasta, erros, onde);
    if (url) img.setAttribute('src', url);
  }

  const conteudo_html = limparHtml(corpo.innerHTML).trim();
  if (!conteudo_html) erros.push(`${onde}: o conteúdo da aula está vazio`);

  return {
    slug,
    ordem: Number(numero),
    pasta: nomePasta,
    titulo,
    pontos_conclusao: bonus,
    conteudo_html,
    questoes,
  };
}

// Lê e valida todas as aulas. Devolve { aulas, erros }; com qualquer erro, nada deve ser gravado.
function lerAulas(diretorio) {
  const pastaAulas = path.join(diretorio, 'aulas');
  if (!fs.existsSync(pastaAulas)) return { aulas: [], erros: [] };

  const erros = [];
  const aulas = [];
  const pastas = fs
    .readdirSync(pastaAulas, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const nome of pastas) {
    if (!PASTA_VALIDA.test(nome)) {
      erros.push(`${nome}: nome de pasta inválido; use NN-assunto em minúsculas (ex.: 04-engenharia-social)`);
      continue;
    }
    const aula = lerAula(path.resolve(pastaAulas, nome), nome, erros);
    if (aula) aulas.push(aula);
  }

  for (const campo of ['ordem', 'slug']) {
    const vistos = new Map();
    for (const aula of aulas) {
      const outra = vistos.get(aula[campo]);
      if (outra) erros.push(`${aula.pasta}: ${campo} "${aula[campo]}" repetido com ${outra}`);
      else vistos.set(aula[campo], aula.pasta);
    }
  }
  return { aulas, erros };
}

// Grava (dentro da transação `c`). Aula: upsert por slug, sem mexer em `ativo` (o admin pode ocultar).
// Questão: upsert por (aula, chave); questão que sumiu do arquivo é desativada (o histórico continua válido).
async function gravarAulas(c, aulas) {
  const resumo = { criadas: 0, atualizadas: 0, inalteradas: 0 };
  for (const aula of aulas) {
    const { rows } = await c.query(
      `INSERT INTO aulas (slug, titulo, ordem, conteudo_html, pontos_conclusao) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET
         titulo = EXCLUDED.titulo, ordem = EXCLUDED.ordem, conteudo_html = EXCLUDED.conteudo_html,
         pontos_conclusao = EXCLUDED.pontos_conclusao, atualizado_em = now()
       WHERE (aulas.titulo, aulas.ordem, aulas.conteudo_html, aulas.pontos_conclusao)
         IS DISTINCT FROM (EXCLUDED.titulo, EXCLUDED.ordem, EXCLUDED.conteudo_html, EXCLUDED.pontos_conclusao)
       RETURNING id, (xmax = 0) AS nova`,
      [aula.slug, aula.titulo, aula.ordem, aula.conteudo_html, aula.pontos_conclusao],
    );
    let aulaId = rows[0]?.id;
    let mudou = Boolean(rows[0]);
    if (rows[0]?.nova) resumo.criadas += 1;
    if (!aulaId) aulaId = (await c.query('SELECT id FROM aulas WHERE slug = $1', [aula.slug])).rows[0].id;

    for (const q of aula.questoes) {
      const { rowCount } = await c.query(
        `INSERT INTO questoes_aula (aula_id, chave, ordem, enunciado, imagem_url,
           alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta, explicacao, pontos)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (aula_id, chave) DO UPDATE SET
           ordem = EXCLUDED.ordem, enunciado = EXCLUDED.enunciado, imagem_url = EXCLUDED.imagem_url,
           alternativa_a = EXCLUDED.alternativa_a, alternativa_b = EXCLUDED.alternativa_b,
           alternativa_c = EXCLUDED.alternativa_c, alternativa_d = EXCLUDED.alternativa_d,
           resposta_correta = EXCLUDED.resposta_correta, explicacao = EXCLUDED.explicacao,
           pontos = EXCLUDED.pontos, ativo = true
         WHERE (questoes_aula.ordem, questoes_aula.enunciado, questoes_aula.imagem_url, questoes_aula.alternativa_a,
                questoes_aula.alternativa_b, questoes_aula.alternativa_c, questoes_aula.alternativa_d,
                questoes_aula.resposta_correta, questoes_aula.explicacao, questoes_aula.pontos, questoes_aula.ativo)
           IS DISTINCT FROM (EXCLUDED.ordem, EXCLUDED.enunciado, EXCLUDED.imagem_url, EXCLUDED.alternativa_a,
                EXCLUDED.alternativa_b, EXCLUDED.alternativa_c, EXCLUDED.alternativa_d,
                EXCLUDED.resposta_correta, EXCLUDED.explicacao, EXCLUDED.pontos, true)`,
        [
          aulaId,
          q.chave,
          q.ordem,
          q.enunciado,
          q.imagem_url,
          ...q.alternativas,
          q.resposta_correta,
          q.explicacao,
          q.pontos,
        ],
      );
      mudou ||= rowCount > 0;
    }
    const { rowCount: desativadas } = await c.query(
      `UPDATE questoes_aula SET ativo = false
       WHERE aula_id = $1 AND chave IS NOT NULL AND ativo AND NOT (chave = ANY($2))`,
      [aulaId, aula.questoes.map((q) => q.chave)],
    );
    mudou ||= desativadas > 0;

    if (!rows[0]?.nova) resumo[mudou ? 'atualizadas' : 'inalteradas'] += 1;
  }
  return resumo;
}

module.exports = { lerAulas, gravarAulas };
