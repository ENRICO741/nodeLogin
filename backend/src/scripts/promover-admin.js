// Uso: npm run promover-admin -- email@empresa.com
const { pool } = require('../db/pool');

const email = process.argv[2];
if (!email) {
  console.error('Uso: npm run promover-admin -- <email>');
  process.exit(1);
}

pool
  .query(
    "UPDATE usuarios SET papel = 'admin', atualizado_em = now() WHERE lower(email) = lower($1) RETURNING apelido",
    [email],
  )
  .then(({ rows }) => {
    console.log(rows[0] ? `${rows[0].apelido} agora é admin.` : `Nenhum usuário com o e-mail ${email}.`);
    process.exitCode = rows[0] ? 0 : 1;
  })
  .finally(() => pool.end());
