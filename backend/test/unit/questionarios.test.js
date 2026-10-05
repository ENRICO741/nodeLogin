require('../env');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const DEFINICOES = require('../../src/modulos/questionarios/definicao');
const {
  resolver,
  validarRespostas,
  participa,
  exigirPre,
  situacao,
  obterDefinicao,
} = require('../../src/modulos/questionarios/service');

const itens = (def) => def.blocos.flatMap((b) => b.itens);
const codigos = (def) => itens(def).map((i) => i.codigo);

// Respostas válidas para todos os itens visíveis (escala = 1, opção = 0, múltipla = [0], aberta = texto).
function respostasValidas(def, extra = {}) {
  const r = {};
  for (const b of def.blocos) {
    for (const i of b.itens) {
      if (i.aberta) r[i.codigo] = 'Gostei';
      else if (i.multipla) r[i.codigo] = [0];
      else if (i.opcoes) r[i.codigo] = 0;
      else r[i.codigo] = i.codigo === 'ATN' ? 1 : 4;
    }
  }
  return { ...r, ...extra };
}

// Captura o 400 e devolve os detalhes { campo: mensagem }.
function errosDe(def, corpo) {
  try {
    validarRespostas(def, corpo);
  } catch (erro) {
    assert.equal(erro.status, 400);
    assert.equal(erro.codigo, 'VALIDACAO');
    return Object.fromEntries(erro.detalhes.map((d) => [d.campo, d.mensagem]));
  }
  assert.fail('deveria recusar');
}

const pre = DEFINICOES.pre;
const pos = resolver(DEFINICOES.pos, { C1: 0 });

