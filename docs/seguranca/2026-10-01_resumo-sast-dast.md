# Resumo consolidado SAST + DAST

Fonte: sessão Claude Code 7f4578ef-853c-4466-bcc6-411465373ed3 (projeto nodeLogin / Guardião Digital), 01/10/2026.
Reconstruído do histórico da conversa: os arquivos originais do scanner foram apagados com a limpeza da pasta temporária.

Os 5 scanners terminaram. Nenhum achou vulnerabilidade explorável no código da aplicação nem nas dependências dela. O que apareceu está nas imagens base (Node e Caddy) e em configuração.

## DAST: OWASP ZAP na stack de prod local
O baseline e o full scan rodaram com o SMTP desligado, então nenhum e-mail foi enviado. O full scan chegou a atacar `/api/auth/esqueci-senha`, e os e-mails foram descartados.

| Scan | Falhas | Avisos | Regras sem alerta |
|---|---|---|---|
| Baseline | 0 | 5 | 62 |
| Full (ativo) | 0 | 2 | 139 |

Nenhum alerta de injeção, XSS, path traversal ou vazamento. Os avisos:
- **CSP com wildcard em `img-src https:`**: é o item de baixo risco da revisão anterior. Só importa se um admin colocar imagens externas nas aulas.
- **Faltam os cabeçalhos `Cross-Origin-Embedder-Policy` e `Cross-Origin-Resource-Policy`**: baixo risco, porque o app não serve nada para outros sites.
- **Informativos**: assets em cache (é o que se quer), comentários no bundle JS e "aplicação moderna" (SPA).
- **Limitação**: o ZAP só testou as páginas públicas, porque não faz login sozinho.

## SAST
**Semgrep:** 4 alertas de configuração, nenhum no código. É o que mandei antes: `USER` ausente nos Dockerfiles de dev e tags mutáveis no CI.

**Gitleaks:** 1 alerta, falso positivo. No `.env.example` antigo (commit `aeeafbb`), a linha `JWT_SECRET=` estava vazia, e a regra juntou a linha seguinte, `JWT_EXPIRA_EM=7d`, como se fosse a chave. Nenhum segredo real no histórico, que tem 14 commits.

**Trivy:**
- **Dependências do app** (os dois `package-lock.json`): **0 vulnerabilidades**.
- **Imagem da API**: 19 CVEs, 7 delas altas. Todas no `npm` que já vem dentro da imagem `node:24-alpine` (`brace-expansion`, `ip-address`, `tar`, `undici`). O app não usa o npm em execução.
- **Imagem web (Caddy)**: 31 CVEs, 16 altas. Estão no binário do Caddy, que foi compilado com Go 1.26.3, `x/crypto`, `x/net` e `grpc` desatualizados.
- **Configuração**: `deploy/web.Dockerfile` roda como root e não tem `HEALTHCHECK`. O `frontend/Dockerfile`, só de dev, tem o mesmo.

## O que vale corrigir (não apliquei)
1. **Atualizar as imagens base.** Rode `docker compose -f docker-compose.prod.yml build --pull`. Isso provavelmente resolve a maior parte das CVEs do Caddy e do Node. Vale fazer em todo deploy.
2. **Tirar o npm da imagem de produção da API.** Uma linha no estágio `prod` do Dockerfile, depois do `npm ci`, zera as 19 CVEs:
   `RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx`
3. **Adicionar `Cross-Origin-Resource-Policy same-origin` no Caddyfile.** É uma linha.

Rodar o Caddy sem root não vale a pena: ele precisa abrir as portas 80 e 443, e a imagem oficial já é feita assim.

Quer que eu aplique os três e rode os scanners de novo para confirmar?

Os relatórios completos (`zap-full.html`, `zap-baseline.html` e os JSON) estão em `scratchpad\sec`. A stack `guardiao-local` continua no ar, com o SMTP desligado.

---

## Correções aplicadas depois (pedido do usuário: pontos 2 e 3)

Os três pedidos estão prontos, e o `/saude` agora faz verificação de verdade. Testando com o banco parado, achei e corrigi um bug que derrubava a API. Os testes do backend passam (245/245), o lint passa e não fiz commit.

**Ponto 2, npm fora da imagem da API.** O [backend/Dockerfile](backend/Dockerfile) remove npm e npx depois do `npm ci`. O Trivy agora acha 0 CVEs na imagem, eram 19.

**Ponto 3, cabeçalho CORP.** O [Caddyfile](deploy/Caddyfile) manda `Cross-Origin-Resource-Policy: same-origin`, e conferi na resposta da stack.

**Script de deploy.** Criei o [deploy/deploy.sh](deploy/deploy.sh), sem nada além de shell e Docker Compose. Na VM, rode `/opt/guardiao/deploy/deploy.sh`. O script:
1. Faz `git pull`.
2. Faz backup do banco, se ele já existir.
3. Roda `build --pull`. Isso também cobre o ponto 1, de graça, a cada deploy.
4. Roda `up -d`.
5. Espera a API ficar saudável. Se ela não ficar em 2,5 minutos, mostra os logs e termina com erro.

O ShellCheck não apontou nada no script. Atualizei o [deploy/README.md](deploy/README.md) com o uso e com como voltar para uma versão anterior.

## `/api/saude`
Antes ele fazia só um `SELECT 1`, sem limite de tempo, e não olhava o SMTP. Agora:

| Situação | HTTP | Resposta |
|---|---|---|
| Tudo ok | 200 | `{"status":"ok","verificacoes":{"banco":"ok","smtp":"ok"}}` |
| SMTP fora ou sem configuração | 200 | `"degradado"`: o app funciona, mas o reset de senha não chega |
| Banco fora | **503** | `"erro"`: o Docker marca o container como `unhealthy` |

- **Prazo:** cada verificação tem até 2 segundos, abaixo dos 5 do healthcheck. O pool do banco também passou a desistir de conectar em 5 segundos, em vez de esperar para sempre.
- **Login no SMTP:** o login real no Brevo é refeito no máximo a cada 5 minutos. O endpoint é público, então ninguém consegue inundar o Brevo chamando `/saude`.
- **Erros:** a resposta não traz detalhes, só `ok` ou `falha`. Os detalhes vão para o log.

Conferi as três situações ao vivo na stack.

**Bug encontrado no teste ao vivo:** com o banco parado, a API **morria** e o Caddy respondia 502. Quando o banco cai, o Postgres derruba as conexões ociosas do pool, o `pg` emite `'error'`, e sem um listener para esse evento o Node encerra o processo. Isso já existia antes de hoje, e a API entrava em loop de restart enquanto o banco estivesse fora. Adicionei `pool.on('error')`, que registra no log. Agora o banco parado dá 503 em 2 segundos, e quando o banco volta, a resposta volta a ser 200, sem nenhum restart.

**Para o commit:**
- Faça o commit do script com `git add --chmod=+x deploy/deploy.sh`, para ele já sair executável.
- As mudanças nos arquivos do `frontend/` (CSS, ícones, `vite.config.js`) não são minhas.

A stack `guardiao-local` continua no ar, agora com o SMTP do Brevo ligado.
