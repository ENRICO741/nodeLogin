import { describe, expect, it } from 'vitest';
import {
  alternarMultipla,
  atende,
  blocosVisiveis,
  caracteres,
  excedidos,
  faltantes,
  itensDoBloco,
  itensVisiveis,
  montarEnvio,
  prazoPos,
  sortearOrdem,
} from '../lib/questionario';
import { DEFINICAO_PRE } from './questionario-fixtures';

const [perfil, ues, hexad, final] = DEFINICAO_PRE.blocos;
const codigos = (itens) => itens.map((it) => it.codigo);

describe('condições', () => {
  it('sem condição sempre atende; com condição compara o valor exato', () => {
    expect(atende(undefined, {})).toBe(true);
    expect(atende({ item: 'C1', igual: 0 }, { C1: 0 })).toBe(true);
    expect(atende({ item: 'C1', igual: 0 }, { C1: 1 })).toBe(false);
    expect(atende({ item: 'C1', igual: 0 }, {})).toBe(false); // sem resposta: oculto
    expect(atende({ item: 'C1', igual: 0 }, { C1: '0' })).toBe(false);
  });

  it('bloco condicionado só aparece com C1 = Sim', () => {
    expect(blocosVisiveis(DEFINICAO_PRE, {}).map((b) => b.id)).toEqual(['perfil', 'hexad', 'final']);
    expect(blocosVisiveis(DEFINICAO_PRE, { C1: 0 }).map((b) => b.id)).toEqual([
      'perfil',
      'ues',
      'hexad',
      'final',
    ]);
  });

  it('itens condicionados somem e aparecem conforme a resposta', () => {
    expect(codigos(itensDoBloco(perfil, { C1: 1 }))).toEqual(['A1', 'A6', 'C1']);
    expect(codigos(itensDoBloco(perfil, { C1: 0 }))).toEqual(['A1', 'A6', 'C1', 'C2']);
  });

  it('usa a ordem sorteada do bloco e ignora códigos desconhecidos', () => {
    const ordem = { hexad: ['HX3', 'ATN', 'XX', 'HX1', 'HX2'] };
    expect(codigos(itensDoBloco(hexad, {}, ordem))).toEqual(['HX3', 'ATN', 'HX1', 'HX2']);
    expect(codigos(itensDoBloco(ues, {}, ordem))).toEqual(['FA1', 'FA2']);
    // Ordem salva sem um item (rascunho antigo): ele entra no fim.
    expect(codigos(itensDoBloco(hexad, {}, { hexad: ['HX2', 'HX1'] }))).toEqual(['HX2', 'HX1', 'ATN', 'HX3']);
  });
});

describe('sortearOrdem', () => {
  it('só os blocos aleatórios, com todos os itens e a verificação de atenção no meio', () => {
    for (let i = 0; i < 20; i++) {
      const ordem = sortearOrdem(DEFINICAO_PRE);
      expect(Object.keys(ordem)).toEqual(['hexad']);
      expect([...ordem.hexad].sort()).toEqual(['ATN', 'HX1', 'HX2', 'HX3']);
      expect(ordem.hexad[1]).toBe('ATN');
    }
  });

  it('embaralha com Fisher-Yates (gerador fixo dá ordem previsível)', () => {
    expect(sortearOrdem(DEFINICAO_PRE, () => 0).hexad).toEqual(['HX2', 'ATN', 'HX3', 'HX1']);
    expect(sortearOrdem(DEFINICAO_PRE, () => 0.999).hexad).toEqual(['HX1', 'ATN', 'HX2', 'HX3']);
  });

  it('bloco com um item só, ou só com o item do meio, não quebra', () => {
    const def = {
      blocos: [
        { id: 'a', aleatorio: true, itens: [{ codigo: 'X' }] },
        { id: 'b', aleatorio: true, itens: [{ codigo: 'ATN', meio: true }] },
      ],
    };
    expect(sortearOrdem(def)).toEqual({ a: ['X'], b: ['ATN'] });
  });
});

describe('faltantes', () => {
  const itens = [...perfil.itens.slice(0, 2), ...final.itens];

  it('aponta os obrigatórios sem resposta e pula os opcionais', () => {
    expect(faltantes(itens, {})).toEqual(['A1', 'A6', 'GAM1']);
  });

  it('0 é resposta (primeira opção e "Não vi"); lista vazia e texto em branco não são', () => {
    expect(faltantes(itens, { A1: 0, A6: [], GAM1: 0, ABR1: '   ' })).toEqual(['A6']);
    expect(faltantes(itens, { A1: 0, A6: [1], GAM1: 3 })).toEqual([]);
  });

  it('aberta obrigatória exige texto', () => {
    const aberta = [{ codigo: 'T', aberta: true }];
    expect(faltantes(aberta, { T: ' ' })).toEqual(['T']);
    expect(faltantes(aberta, { T: 'ok' })).toEqual([]);
  });
});

describe('alternarMultipla', () => {
  const item = perfil.itens[1]; // exclusiva: 2 ("Nenhuma")

  it('marca e desmarca opções comuns, em ordem', () => {
    expect(alternarMultipla(item, undefined, 1, true)).toEqual([1]);
    expect(alternarMultipla(item, [1], 0, true)).toEqual([0, 1]);
    expect(alternarMultipla(item, [0, 1], 0, false)).toEqual([1]);
  });

  it('a exclusiva desmarca as outras, e qualquer outra desmarca a exclusiva', () => {
    expect(alternarMultipla(item, [0, 1], 2, true)).toEqual([2]);
    expect(alternarMultipla(item, [2], 0, true)).toEqual([0]);
  });

  it('sem exclusiva, só acumula', () => {
    expect(alternarMultipla({ codigo: 'M' }, [0], 1, true)).toEqual([0, 1]);
  });
});