describe('definição dos questionários', () => {
  test('pré com 40 itens e pós com 32 (com o bloco de comparação), códigos únicos', () => {
    assert.equal(itens(pre).length, 40);
    assert.equal(itens(pos).length, 32);
    for (const def of [pre, pos]) assert.equal(new Set(codigos(def)).size, codigos(def).length, def.tipo);
  });

  test('blocos e itens na ordem de docs/questionario-pesquisa.txt (ABR2 antes de ABR1)', () => {
    const UES = ['FA1', 'FA2', 'FA3', 'PU1_R', 'PU2_R', 'PU3_R', 'AE1', 'AE2', 'AE3', 'RW1', 'RW2', 'RW3'];
    const K = ['K1_R', 'K2_R', 'K3_R', 'K4_R', 'K5_R', 'K6', 'K7'];
    const porBloco = (def) => def.blocos.map((b) => b.itens.map((i) => i.codigo));
    assert.deepEqual(porBloco(pre), [
      ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'],
      ['C1', 'C2', 'C3', 'C4'],
      UES,
      K,
      ['HXP1', 'HXP4', 'HXS2', 'HXS4', 'HXA2', 'ATN', 'HXA4', 'HXR2', 'HXR4', 'HXF1', 'HXF3'],
    ]);
    assert.deepEqual(porBloco(pos), [
      UES,
      ['GAM1', 'GAM2', 'GAM3', 'GAM4', 'ATN', 'GAM5', 'GAM6_R', 'EXT', 'APR1'],
      ['MOT'],
      K,
      ['CMP'],
      ['ABR2', 'ABR1'],
    ]);
    // Texto e ordem de cada escolha, copiados do .txt: o valor exportado é o índice da opção.
    const opcoes = Object.fromEntries(
      [...itens(pre), ...itens(pos)].filter((i) => i.opcoes).map((i) => [i.codigo, i.opcoes]),
    );
    assert.deepEqual(opcoes, {
      A1: ['18–24', '25–34', '35–44', '45–54', '55 ou mais'],
      A2: ['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'],
      A3: [
        'Até o ensino médio (completo ou não)',
        'Superior incompleto',
        'Superior completo',
        'Pós-graduação',
      ],
      A4: [
        'Administrativo',
        'Financeiro ou contábil',
        'Recursos humanos',
        'Comercial ou vendas',
        'Marketing ou comunicação',
        'Jurídico',
        'Atendimento ao cliente',
        'Operações ou logística',
        'Outra',
      ],
      A5: [
        'Nunca',
        'Raramente (menos de 1 vez por mês)',
        'Algumas vezes por mês',
        'Algumas vezes por semana',
        'Todos os dias',
      ],
      A6: [
        'Duolingo',
        'Kahoot!',
        'Quizizz',
        'Khan Academy',
        'Treinamento da empresa com pontos, medalhas ou ranking',
        'Outra',
        'Nenhuma',
      ],
      C1: ['Sim', 'Não', 'Não lembro'],
      C2: ['Menos de 6 meses', 'Entre 6 meses e 1 ano', 'Entre 1 e 2 anos', 'Mais de 2 anos', 'Não lembro'],
      C3: [
        'Vídeo ou curso online',
        'Palestra ou aula presencial',
        'Material para leitura',
        'Simulação de e-mail falso (phishing)',
        'Jogo ou quiz com pontos ou ranking',
        'Outro',
      ],
      C4: ['Sim', 'Não', 'Não lembro'],
      MOT: ['Pontos', 'Conquistas', 'Ranking', 'Trivia', 'Explicações depois das respostas', 'Nenhum deles'],
      CMP: ['Muito pior', 'Pior', 'Igual', 'Melhor', 'Muito melhor', 'Não lembro o suficiente para comparar'],
    });
    assert.deepEqual(
      itens(pre).find((i) => i.codigo === 'K1_R'),
      itens(pos).find((i) => i.codigo === 'K1_R'),
    );
  });

  test('condições: C2–C4 e a UES do pré dependem de C1 = Sim; CMP do pós depende do pré', () => {
    const condicionados = itens(pre)
      .filter((i) => i.se)
      .map((i) => i.codigo);
    assert.deepEqual(condicionados, ['C2', 'C3', 'C4']);
    assert.deepEqual(pre.blocos.find((b) => b.id === 'experiencia-treinamento').se, { item: 'C1', igual: 0 });
    assert.deepEqual(DEFINICOES.pos.blocos.find((b) => b.id === 'comparacao').sePre, {
      item: 'C1',
      igual: 0,
    });
    // Toda condição aponta para um item de opções que existe antes dela.
    for (const def of [pre, pos]) {
      const vistos = [];
      for (const b of def.blocos) {
        if (b.se) assert.ok(vistos.includes(b.se.item), b.id);
        for (const i of b.itens) {
          if (i.se) assert.ok(vistos.includes(i.se.item), i.codigo);
          vistos.push(i.codigo);
        }
      }
    }
  });

  test('ATN no meio de um bloco aleatório; Hexad com 7 pontos e aviso; GAM1/2/3/5 com "não usei"', () => {
    for (const def of [pre, pos]) {
      const bloco = def.blocos.find((b) => b.itens.some((i) => i.codigo === 'ATN'));
      assert.ok(bloco.aleatorio && bloco.escala, def.tipo);
      assert.equal(bloco.itens.find((i) => i.codigo === 'ATN').meio, true);
      assert.equal(bloco.escala[0], 'Discordo totalmente');
    }
    const hexad = pre.blocos.find((b) => b.id === 'como-voce-e');
    assert.equal(hexad.escala.length, 7);
    assert.match(hexad.aviso, /7 pontos/);
    assert.deepEqual(
      itens(pos)
        .filter((i) => i.naoUsei)
        .map((i) => i.codigo),
      ['GAM1', 'GAM2', 'GAM3', 'GAM5'],
    );
  });

  test('A6 é múltipla com "Nenhuma" exclusiva; abertas são opcionais com limite', () => {
    const a6 = itens(pre).find((i) => i.codigo === 'A6');
    assert.equal(a6.multipla, true);
    assert.equal(a6.opcoes[a6.exclusiva], 'Nenhuma');
    for (const c of ['ABR1', 'ABR2']) {
      const i = itens(pos).find((x) => x.codigo === c);
      assert.deepEqual([i.aberta, i.opcional, i.max], [true, true, 2000]);
    }
    // Texto livre vai para o CSV pseudonimizado: o bloco pede para não se identificar.
    assert.match(pos.blocos.at(-1).intro, /Não escreva nomes, e-mails/);
  });

  test('o pré não fala de gamificação (viés de demanda); só português, sem notas de revisão', () => {
    const textoPre = [pre.titulo, ...pre.abertura].join(' ');
    assert.doesNotMatch(textoPre, /gamifica|pontos|ranking|medalha|conquista/i);
    assert.deepEqual(pre.abertura, [
      'Antes de continuar, responda a um questionário de até 40 perguntas. Leva cerca de 10 minutos.',
      'Não existem respostas certas ou erradas. Suas respostas são usadas só nesta pesquisa e analisadas sem o seu nome.',
    ]);
    assert.doesNotMatch(textoPre, /10 a 15/);
    // Vale também para contas antigas, que já usam o app: nada de "se inscrever" ou "começar a usar".
    assert.doesNotMatch(textoPre, /inscrever|começar a usar/i);
    // Aviso de resposta única num campo próprio (o app mostra em destaque), fora da abertura.
    assert.equal(
      pos.aviso,
      'Você só pode responder este questionário uma vez. Responda quando já tiver usado o app o suficiente para dar sua opinião. Sua resposta ajuda muito a pesquisa.',
    );
    assert.doesNotMatch(pos.abertura.join(' '), /só pode responder/);
    // A abertura não contradiz o aviso (que pede para responder depois de usar o app o suficiente).
    assert.doesNotMatch(pos.abertura.join(' '), /usado pouco/);
    assert.equal(pre.aviso, undefined);
    const tudo = JSON.stringify(DEFINICOES);
    assert.doesNotMatch(tudo, /Strongly|I don't|Hexad|UES|HAIS|O'Brien/);
  });
});

