# Guardião Impacta

O Guardião Impacta é um PWA mobile-first de **conscientização em segurança da informação** para o ambiente corporativo.

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
  - `app_instalado`;
  - `questionario_iniciado` e `questionario_concluido`, com o `momento` (ver Questionários).
- **No banco, com data e hora:** respostas, conclusões, badges e o **histórico de pontos** (`pontuacao_historico`).

**Consentimento:** ter conta é participar da pesquisa, sem identificação pelo nome (os dados exportados são pseudonimizados). O aceite é obrigatório no cadastro (sem ele, a conta não é criada) e não pode ser retirado pelo app: o perfil não tem essa opção e a API ignora o campo. Admins ficam fora da pesquisa.

**Exportação:** Admin → Estatísticas → **Dados da pesquisa** gera CSVs das visões `pesquisa_*` (migration `002`):

- uso diário (DAU);
- engajamento por participante;
- retenção por coorte;
- sessões (sem fim registrado, o fim é o último evento da sessão e `fim_estimado` marca), eventos, respostas, pontos e conquistas com a data (`pesquisa_badges`, migration `005`).

Os CSVs não trazem nome, e-mail nem apelido. Cada pessoa aparece como um pseudônimo, gerado com `PESQUISA_SEGREDO`. Os horários estão em America/Sao_Paulo.

### Questionários (pré e pós)

Os textos ficam só em `backend/src/modulos/questionarios/definicao.js` (base: `docs/questionario-pesquisa.txt`); o app recebe tudo por `GET /api/questionarios/:momento` (`pre` ou `pos`) e o servidor valida cada envio (`POST`, corpo `{ respostas }`): código existe, valor na faixa, obrigatórios presentes, desvios e "Nenhuma" exclusiva em A6.

- **Quem participa:** usuário comum com `consentiu_pesquisa_em` preenchido. Admins e contas sem consentimento nunca veem os questionários nem são bloqueados.
- **Pré (40 itens, cerca de 10 minutos):** obrigatório para todo participante, inclusive contas antigas. `/auth/me`, `/auth/login` e `/auth/cadastro` devolvem `usuario.questionarios.pre_pendente`; com ele `true`, o app só mostra o questionário. O servidor também barra o início de aula (`POST /api/aulas/:id/visitas`) e de trivia (`POST /api/trivia/rodadas`) com 403 `QUESTIONARIO_PRE_PENDENTE` até o pré ser enviado.
- **Desvio:** C1 diferente de "Sim" esconde C2–C4 e o bloco de experiência com o treinamento; respostas enviadas para eles são descartadas.
- **Pós (32 itens, opcional):** abre 14 dias depois do envio do pré e fecha no dia 28 ou no fim de `PESQUISA_DATA_FIM`, o que vier antes (relógio do servidor). Dentro da janela, `usuario.questionarios.pos_pendente` é `true` e `pos_fecha_em` traz o instante em que fecha (o app e os e-mails mostram como prazo o último dia inteiro, o anterior ao fechamento); o app mostra um card na tela inicial, mas nada é bloqueado. Antes de abrir (ou sem o pré) a API dá 404; depois de fechar, 410 `QUESTIONARIO_ENCERRADO`. O aviso de resposta única vem no campo `aviso` da definição. CMP só aparece para quem respondeu C1 = Sim no pré (para os outros, CMP enviado é pergunta desconhecida). Responder não dá pontos nem conquistas.
- **`PESQUISA_DATA_FIM` (produção):** último dia da coleta, `AAAA-MM-DD`, aceito inteiro no fuso de São Paulo (o pós fecha à 00:00 do dia seguinte), mesmo para quem entrou tarde e ainda não chegou ao dia 28. Vazia = sem teto. Defina no `.env` da VM antes de encerrar a coleta e rode `docker compose -f docker-compose.prod.yml up -d api` para aplicar (a API lê a variável só ao subir); valor fora de `AAAA-MM-DD` impede a API de subir.
- **E-mails do pós:** a API manda o convite a partir do dia 14 e o lembrete a partir do dia 18 (no mínimo 1 dia depois do convite), só para participantes ativos com o pós aberto e sem resposta. Uma rodada ao subir e depois a cada hora (fora de teste; em produção só com `SMTP_HOST`). Cada envio é reservado antes em `questionario_emails` (migration `012`, único por pessoa e tipo): reinício, deploy ou rodadas simultâneas não duplicam, e uma falha de envio libera a reserva para a rodada seguinte. Texto fixo, sem o nome da pessoa, com o link `APP_URL/questionario` e o prazo.
- **Uma resposta por pessoa e momento** (`questionario_envios`, único por usuário e momento; reenvio dá 409). O rascunho fica no aparelho até o envio.

