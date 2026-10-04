const { Router } = require('express');
const { z } = require('zod');
const service = require('./service');
const { autenticar } = require('../../middleware/autenticacao');
const { limiteAuth, limiteRecuperacaoIp, limiteRecuperacaoEmail } = require('../../middleware/limites');
const { texto, senha } = require('../../lib/validacao');

const email = z.email('E-mail inválido').max(254);

const esquemaCadastro = z.object({
  nome: texto(2, 120),
  apelido: z
    .string()
    .trim()
    .regex(/^[\w.-]{3,30}$/, 'Use de 3 a 30 letras, números, ponto, hífen ou sublinhado'),
  email,
  senha,
  // Consentimento obrigatório para uso anônimo dos dados de uso (telemetria e pesquisa, LGPD).
  consentiu_pesquisa: z.literal(true, 'É preciso aceitar o uso anônimo dos dados para criar a conta'),
});
const esquemaLogin = z.object({ identificador: texto(1, 254), senha: z.string().min(1).max(72) });
const esquemaRedefinicao = z.object({ token: z.string().min(20).max(100), senha });

const router = Router();

router.post('/cadastro', limiteAuth, async (req, res) => {
  res.status(201).json(await service.cadastrar(esquemaCadastro.parse(req.body)));
});

router.post('/login', limiteAuth, async (req, res) => {
  res.json(await service.entrar(esquemaLogin.parse(req.body)));
});

router.get('/me', autenticar, (req, res) => {
  res.json(req.usuario);
});

router.post('/esqueci-senha', limiteRecuperacaoIp, limiteRecuperacaoEmail, async (req, res) => {
  await service.solicitarRecuperacao(z.object({ email }).parse(req.body).email);
  res.json({
    mensagem:
      'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha. Não encontrou? Verifique a caixa de spam',
  });
});

router.post('/redefinir-senha', limiteAuth, async (req, res) => {
  await service.redefinirSenha(esquemaRedefinicao.parse(req.body));
  res.status(204).end();
});

module.exports = router;
