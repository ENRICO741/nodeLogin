const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const { naoAutenticado, proibido } = require('../lib/erros');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPOS_USUARIO =
  'id, nome, apelido, email, foto_perfil_url, bio, profissao, empresa, papel, pontuacao_total, criado_em';

// `sv` = versão da senha (ms de senha_alterada_em). Trocar a senha invalida todos os tokens anteriores.
function emitirToken(usuarioId, senhaAlteradaEm) {
  return jwt.sign({ sv: senhaAlteradaEm.getTime() }, config.JWT_SECRET, {
    subject: usuarioId,
    expiresIn: config.JWT_EXPIRA_EM,
    algorithm: 'HS256',
  });
}

// Carrega o usuário a cada request: desativação e mudança de papel valem na hora.
async function autenticar(req, _res, next) {
  const [tipo, token] = (req.get('authorization') ?? '').split(' ');
  if (tipo !== 'Bearer' || !token) throw naoAutenticado();

  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw naoAutenticado('Sessão expirada. Faça login novamente');
  }
  if (!UUID.test(payload.sub ?? '')) throw naoAutenticado('Sessão expirada. Faça login novamente');

  const { rows } = await query(
    `SELECT ${CAMPOS_USUARIO}, senha_alterada_em, ativo FROM usuarios WHERE id = $1`,
    [payload.sub],
  );
  const usuario = rows[0];
  if (!usuario?.ativo || usuario.senha_alterada_em.getTime() !== payload.sv) {
    throw naoAutenticado('Sessão expirada. Faça login novamente');
  }

  delete usuario.senha_alterada_em;
  delete usuario.ativo;
  req.usuario = usuario;
  next();
}

function exigirAdmin(req, _res, next) {
  if (req.usuario.papel !== 'admin') throw proibido();
  next();
}

module.exports = { CAMPOS_USUARIO, emitirToken, autenticar, exigirAdmin };
