require('../env');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lerAulas } = require('../../src/modulos/aulas/importador');
const { pergunta, aulaHtml, criarConteudo } = require('../conteudo-falso');

const ler = (pastas) => lerAulas(criarConteudo(pastas));
const umErro = (pastas, esperado) => {
  const { erros } = ler(pastas);
  assert.ok(
    erros.some((e) => (esperado instanceof RegExp ? esperado.test(e) : e.includes(esperado))),
    `esperava "${esperado}" em:\n${erros.join('\n')}`,
  );
};

describe('lerAulas: aula válida', () => {
  test('lê título, ordem e slug pela pasta, bônus, conteúdo e perguntas', () => {
    const { aulas, erros } = ler({
      '07-engenharia-social': {
        html: aulaHtml({
          titulo: '  Engenharia social  ',
          bonus: 35,
          perguntas: [
            pergunta({
              chave: 'senha-por-telefone',
              pontos: 15,
              correta: 2,
              explicacao: 'Nunca passe a senha.',
            }),
            pergunta({ chave: 'link-suspeito' }),
          ],
        }),
      },
    });
    assert.deepEqual(erros, []);
    const [aula] = aulas;
    assert.equal(aula.titulo, 'Engenharia social');
    assert.equal(aula.ordem, 7);
    assert.equal(aula.slug, 'engenharia-social');
    assert.equal(aula.pontos_conclusao, 35);
    assert.equal(aula.conteudo_html, '<h2>Seção</h2><p>Texto.</p>');
    assert.deepEqual(aula.questoes[0], {
      chave: 'senha-por-telefone',
      ordem: 1,
      enunciado: 'Qual?',
      imagem_url: null,
      alternativas: ['A', 'B', 'C', 'D'],
      resposta_correta: 'c',
      explicacao: 'Nunca passe a senha.',
      pontos: 15,
    });
    assert.equal(aula.questoes[1].ordem, 2);
    assert.equal(aula.questoes[1].pontos, 10, 'padrão de 10 pontos');
    assert.equal(aula.questoes[1].explicacao, null);
  });

  test('bônus padrão é 20 e aula sem perguntas é aceita', () => {
    const { aulas, erros } = ler({ '01-leitura': { html: aulaHtml({ perguntas: null }) } });
    assert.deepEqual(erros, []);
    assert.equal(aulas[0].pontos_conclusao, 20);
    assert.deepEqual(aulas[0].questoes, []);
  });

  test('ordena pelas pastas e ignora arquivos soltos na pasta aulas', () => {
    const raiz = criarConteudo({ '02-b': { html: aulaHtml() }, '01-a': { html: aulaHtml() } });
    fs.writeFileSync(path.join(raiz, 'aulas', 'LEIA-ME.txt'), 'x');
    const { aulas, erros } = lerAulas(raiz);
    assert.deepEqual(erros, []);
    assert.deepEqual(
      aulas.map((a) => a.slug),
      ['a', 'b'],
    );
  });

  test('sem pasta aulas não há nada a importar', () => {
    assert.deepEqual(lerAulas(path.join(__dirname, 'nao-existe')), { aulas: [], erros: [] });
  });

  test('reescreve imagens para a URL pública e aceita alt vazio (decorativa)', () => {
    const { aulas, erros } = ler({
      '03-imagens': {
        html: aulaHtml({
          corpo:
            '<figure><img src="imagens/a.png" alt="Diagrama"><figcaption>x</figcaption></figure><img src="./imagens/b.svg" alt="">',
          perguntas: [pergunta({ extra: '<img src="imagens/q.webp" alt="Apoio">' })],
        }),
        imagens: ['a.png', 'b.svg', 'q.webp'],
      },
    });
    assert.deepEqual(erros, []);
    assert.match(aulas[0].conteudo_html, /src="\/api\/conteudo\/aulas\/03-imagens\/imagens\/a\.png"/);
    assert.match(aulas[0].conteudo_html, /src="\/api\/conteudo\/aulas\/03-imagens\/imagens\/b\.svg"/);
    assert.match(aulas[0].conteudo_html, /<figcaption>x<\/figcaption>/);
    assert.equal(aulas[0].questoes[0].imagem_url, '/api/conteudo/aulas/03-imagens/imagens/q.webp');
  });

  test('sanitiza: remove script, estilo, eventos e classes fora da lista; mantém caixas e tabelas', () => {
    const { aulas } = ler({
      '01-x': {
        html: aulaHtml({
          corpo:
            '<h2 style="color:red" onclick="x()">T</h2><script>alert(1)</script><style>*{}</style>' +
            '<aside class="nota">n</aside><aside class="dica">d</aside><aside class="atencao">a</aside>' +
            '<aside class="perigo">p</aside><table><tr><td>c</td></tr></table><pre><code>x</code></pre>' +
            '<a href="javascript:alert(1)">ruim</a><a href="https://ok.com">bom</a><!-- comentário -->',
        }),
      },
    });
    const html = aulas[0].conteudo_html;
    for (const proibido of ['script', 'style', 'onclick', 'javascript:', 'perigo', 'comentário']) {
      assert.ok(!html.includes(proibido), proibido);
    }
    for (const ok of [
      '<aside class="nota">',
      '<aside class="dica">',
      '<aside class="atencao">',
      '<table>',
      '<code>',
      'href="https://ok.com"',
    ]) {
      assert.ok(html.includes(ok), ok);
    }
  });

  test('o bloco de perguntas não aparece no conteúdo', () => {
    const { aulas } = ler({ '01-x': { html: aulaHtml() } });
    assert.ok(!aulas[0].conteudo_html.includes('data-pergunta'));
    assert.ok(!aulas[0].conteudo_html.includes('Qual?'));
  });

  test('as aulas reais de conteudo/ são válidas', () => {
    const { aulas, erros } = lerAulas(path.resolve(__dirname, '..', '..', '..', 'conteudo'));
    assert.deepEqual(erros, []);
    assert.ok(aulas.length >= 3);
  });
});

