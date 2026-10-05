require('../env');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { VISOES, paraCsv } = require('../../src/modulos/admin/pesquisa');

describe('VISOES', () => {
  test('cada id aponta para uma visão pesquisa_* (o nome entra direto no SQL)', () => {
    for (const [id, { visao, titulo, descricao }] of Object.entries(VISOES)) {
      assert.match(id, /^[a-z-]+$/);
      assert.match(visao, /^pesquisa_[a-z_]+$/);
      assert.ok(titulo && descricao, id);
    }
    assert.equal(new Set(Object.values(VISOES).map((v) => v.visao)).size, Object.keys(VISOES).length);
  });

  test('exporta as conquistas e as sessões, nunca a visão interna de fim das sessões', () => {
    assert.equal(VISOES.badges.visao, 'pesquisa_badges');
    assert.equal(VISOES.sessoes.visao, 'pesquisa_sessoes');
    assert.ok(!Object.values(VISOES).some((v) => v.visao.includes('sessoes_app')));
  });
});

describe('lerVisao', () => {
  test('aumenta o statement_timeout só na própria transação, antes de ler a visão', async (t) => {
    const { pool } = require('../../src/db/pool');
    const { lerVisao } = require('../../src/modulos/admin/pesquisa');
    const comandos = [];
    const cliente = {
      on() {},
      off() {},
      release() {},
      query: async (sql) => {
        comandos.push(typeof sql === 'string' ? sql : sql.text);
        return { rows: [], fields: [] };
      },
    };
    t.mock.method(pool, 'connect', async () => cliente);
    await lerVisao('pesquisa_eventos');
    assert.deepEqual(comandos, [
      'BEGIN',
      "SET LOCAL statement_timeout = '60s'",
      "SELECT set_config('app.pesquisa_segredo', $1, true)",
      'SELECT * FROM pesquisa_eventos',
      'COMMIT',
    ]);
  });
});

describe('paraCsv com fim_estimado', () => {
  test('booleanos viram true/false; fim ausente vira célula vazia', () => {
    assert.equal(
      paraCsv(
        ['duracao_s', 'fim_estimado'],
        [
          { duracao_s: '300', fim_estimado: true },
          { duracao_s: '600', fim_estimado: false },
          { duracao_s: null, fim_estimado: null },
        ],
      ),
      'duracao_s,fim_estimado\r\n300,true\r\n600,false\r\n,\r\n',
    );
  });
});
