-- Schema inicial conforme docs/modelo-relacional.md.

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome varchar(120) NOT NULL,
  apelido varchar(30) NOT NULL,
  email varchar(254) NOT NULL,
  senha_hash text NOT NULL,
  foto_perfil_url text,
  bio varchar(500),
  profissao varchar(80),
  empresa varchar(80),
  papel varchar(10) NOT NULL DEFAULT 'usuario' CHECK (papel IN ('usuario', 'admin')),
  pontuacao_total integer NOT NULL DEFAULT 0 CHECK (pontuacao_total >= 0),
  pontuacao_atualizada_em timestamptz,
  senha_alterada_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuarios_apelido_uk ON usuarios (lower(apelido));
CREATE UNIQUE INDEX usuarios_email_uk ON usuarios (lower(email));
CREATE INDEX usuarios_ranking_idx ON usuarios (pontuacao_total DESC) WHERE ativo AND papel = 'usuario';

CREATE TABLE tokens_recuperacao_senha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expira_em timestamptz NOT NULL,
  usado boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tokens_recuperacao_usuario_idx ON tokens_recuperacao_senha (usuario_id);

CREATE TABLE aulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo varchar(160) NOT NULL,
  ordem integer NOT NULL UNIQUE,
  conteudo_html text NOT NULL,
  pontos_conclusao integer NOT NULL DEFAULT 0 CHECK (pontos_conclusao >= 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE questoes_aula (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aula_id uuid NOT NULL REFERENCES aulas (id) ON DELETE CASCADE,
  enunciado text NOT NULL,
  imagem_url text,
  alternativa_a text NOT NULL,
  alternativa_b text NOT NULL,
  alternativa_c text NOT NULL,
  alternativa_d text NOT NULL,
  resposta_correta char(1) NOT NULL CHECK (resposta_correta IN ('a', 'b', 'c', 'd')),
  explicacao text,
  pontos integer NOT NULL DEFAULT 10 CHECK (pontos >= 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX questoes_aula_aula_idx ON questoes_aula (aula_id);

CREATE TABLE aula_visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  aula_id uuid NOT NULL REFERENCES aulas (id) ON DELETE CASCADE,
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  finalizada_em timestamptz,
  concluida boolean NOT NULL DEFAULT false,
  pontos_conclusao_ganhos boolean NOT NULL DEFAULT false
);
CREATE INDEX aula_visitas_usuario_aula_idx ON aula_visitas (usuario_id, aula_id);
-- Bônus de conclusão pago uma única vez por usuário e aula.
CREATE UNIQUE INDEX aula_visitas_bonus_uk ON aula_visitas (usuario_id, aula_id) WHERE pontos_conclusao_ganhos;

CREATE TABLE aula_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id uuid NOT NULL REFERENCES aula_visitas (id) ON DELETE CASCADE,
  questao_id uuid NOT NULL REFERENCES questoes_aula (id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  correta boolean NOT NULL,
  pontuou boolean NOT NULL DEFAULT false,
  respondido_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visita_id, questao_id)
);
CREATE INDEX aula_respostas_questao_idx ON aula_respostas (questao_id);
-- Cada questão pontua uma única vez por usuário, em qualquer visita.
CREATE UNIQUE INDEX aula_respostas_pontuou_uk ON aula_respostas (usuario_id, questao_id) WHERE pontuou;

CREATE TABLE questoes_trivia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dificuldade varchar(10) NOT NULL CHECK (dificuldade IN ('facil', 'media', 'dificil')),
  enunciado text NOT NULL,
  imagem_url text,
  alternativa_a text NOT NULL,
  alternativa_b text NOT NULL,
  alternativa_c text NOT NULL,
  alternativa_d text NOT NULL,
  resposta_correta char(1) NOT NULL CHECK (resposta_correta IN ('a', 'b', 'c', 'd')),
  explicacao text,
  aula_referencia_id uuid REFERENCES aulas (id) ON DELETE SET NULL,
  pontos integer NOT NULL DEFAULT 10 CHECK (pontos >= 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX questoes_trivia_dificuldade_idx ON questoes_trivia (dificuldade) WHERE ativo;

CREATE TABLE trivia_rodadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  dificuldade varchar(10) NOT NULL CHECK (dificuldade IN ('facil', 'media', 'dificil')),
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  finalizada_em timestamptz,
  pontos_ganhos integer NOT NULL DEFAULT 0 CHECK (pontos_ganhos >= 0)
);
CREATE INDEX trivia_rodadas_usuario_idx ON trivia_rodadas (usuario_id);

-- Questões sorteadas para cada rodada.
CREATE TABLE trivia_rodada_questoes (
  rodada_id uuid NOT NULL REFERENCES trivia_rodadas (id) ON DELETE CASCADE,
  questao_id uuid NOT NULL REFERENCES questoes_trivia (id) ON DELETE CASCADE,
  ordem smallint NOT NULL,
  PRIMARY KEY (rodada_id, questao_id)
);

CREATE TABLE trivia_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rodada_id uuid NOT NULL REFERENCES trivia_rodadas (id) ON DELETE CASCADE,
  questao_id uuid NOT NULL REFERENCES questoes_trivia (id) ON DELETE CASCADE,
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  correta boolean NOT NULL,
  pontuou boolean NOT NULL DEFAULT false,
  respondido_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rodada_id, questao_id),
  -- Só aceita resposta a uma questão sorteada para a rodada.
  FOREIGN KEY (rodada_id, questao_id) REFERENCES trivia_rodada_questoes (rodada_id, questao_id) ON DELETE CASCADE
);
CREATE INDEX trivia_respostas_questao_idx ON trivia_respostas (questao_id);
CREATE UNIQUE INDEX trivia_respostas_pontuou_uk ON trivia_respostas (usuario_id, questao_id) WHERE pontuou;

CREATE TABLE badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome varchar(80) NOT NULL,
  descricao text NOT NULL,
  imagem_url text,
  tipo_criterio varchar(20) NOT NULL CHECK (tipo_criterio IN ('aula_concluida', 'primeira_trivia', 'todas_aulas')),
  aula_id uuid REFERENCES aulas (id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo_criterio <> 'aula_concluida' OR aula_id IS NOT NULL)
);

CREATE TABLE usuario_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES badges (id) ON DELETE CASCADE,
  obtida_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, badge_id)
);

CREATE TABLE sessoes_app (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  finalizada_em timestamptz
);
CREATE INDEX sessoes_app_usuario_idx ON sessoes_app (usuario_id);

CREATE TABLE eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  sessao_id uuid REFERENCES sessoes_app (id) ON DELETE CASCADE,
  tipo_evento varchar(40) NOT NULL,
  tela varchar(60),
  elemento varchar(80),
  duracao_ms integer CHECK (duracao_ms >= 0),
  metadata jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eventos_sessao_idx ON eventos (sessao_id);
CREATE INDEX eventos_usuario_idx ON eventos (usuario_id);