describe('montarEnvio', () => {
  const ordem = { hexad: ['HX2', 'ATN', 'HX1', 'HX3'] };

  it('manda só itens visíveis e respondidos, com texto aparado (desviados ficam de fora)', () => {
    const respostas = { A1: 1, A6: [0], C1: 1, C2: 0, FA1: 3, HX1: 2, ATN: 1, GAM1: 0, ABR1: '  bom  ' };
    expect(montarEnvio(DEFINICAO_PRE, respostas)).toEqual({
      respostas: { A1: 1, A6: [0], C1: 1, HX1: 2, ATN: 1, GAM1: 0, ABR1: 'bom' },
    });
  });

  it('aberta em branco fica de fora; itens do bloco condicionado entram com C1 = Sim', () => {
    const envio = montarEnvio(DEFINICAO_PRE, { C1: 0, C2: 1, FA1: 1, ABR1: ' ' });
    expect(envio).toEqual({ respostas: { C1: 0, C2: 1, FA1: 1 } });
  });

  it('sem respostas, corpo vazio (a API diz o que falta)', () => {
    expect(montarEnvio(DEFINICAO_PRE, {})).toEqual({ respostas: {} });
  });

  it('itensVisiveis segue a ordem sorteada', () => {
    expect(codigos(itensVisiveis(DEFINICAO_PRE, { C1: 1 }, ordem)).slice(3, 7)).toEqual([
      'HX2',
      'ATN',
      'HX1',
      'HX3',
    ]);
    expect(codigos(itensVisiveis(DEFINICAO_PRE, {}, {}))).toEqual([
      'A1',
      'A6',
      'C1',
      'HX1',
      'ATN',
      'HX2',
      'HX3',
      'GAM1',
      'ABR1',
    ]);
  });
});

describe('limite das abertas', () => {
  const LONGO = 'é'.repeat(1000) + '😀'.repeat(1000); // .length 3000: conta por code point
  const aberta = [{ codigo: 'ABR1', aberta: true, opcional: true, max: 2000 }];

  it('conta caracteres, não unidades UTF-16 (emoji e acento valem 1)', () => {
    expect(LONGO.length).toBe(3000);
    expect(caracteres(LONGO)).toBe(2000);
    expect(caracteres('')).toBe(0);
    expect(caracteres(undefined)).toBe(0);
    expect(caracteres(5)).toBe(0); // rascunho estranho não quebra
  });

  it('2000 passa; 2001 é recusado; sem resposta ou item sem max não conta', () => {
    expect(excedidos(aberta, { ABR1: LONGO })).toEqual([]);
    expect(excedidos(aberta, { ABR1: LONGO + '😀' })).toEqual(['ABR1']);
    expect(excedidos(aberta, { ABR1: LONGO + 'a' })).toEqual(['ABR1']);
    expect(excedidos(aberta, {})).toEqual([]);
    expect(
      excedidos(aberta, {
        ABR1: ` ${LONGO}
`,
      }),
    ).toEqual([]); // a API conta depois do trim
    expect(
      excedidos(aberta, {
        ABR1: ` ${LONGO}a
`,
      }),
    ).toEqual(['ABR1']);
    expect(excedidos([{ codigo: 'A1', opcoes: ['a'] }], { A1: 0 })).toEqual([]);
  });
});

describe('prazo do pós', () => {
  const LONGE = Date.parse('2026-10-01T12:00:00Z');

  it('meia-noite de SP (fim da pesquisa) mostra o dia anterior, o último aceito', () => {
    expect(prazoPos('2026-11-09T03:00:00.000Z', LONGE)).toBe('Disponível até 08/11');
  });

  it('prazo no meio do dia (pré + 28 dias) mostra o dia anterior, o último inteiro, no fuso de SP', () => {
    // Fecha 29/10 às 10h30 de SP: quem abrisse à noite de 29/10 receberia 410.
    expect(prazoPos('2026-10-29T13:30:00.000Z', LONGE)).toBe('Disponível até 28/10');
    // 01:00 UTC ainda é o dia anterior em SP (fecha 29/10 às 22h).
    expect(prazoPos('2026-10-30T01:00:00.000Z', LONGE)).toBe('Disponível até 28/10');
  });

  it('menos de 24h: hora do último minuto aceito, hoje ou amanhã no fuso de SP', () => {
    // Fecha 00:00 de 09/11; agora 09h de 08/11 em SP.
    expect(prazoPos('2026-11-09T03:00:00.000Z', Date.parse('2026-11-08T12:00:00Z'))).toBe(
      'Disponível hoje até 23:59',
    );
    // Fecha 29/10 às 10h30; agora 21h de 28/10 em SP (já 29/10 em UTC).
    expect(prazoPos('2026-10-29T13:30:00.000Z', Date.parse('2026-10-29T00:00:00Z'))).toBe(
      'Disponível amanhã até 10:29',
    );
    expect(prazoPos('2026-10-29T13:30:00.000Z', Date.parse('2026-10-29T13:29:59.999Z'))).toBe(
      'Disponível hoje até 10:29',
    );
  });

  it('borda das 24h e prazo já vencido mantêm o dia', () => {
    const fecha = '2026-10-29T13:30:00.000Z';
    const vinteQuatro = Date.parse(fecha) - 86_400_000;
    expect(prazoPos(fecha, vinteQuatro)).toBe('Disponível até 28/10');
    expect(prazoPos(fecha, vinteQuatro + 1)).toBe('Disponível amanhã até 10:29');
    expect(prazoPos(fecha, Date.parse(fecha))).toBe('Disponível até 28/10');
  });
});
