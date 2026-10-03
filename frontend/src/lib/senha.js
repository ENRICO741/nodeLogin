// Espelho da regra de senha da API (backend/src/lib/validacao.js); a API é quem decide.
export const MINIMO_SENHA = 8;

export const REQUISITOS_SENHA = [
  { texto: `Pelo menos ${MINIMO_SENHA} caracteres`, atende: (s) => s.length >= MINIMO_SENHA },
  { texto: 'Uma letra maiúscula', atende: (s) => /\p{Lu}/u.test(s) },
  { texto: 'Uma letra minúscula', atende: (s) => /\p{Ll}/u.test(s) },
  { texto: 'Um número', atende: (s) => /\d/.test(s) },
  {
    texto: 'Um caractere especial (ex.: ! @ # $ %)',
    // Emoji não conta como especial (nem símbolo virado emoji pelo U+FE0F, como ❤️).
    atende: (s) =>
      /[^\p{L}\p{M}\p{N}\s\p{C}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}](?!\uFE0F)/u.test(
        s,
      ),
  },
];

// O bcrypt ignora o que passa do 72º byte (acento ocupa 2).
export const senhaLongaDemais = (s) => new TextEncoder().encode(s).length > 72;

// Emoji, caracteres invisíveis e de controle. Aspas e barra invertida são aceitas.
export const temCaractereInvalido = (s) =>
  /[\p{C}\p{Zl}\p{Zp}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0F]/u.test(s);
