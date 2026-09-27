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
  CORS_ORIGEM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_SENHA: z.string().optional(),
  SMTP_REMETENTE: z.string().default('Security Awareness <no-reply@localhost>'),
});

// Variável vazia no .env (ex.: SMTP_HOST=) conta como ausente.
const env = Object.fromEntries(Object.entries(process.env).filter(([, valor]) => valor !== ''));
const resultado = esquema.safeParse(env);

if (!resultado.success) {
  console.error('Configuração inválida:\n' + z.prettifyError(resultado.error));
  process.exit(1);
}

module.exports = resultado.data;
