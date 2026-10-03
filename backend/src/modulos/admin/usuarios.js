const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcrypt');
const config = require('../../config');
const { query, transacao } = require('../../db/pool');
const { naoEncontrado, conflito } = require('../../lib/erros');
const logger = require('../../lib/logger');
const { idDaRota, senha, esquemaPapel } = require('../../lib/validacao');

const CAMPOS = 'id, nome, email, foto_perfil_url, papel';

const esquemaSenha = z.object({ senha });

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await query(`SELECT ${CAMPOS} FROM usuarios WHERE ativo ORDER BY lower(nome), id`);
  res.json(rows);
});

// Trocar senha_alterada_em derruba todas as sessões do usuário (o JWT carrega a versão da senha).
router.put('/:id/senha', async (req, res) => {
  const id = idDaRota(req);
  const senhaHash = await bcrypt.hash(esquemaSenha.parse(req.body).senha, config.BCRYPT_CUSTO);
  await transacao(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE usuarios SET senha_hash = $2, senha_alterada_em = now(), atualizado_em = now()
       WHERE id = $1 AND ativo`,
      [id, senhaHash],
    );
    if (!rowCount) throw naoEncontrado('Usuário não encontrado');
    await c.query('UPDATE tokens_recuperacao_senha SET usado = true WHERE usuario_id = $1 AND NOT usado', [
      id,
    ]);
  });
  logger.info('admin redefiniu a senha de usuário', { admin_id: req.usuario.id, usuario_id: id });
  res.status(204).end();
});

router.patch('/:id', async (req, res) => {
  const id = idDaRota(req);
  const { admin } = esquemaPapel.parse(req.body);
  // O uuid da rota pode vir em maiúsculas; o do banco é minúsculo.
  if (id.toLowerCase() === req.usuario.id)
    throw conflito('PROPRIO_PAPEL', 'Você não pode alterar o seu próprio papel');

  const usuario = await transacao(async (c) => {
    // Trava os admins: dois rebaixamentos simultâneos não podem, juntos, zerar os administradores.
    if (!admin) await c.query("SELECT 1 FROM usuarios WHERE papel = 'admin' AND ativo FOR UPDATE");
    const { rows } = await c.query(
      `UPDATE usuarios SET papel = CASE WHEN $2 THEN 'admin' ELSE 'usuario' END, atualizado_em = now()
       WHERE id = $1 AND ativo
         AND ($2 OR EXISTS (SELECT 1 FROM usuarios WHERE papel = 'admin' AND ativo AND id <> $1))
       RETURNING ${CAMPOS}`,
      [id, admin],
    );
    if (rows[0]) return rows[0];
    const existe = await c.query('SELECT 1 FROM usuarios WHERE id = $1 AND ativo', [id]);
    if (!existe.rowCount) throw naoEncontrado('Usuário não encontrado');
    throw conflito('ULTIMO_ADMIN', 'O sistema precisa de pelo menos um administrador ativo');
  });
  logger.info('admin alterou o papel de usuário', {
    admin_id: req.usuario.id,
    usuario_id: id,
    papel: usuario.papel,
  });
  res.json(usuario);
});

module.exports = router;
