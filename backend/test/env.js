// Ambiente de teste: banco próprio (criado por deploy/dev-init.sql) e bcrypt barato.
// Precisa ser carregado antes de qualquer módulo de src/ (config.js lê o ambiente uma vez).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/security_awareness_teste';
process.env.JWT_SECRET ??= 'segredo-de-teste-com-pelo-menos-32-caracteres';
process.env.BCRYPT_CUSTO = '4';
// Sem SMTP, mesmo rodando no container de dev (que aponta para o mailpit): teste nunca envia e-mail.
process.env.SMTP_HOST = '';

module.exports = { DATABASE_URL: process.env.DATABASE_URL, JWT_SECRET: process.env.JWT_SECRET };
