// Migration já aplicada nunca é editada (o migrar.js só olha o nome e não reaplicaria a mudança):
// qualquer correção vai numa migration nova. Ao criar uma, acrescente o sha256 dela aqui.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PASTA = path.join(__dirname, '..', '..', 'src', 'db', 'migrations');

const HASHES = {
  '001_schema_inicial.sql': '7c5e045d57e58757aae3ae2249e3f39b7f0b237e266f732536108fda906bab7d',
  '002_aulas_arquivo_e_pesquisa.sql': '55897d8a4cdff23621a99f507f58f44f7c3f2da947c15a44a47cd3db09f4198f',
  '003_aulas_lgpd_substituidas.sql': '1ae07f26e116167aa94d9b188e18dd8b64cfb00126430848714dbb605122e185',
  '004_mais_conquistas.sql': '296bfc0b8c96f6df205e96f33944d2a64dc2138b87c4c3599e985b87eb4336ac',
  '005_pesquisa_fim_sessao_e_badges.sql': 'cb66e5059ff6aa0c520e22ee81a7d176aef89ab7bbc5dcccb5d3726a472a3672',
  '006_respostas_alternativa.sql': 'b3ec797144460435a1dd961b639c9d42e4ec3e3e6311b4d5ff89a14c1ab57582',
  '007_badges_nome_unico.sql': 'bf78a40d0da90e127b125b15da57853ca36dbf2d57074a2cb1dc9c782ae2374a',
};

describe('migrations', () => {
  const arquivos = fs
    .readdirSync(PASTA)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  test('nenhuma migration já aplicada foi editada', () => {
    for (const [nome, esperado] of Object.entries(HASHES)) {
      const atual = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(PASTA, nome)))
        .digest('hex');
      assert.equal(atual, esperado, `${nome} mudou: crie uma migration nova em vez de editar esta`);
    }
  });

  test('toda migration da pasta está na lista (migration nova entra aqui com o hash)', () => {
    assert.deepEqual(arquivos, Object.keys(HASHES).sort());
  });

  test('nomes em ordem com 3 dígitos, sem número repetido', () => {
    const numeros = arquivos.map((f) => f.match(/^(\d{3})_[a-z0-9_]+\.sql$/)?.[1]);
    assert.ok(numeros.every(Boolean), arquivos.join(', '));
    assert.equal(new Set(numeros).size, numeros.length);
  });
});