**Exportação:** visão `pesquisa_questionario` em Dados da pesquisa (CSV `questionario`, migration `011`), formato longo com as colunas `participante, momento, item, valor, respondido_em`. A tela mostra também quantos participantes já responderam o pré e o pós.

**Codificação:**

- `item`: código do .txt (`FA1`, `KS3`, `A6`, `ABR1`…).
- `valor`: escalas de concordância = 1..5 ou 1..7 (1 = Discordo totalmente); "Não vi / não usei esse recurso" (só GAM1, GAM2, GAM3 e GAM5) = 0, tratar como ausente; escolha = índice a partir de 0 na ordem do .txt (C1: 0 = Sim, 1 = Não, 2 = Não lembro); aberta = o texto; múltipla escolha (A6) = uma linha por opção marcada.
- Item escondido por desvio não tem linha. `respondido_em` é a hora do envio, igual em todas as linhas dele.
- Itens com final `_R` são invertidos só na análise: nota = (máximo da escala + 1) − valor. O ATN deve ser 1; quem errar sai da análise.
- O tempo de resposta vem dos eventos `questionario_iniciado` e `questionario_concluido` (metadata `momento`).

## Desenvolvimento

Só é preciso ter **Docker** (Docker Desktop no Windows ou macOS). Não precisa instalar Node nem Postgres, nem criar `.env`.

### Passo a passo

1. Abra o Docker Desktop e espere ele ficar pronto.
2. Na raiz do repositório, suba tudo em segundo plano:

   ```bash
   docker compose up -d --build
   ```

   A primeira vez demora alguns minutos (baixa as imagens e instala as dependências).

3. Confira se a API subiu: abra http://localhost:4000/api/saude. Deve aparecer `"banco":"ok"`.
4. Abra o app em http://localhost:5173 e crie sua conta em **Cadastrar**.
5. Transforme sua conta em admin (use o e-mail do cadastro):

   ```bash
   docker compose exec api npm run promover-admin -- voce@empresa.com
   ```

   Deve aparecer `<seu apelido> agora é admin.`

6. Recarregue a página do app e vá em **Perfil → Área do administrador** (ou abra http://localhost:5173/admin).

| Endereço | O quê |
| --- | --- |
| http://localhost:5173 | O app. Abra o DevTools no modo celular para ver o layout mobile |
| http://localhost:8025 | Mailpit: caixa de e-mail falsa. O e-mail de "Esqueci minha senha" chega aqui |
| http://localhost:4000/api/saude | A API |
| `localhost:5432` | Postgres (usuário e senha `app`) |

**Depois de mudar o código**, rode `docker compose up -d --build` de novo: sem `--watch`, os containers não acompanham as mudanças sozinhos. Para acompanhar ao vivo, use `docker compose up --watch` (mostra os logs no terminal).

**Parar:** `docker compose down`. Para apagar também o banco (e começar do zero, inclusive o admin): `docker compose down -v`.

**Algo não subiu?** `docker compose ps` mostra o estado de cada container e `docker compose logs api` mostra o erro da API.

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
