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

// Aspas e barra invertida são aceitas: a senha vai por parâmetro e só o hash chega ao banco.
// Recusa o que quebra a senha de verdade: NUL (o bcrypt corta a string nele), controle/invisíveis
// e emoji (dependem do teclado e cada um gasta 4 dos 72 bytes). Mesma regra em frontend/src/lib/senha.js.
const CARACTERE_INVALIDO =
  /[\p{C}\p{Zl}\p{Zp}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0F]/u;

// Sem trim: a senha vale exatamente como digitada. O limite é em bytes porque o bcrypt ignora tudo
// depois do 72º byte (com acento, duas senhas diferentes virariam a mesma).
const senha = z
  .string()
  .min(8, 'A senha precisa de pelo menos 8 caracteres')
  .regex(/\p{Lu}/u, 'A senha precisa de uma letra maiúscula')
  .regex(/\p{Ll}/u, 'A senha precisa de uma letra minúscula')
  .regex(/\d/, 'A senha precisa de um número')
  // Emoji não conta como especial (nem símbolo virado emoji pelo U+FE0F, como ❤️).
  .regex(
    /[^\p{L}\p{M}\p{N}\s\p{C}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}](?!\uFE0F)/u,
    'A senha precisa de um caractere especial',
  )
  .refine((s) => !CARACTERE_INVALIDO.test(s), 'A senha não pode ter emoji nem caracteres invisíveis')
  .refine((s) => Buffer.byteLength(s) <= 72, 'Senha muito longa, considere diminuí-la um pouco');

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
