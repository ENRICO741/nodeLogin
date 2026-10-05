const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const config = require('../../config');
const { query, transacao } = require('../../db/pool');
const { HttpError } = require('../../lib/erros');
const mailer = require('../../lib/mailer');
const logger = require('../../lib/logger');
const { CAMPOS_USUARIO, emitirToken } = require('../../middleware/autenticacao');

const VALIDADE_TOKEN_RECUPERACAO = '30 minutes';
// Comparar contra um hash fixo quando o usuário não existe deixa o tempo de resposta igual (não revela contas).
const HASH_FALSO = bcrypt.hashSync('usuario-inexistente', config.BCRYPT_CUSTO);

const hashSha256 = (valor) => crypto.createHash('sha256').update(valor).digest('hex');

function sessao({ senha_alterada_em, ...usuario }) {
  return { token: emitirToken(usuario.id, senha_alterada_em), usuario };
}

async function cadastrar({ nome, apelido, email, senha }) {
  const senhaHash = await bcrypt.hash(senha, config.BCRYPT_CUSTO);
  const { rows } = await query(
    `INSERT INTO usuarios (nome, apelido, email, senha_hash, consentiu_pesquisa_em)
     VALUES ($1, $2, $3, $4, now())
     RETURNING ${CAMPOS_USUARIO}, senha_alterada_em`,
    [nome, apelido, email, senhaHash],
  );
  return sessao(rows[0]);
}

async function entrar({ identificador, senha }) {
  const { rows } = await query(
    `SELECT ${CAMPOS_USUARIO}, senha_alterada_em, senha_hash FROM usuarios
     WHERE ativo AND (lower(email) = lower($1) OR lower(apelido) = lower($1))`,
    [identificador],
  );
  const { senha_hash: senhaHash, ...usuario } = rows[0] ?? {};
  const senhaConfere = await bcrypt.compare(senha, senhaHash ?? HASH_FALSO);
  if (!rows[0] || !senhaConfere) {
    throw new HttpError(401, 'CREDENCIAIS_INVALIDAS', 'Usuário ou senha incorretos');
  }
  return sessao(usuario);
}

// Sempre termina sem erro para quem chamou: a resposta não revela se o e-mail existe.
async function solicitarRecuperacao(email) {
  const { rows } = await query('SELECT id, email FROM usuarios WHERE ativo AND lower(email) = lower($1)', [
    email,
  ]);
  const usuario = rows[0];
  if (!usuario) return;

  const token = crypto.randomBytes(32).toString('base64url');
  await transacao(async (c) => {
    await c.query('UPDATE tokens_recuperacao_senha SET usado = true WHERE usuario_id = $1 AND NOT usado', [
      usuario.id,
    ]);
    await c.query(
      `INSERT INTO tokens_recuperacao_senha (usuario_id, token_hash, expira_em)
       VALUES ($1, $2, now() + $3::interval)`,
      [usuario.id, hashSha256(token), VALIDADE_TOKEN_RECUPERACAO],
    );
  });

  const link = `${config.APP_URL}/redefinir-senha?token=${token}`;
  // Sem await: o tempo de envio do e-mail não pode diferenciar a resposta.
  mailer
    .enviarEmail({
      para: usuario.email,
      assunto: 'Redefinição de senha',
      // Só texto fixo: o nome vem de quem cadastrou, e o cadastro não confirma o e-mail. Um nome com
      // quebras de linha e URL viraria phishing saindo do remetente oficial.
      texto:
        `Olá.\n\nPara criar uma nova senha, acesse o link abaixo (válido por 30 minutos):\n${link}\n\n` +
        'Se você não pediu a redefinição, ignore este e-mail. Sua senha continua a mesma.',
    })
    .catch((erro) => logger.error('falha ao enviar e-mail de recuperação', { erro }));
}

async function redefinirSenha({ token, senha }) {
  const senhaHash = await bcrypt.hash(senha, config.BCRYPT_CUSTO);
  await transacao(async (c) => {
    const { rows } = await c.query(
      `UPDATE tokens_recuperacao_senha SET usado = true
       WHERE token_hash = $1 AND NOT usado AND expira_em > now()
       RETURNING usuario_id`,
      [hashSha256(token)],
    );
    if (!rows[0]) throw new HttpError(400, 'TOKEN_INVALIDO', 'Link inválido ou expirado. Peça um novo');
    await c.query(
      'UPDATE usuarios SET senha_hash = $2, senha_alterada_em = now(), atualizado_em = now() WHERE id = $1',
      [rows[0].usuario_id, senhaHash],
    );
  });
}

module.exports = { cadastrar, entrar, solicitarRecuperacao, redefinirSenha };
