# Modelo relacional

Este é o modelo implementado em `backend/src/db/migrations/`. Ele tem duas diferenças em relação ao ERD original do TCC:

- **`trivia_rodada_questoes`** (tabela nova): guarda quais questões foram sorteadas para cada rodada.
  - O servidor só aceita respostas a essas questões.
  - A rodada pode ser retomada depois de recarregar a página.
- **`usuarios.senha_alterada_em`** (coluna nova): quando a senha muda, os JWTs emitidos antes deixam de valer.

## Regras garantidas pelo banco

- `apelido` e `email` são únicos, sem diferenciar maiúsculas de minúsculas.
- Cada questão (de aula ou de trivia) pontua só uma vez por usuário. Isso é garantido por um índice único parcial `(usuario_id, questao_id) WHERE pontuou`.
- O bônus de conclusão de cada aula é pago só uma vez por usuário. Índice único parcial `(usuario_id, aula_id) WHERE pontos_conclusao_ganhos`.
- Colunas com valores fixos têm `CHECK`: `papel`, `dificuldade`, `resposta_correta`, `tipo_criterio` e pontos maiores ou iguais a zero.

```mermaid
erDiagram
  USUARIOS ||--o{ TOKENS_RECUPERACAO_SENHA : solicita
  USUARIOS ||--o{ AULA_VISITAS : visita
  USUARIOS ||--o{ AULA_RESPOSTAS : responde_aula
  USUARIOS ||--o{ TRIVIA_RODADAS : joga
  USUARIOS ||--o{ TRIVIA_RESPOSTAS : responde_trivia
  USUARIOS ||--o{ USUARIO_BADGES : conquista
  USUARIOS ||--o{ SESSOES_APP : abre
  USUARIOS ||--o{ EVENTOS : gera

  AULAS ||--o{ QUESTOES_AULA : contem
  AULAS ||--o{ AULA_VISITAS : recebe_visita
  AULAS ||--o{ QUESTOES_TRIVIA : e_referencia_de
  AULAS ||--o{ BADGES : e_criterio_de

  QUESTOES_AULA ||--o{ AULA_RESPOSTAS : e_respondida_em
  AULA_VISITAS ||--o{ AULA_RESPOSTAS : agrupa

  QUESTOES_TRIVIA ||--o{ TRIVIA_RODADA_QUESTOES : e_sorteada_em
  TRIVIA_RODADAS ||--o{ TRIVIA_RODADA_QUESTOES : sorteia
  QUESTOES_TRIVIA ||--o{ TRIVIA_RESPOSTAS : e_respondida_em
  TRIVIA_RODADAS ||--o{ TRIVIA_RESPOSTAS : agrupa

  BADGES ||--o{ USUARIO_BADGES : e_concedida_como

  SESSOES_APP ||--o{ EVENTOS : contextualiza

  USUARIOS {
    uuid id PK
    string nome
    string apelido UK
    string email UK
    string senha_hash
    text foto_perfil_url
    text bio
    string profissao
    string empresa
    string papel
    int pontuacao_total
    timestamp pontuacao_atualizada_em
    timestamp senha_alterada_em
    boolean ativo
    timestamp criado_em
    timestamp atualizado_em
  }

  TOKENS_RECUPERACAO_SENHA {
    uuid id PK
    uuid usuario_id FK
    string token_hash
    timestamp expira_em
    boolean usado
    timestamp criado_em
  }

  AULAS {
    uuid id PK
    string titulo
    int ordem UK
    text conteudo_html
    int pontos_conclusao
    boolean ativo
    timestamp criado_em
    timestamp atualizado_em
  }

  QUESTOES_AULA {
    uuid id PK
    uuid aula_id FK
    text enunciado
    text imagem_url
    text alternativa_a
    text alternativa_b
    text alternativa_c
    text alternativa_d
    char resposta_correta
    text explicacao
    int pontos
    boolean ativo
    timestamp criado_em
  }

  AULA_VISITAS {
    uuid id PK
    uuid usuario_id FK
    uuid aula_id FK
    timestamp iniciada_em
    timestamp finalizada_em
    boolean concluida
    boolean pontos_conclusao_ganhos
  }

  AULA_RESPOSTAS {
    uuid id PK
    uuid visita_id FK
    uuid questao_id FK
    uuid usuario_id FK
    boolean correta
    boolean pontuou
    timestamp respondido_em
  }

  QUESTOES_TRIVIA {
    uuid id PK
    string dificuldade
    text enunciado
    text imagem_url
    text alternativa_a
    text alternativa_b
    text alternativa_c
    text alternativa_d
    char resposta_correta
    text explicacao
    uuid aula_referencia_id FK
    int pontos
    boolean ativo
    timestamp criado_em
  }

  TRIVIA_RODADAS {
    uuid id PK
    uuid usuario_id FK
    string dificuldade
    timestamp iniciada_em
    timestamp finalizada_em
    int pontos_ganhos
  }

  TRIVIA_RODADA_QUESTOES {
    uuid rodada_id PK, FK
    uuid questao_id PK, FK
    int ordem
  }

  TRIVIA_RESPOSTAS {
    uuid id PK
    uuid rodada_id FK
    uuid questao_id FK
    uuid usuario_id FK
    boolean correta
    boolean pontuou
    timestamp respondido_em
  }

  BADGES {
    uuid id PK
    string nome
    text descricao
    text imagem_url
    string tipo_criterio
    uuid aula_id FK
    boolean ativo
    timestamp criado_em
  }

  USUARIO_BADGES {
    uuid id PK
    uuid usuario_id FK
    uuid badge_id FK
    timestamp obtida_em
  }

  SESSOES_APP {
    uuid id PK
    uuid usuario_id FK
    timestamp iniciada_em
    timestamp finalizada_em
  }

  EVENTOS {
    uuid id PK
    uuid usuario_id FK
    uuid sessao_id FK
    string tipo_evento
    string tela
    string elemento
    int duracao_ms
    jsonb metadata
    timestamp criado_em
  }
```
