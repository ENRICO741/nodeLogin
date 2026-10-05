// Regras puras do questionário da pesquisa (a validação que vale é a da API; esta só guia a pessoa).

export const atende = (se, respostas) => !se || respostas[se.item] === se.igual;

export const blocosVisiveis = (definicao, respostas) =>
  definicao.blocos.filter((b) => atende(b.se, respostas));

// Itens do bloco na ordem sorteada (ordem[bloco.id]) ou na original, só os visíveis.
// Item que não está na ordem salva (rascunho antigo) entra no fim, para nunca sumir.
export function itensDoBloco(bloco, respostas, ordem = {}) {
  const porCodigo = Object.fromEntries(bloco.itens.map((it) => [it.codigo, it]));
  const codigos = new Set([...(ordem[bloco.id] ?? []), ...Object.keys(porCodigo)]);
  return [...codigos].map((c) => porCodigo[c]).filter((it) => it && atende(it.se, respostas));
}

// Fisher-Yates nos blocos aleatórios; itens 'meio' (verificação de atenção) vão para o meio dos demais.
export function sortearOrdem(definicao, aleatorio = Math.random) {
  const ordem = {};
  for (const bloco of definicao.blocos.filter((b) => b.aleatorio)) {
    const demais = bloco.itens.filter((it) => !it.meio).map((it) => it.codigo);
    for (let i = demais.length - 1; i > 0; i--) {
      const j = Math.floor(aleatorio() * (i + 1));
      [demais[i], demais[j]] = [demais[j], demais[i]];
    }
    const meio = bloco.itens.filter((it) => it.meio).map((it) => it.codigo);
    demais.splice(Math.floor(demais.length / 2), 0, ...meio);
    ordem[bloco.id] = demais;
  }
  return ordem;
}

const respondido = (valor) =>
  Array.isArray(valor) ? valor.length > 0 : typeof valor === 'string' ? valor.trim() !== '' : valor != null;

export const faltantes = (itens, respostas) =>
  itens.filter((it) => !it.opcional && !respondido(respostas[it.codigo])).map((it) => it.codigo);

// Marcar a opção exclusiva ("Nenhuma") desmarca as outras, e vice-versa.
export function alternarMultipla(item, atual = [], indice, marcado) {
  if (!marcado) return atual.filter((v) => v !== indice);
  if (indice === item.exclusiva) return [indice];
  return [...atual.filter((v) => v !== item.exclusiva), indice].sort((a, b) => a - b);
}

// Itens visíveis de todos os blocos visíveis, na ordem exibida.
export const itensVisiveis = (definicao, respostas, ordem) =>
  blocosVisiveis(definicao, respostas).flatMap((b) => itensDoBloco(b, respostas, ordem));

// Corpo do POST: só itens visíveis e respondidos (texto sem espaços nas pontas).
export function montarEnvio(definicao, respostas) {
  const limpas = {};
  for (const { codigo } of itensVisiveis(definicao, respostas)) {
    const valor = typeof respostas[codigo] === 'string' ? respostas[codigo].trim() : respostas[codigo];
    if (respondido(valor)) limpas[codigo] = valor;
  }
  return { respostas: limpas };
}

// Caracteres como a API conta (code points, sem espaços nas pontas): emoji vale 1, não 2 como no .length.
export const caracteres = (texto) => (typeof texto === 'string' ? [...texto.trim()].length : 0);

// Abertas acima do limite: bloqueiam o avanço antes de chegar à API.
export const excedidos = (itens, respostas) =>
  itens.filter((it) => it.max && caracteres(respostas[it.codigo]) > it.max).map((it) => it.codigo);

const DIA = 86_400_000;
const SP = { timeZone: 'America/Sao_Paulo' };
const diaSP = (ms) => new Date(ms).toLocaleDateString('pt-BR', { ...SP, day: '2-digit', month: '2-digit' });

// Prazo do pós no card. Com mais de 24h: o último dia inteiro (dd/mm, fuso de SP), o dia anterior a
// pos_fecha_em, o primeiro instante já fechado. Pelo dia 28 ele cai na hora do envio do pré (ex.: 14h37):
// mostrar esse dia faria quem abre à noite receber 410. No fim da pesquisa (00:00) dá o próprio último dia.
// Com menos de 24h: a hora do último minuto aceito (fecha 00:00 → "23:59"), hoje ou amanhã.
export function prazoPos(fechaEm, agora = Date.now()) {
  const fecha = Date.parse(fechaEm);
  if (fecha <= agora || fecha - agora >= DIA) return `Disponível até ${diaSP(fecha - DIA)}`;
  const ultimo = fecha - 1;
  const hora = new Date(ultimo).toLocaleTimeString('pt-BR', { ...SP, hour: '2-digit', minute: '2-digit' });
  return `Disponível ${diaSP(ultimo) === diaSP(agora) ? 'hoje' : 'amanhã'} até ${hora}`;
}
