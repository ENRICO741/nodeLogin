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

describe('transacao (cliente falso)', () => {
  const { EventEmitter } = require('node:events');
  const { transacao } = require('../../src/db/pool');

  function clienteFalso(falhar) {
    const cliente = new EventEmitter();
    cliente.comandos = [];
    cliente.query = async (sql) => {
      cliente.comandos.push(sql);
      if (falhar[sql]) throw falhar[sql];
      return { rows: [] };
    };
    cliente.release = () => {
      cliente.liberado = true;
      // Listener removido antes de devolver ao pool (lá o pool põe o dele).
      cliente.listenersNoRelease = cliente.listenerCount('error');
    };
    return cliente;
  }

  test('ROLLBACK que falha: loga e rejeita com o erro original', async (t) => {
    const original = new Error('erro original');
    const cliente = clienteFalso({ ROLLBACK: new Error('Connection terminated') });
    t.mock.method(pool, 'connect', async () => cliente);
    const log = t.mock.method(console, 'error', () => {});
    await assert.rejects(
      transacao(async () => {
        throw original;
      }),
      (erro) => erro === original,
    );
    assert.deepEqual(cliente.comandos, ['BEGIN', 'ROLLBACK']);
    assert.ok(log.mock.calls.some((c) => String(c.arguments[0]).includes('falha no ROLLBACK')));
    assert.equal(cliente.liberado, true);
    assert.equal(cliente.listenersNoRelease, 0);
  });

  test("'error' emitido durante a transação é logado em vez de derrubar o processo", async (t) => {
    const cliente = clienteFalso({});
    t.mock.method(pool, 'connect', async () => cliente);
    const log = t.mock.method(console, 'error', () => {});
    const r = await transacao(async (c) => {
      c.emit('error', new Error('socket caiu'));
      return 'ok';
    });
    assert.equal(r, 'ok');
    assert.ok(log.mock.calls.some((c) => String(c.arguments[0]).includes('caiu durante uma transação')));
    assert.deepEqual(cliente.comandos, ['BEGIN', 'COMMIT']);
    assert.equal(cliente.listenersNoRelease, 0);
  });

  test('sucesso: BEGIN, COMMIT, sem ROLLBACK', async (t) => {
    const cliente = clienteFalso({});
    t.mock.method(pool, 'connect', async () => cliente);
    assert.equal(await transacao(async () => 42), 42);
    assert.deepEqual(cliente.comandos, ['BEGIN', 'COMMIT']);
  });
});
