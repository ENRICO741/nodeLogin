require('../env');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  texto,
  textoOpcional,
  nome,
  apelido,
  identificadorLogin,
  urlHttps,
  esquemaQuestao,
  esquemaResposta,
  idDaRota,
  senha,
  esquemaPapel,
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

describe('nome', () => {
  test('aceita acentos, apóstrofo, hífen e espaços internos (trim nas pontas)', () => {
    for (const valor of ['José da Conceição', "Ana D'Ávila", 'Zoë Müller-Łukasz', 'Ñandú 2º']) {
      assert.equal(nome.parse(valor), valor);
    }
    assert.equal(nome.parse('  Ana  '), 'Ana');
  });
  test('recusa quebra de linha, controle e caracteres invisíveis', () => {
    for (const valor of [
      'Ana.\n\nSua conta foi bloqueada',
      'Ana\rBia',
      'Ana\u0000',
      'Ana\u202Eetla',
      'Ana\u200BBia',
      'Ana\u2028Bia',
      'Ana\tBia',
    ]) {
      const r = nome.safeParse(valor);
      assert.equal(r.success, false, JSON.stringify(valor));
      assert.match(r.error.issues[0].message, /quebra de linha/);
    }
  });
  test('mantém os limites de 2 a 120 caracteres', () => {
    assert.throws(() => nome.parse('A'));
    assert.equal(nome.parse('Ab'), 'Ab');
    assert.equal(nome.parse('a'.repeat(120)).length, 120);
    assert.throws(() => nome.parse('a'.repeat(121)));
  });
});

describe('apelido', () => {
  const TIL = String.fromCharCode(0x303);
  test('aceita letras latinas com acento, números, ponto, hífen e _', () => {
    for (const valor of ['joão.silva', 'JOÃO_2', 'çé-ü', 'ÀÖØöøÿ', 'abc'])
      assert.equal(apelido.parse(valor), valor);
  });
  test('normaliza para NFC e faz trim', () => {
    assert.equal(apelido.parse(`  joa${TIL}o  `), 'joão');
  });
  test('recusa × ÷, letras fora do conjunto, espaço e limites', () => {
    for (const valor of ['a×b', 'a÷b', 'İsa', 'ŵal', 'a b', 'ab', 'a'.repeat(31), 'a🙂b']) {
      const r = apelido.safeParse(valor);
      assert.equal(r.success, false, valor);
      assert.equal(
        r.error.issues[0].message,
        'Use de 3 a 30 letras (acentos permitidos), números, ponto, hífen ou _',
      );
    }
  });
});

