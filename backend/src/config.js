const path = require('node:path');
const crypto = require('node:crypto');
const { z } = require('zod');

z.config(z.locales.pt());

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa de pelo menos 32 caracteres'),
  JWT_EXPIRA_EM: z.string().default('7d'),
  BCRYPT_CUSTO: z.coerce.number().int().min(4).max(15).default(12),
  APP_URL: z.url().default('http://localhost:5173'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_SENHA: z.string().optional(),
  SMTP_REMETENTE: z.string().default('Guardião Impacta <no-reply@localhost>'),
  CONTEUDO_DIR: z.string().default(path.resolve(__dirname, '..', '..', 'conteudo')),
  PESQUISA_SEGREDO: z.string().min(16, 'PESQUISA_SEGREDO precisa de pelo menos 16 caracteres').optional(),
});

// Variável vazia no .env (ex.: SMTP_HOST=) conta como ausente.
const env = Object.fromEntries(Object.entries(process.env).filter(([, valor]) => valor !== ''));
const resultado = esquema.safeParse(env);

if (!resultado.success) {
  console.error('Configuração inválida:\n' + z.prettifyError(resultado.error));
  process.exit(1);
}

// Segredo dos pseudônimos da exportação da pesquisa. Sem valor próprio, deriva do JWT_SECRET
// (trocar o JWT_SECRET muda os pseudônimos, por isso em produção prefira definir PESQUISA_SEGREDO).
resultado.data.PESQUISA_SEGREDO ??= crypto
  .createHash('sha256')
  .update(`pesquisa:${resultado.data.JWT_SECRET}`)
  .digest('hex');

module.exports = resultado.data;
