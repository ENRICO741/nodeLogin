# Guardião Digital

O Guardião Digital é um PWA mobile-first de **conscientização em segurança da informação** para o ambiente corporativo.

- O usuário estuda **aulas** e responde às perguntas de cada uma.
- Pode jogar **trivia** em três níveis de dificuldade.
- Ganha **pontos** e **conquistas** e compete no **ranking**.
- Administradores gerenciam o conteúdo e acompanham as estatísticas.

## Arquitetura

```
frontend/  React 19 + Vite + vite-plugin-pwa   → build estático servido pelo Caddy
backend/   Node 24 + Express 5 + Postgres (pg) → API REST em /api
deploy/    docker compose: Caddy (HTTPS + proxy /api) · API · Postgres
docs/      modelo relacional (ERD)
```

O front e a API ficam sempre na **mesma origem**: `/api` passa pelo proxy do Vite em dev e pelo Caddy em produção. Por isso não há CORS.

### Backend

| Pasta                             | Conteúdo                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/modulos/<domínio>/`          | Rotas e regras de cada domínio: auth, perfil, aulas, trivia, badges, ranking, telemetria, admin  |
| `src/modulos/pontuacao.js`        | Crédito de pontos e concessão de badges, compartilhado por aulas e trivia                        |
| `src/db/migrations/*.sql`         | Schema versionado, aplicado em ordem por `src/db/migrar.js` quando a API sobe                    |
| `src/db/seed.js`                  | Conteúdo inicial, aplicado só em banco vazio                                                     |
| `src/middleware/`                 | Autenticação JWT, papel admin, rate limit e tratamento de erros                                  |

**Autenticação:** JWT Bearer. O middleware lê o usuário do banco a cada requisição. Com isso:

- desativar um usuário ou mudar o papel dele vale na hora;
- trocar a senha invalida os tokens emitidos antes.

**Integridade da pontuação:** a pontuação é garantida no banco, não no cliente.

- Transações com `FOR UPDATE` evitam que duas requisições da mesma visita ou rodada corram em paralelo.
- Índices únicos parciais fazem cada questão pontuar uma única vez por usuário.
- Outro índice único parcial paga o bônus de conclusão só uma vez por aula.

**Formato de erro:** sempre `{ "erro": { "codigo", "mensagem", "detalhes"? } }`. Em erros de validação, `detalhes` lista cada campo com sua mensagem.

### Frontend

| Pasta                  | Conteúdo                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `src/lib/api.js`       | Cliente `fetch` com token e erros padronizados                                          |
| `src/contexto/Auth.jsx`| Sessão do usuário                                                                       |
| `src/hooks/`           | `useApi` (carregar dados) e `useQuiz` (fluxo de perguntas, usado por aulas e trivia)    |
| `src/estilos/tokens.css` | Cores, espaçamentos e tipografia. Tema claro e escuro automático                      |

## Desenvolvimento

Pré-requisitos: Node 24 ou mais recente e Docker.

1. Suba o Postgres local. Ele já cria também o banco de testes:
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```
2. Configure o backend:
   ```bash
   cd backend
   printf 'DATABASE_URL=postgres://app:app@localhost:5432/security_awareness\nJWT_SECRET=%s\n' \
     "$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")" > .env
   npm install
   npm run dev      # API em http://localhost:4000; aplica migrações e seed ao subir
   ```
3. Em outro terminal, suba o frontend:
   ```bash
   cd frontend
   npm install
   npm run dev      # http://localhost:5173 (proxy /api → :4000)
   ```
4. Promova um usuário a admin (ele precisa ter se cadastrado antes):
   ```bash
   cd backend && npm run promover-admin -- email@empresa.com
   ```

Sem SMTP configurado, o link de redefinição de senha aparece no log da API.

### Testes e qualidade

```bash
npm install && npx eslint . && npx prettier --check .   # na raiz
cd backend && npm test                                    # integração contra o Postgres de teste
cd frontend && npm test                                   # vitest + Testing Library
```

O GitHub Actions (`.github/workflows/ci.yml`) roda tudo isso a cada push.

## Deploy

O deploy é numa VM Azure com Docker Compose. O passo a passo está em [deploy/README.md](deploy/README.md).

## Variáveis de ambiente

Todas estão documentadas em [.env.example](.env.example).
