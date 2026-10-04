require('../env');
const { describe, test, after } = require('node:test');
const assert = require('node:assert/strict');
const { chaveLogin } = require('../../src/middleware/limites');
const { pool } = require('../../src/db/pool');

after(() => pool.end());

describe('chaveLogin', () => {
  const req = (ip, body) => ({ ip, body });

  test('junta IP e conta, sem diferenciar maiúsculas', () => {
    assert.equal(chaveLogin(req('10.0.0.1', { identificador: 'Ana' })), '10.0.0.1|ana');
    assert.equal(
      chaveLogin(req('10.0.0.1', { identificador: 'ANA@X.COM' })),
      chaveLogin(req('10.0.0.1', { identificador: 'ana@x.com' })),
    );
  });

  test('outra conta ou outro IP é outra chave', () => {
    const base = chaveLogin(req('10.0.0.1', { identificador: 'ana' }));
    assert.notEqual(chaveLogin(req('10.0.0.1', { identificador: 'bia' })), base);
    assert.notEqual(chaveLogin(req('10.0.0.2', { identificador: 'ana' })), base);
  });

  test('IPv6 conta pela sub-rede /56: trocar de endereço na mesma rede não zera o limite', () => {
    assert.equal(
      chaveLogin(req('2001:db8:0:1::1', { identificador: 'ana' })),
      chaveLogin(req('2001:db8:0:2::9', { identificador: 'ana' })),
    );
  });

  test('corpo ausente ou identificador estranho não quebra (a validação responde 400 depois)', () => {
    assert.equal(chaveLogin(req('10.0.0.1', undefined)), '10.0.0.1|');
    assert.equal(chaveLogin(req('10.0.0.1', { identificador: 42 })), '10.0.0.1|42');
  });
});

describe('pool', () => {
  test('até 20 conexões e 5 s de espera por uma livre', () => {
    assert.equal(pool.options.max, 20);
    assert.equal(pool.options.connectionTimeoutMillis, 5000);
  });
});
