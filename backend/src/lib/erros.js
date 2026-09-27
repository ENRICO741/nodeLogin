class HttpError extends Error {
  constructor(status, codigo, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.detalhes = detalhes;
  }
}

module.exports = {
  HttpError,
  naoAutenticado: (mensagem = 'Faça login para continuar') => new HttpError(401, 'NAO_AUTENTICADO', mensagem),
  proibido: (mensagem = 'Acesso não permitido') => new HttpError(403, 'PROIBIDO', mensagem),
  naoEncontrado: (mensagem = 'Recurso não encontrado') => new HttpError(404, 'NAO_ENCONTRADO', mensagem),
  conflito: (codigo, mensagem) => new HttpError(409, codigo, mensagem),
};
