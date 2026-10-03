const { z } = require('zod');

const texto = (min, max) => z.string().trim().min(min).max(max);
// Texto vazio vira NULL no banco.
const textoOpcional = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const urlHttps = z.url({ protocol: /^https$/, error: 'Use uma URL https://' }).max(2000);

const esquemaQuestao = z.object({
  enunciado: texto(1, 1000),
  imagem_url: urlHttps.nullable().optional(),
  alternativa_a: texto(1, 300),
  alternativa_b: texto(1, 300),
  alternativa_c: texto(1, 300),
  alternativa_d: texto(1, 300),
  resposta_correta: z.enum(['a', 'b', 'c', 'd']),
  explicacao: textoOpcional(1000),
  pontos: z.number().int().min(0).max(100),
  ativo: z.boolean().optional(),
});

const esquemaResposta = z.object({
  questao_id: z.uuid(),
  alternativa: z.enum(['a', 'b', 'c', 'd']),
});

const idDaRota = (req) => z.uuid({ error: 'Identificador inválido' }).parse(req.params.id);

// Sem trim: a senha vale exatamente como digitada. O limite é em bytes porque o bcrypt ignora tudo
// depois do 72º byte (com acento ou emoji, duas senhas diferentes virariam a mesma).
const senha = z
  .string()
  .min(8, 'A senha precisa de pelo menos 8 caracteres')
  .refine((s) => Buffer.byteLength(s) <= 72, 'A senha é longa demais (máximo de 72 bytes)');

const esquemaPapel = z.strictObject({ admin: z.boolean() });

module.exports = {
  texto,
  textoOpcional,
  urlHttps,
  esquemaQuestao,
  esquemaResposta,
  idDaRota,
  senha,
  esquemaPapel,
};