describe('resolver', () => {
  test('mantém CMP só com C1 = 0 no pré; sem pré ou outra resposta, remove o bloco', () => {
    assert.ok(codigos(resolver(DEFINICOES.pos, { C1: 0 })).includes('CMP'));
    for (const respostasPre of [{}, { C1: 1 }, { C1: 2 }, { C1: null }]) {
      const def = resolver(DEFINICOES.pos, respostasPre);
      assert.ok(!codigos(def).includes('CMP'), JSON.stringify(respostasPre));
      assert.equal(itens(def).length, 31);
    }
  });

  test('não expõe o campo interno sePre e não altera a definição original', () => {
    assert.ok(!JSON.stringify(resolver(DEFINICOES.pos, { C1: 0 })).includes('sePre'));
    assert.ok(DEFINICOES.pos.blocos.some((b) => b.sePre));
  });
});

describe('validarRespostas', () => {
  test('envio completo: uma linha por item com o valor em texto; múltipla vira uma linha por opção', () => {
    const linhas = validarRespostas(pre, { respostas: respostasValidas(pre, { A6: [3, 0], HXF3: 7 }) });
    assert.equal(linhas.length, 41); // 40 itens, A6 com duas opções
    assert.deepEqual(
      linhas.filter((l) => l.item === 'A6'),
      [
        { item: 'A6', valor: '0' },
        { item: 'A6', valor: '3' },
      ],
    );
    assert.deepEqual(linhas[0], { item: 'A1', valor: '0' });
    assert.equal(linhas.find((l) => l.item === 'HXF3').valor, '7');
    assert.equal(linhas.find((l) => l.item === 'ATN').valor, '1');
  });

  test('C1 diferente de Sim: C2–C4 e a UES ficam ocultos e as respostas deles são descartadas', () => {
    const linhas = validarRespostas(pre, { respostas: respostasValidas(pre, { C1: 1 }) });
    const itensGravados = new Set(linhas.map((l) => l.item));
    for (const c of ['C2', 'C3', 'C4', 'FA1', 'RW3']) assert.ok(!itensGravados.has(c), c);
    assert.equal(itensGravados.size, 40 - 3 - 12);
    // Sem as respostas ocultas também passa (não são obrigatórias).
    const r = respostasValidas(pre, { C1: 2 });
    for (const c of ['C2', 'C3', 'C4', 'FA1', 'FA2', 'FA3']) delete r[c];
    assert.doesNotThrow(() => validarRespostas(pre, { respostas: r }));
  });

  test('resposta inválida em item oculto também é descartada (não dá 400)', () => {
    const linhas = validarRespostas(pre, { respostas: respostasValidas(pre, { C1: 1, C2: 99, FA1: 'x' }) });
    assert.ok(!linhas.some((l) => l.item === 'C2' || l.item === 'FA1'));
  });

  test('item visível sem resposta é obrigatório', () => {
    const r = respostasValidas(pre);
    delete r.A1;
    delete r.FA2;
    assert.deepEqual(errosDe(pre, { respostas: r }), {
      A1: 'Responda esta pergunta',
      FA2: 'Responda esta pergunta',
    });
    // Sem C1, o desvio esconde C2–C4 e a UES: só C1 é cobrado.
    const semC1 = respostasValidas(pre);
    delete semC1.C1;
    assert.deepEqual(errosDe(pre, { respostas: semC1 }), { C1: 'Responda esta pergunta' });
  });

  test('fora da faixa ou tipo errado dá 400 no item', () => {
    const erros = errosDe(pre, {
      respostas: respostasValidas(pre, {
        A1: 5,
        A2: -1,
        A3: 1.5,
        K1_R: 0,
        K2_R: 6,
        HXP1: 8,
        HXP4: '3',
        A6: 0,
      }),
    });
    assert.deepEqual(Object.keys(erros).sort(), ['A1', 'A2', 'A3', 'A6', 'HXP1', 'HXP4', 'K1_R', 'K2_R']);
    assert.ok(Object.values(erros).every((m) => m === 'Resposta inválida'));
  });

  test('bordas válidas: 1 e máximo da escala, última opção, 7 no Hexad', () => {
    assert.doesNotThrow(() =>
      validarRespostas(pre, { respostas: respostasValidas(pre, { K1_R: 1, K2_R: 5, HXF3: 7, A4: 8 }) }),
    );
  });

  test('"Não vi / não usei" vale 0 só nos itens que têm a opção', () => {
    const linhas = validarRespostas(pos, { respostas: respostasValidas(pos, { GAM1: 0 }) });
    assert.deepEqual(
      linhas.find((l) => l.item === 'GAM1'),
      { item: 'GAM1', valor: '0' },
    );
    for (const codigo of ['GAM2', 'GAM3', 'GAM5']) {
      assert.doesNotThrow(() => validarRespostas(pos, { respostas: respostasValidas(pos, { [codigo]: 0 }) }));
    }
    for (const codigo of ['GAM4', 'GAM6_R', 'EXT', 'APR1', 'FA1']) {
      assert.deepEqual(errosDe(pos, { respostas: respostasValidas(pos, { [codigo]: 0 }) }), {
        [codigo]: 'Resposta inválida',
      });
    }
  });

  test('múltipla: vazia, repetida ou fora da faixa dá 400; "Nenhuma" não combina com outras', () => {
    for (const A6 of [[], [0, 0], [7], ['0'], 'Duolingo']) {
      assert.deepEqual(Object.keys(errosDe(pre, { respostas: respostasValidas(pre, { A6 }) })), ['A6']);
    }
    assert.match(errosDe(pre, { respostas: respostasValidas(pre, { A6: [6, 0] }) }).A6, /"Nenhuma" não pode/);
    const sozinha = validarRespostas(pre, { respostas: respostasValidas(pre, { A6: [6] }) });
    assert.deepEqual(
      sozinha.filter((l) => l.item === 'A6').map((l) => l.valor),
      ['6'],
    );
  });

  test('código desconhecido dá 400', () => {
    assert.deepEqual(errosDe(pre, { respostas: respostasValidas(pre, { XYZ: 1 }) }), {
      XYZ: 'Pergunta desconhecida',
    });
    // CMP removido pelo pré (C1 ≠ Sim) também é desconhecido.
    const semCmp = resolver(DEFINICOES.pos, { C1: 1 });
    assert.deepEqual(Object.keys(errosDe(semCmp, { respostas: respostasValidas(pos) })), ['CMP']);
  });

  test('abertas: opcionais, com trim; vazia = ausente; acima do limite ou não texto dá 400', () => {
    const r = respostasValidas(pos, { ABR1: '   ', ABR2: '  Mais aulas  ' });
    const linhas = validarRespostas(pos, { respostas: r });
    assert.ok(!linhas.some((l) => l.item === 'ABR1'));
    assert.deepEqual(
      linhas.find((l) => l.item === 'ABR2'),
      { item: 'ABR2', valor: 'Mais aulas' },
    );
    const semAbertas = respostasValidas(pos);
    delete semAbertas.ABR1;
    delete semAbertas.ABR2;
    assert.doesNotThrow(() => validarRespostas(pos, { respostas: semAbertas }));
    // Conta caracteres (code points): emoji vale 1, embora ocupe 2 unidades UTF-16.
    const limite = 'é'.repeat(1000) + '😀'.repeat(1000);
    const linhasLimite = validarRespostas(pos, { respostas: respostasValidas(pos, { ABR1: ` ${limite} ` }) });
    assert.equal(linhasLimite.find((l) => l.item === 'ABR1').valor, limite);
    assert.deepEqual(errosDe(pos, { respostas: respostasValidas(pos, { ABR1: `${limite}😀`, ABR2: 3 }) }), {
      ABR1: 'Use no máximo 2000 caracteres',
      ABR2: 'Resposta inválida',
    });
    assert.deepEqual(errosDe(pos, { respostas: respostasValidas(pos, { ABR1: `${limite}a` }) }), {
      ABR1: 'Use no máximo 2000 caracteres',
    });
  });
});

