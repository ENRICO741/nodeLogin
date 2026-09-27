require('../env');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  texto,
  textoOpcional,
  urlHttps,
  esquemaQuestao,
  esquemaResposta,
  idDaRota,
} = require('../../src/lib/validacao');

const UUID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
const questaoValida = {
  enunciado: 'O que fazer com um e-mail suspeito?',
  alternativa_a: 'Abrir o anexo',
  alternativa_b: 'Reportar',
  alternativa_c: 'Encaminhar',
  alternativa_d: 'Responder',
  resposta_correta: 'b',
  pontos: 10,
};

describe('texto', () => {
  test('aceita texto dentro dos limites e remove espaços das pontas', () => {
    assert.equal(texto(2, 5).parse('  abc  '), 'abc');
  });
  test('recusa texto curto demais depois do trim', () => {
    assert.throws(() => texto(2, 5).parse('  a  '));
  });
  test('recusa texto longo demais', () => {
    assert.throws(() => texto(1, 3).parse('abcd'));
  });
  test('aceita exatamente os limites', () => {
    assert.equal(texto(1, 3).parse('a'), 'a');
    assert.equal(texto(1, 3).parse('abc'), 'abc');
  });
  test('recusa tipos que não são string', () => {
    for (const valor of [123, null, undefined, {}, []]) assert.throws(() => texto(1, 3).parse(valor));
  });
});

describe('textoOpcional', () => {
  const esquema = textoOpcional(5);
  test('texto vazio ou só espaços vira null', () => {
    assert.equal(esquema.parse(''), null);
    assert.equal(esquema.parse('   '), null);
  });
  test('null e undefined passam como estão', () => {
    assert.equal(esquema.parse(null), null);
    assert.equal(esquema.parse(undefined), undefined);
  });
  test('texto normal é mantido (com trim)', () => {
    assert.equal(esquema.parse(' oi '), 'oi');
  });
  test('recusa acima do máximo', () => {
    assert.throws(() => esquema.parse('123456'));
  });
});

describe('urlHttps', () => {
  test('aceita https', () => {
    assert.equal(urlHttps.parse('https://exemplo.com/a.png'), 'https://exemplo.com/a.png');
  });
  test('recusa http, javascript:, data: e texto solto', () => {
    for (const url of [
      'http://exemplo.com',
      'javascript:alert(1)',
      'data:image/png;base64,AA',
      'exemplo.com',
    ]) {
      assert.throws(() => urlHttps.parse(url), url);
    }
  });
  test('mensagem de erro orienta a usar https', () => {
    const r = urlHttps.safeParse('http://x.com');
    assert.equal(r.error.issues[0].message, 'Use uma URL https://');
  });
  test('recusa URL acima de 2000 caracteres', () => {
    assert.throws(() => urlHttps.parse(`https://x.com/${'a'.repeat(2000)}`));
  });
});

describe('esquemaQuestao', () => {
  test('aceita questão completa e mínima', () => {
    assert.deepEqual(esquemaQuestao.parse(questaoValida), questaoValida);
  });
  test('aceita campos opcionais preenchidos', () => {
    const q = esquemaQuestao.parse({
      ...questaoValida,
      imagem_url: 'https://x.com/a.png',
      explicacao: 'Porque sim',
      ativo: false,
    });
    assert.equal(q.ativo, false);
    assert.equal(q.explicacao, 'Porque sim');
  });
  test('descarta campos desconhecidos', () => {
    const q = esquemaQuestao.parse({ ...questaoValida, id: 'x', aula_id: 'y' });
    assert.equal(q.id, undefined);
    assert.equal(q.aula_id, undefined);
  });
  test('recusa resposta_correta fora de a-d (inclusive maiúscula)', () => {
    for (const r of ['e', 'A', '', 'ab']) {
      assert.throws(() => esquemaQuestao.parse({ ...questaoValida, resposta_correta: r }), r);
    }
  });
  test('recusa pontos negativos, acima de 100, fracionários ou em texto', () => {
    for (const pontos of [-1, 101, 1.5, '10']) {
      assert.throws(() => esquemaQuestao.parse({ ...questaoValida, pontos }), String(pontos));
    }
  });
  test('aceita pontos nos limites 0 e 100', () => {
    assert.equal(esquemaQuestao.parse({ ...questaoValida, pontos: 0 }).pontos, 0);
    assert.equal(esquemaQuestao.parse({ ...questaoValida, pontos: 100 }).pontos, 100);
  });
  test('recusa quando falta uma alternativa', () => {
    const { alternativa_c: _c, ...semC } = questaoValida;
    const r = esquemaQuestao.safeParse(semC);
    assert.equal(r.success, false);
    assert.deepEqual(r.error.issues[0].path, ['alternativa_c']);
  });
  test('recusa imagem http', () => {
    assert.throws(() => esquemaQuestao.parse({ ...questaoValida, imagem_url: 'http://x.com/a.png' }));
  });
  test('partial aceita objeto vazio (PATCH sem mudanças)', () => {
    assert.deepEqual(esquemaQuestao.partial().parse({}), {});
  });
});

describe('esquemaResposta', () => {
  test('aceita uuid e alternativa válida', () => {
    assert.deepEqual(esquemaResposta.parse({ questao_id: UUID, alternativa: 'c' }), {
      questao_id: UUID,
      alternativa: 'c',
    });
  });
  test('recusa id que não é uuid', () => {
    assert.throws(() => esquemaResposta.parse({ questao_id: '1', alternativa: 'a' }));
  });
  test('recusa alternativa inválida ou ausente', () => {
    assert.throws(() => esquemaResposta.parse({ questao_id: UUID, alternativa: 'z' }));
    assert.throws(() => esquemaResposta.parse({ questao_id: UUID }));
  });
  test('recusa corpo ausente', () => {
    assert.throws(() => esquemaResposta.parse(undefined));
  });
});

describe('idDaRota', () => {
  test('devolve o uuid do parâmetro', () => {
    assert.equal(idDaRota({ params: { id: UUID } }), UUID);
  });
  test('recusa id numérico, vazio ou com SQL', () => {
    for (const id of ['1', '', "1' OR '1'='1", `${UUID}x`]) {
      assert.throws(
        () => idDaRota({ params: { id } }),
        (e) => e.issues[0].message === 'Identificador inválido',
      );
    }
  });
});
