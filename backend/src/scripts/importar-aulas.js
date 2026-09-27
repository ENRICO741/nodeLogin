// Uso: npm run importar-aulas            importa conteudo/aulas para o banco
//      npm run importar-aulas -- --validar   só valida os arquivos (não precisa de banco; roda na CI)
const path = require('node:path');
const { lerAulas, gravarAulas } = require('../modulos/aulas/importador');

const diretorioPadrao = () =>
  process.env.CONTEUDO_DIR || path.resolve(__dirname, '..', '..', '..', 'conteudo');

// Lê, valida e grava tudo numa transação. Com erro de validação não grava nada e devolve os erros.
async function importarConteudo(diretorio = require('../config').CONTEUDO_DIR) {
  const { aulas, erros } = lerAulas(diretorio);
  if (erros.length) return { erros, total: aulas.length };
  const { transacao } = require('../db/pool');
  const resumo = await transacao((c) => gravarAulas(c, aulas));
  return { erros: [], total: aulas.length, ...resumo };
}

module.exports = { importarConteudo };

if (require.main === module) {
  const soValidar = process.argv.includes('--validar');
  const diretorio = diretorioPadrao();

  if (soValidar) {
    const { aulas, erros } = lerAulas(diretorio);
    for (const erro of erros) console.error(`✗ ${erro}`);
    console.log(
      erros.length ? `${erros.length} erro(s) em ${diretorio}` : `✓ ${aulas.length} aula(s) válidas`,
    );
    process.exit(erros.length ? 1 : 0);
  }

  const { pool } = require('../db/pool');
  importarConteudo(diretorio)
    .then(({ erros, total, criadas, atualizadas, inalteradas }) => {
      for (const erro of erros) console.error(`✗ ${erro}`);
      if (erros.length) process.exitCode = 1;
      else
        console.log(
          `✓ ${total} aula(s): ${criadas} nova(s), ${atualizadas} atualizada(s), ${inalteradas} sem mudança`,
        );
    })
    .catch((erro) => {
      console.error(`✗ falha ao gravar: ${erro.message}`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