describe('participação e bloqueio pelo pré', () => {
  const consentiu = new Date();
  // Executor falso: registra as consultas e responde se o pré está pendente.
  const executor = (pendente) => {
    const chamadas = [];
    const query = async (...args) => {
      chamadas.push(args);
      return { rows: [{ pendente }] };
    };
    return { chamadas, query };
  };

  test('participa só usuário comum que consentiu', () => {
    assert.equal(participa({ papel: 'usuario', consentiu_pesquisa_em: consentiu }), true);
    assert.equal(participa({ papel: 'usuario', consentiu_pesquisa_em: null }), false);
    assert.equal(participa({ papel: 'admin', consentiu_pesquisa_em: consentiu }), false);
  });

  test('admin e sem consentimento passam sem consultar o banco', async () => {
    for (const usuario of [
      { id: 'a', papel: 'admin', consentiu_pesquisa_em: consentiu },
      { id: 'b', papel: 'usuario', consentiu_pesquisa_em: null },
    ]) {
      const ex = executor(true);
      await exigirPre(usuario, ex);
      assert.equal(ex.chamadas.length, 0, usuario.papel);
    }
  });

  test('participante com o pré pendente leva 403 QUESTIONARIO_PRE_PENDENTE; com o pré enviado, passa', async () => {
    const usuario = { id: 'u1', papel: 'usuario', consentiu_pesquisa_em: consentiu };
    const ex = executor(true);
    await assert.rejects(exigirPre(usuario, ex), {
      status: 403,
      codigo: 'QUESTIONARIO_PRE_PENDENTE',
      message: 'Responda ao questionário inicial para continuar',
    });
    assert.deepEqual(ex.chamadas[0][1], ['u1']);
    await exigirPre(usuario, executor(false));
  });
});

