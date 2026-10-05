const path = require('node:path');
const crypto = require('node:crypto');
const { z } = require('zod');

z.config(z.locales.pt());

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa de pelo menos 32 caracteres'),
  // Validado no boot: um valor inválido só falharia no jwt.sign, depois do INSERT do cadastro (conta órfã).
  // Exige a unidade: só dígitos o jsonwebtoken lê como segundos ("7" = 7 s).
  JWT_EXPIRA_EM: z
    .string()
    .regex(/^[1-9]\d*[smhd]$/, 'JWT_EXPIRA_EM precisa de número e unidade (s, m, h ou d), ex.: 7d')
    .default('7d'),
  // 11: metade da CPU do 12 por cadastro/login (o gargalo no teste de carga), acima do mínimo do OWASP (10).
  // Hashes antigos continuam valendo: o custo fica gravado no próprio hash.
  BCRYPT_CUSTO: z.coerce.number().int().min(4).max(15).default(11),
  APP_URL: z.url().default('http://localhost:5173'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_SENHA: z.string().optional(),
  SMTP_REMETENTE: z.string().default('Guardião Impacta <no-reply@localhost>'),
  CONTEUDO_DIR: z.string().default(path.resolve(__dirname, '..', '..', 'conteudo')),
  PESQUISA_SEGREDO: z.string().min(16, 'PESQUISA_SEGREDO precisa de pelo menos 16 caracteres').optional(),
  // Último dia da pesquisa (AAAA-MM-DD), aceito inteiro no fuso de SP: o pós fecha à 00:00 do dia seguinte,
  // mesmo antes do dia 28 de quem entrou tarde. Sem valor, não há teto.
  PESQUISA_DATA_FIM: z.iso.date().optional(),
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
