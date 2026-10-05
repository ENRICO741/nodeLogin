const { Router } = require('express');
const { z } = require('zod');
const { pool, query, atualizarLinha } = require('../../db/pool');
const { CAMPOS_USUARIO } = require('../../middleware/autenticacao');
const { nome, apelido, textoOpcional } = require('../../lib/validacao');

// ponytail: foto em data URL no banco (máx. ~200 KB, o front redimensiona para 256 px).
// Migrar para storage de objetos (Azure Blob) se o número de usuários crescer.
const TAMANHO_MAXIMO_FOTO = 270_000; // ~200 KB em base64
const fotoDataUrl = z
  .string()
  .max(TAMANHO_MAXIMO_FOTO, 'Imagem grande demais (máx. 200 KB)')
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, 'Envie uma imagem PNG, JPEG ou WebP');

const esquemaPerfil = z
  .object({
    nome,
    apelido,
    bio: textoOpcional(500),
    profissao: textoOpcional(80),
    empresa: textoOpcional(80),
    foto_perfil_url: fotoDataUrl.nullable(),
    // true registra o consentimento (com data); false retira.
    consentiu_pesquisa: z.boolean(),
  })
  .partial()
  .transform(({ consentiu_pesquisa, ...dados }) =>
    consentiu_pesquisa === undefined
      ? dados
      : { ...dados, consentiu_pesquisa_em: consentiu_pesquisa ? new Date() : null },
  );

const router = Router();

router.get('/', async (req, res) => {
  const { rows } = await query(`SELECT ${CAMPOS_USUARIO} FROM usuarios WHERE id = $1`, [req.usuario.id]);
  res.json(rows[0]);
});

router.patch('/', async (req, res) => {
  const dados = esquemaPerfil.parse(req.body);
  const perfil = await atualizarLinha(
    pool,
    'usuarios',
    req.usuario.id,
    Object.keys(dados).length ? { ...dados, atualizado_em: new Date() } : dados,
    CAMPOS_USUARIO,
  );
  res.json(perfil);
});

module.exports = router;
