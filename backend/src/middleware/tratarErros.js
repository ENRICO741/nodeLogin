const { ZodError } = require('zod');
const { HttpError } = require('../lib/erros');
const logger = require('../lib/logger');

const PG_VIOLACAO_UNICA = '23505';
const PG_VIOLACAO_FK = '23503';
const MENSAGENS_UNICIDADE = {
  usuarios_apelido_uk: 'Este apelido já está em uso',
  usuarios_email_uk: 'Este e-mail já está cadastrado',
  aulas_ordem_key: 'Já existe uma aula com essa ordem',
};

function responder(res, status, codigo, mensagem, detalhes) {
  res.status(status).json({ erro: { codigo, mensagem, ...(detalhes && { detalhes }) } });
}

function tratarErros(erro, req, res, _next) {
  if (erro instanceof HttpError) return responder(res, erro.status, erro.codigo, erro.message, erro.detalhes);

  if (erro instanceof ZodError) {
    const detalhes = erro.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }));
    return responder(res, 400, 'VALIDACAO', 'Dados inválidos', detalhes);
  }

  if (erro.type === 'entity.parse.failed') return responder(res, 400, 'JSON_INVALIDO', 'JSON inválido');
  if (erro.type === 'entity.too.large') return responder(res, 413, 'MUITO_GRANDE', 'Conteúdo grande demais');
  if (erro.code === PG_VIOLACAO_FK) {
    return responder(res, 400, 'REFERENCIA_INVALIDA', 'Registro relacionado não existe');
  }
  if (erro.code === PG_VIOLACAO_UNICA) {
    return responder(res, 409, 'CONFLITO', MENSAGENS_UNICIDADE[erro.constraint] ?? 'Registro já existe');
  }

  logger.error('erro não tratado', { erro, metodo: req.method, url: req.originalUrl, req_id: req.id });
  responder(res, 500, 'ERRO_INTERNO', 'Erro interno. Tente novamente');
}

module.exports = { tratarErros };