describe('identificadorLogin', () => {
  test('aceita e-mail e apelido acentuado; normaliza NFC', () => {
    assert.equal(identificadorLogin.parse(' ana@x.com '), 'ana@x.com');
    assert.equal(identificadorLogin.parse(`JOA${String.fromCharCode(0x303)}O`), 'JOÃO');
  });
  test('recusa "İ", espaço interno, vazio e acima de 254', () => {
    for (const valor of ['marİa', 'a b', '', ' ', 'a'.repeat(255)]) {
      assert.equal(identificadorLogin.safeParse(valor).success, false, valor);
    }
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

describe('senha', () => {
  const SENHA_72 = 'Ab1!' + 'x'.repeat(68);
  const SENHA_72_BYTES = 'Ab1!' + 'é'.repeat(34); // 38 caracteres, 72 bytes
  const mensagens = (s) => {
    const r = senha.safeParse(s);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };
  const INVALIDO = 'A senha não pode ter emoji nem caracteres invisíveis';
  const ESPECIAL = 'A senha precisa de um caractere especial';

  test('aceita 8 e 72 caracteres ASCII (limites exatos)', () => {
    assert.equal(senha.parse('Abcdef1!'), 'Abcdef1!');
    assert.equal(senha.parse(SENHA_72), SENHA_72);
  });
  test('recusa 7 caracteres com mensagem clara', () => {
    assert.deepEqual(mensagens('Abcde1!'), ['A senha precisa de pelo menos 8 caracteres']);
  });
  test('recusa 73 caracteres ASCII', () => {
    assert.deepEqual(mensagens(SENHA_72 + 'x'), ['Senha muito longa, considere diminuí-la um pouco']);
  });
  test('cada requisito faltando dá só a sua mensagem', () => {
    assert.deepEqual(mensagens('abcdef1!'), ['A senha precisa de uma letra maiúscula']);
    assert.deepEqual(mensagens('ABCDEF1!'), ['A senha precisa de uma letra minúscula']);
    assert.deepEqual(mensagens('Abcdefg!'), ['A senha precisa de um número']);
    assert.deepEqual(mensagens('Abcdefg1'), [ESPECIAL]);
  });
  test('vazia lista todos os requisitos, na ordem da tela', () => {
    assert.deepEqual(mensagens(''), [
      'A senha precisa de pelo menos 8 caracteres',
      'A senha precisa de uma letra maiúscula',
      'A senha precisa de uma letra minúscula',
      'A senha precisa de um número',
      ESPECIAL,
    ]);
  });
  test('emoji é apontado junto com os requisitos que faltam', () => {
    assert.deepEqual(mensagens('abcdefg🔒'), [
      'A senha precisa de uma letra maiúscula',
      'A senha precisa de um número',
      ESPECIAL,
      INVALIDO,
    ]);
  });
  test('letra acentuada conta como maiúscula e minúscula', () => {
    assert.equal(senha.parse('Ábcdef1!'), 'Ábcdef1!');
    assert.equal(senha.parse('éBCDEF1!'), 'éBCDEF1!');
    assert.equal(senha.parse('ÇÃO-ção1'), 'ÇÃO-ção1');
  });
  test('aspas, aspas simples e barra invertida são aceitas e contam como especial', () => {
    for (const c of ['"', "'", '\\']) assert.equal(senha.parse(`Abcdef1${c}`), `Abcdef1${c}`, c);
    const sql = `Ab1"'\\'; DROP TABLE usuarios; --`;
    assert.equal(senha.parse(sql), sql);
  });
  test('espaço é aceito mas não conta como especial', () => {
    assert.deepEqual(mensagens('Abcdef 1'), [ESPECIAL]);
    assert.equal(senha.parse('Abc def 1!'), 'Abc def 1!');
  });
  test('símbolos do teclado (ABNT2 inclusive) contam como especial', () => {
    for (const c of '!@#$%^&*()-_=+[]{}<>?/|;:,.~`´¨§¬¢£°€') {
      assert.equal(senha.parse(`Abcdef1${c}`), `Abcdef1${c}`, c);
    }
  });
  test('ª º ¹ ² ³ são aceitos mas não contam como especial (Unicode os trata como letra/número)', () => {
    for (const c of 'ªº¹²³') assert.deepEqual(mensagens(`Abcdef1${c}`), [ESPECIAL], c);
    // ² não conta como número: \d é só 0-9.
    assert.deepEqual(mensagens('Abcdefg²!'), ['A senha precisa de um número']);
  });
  test('recusa emoji: simples, com tom de pele, bandeira e com seletor de variação', () => {
    for (const e of ['🔒', '👍🏽', '🇧🇷', '❤️', '😀'])
      assert.deepEqual(mensagens(`Abcdef1!${e}`), [INVALIDO], e);
  });
  test('aceita símbolos de teclado que o Unicode também lista como emoji de texto (© ® ™ ❤ sem seletor)', () => {
    for (const c of '©®™❤✓★') assert.equal(senha.parse(`Abcdef1${c}`), `Abcdef1${c}`, c);
  });
  test('recusa NUL, controle e invisíveis', () => {
    for (const c of [
      '\u0000',
      '\t',
      '\n',
      '\r',
      '\u200B',
      '\u200D',
      '\u00AD',
      '\uFEFF',
      '\u202E',
      '\uD800',
      '\u2028',
      '\u2029',
    ]) {
      assert.deepEqual(mensagens(`Abcdef1!${c}`), [INVALIDO], JSON.stringify(c));
    }
  });
  test('espaços Unicode (NBSP, U+3000) passam', () => {
    for (const c of ['\u00A0', '\u3000']) {
      assert.equal(senha.parse(`Abcdef1!${c}`), `Abcdef1!${c}`, JSON.stringify(c));
    }
  });
  test('preserva espaços nas pontas e unicode (sem trim)', () => {
    assert.equal(senha.parse('  Abcdef1!  '), '  Abcdef1!  ');
    assert.equal(senha.parse('  Sénha çã-1  '), '  Sénha çã-1  ');
  });
  test('limite é de 72 bytes, não de 72 caracteres (o bcrypt corta em 72 bytes)', () => {
    assert.equal(Buffer.byteLength(SENHA_72_BYTES), 72);
    assert.equal(senha.parse(SENHA_72_BYTES), SENHA_72_BYTES);
    assert.deepEqual(mensagens(SENHA_72_BYTES + 'A'), ['Senha muito longa, considere diminuí-la um pouco']);
  });
  test('recusa tipos que não são string', () => {
    for (const valor of [12345678, null, undefined, [], {}]) {
      assert.throws(() => senha.parse(valor), String(valor));
    }
  });
});

describe('esquemaPapel', () => {
  test('aceita admin true e false sem mudar nada', () => {
    assert.deepEqual(esquemaPapel.parse({ admin: true }), { admin: true });
    assert.deepEqual(esquemaPapel.parse({ admin: false }), { admin: false });
  });
  test('recusa corpo ausente, vazio, array e admin que não é boolean', () => {
    for (const corpo of [undefined, {}, [], { admin: 'true' }, { admin: 1 }, { admin: null }]) {
      assert.throws(() => esquemaPapel.parse(corpo), JSON.stringify(corpo));
    }
  });
  test('é estrito: campo extra é recusado, não descartado', () => {
    const r = esquemaPapel.safeParse({ admin: true, papel: 'admin' });
    assert.equal(r.success, false);
    assert.equal(r.error.issues[0].code, 'unrecognized_keys');
    assert.deepEqual(r.error.issues[0].keys, ['papel']);
  });
});