describe('lerAulas: erros de validação', () => {
  test('pasta com nome fora do padrão', () => {
    for (const nome of ['phishing', '1_phishing', '01-Phishing', '01-com espaço', '01-']) {
      umErro({ [nome]: { html: aulaHtml() } }, 'nome de pasta inválido');
    }
  });

  test('pasta sem aula.html', () => {
    umErro({ '01-vazia': {} }, '01-vazia: falta o arquivo aula.html');
  });

  test('sem título, título longo, h1 no conteúdo, conteúdo vazio', () => {
    umErro({ '01-x': { html: aulaHtml({ titulo: null }) } }, 'falta o <title>');
    umErro({ '01-x': { html: aulaHtml({ titulo: 'x'.repeat(161) }) } }, 'mais de 160 caracteres');
    umErro({ '01-x': { html: aulaHtml({ corpo: '<h1>Título</h1><p>x</p>' }) } }, 'não use <h1>');
    umErro(
      { '01-x': { html: aulaHtml({ corpo: '<script>x</script>', perguntas: null }) } },
      'conteúdo da aula está vazio',
    );
  });

  test('bônus inválido', () => {
    for (const bonus of ['-1', '1001', 'vinte', '1.5']) {
      umErro(
        { '01-x': { html: aulaHtml({ bonus }) } },
        'aula:pontos-conclusao deve ser um inteiro de 0 a 1000',
      );
    }
  });

  test('ordem e slug repetidos entre pastas', () => {
    umErro(
      { '01-a': { html: aulaHtml() }, '01-b': { html: aulaHtml() } },
      /01-b: ordem "1" repetido com 01-a/,
    );
    umErro(
      { '01-a': { html: aulaHtml() }, '02-a': { html: aulaHtml() } },
      /02-a: slug "a" repetido com 01-a/,
    );
  });

  test('mais de um bloco de perguntas', () => {
    umErro(
      { '01-x': { html: aulaHtml({ corpo: '<p>x</p><section data-perguntas></section>' }) } },
      'use um único <section data-perguntas>',
    );
  });

  test('pergunta: chave inválida ou repetida', () => {
    umErro(
      { '01-x': { html: aulaHtml({ perguntas: [pergunta({ chave: 'Com Espaço' })] }) } },
      'data-pergunta deve ter só letras',
    );
    umErro({ '01-x': { html: aulaHtml({ perguntas: [pergunta({ chave: '' })] }) } }, 'pergunta nº 1');
    umErro(
      { '01-x': { html: aulaHtml({ perguntas: [pergunta({ chave: 'a' }), pergunta({ chave: 'a' })] }) } },
      'data-pergunta "a" repetido',
    );
  });

  test('pergunta: pontos fora de 0–100', () => {
    for (const pontos of ['-5', '101', 'dez']) {
      umErro(
        { '01-x': { html: aulaHtml({ perguntas: [pergunta({ pontos })] }) } },
        'data-pontos deve ser um inteiro de 0 a 100',
      );
    }
  });

  test('pergunta: aceita 0 e 100 pontos', () => {
    const { erros } = ler({
      '01-x': {
        html: aulaHtml({
          perguntas: [pergunta({ chave: 'a', pontos: 0 }), pergunta({ chave: 'b', pontos: 100 })],
        }),
      },
    });
    assert.deepEqual(erros, []);
  });

  test('pergunta: sem enunciado, número errado de alternativas, alternativa vazia', () => {
    umErro(
      { '01-x': { html: aulaHtml({ perguntas: [pergunta({ enunciado: null })] }) } },
      'falta o enunciado',
    );
    umErro(
      { '01-x': { html: aulaHtml({ perguntas: [pergunta({ alternativas: ['A', 'B', 'C'] })] }) } },
      'exatamente 4 alternativas em <ol>, tem 3',
    );
    umErro(
      { '01-x': { html: aulaHtml({ perguntas: [pergunta({ alternativas: ['A', ' ', 'C', 'D'] })] }) } },
      'alternativa B vazia',
    );
  });

  test('pergunta: nenhuma ou duas alternativas corretas', () => {
    umErro({ '01-x': { html: aulaHtml({ perguntas: [pergunta({ correta: -1 })] }) } }, 'data-correta, tem 0');
    const duas = pergunta().replace('<li>A</li>', '<li data-correta>A</li>');
    umErro({ '01-x': { html: aulaHtml({ perguntas: [duas] }) } }, 'data-correta, tem 2');
  });

  test('imagens: sem alt, externa, absoluta, fora da pasta, formato ruim, inexistente', () => {
    const casos = [
      ['<img src="imagens/a.png">', 'sem atributo alt'],
      ['<img src="https://x.com/a.png" alt="x">', 'deve ser um arquivo da pasta da aula'],
      ['<img src="//x.com/a.png" alt="x">', 'deve ser um arquivo da pasta da aula'],
      ['<img src="/a.png" alt="x">', 'deve ser um arquivo da pasta da aula'],
      ['<img src="data:image/png;base64,AA" alt="x">', 'deve ser um arquivo da pasta da aula'],
      ['<img src="../../segredo.png" alt="x">', 'aponta para fora da pasta'],
      ['<img src="imagens/a.bmp" alt="x">', 'formato não suportado'],
      ['<img src="imagens/sumiu.png" alt="x">', 'não encontrada'],
    ];
    for (const [img, erro] of casos) {
      umErro({ '01-x': { html: aulaHtml({ corpo: `<p>x</p>${img}` }), imagens: ['a.png', 'a.bmp'] } }, erro);
    }
  });

  test('vários erros são todos listados de uma vez', () => {
    const { erros } = ler({
      '01-x': { html: aulaHtml({ titulo: null, perguntas: [pergunta({ correta: -1, enunciado: null })] }) },
    });
    assert.ok(erros.length >= 3);
  });
});