describe('janela do pós (executor falso)', () => {
  const usuario = { id: 'u1', papel: 'usuario', consentiu_pesquisa_em: new Date() };
  const fecha = new Date('2026-11-09T03:00:00.000Z');
  // `janela` = linha da consulta da janela (undefined = sem pré); `c1` = resposta C1 do pré, como texto.
  const executor = (janela, c1) => ({
    query: async (sql) => {
      if (sql.includes('questionario_respostas')) return { rows: c1 ? [{ item: 'C1', valor: c1 }] : [] };
      return { rows: janela ? [{ pre_id: 'p1', fecha, ...janela }] : [] };
    },
  });
  const ABERTA = { abriu: true, fechou: false, respondido: false };
  const NADA = { pre_pendente: false, pos_pendente: false };
  const temCmp = (def) => def.blocos.some((b) => b.itens.some((i) => i.codigo.startsWith('CMP')));

  test('situação: pendente só dentro da janela e sem resposta, com pos_fecha_em', async () => {
    assert.deepEqual(await situacao(usuario, executor(ABERTA)), {
      pre_pendente: false,
      pos_pendente: true,
      pos_fecha_em: fecha.toISOString(),
    });
    assert.deepEqual(await situacao(usuario, executor(undefined)), {
      pre_pendente: true,
      pos_pendente: false,
    });
    for (const fora of [{ abriu: false }, { fechou: true }, { respondido: true }]) {
      assert.deepEqual(await situacao(usuario, executor({ ...ABERTA, ...fora })), NADA, JSON.stringify(fora));
    }
  });

  test('acesso ao pós: 404 sem pré ou antes de abrir; 409 respondido (mesmo fechado); 410 fechado', async () => {
    const acesso = (janela) => obterDefinicao(usuario, 'pos', executor(janela));
    await assert.rejects(acesso(undefined), { status: 404 });
    await assert.rejects(acesso({ ...ABERTA, abriu: false }), { status: 404 });
    await assert.rejects(acesso({ ...ABERTA, respondido: true, fechou: true }), { status: 409 });
    await assert.rejects(acesso({ ...ABERTA, fechou: true }), {
      status: 410,
      codigo: 'QUESTIONARIO_ENCERRADO',
    });
  });

  test("CMP só com C1 = '0' (Sim, texto no banco)", async () => {
    const pos = (c1) => obterDefinicao(usuario, 'pos', executor(ABERTA, c1));
    assert.equal(temCmp(await pos('0')), true);
    assert.equal(temCmp(await pos('1')), false);
    assert.equal(temCmp(await pos(undefined)), false);
  });
});
