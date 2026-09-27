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
deploy/    Caddyfile, build do PWA para produção, backup e guia da VM
conteudo/  aulas em HTML (uma pasta por aula) · guia e modelo para quem escreve
docs/      modelo relacional (ERD)

docker-compose.yml       desenvolvimento: Postgres · API · Vite · Mailpit
docker-compose.prod.yml  produção: Caddy (HTTPS + proxy /api) · API · Postgres
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

## Aulas

As aulas são arquivos HTML em [`conteudo/aulas/`](conteudo/), uma pasta por aula (`NN-assunto/aula.html` + `imagens/`), com as perguntas no próprio HTML.

- **Importação:** acontece quando a API sobe. Ela valida tudo, atualiza sem perder respostas e desativa perguntas removidas do arquivo.
- **Arquivo com erro:** não derruba a API. O erro vai para o log e o banco fica como estava.
- **Como escrever:** o formato, o modelo e as regras estão em [conteudo/README.md](conteudo/README.md).
- **Validar sem banco:** `npm run importar-aulas -- --validar`. A CI roda esse mesmo comando.

## Telemetria e pesquisa (TCC)

**O que o app registra:**

- **Sessões:** abrem no login e fecham quando o app vai para segundo plano. Se o app voltar em até 30 minutos, a mesma sessão é retomada. Cada sessão guarda se o app está instalado (PWA) e a largura da tela.
- **Eventos:**
  - `tela_visualizada`, com a tela anterior;
  - `aula_conteudo_lido`, com o tempo e a rolagem máxima;
  - `aula_iniciada`, `quiz_respondido` e `aula_concluida`;
  - `trivia_iniciada`;
  - `resultado_visualizado`;
  - `app_instalado`.
- **No banco, com data e hora:** respostas, conclusões, badges e o **histórico de pontos** (`pontuacao_historico`).

**Consentimento:** é opcional, pedido no cadastro e alterável no perfil. Só quem consentiu entra na pesquisa.

**Exportação:** Admin → Estatísticas → **Dados da pesquisa** gera CSVs das visões `pesquisa_*` (migration `002`):

- uso diário (DAU);
- engajamento por participante;
- retenção por coorte;
- sessões, eventos, respostas e pontos.

Os CSVs não trazem nome, e-mail nem apelido. Cada pessoa aparece como um pseudônimo, gerado com `PESQUISA_SEGREDO`. Os horários estão em America/Sao_Paulo.

## Desenvolvimento

Só é preciso ter **Docker** (Docker Desktop no Windows ou macOS). Não precisa instalar Node nem Postgres.

```bash
docker compose up --watch
```

| Endereço | O quê |
| --- | --- |
| http://localhost:5173 | O app. Abra o DevTools no modo celular para ver o layout mobile |
| http://localhost:8025 | Mailpit: caixa de e-mail falsa. O e-mail de "Esqueci minha senha" chega aqui |
| http://localhost:4000/api/saude | A API |
| `localhost:5432` | Postgres (usuário e senha `app`) |

- Com `--watch`, mudanças em `backend/src` ou `conteudo/` reiniciam a API (e reimportam as aulas), e mudanças em `frontend/src` recarregam a página.
- Mudar um `package.json` reconstrói a imagem.
- `Ctrl+C` para tudo. `docker compose down -v` também apaga o banco.

Comandos úteis, com o ambiente rodando:

```bash
docker compose exec api npm run promover-admin -- voce@empresa.com   # vira admin (cadastre-se antes)
docker compose exec api npm run importar-aulas -- --validar          # confere as aulas de conteudo/
docker compose exec api npm run test:cobertura                       # testes do backend
docker compose exec web npm run test:cobertura                       # testes do frontend
docker compose logs -f api                                           # logs da API
```

<details>
<summary>Sem Docker para a API e o front (Node 24 na máquina)</summary>

Suba só o banco com `docker compose up -d db`. Depois, no `backend/`, crie um `.env`:

```
DATABASE_URL=postgres://app:app@localhost:5432/security_awareness
JWT_SECRET=<32+ caracteres>
```

Em seguida rode `npm install && npm run dev` no `backend/` e `npm install && npm run dev` no `frontend/`. Sem SMTP, o link de redefinição de senha aparece no log da API.

</details>

### Conferir o build de produção na sua máquina

```bash
DOMAIN=:80 APP_URL=http://localhost POSTGRES_PASSWORD=local JWT_SECRET=local-local-local-local-local-local-local   docker compose -f docker-compose.prod.yml -p guardiao-local up -d --build
```

O app abre em http://localhost, com o mesmo Caddy, CSP e service worker da VM, mas sem HTTPS. Para derrubar: `docker compose -p guardiao-local -f docker-compose.prod.yml down -v`.

### Testes e qualidade

```bash
npm install && npx eslint . && npx prettier --check .   # na raiz
cd backend && npm run test:cobertura                      # node:test + supertest + c8 (Postgres de teste)
cd frontend && npm run test:cobertura                     # vitest + Testing Library + v8
```

A cobertura mínima é de 80% em linhas, branches, funções e statements. Abaixo disso o comando falha, e a CI também.

Os testes rodam também dentro dos containers de dev (veja os comandos acima).

**Backend** (`backend/test/`, 240 testes):

- `unit/`: validação, erros, logger, mailer e config. Não precisa de banco.
- `integracao/`: todas as rotas contra o Postgres de teste. Cobrem:
  - entrada válida e inválida;
  - autorização entre usuários;
  - anti-farm e corridas de pontuação;
  - recuperação de senha;
  - rate limit;
  - scripts de linha de comando e boot/desligamento do servidor.

**Frontend** (`frontend/src/testes/`, 171 testes):

- `utils.jsx` tem um `fetch` falso. As páginas rodam pelo `api.js` real e pelo `App` inteiro.
- Os testes cobrem cada estado das telas: carregando, vazio, erro com nova tentativa, sucesso e validação por campo.

O GitHub Actions (`.github/workflows/ci.yml`) roda tudo isso a cada push.

## Deploy

O deploy é numa VM Azure com Docker Compose. O passo a passo está em [deploy/README.md](deploy/README.md).

## Variáveis de ambiente

Todas estão documentadas em [.env.example](.env.example).
