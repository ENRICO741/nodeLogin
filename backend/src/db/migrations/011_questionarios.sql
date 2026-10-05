-- Questionários da pesquisa (pré e pós). O texto das perguntas fica no código
-- (backend/src/modulos/questionarios/definicao.js); aqui só as respostas.

-- Um envio por usuário e momento: o UNIQUE segura o duplo envio.
CREATE TABLE questionario_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  momento varchar(3) NOT NULL CHECK (momento IN ('pre', 'pos')),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, momento)
);

-- Formato longo: uma linha por item; múltipla escolha = uma linha por opção marcada.
-- valor: escala 1..N (0 = "não usei"), escolha = índice 0-based da opção, aberta = o texto.
CREATE TABLE questionario_respostas (
  envio_id uuid NOT NULL REFERENCES questionario_envios (id) ON DELETE CASCADE,
  item varchar(10) NOT NULL,
  valor text NOT NULL
);
-- Unicidade pelo md5 do valor: a aberta (até 2000 caracteres, 4 bytes cada com emoji) estouraria o btree.
CREATE UNIQUE INDEX questionario_respostas_unico ON questionario_respostas (envio_id, item, md5(valor));

-- Exportação (mesmo padrão das pesquisa_* da 002). Item oculto por desvio não tem linha.
CREATE VIEW pesquisa_questionario AS
SELECT p.participante, e.momento, r.item, r.valor,
  e.enviado_em AT TIME ZONE 'America/Sao_Paulo' AS respondido_em
FROM questionario_respostas r
JOIN questionario_envios e ON e.id = r.envio_id
JOIN pesquisa_participantes p ON p.id = e.usuario_id
ORDER BY p.participante, e.momento DESC, r.item, r.valor;
