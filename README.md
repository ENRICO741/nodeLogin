# Guardião Impacta

[![CI](https://github.com/ENRICO741/nodeLogin/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ENRICO741/nodeLogin/actions/workflows/ci.yml)
![Node 24](https://img.shields.io/badge/Node-24-339933?logo=nodedotjs&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Testes](https://img.shields.io/badge/testes-860-success)
![Cobertura](https://img.shields.io/badge/cobertura-%E2%89%A580%25-success)

PWA mobile-first de **conscientização em segurança da informação** para o ambiente corporativo, desenvolvido como Trabalho de Conclusão de Curso. O projeto avalia se a gamificação torna o treinamento mais engajador: o app ensina, pontua e, ao mesmo tempo, coleta os dados pseudonimizados da pesquisa.

**Produção:** https://guardiaoimpacta.brazilsouth.cloudapp.azure.com (disponível até 02/11/2026)

## Sumário

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Arquitetura](#arquitetura)
- [Segurança](#segurança)
- [Conteúdo](#conteúdo)
- [Pesquisa (TCC)](#pesquisa-tcc)
- [Desenvolvimento](#desenvolvimento)
- [Testes e qualidade](#testes-e-qualidade)
- [Deploy e CI/CD](#deploy-e-cicd)
- [Decisões de escopo](#decisões-de-escopo)

## Funcionalidades

| Área            | O que faz                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aulas**       | Trilha fixa de 15 aulas (LGPD, phishing, engenharia social, senhas, incidentes…) com 4 perguntas ao final de cada aula. Cada pergunta pontua só no primeiro acerto; a aula concluída paga um bônus uma única vez.       |
| **Modo trivia** | 180 questões em três níveis (60 por nível), cada uma ligada a uma aula. Abre depois das 15 aulas concluídas. Rodada de 5 questões, que só termina após todas serem respondidas. |
| **Quiz**        | As alternativas aparecem em ordem sorteada a cada tentativa, nas aulas e na trivia.                                    |
| **Gamificação** | Pontos, conquistas (badges) e ranking.                                                                                                                                                            |
| **PWA**         | Instalável, com convite para instalar (no máximo a cada 3 dias; no iOS, ensina o caminho pelo Compartilhar), aviso de nova versão e tema claro/escuro.                                             |
| **Pesquisa**    | Consentimento no cadastro, questionários pré e pós, telemetria de uso e exportação em CSV pseudonimizado.                                                                                         |
| **Admin**       | Aulas, questões e trivia; usuários (numeração, apelido, papel, datas de resposta do pré e do pós); estatísticas e dados da pesquisa.                                                              |

## Stack

| Camada      | Tecnologias                                                                     |
| ----------- | ------------------------------------------------------------------------------- |
| Frontend    | React 19, Vite, vite-plugin-pwa, React Router 7, DOMPurify, CSS Modules         |
| Backend     | Node 24, Express 5, `pg`, zod, JWT, bcrypt, helmet, express-rate-limit, nodemailer |
| Banco       | PostgreSQL 17, migrations SQL versionadas                                       |
| Infra       | Docker Compose, Caddy (HTTPS automático), VM Azure, GitHub Actions com OIDC     |
| Testes      | node:test + supertest + c8 (backend), Vitest + Testing Library (frontend), k6 (carga) |

## Arquitetura

```
frontend/  React 19 + Vite + vite-plugin-pwa   → build estático servido pelo Caddy
backend/   Node 24 + Express 5 + Postgres (pg) → API REST em /api
deploy/    Caddyfile, scripts da VM e deploy/azure/ (template da VM e cloud-init)
conteudo/  aulas em HTML (uma pasta por aula) · guia e modelo para quem escreve
docs/      modelo relacional (ERD)

docker-compose.yml       desenvolvimento: Postgres · API · Vite · Mailpit
docker-compose.prod.yml  produção: Caddy (HTTPS + proxy /api) · API · Postgres
```

O front e a API ficam sempre na **mesma origem**: `/api` passa pelo proxy do Vite em dev e pelo Caddy em produção. Por isso não há CORS.

### Backend

| Pasta                     | Conteúdo                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/modulos/<domínio>/`  | Rotas e regras de cada domínio: auth, perfil, aulas, trivia, badges, ranking, telemetria, questionários, admin |
| `src/modulos/pontuacao.js`| Crédito de pontos e concessão de badges, compartilhado por aulas e trivia                                    |
| `src/db/migrations/*.sql` | Schema versionado (001 a 012), aplicado em ordem por `src/db/migrar.js` quando a API sobe                    |
| `src/db/seed.js`          | Questões da trivia e conquistas. Incremental: insere só o que falta e não toca no que o admin editou         |
| `src/middleware/`         | Autenticação JWT, papel admin, rate limit e tratamento de erros                                              |

**Formato de erro:** sempre `{ "erro": { "codigo", "mensagem", "detalhes"? } }`. Em erros de validação, `detalhes` lista cada campo com sua mensagem.

**Migrations:** uma migration aplicada nunca é editada; mudança de schema é sempre uma migration nova. O teste `test/unit/migracoes.test.js` guarda o hash de cada arquivo e falha se algum mudar.

### Frontend

| Pasta                    | Conteúdo                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `src/lib/api.js`         | Cliente `fetch` com token e erros padronizados                                       |
| `src/contexto/Auth.jsx`  | Sessão do usuário                                                                    |
| `src/hooks/`             | `useApi` (carregar dados) e `useQuiz` (fluxo de perguntas, usado por aulas e trivia) |
| `src/estilos/tokens.css` | Cores, espaçamentos e tipografia. Tema claro e escuro                                |

## Segurança

- **Autenticação:** JWT Bearer. O middleware lê o usuário do banco a cada requisição, então desativar alguém ou mudar o papel vale na hora, e trocar a senha invalida os tokens emitidos antes. Senhas com bcrypt.
- **Integridade da pontuação:** garantida no banco, nunca no cliente. Transações com `FOR UPDATE` serializam requisições da mesma visita ou rodada; índices únicos parciais fazem cada questão pontuar uma vez por usuário e o bônus de conclusão ser pago uma vez por aula.
- **Rate limit:** auth somada por IP (100 em 15 min), login por conta + IP (10 em 15 min) e recuperação de senha por IP e por e-mail (3 por hora, sem revelar se o limite estourou).
- **Cabeçalhos:** helmet na API; no Caddy, CSP restritiva (`script-src 'self'`, `frame-ancestors 'none'`) e HTTPS automático.
- **Infra:** só as portas 80 e 443 ficam abertas; a VM não tem porta 22 exposta. O deploy entra no Azure por OIDC, sem segredo guardado no GitHub.
- **Dados da pesquisa:** os CSVs não trazem nome, e-mail nem apelido; cada pessoa vira um pseudônimo derivado de `PESQUISA_SEGREDO`.

## Conteúdo

### Aulas

As aulas são arquivos HTML em [`conteudo/aulas/`](conteudo/), uma pasta por aula (`NN-assunto/aula.html` + `imagens/`), com as perguntas no próprio HTML. A trilha é fixa: aulas 01 a 15.

- **Importação:** acontece quando a API sobe. Ela valida tudo, atualiza sem perder respostas e desativa perguntas removidas do arquivo.
- **Arquivo com erro:** não derruba a API. O erro vai para o log e o banco fica como estava.
- **Como escrever:** formato, modelo e regras em [conteudo/README.md](conteudo/README.md).
- **Validar sem banco:** `npm run importar-aulas -- --validar`. A CI roda esse mesmo comando.

### Trivia

As 180 questões ficam em `backend/src/db/seed.js`, cada uma com o slug da aula a que pertence. O seed roda a cada subida da API e só insere as questões que ainda não existem (pelo enunciado). Se a aula ainda não tiver sido importada, a questão fica fora do sorteio e é ligada assim que a aula existir.

## Pesquisa (TCC)

### Telemetria

- **Sessões:** abrem no login e fecham quando o app vai para segundo plano. Se o app voltar em até 30 minutos, a mesma sessão é retomada. Cada sessão guarda se o app está instalado (PWA) e a largura da tela.
- **Eventos:** `tela_visualizada` (com a tela anterior), `aula_conteudo_lido` (tempo e rolagem máxima), `aula_iniciada`, `quiz_respondido`, `aula_concluida`, `trivia_iniciada`, `resultado_visualizado`, `app_instalado`, `questionario_iniciado` e `questionario_concluido` (com o `momento`).
- **No banco, com data e hora:** respostas, conclusões, badges e o **histórico de pontos** (`pontuacao_historico`).

### Consentimento

Ter conta é participar da pesquisa, sem identificação pelo nome (os dados exportados são **pseudonimizados**, não totalmente anônimos). O aceite é obrigatório no cadastro e não pode ser retirado pelo app: o perfil não tem essa opção e a API ignora o campo. Admins ficam fora da pesquisa.

### Exportação

Admin → Estatísticas → **Dados da pesquisa** gera CSVs das visões `pesquisa_*`:

- uso diário (DAU), engajamento por participante e retenção por coorte;
- sessões (sem fim registrado, o fim é o último evento e `fim_estimado` marca), eventos, respostas, pontos e conquistas;
- questionários (`pesquisa_questionario`, ver abaixo).

Os horários estão em America/Sao_Paulo. Trocar `PESQUISA_SEGREDO` muda todos os pseudônimos.

### Questionários (pré e pós)

Os textos ficam só em `backend/src/modulos/questionarios/definicao.js`. O app recebe tudo por `GET /api/questionarios/:momento` (`pre` ou `pos`), e o servidor valida cada envio (`POST`, corpo `{ respostas }`): código existe, valor na faixa, obrigatórios presentes, desvios e "Nenhuma" exclusiva em A6.

- **Quem participa:** usuário comum com `consentiu_pesquisa_em` preenchido, inclusive contas antigas. Admins e contas sem consentimento nunca veem os questionários nem são bloqueados.
- **Pré (40 itens, cerca de 10 minutos):** obrigatório. `/auth/me`, `/auth/login` e `/auth/cadastro` devolvem `usuario.questionarios.pre_pendente`; com ele `true`, o app só mostra o questionário, e a API barra o início de aula (`POST /api/aulas/:id/visitas`) e de trivia (`POST /api/trivia/rodadas`) com 403 `QUESTIONARIO_PRE_PENDENTE`.
- **Conhecimento:** 7 situações do dia a dia (KS1–KS7), iguais no pré e no pós, com 4 opções (uma correta, duas erradas plausíveis e "Não sei"). A nota é a soma de acertos, de 0 a 7. O formato substituiu escalas de concordância para evitar efeito teto e desejabilidade social.
- **Desvio:** C1 diferente de "Sim" esconde C2–C4 e o bloco de experiência com o treinamento anterior; respostas enviadas para eles são descartadas.
- **Pós (32 itens, opcional):** abre 14 dias depois do envio do pré e fecha no dia 28 ou no fim de `PESQUISA_DATA_FIM`, o que vier antes (relógio do servidor). Dentro da janela, `usuario.questionarios.pos_pendente` é `true` e `pos_fecha_em` traz o fechamento; o app mostra um card na tela inicial, sem bloquear nada. Antes de abrir, a API dá 404; depois de fechar, 410 `QUESTIONARIO_ENCERRADO`. CMP só aparece para quem respondeu C1 = Sim no pré. Responder não dá pontos nem conquistas.
- **`PESQUISA_DATA_FIM`:** último dia da coleta (`AAAA-MM-DD`), aceito inteiro no fuso de São Paulo. Vazia = sem teto; valor inválido impede a API de subir. A API lê a variável só ao subir: depois de mudar o `.env` da VM, rode `docker compose -f docker-compose.prod.yml up -d api`.
- **E-mails do pós:** convite a partir do dia 14 e lembrete a partir do dia 18, só para participantes ativos com o pós aberto e sem resposta. Rodam ao subir e depois a cada hora (em produção, só com `SMTP_HOST`). Cada envio é reservado antes em `questionario_emails` (único por pessoa e tipo): reinício, deploy ou rodadas simultâneas não duplicam, e uma falha libera a reserva para a rodada seguinte.
- **Uma resposta por pessoa e momento** (`questionario_envios`; reenvio dá 409). O rascunho fica no aparelho até o envio.

<details>
<summary>Codificação do CSV <code>questionario</code></summary>

Formato longo, com as colunas `participante, momento, item, valor, respondido_em`. Esse contrato é fixo: a análise depende dele.

- `item`: código do item (`FA1`, `KS3`, `A6`, `ABR1`…).
- `valor`: escalas de concordância = 1..5 ou 1..7 (1 = Discordo totalmente); "Não vi / não usei esse recurso" (só GAM1, GAM2, GAM3 e GAM5) = 0, tratar como ausente; escolha = índice a partir de 0 (C1: 0 = Sim, 1 = Não, 2 = Não lembro); aberta = o texto; múltipla escolha (A6) = uma linha por opção marcada.
- Item escondido por desvio não tem linha. `respondido_em` é a hora do envio, igual em todas as linhas dele.
- Itens com final `_R` são invertidos só na análise: nota = (máximo da escala + 1) − valor. O ATN deve ser 1; quem errar sai da análise.
- O tempo de resposta vem dos eventos `questionario_iniciado` e `questionario_concluido`.

</details>

## Desenvolvimento

Só é preciso ter **Docker** (Docker Desktop no Windows ou macOS). Não precisa instalar Node nem Postgres, nem criar `.env`.

```bash
docker compose up -d --build                                           # sobe Postgres, API, Vite e Mailpit
docker compose exec api npm run promover-admin -- voce@empresa.com     # depois de se cadastrar pelo app
```

A primeira subida demora alguns minutos. Confira a API em http://localhost:4000/api/saude (deve mostrar `"banco":"ok"`), crie sua conta em http://localhost:5173 e, depois de promovê-la, recarregue a página e vá em **Perfil → Área do administrador**.

| Endereço                        | O quê                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------ |
| http://localhost:5173           | O app. Abra o DevTools no modo celular para ver o layout mobile                |
| http://localhost:8025           | Mailpit: caixa de e-mail falsa. O e-mail de "Esqueci minha senha" chega aqui   |
| http://localhost:4000/api/saude | A API                                                                          |
| `localhost:5432`                | Postgres (usuário e senha `app`)                                               |

- **Depois de mudar o código ou o conteúdo:** `docker compose up -d --build --force-recreate`. Os containers rodam o código copiado na imagem; para acompanhar ao vivo, use `docker compose up --watch`.
- **Parar:** `docker compose down`. Para apagar também o banco: `docker compose down -v`.
- **Algo não subiu?** `docker compose ps` e `docker compose logs api`.

Comandos úteis com o ambiente rodando:

```bash
docker compose exec api npm run importar-aulas -- --validar   # confere as aulas de conteudo/
docker compose exec api npm run test:cobertura                # testes do backend
docker compose exec web npm run test:cobertura                # testes do frontend
docker compose logs -f api                                    # logs da API
```

<details>
<summary>Sem Docker para a API e o front (Node 24 na máquina)</summary>

Suba só o banco com `docker compose up -d db`. Depois, no `backend/`, crie um `.env`:

```
DATABASE_URL=postgres://app:app@localhost:5432/security_awareness
JWT_SECRET=<32+ caracteres>
```

Em seguida rode `npm install && npm run dev` no `backend/` e no `frontend/`. Sem SMTP, o link de redefinição de senha aparece no log da API.

</details>

<details>
<summary>Conferir o build de produção na sua máquina</summary>

```bash
DOMAIN=:80 APP_URL=http://localhost POSTGRES_PASSWORD=local JWT_SECRET=local-local-local-local-local-local-local \
  docker compose -f docker-compose.prod.yml -p guardiao-local up -d --build
```

O app abre em http://localhost, com o mesmo Caddy, CSP e service worker da VM, mas sem HTTPS. Para derrubar: `docker compose -p guardiao-local -f docker-compose.prod.yml down -v`.

</details>

Todas as variáveis de ambiente estão documentadas em [.env.example](.env.example).

## Testes e qualidade

| Suíte    | Ferramentas                       | Arquivos | Testes        | Linhas      | Branches      |
| -------- | --------------------------------- | -------: | ------------: | ----------: | ------------: |
| Backend  | node:test + supertest + c8        |       19 | 475      | 100%      | 99,1%        |
| Frontend | Vitest + Testing Library + v8     |       12 | 385           | 99,9%       | 98,9%         |
| **Total**|                                   |   **31** | **860** |             |               |

<sub>Medido em 30/10/2026, commit `c9c9eba`.</sub>

```bash
npm install && npm run lint && npm run format:check   # na raiz
cd backend && npm run test:cobertura                  # precisa do Postgres: docker compose up -d db
cd frontend && npm run test:cobertura
```

A cobertura mínima é de **80%** em linhas, branches, funções e statements; abaixo disso o comando falha, e a CI também.

- **Backend** (`backend/test/`): `unit/` cobre validação, erros, logger, mailer, config, importador de aulas, questionários, pesquisa e o hash das migrations, sem banco. `integracao/` exercita todas as rotas contra um Postgres de teste: entrada válida e inválida, autorização entre usuários, anti-farm e corridas de pontuação, recuperação de senha, rate limit, questionários e e-mails do pós, scripts de linha de comando e boot/desligamento do servidor.
- **Frontend** (`frontend/src/testes/`): as páginas rodam pelo `api.js` real e pelo `App` inteiro, com um `fetch` falso (`utils.jsx`). Cada tela é testada em todos os estados: carregando, vazio, erro com nova tentativa, sucesso e validação por campo.
- **Dica:** se um teste do backend falhar, a suíte inteira pode não terminar. Rode o arquivo isolado: `node --test --test-timeout=60000 test/integracao/<arquivo>.test.js`. Não rode duas suítes ao mesmo tempo: elas compartilham o banco de teste.

### Desempenho

Teste de carga com k6 numa VM descartável idêntica à de produção (D2s_v4, 2 vCPU, 8 GB), em 05/10/2026:

| Cenário                                      | Resultado                                                         |
| -------------------------------------------- | ----------------------------------------------------------------- |
| 100 usuários simultâneos por 3 min           | 0 falha; p95 de 20 ms e p99 de 25 ms (auth: p95 de 150 ms); API abaixo de 20% de CPU |
| Estresse até 1000 usuários                   | p95 de 41 ms e p99 de 76 ms; banco a ~60% de CPU, API a ~45%     |

O próximo gargalo é o banco.

## Deploy e CI/CD

O GitHub Actions ([ci.yml](.github/workflows/ci.yml)) roda a cada push: lint e formatação, validação do Caddyfile, validação das aulas, testes com cobertura do backend e do frontend e o build do PWA.

Push no `main` com tudo verde dispara o **deploy automático**: o job entra no Azure por OIDC e roda o `deploy/deploy.sh` na VM pelo Run Command (sem SSH). O script faz backup do banco, reconstrói as imagens, sobe a stack e espera a API ficar saudável. Há também backup diário com retenção de 14 cópias.

Passo a passo da VM, rollback e restauração de backup: [deploy/README.md](deploy/README.md).

## Decisões de escopo

Decididas pelos autores e mantidas fora da versão atual:

- exclusão ou desativação da própria conta pelo app;
- confirmação de e-mail no cadastro;
- revogação individual de JWT;
- backups fora da VM;
- deduplicação de visitas e rodadas no backend.

O modelo de análise estatística (Python) e os dados exportados da pesquisa ficaram fora do repositório.
