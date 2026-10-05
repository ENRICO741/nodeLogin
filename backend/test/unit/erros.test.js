require('../env');
const { describe, test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const erros = require('../../src/lib/erros');
const { tratarErros } = require('../../src/middleware/tratarErros');

function respostaFalsa() {
  const res = { statusCode: null, corpo: null };
  res.status = (s) => ((res.statusCode = s), res);
  res.json = (c) => ((res.corpo = c), res);
  return res;
}
const req = { method: 'GET', originalUrl: '/api/x', id: 'req-1' };
const tratar = (erro) => {
  const res = respostaFalsa();
  tratarErros(erro, req, res, () => {});
  return res;
};

afterEach(() => mock.restoreAll());

describe('lib/erros', () => {
  test('HttpError guarda status, código, mensagem e detalhes', () => {
    const e = new erros.HttpError(418, 'CHA', 'Sou um bule', [{ campo: 'x' }]);
    assert.ok(e instanceof Error);
    assert.equal(e.status, 418);
    assert.equal(e.codigo, 'CHA');
    assert.equal(e.message, 'Sou um bule');
    assert.deepEqual(e.detalhes, [{ campo: 'x' }]);
  });

  test('helpers usam status e mensagens padrão', () => {
    assert.equal(erros.naoAutenticado().status, 401);
    assert.equal(erros.naoAutenticado().message, 'Faça login para continuar');
    assert.equal(erros.proibido().status, 403);
    assert.equal(erros.naoEncontrado().status, 404);
    assert.equal(erros.naoEncontrado().message, 'Recurso não encontrado');
    const c = erros.conflito('DUP', 'Duplicado');
    assert.equal(c.status, 409);
    assert.equal(c.codigo, 'DUP');
  });

  test('helpers aceitam mensagem personalizada', () => {
    assert.equal(erros.naoAutenticado('x').message, 'x');
    assert.equal(erros.proibido('y').message, 'y');
    assert.equal(erros.naoEncontrado('z').message, 'z');
  });
});

describe('middleware tratarErros', () => {
  test('HttpError vira resposta com o status e código dele', () => {
    const res = tratar(erros.conflito('JA_RESPONDIDA', 'Já respondida'));
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.corpo, { erro: { codigo: 'JA_RESPONDIDA', mensagem: 'Já respondida' } });
  });

  test('HttpError com detalhes inclui detalhes', () => {
    const res = tratar(new erros.HttpError(400, 'X', 'Y', [1]));
    assert.deepEqual(res.corpo.erro.detalhes, [1]);
  });

  test('ZodError vira 400 com um detalhe por campo', () => {
    const r = z.object({ a: z.string(), b: z.object({ c: z.number() }) }).safeParse({ b: { c: 'x' } });
    const res = tratar(r.error);
    assert.equal(res.statusCode, 400);
    assert.equal(res.corpo.erro.codigo, 'VALIDACAO');
    assert.deepEqual(
      res.corpo.erro.detalhes.map((d) => d.campo),
      ['a', 'b.c'],
    );
  });

  test('ZodError na raiz (corpo ausente) tem campo vazio', () => {
    const res = tratar(z.object({}).safeParse(undefined).error);
    assert.equal(res.corpo.erro.detalhes[0].campo, '');
  });

  test('JSON malformado vira 400', () => {
    const res = tratar(Object.assign(new SyntaxError('x'), { type: 'entity.parse.failed' }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.corpo.erro.codigo, 'JSON_INVALIDO');
  });

  test('corpo grande demais vira 413', () => {
    const res = tratar(Object.assign(new Error('x'), { type: 'entity.too.large' }));
    assert.equal(res.statusCode, 413);
  });

  test('violação de FK vira 400 REFERENCIA_INVALIDA', () => {
    const res = tratar(Object.assign(new Error('fk'), { code: '23503' }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.corpo.erro.codigo, 'REFERENCIA_INVALIDA');
  });

  test('violação de unicidade conhecida usa mensagem específica', () => {
    const casos = {
      usuarios_apelido_uk: 'Este apelido já está em uso',
      usuarios_email_uk: 'Este e-mail já está cadastrado',
      aulas_ordem_key: 'Já existe uma aula com essa ordem',
    };
    for (const [constraint, mensagem] of Object.entries(casos)) {
      const res = tratar(Object.assign(new Error('dup'), { code: '23505', constraint }));
      assert.equal(res.statusCode, 409);
      assert.equal(res.corpo.erro.mensagem, mensagem);
    }
  });

  test('NUL em texto (pg 22021) vira 400 VALIDACAO', () => {
    const res = tratar(
      Object.assign(new Error('invalid byte sequence for encoding "UTF8": 0x00'), { code: '22021' }),
    );
    assert.equal(res.statusCode, 400);
    assert.equal(res.corpo.erro.codigo, 'VALIDACAO');
    assert.doesNotMatch(JSON.stringify(res.corpo), /0x00/);
  });

  test('outro erro 4xx exposto (body-parser) mantém o status com mensagem genérica, sem log', () => {
    const erroLog = mock.method(console, 'error', () => {});
    const res = tratar(
      Object.assign(new Error('unsupported charset "LATIN-9"'), {
        expose: true,
        status: 415,
        type: 'charset.unsupported',
      }),
    );
    assert.equal(res.statusCode, 415);
    assert.deepEqual(res.corpo, { erro: { codigo: 'REQUISICAO_INVALIDA', mensagem: 'Requisição inválida' } });
    assert.equal(erroLog.mock.callCount(), 0);
  });

  test('erro 5xx ou não exposto continua 500', () => {
    mock.method(console, 'error', () => {});
    assert.equal(tratar(Object.assign(new Error('x'), { expose: true, status: 503 })).statusCode, 500);
    assert.equal(tratar(Object.assign(new Error('x'), { expose: false, status: 400 })).statusCode, 500);
  });

  test('violação de unicidade desconhecida usa mensagem genérica', () => {
    const res = tratar(Object.assign(new Error('dup'), { code: '23505', constraint: 'outra' }));
    assert.equal(res.corpo.erro.mensagem, 'Registro já existe');
  });

  test('erro inesperado vira 500 sem vazar detalhes e é logado', () => {
    const erroLog = mock.method(console, 'error', () => {});
    const res = tratar(new Error('senha do banco: 123'));
    assert.equal(res.statusCode, 500);
    assert.equal(res.corpo.erro.codigo, 'ERRO_INTERNO');
    assert.doesNotMatch(JSON.stringify(res.corpo), /senha do banco/);
    assert.equal(erroLog.mock.callCount(), 1);
    const linha = JSON.parse(erroLog.mock.calls[0].arguments[0]);
    assert.equal(linha.req_id, 'req-1');
    assert.match(linha.erro, /senha do banco/);
  });
});
