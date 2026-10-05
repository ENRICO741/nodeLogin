# Deploy numa VM Azure

Tudo roda com o [`docker-compose.prod.yml`](../docker-compose.prod.yml), da raiz do repositório.
Dica: rode `export COMPOSE_FILE=docker-compose.prod.yml` na VM, e aí o `-f` deixa de ser necessário nos comandos abaixo.

Três contêineres rodam numa única VM:

- **web** (Caddy): serve o PWA, faz o proxy de `/api` para a API e emite o certificado HTTPS automaticamente com Let's Encrypt.
- **api** (Node): aplica as migrações e o seed ao subir.
- **db** (Postgres 17): guarda os dados num volume Docker.

Só as portas 80 e 443 ficam expostas. A API e o banco ficam na rede interna do compose.

## 1. VM e rede

**Atalho:** [`azure/criar-vm.sh`](azure/criar-vm.sh) aplica o template [`azure/vm.json`](azure/vm.json) e faz os passos 1 a 5 e o início da seção 2 sozinho (VM D2s_v4 com Trusted Launch no grupo `TCC`, NSG, Bastion Developer, Docker, clone, `.env` com segredos gerados e backup diário). Rode no seu PC com o `az` logado: `./deploy/azure/criar-vm.sh` (mostra o what-if e pede confirmação). O app fica em `guardiaoimpacta.brazilsouth.cloudapp.azure.com`. Depois só falta o SMTP no `.env` e o `deploy.sh`.

1. Crie a VM. Ubuntu 24.04 LTS com 2 vCPU e 8 GB (D2s_v4; a série B não é liberada em Brazil South nesta assinatura e a D2als_v7 ficou sem capacidade).
2. No **NSG**, libere a entrada TCP 80 e 443, e UDP 443 (HTTP/3).
3. Não abra a porta 22 para a internet: entre pelo Bastion Developer (portal > VM > Conectar > Bastion), que é gratuito.
4. No DNS do domínio, crie um registro **A** apontando para o IP público da VM. Use um IP estático.
5. Instale o Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER   # saia e entre de novo na sessão SSH
   ```

## 2. Primeiro deploy

1. Clone o repositório e crie o `.env` na raiz:
   ```bash
   sudo mkdir -p /opt/guardiao && sudo chown $USER /opt/guardiao
   git clone <url-do-repositorio> /opt/guardiao
   cd /opt/guardiao
   cp .env.example .env
   ```
2. Edite o `.env` e preencha no mínimo:

   | Variável | Valor |
   |---|---|
   | `DOMAIN` | O domínio, por exemplo `guardiao.suaempresa.com` |
   | `POSTGRES_PASSWORD` | Gere com `openssl rand -hex 24` |
   | `JWT_SECRET` | Gere com `openssl rand -base64 48` |
   | `SMTP_*` | Os dados do provedor de e-mail |
   | `PESQUISA_DATA_FIM` | Opcional: último dia da coleta (`AAAA-MM-DD`); vazia = sem teto. Nesta pesquisa: `2026-11-07` (último dia aceito; o site recusa a partir de 08/11, 00:00 de SP). Ver o README da raiz |

3. Suba a stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   docker compose -f docker-compose.prod.yml ps   # api e db devem ficar "healthy"
   curl https://SEU_DOMINIO/api/saude             # {"status":"ok","verificacoes":{"banco":"ok","smtp":"ok"}}
   ```
4. Crie o primeiro admin. Cadastre-se pelo app e depois rode:
   ```bash
   docker compose -f docker-compose.prod.yml exec api node src/scripts/promover-admin.js email@empresa.com
   ```

## 3. Atualizar

**Automático:** cada push no `main` com o CI verde roda o job `deploy` do [ci.yml](../.github/workflows/ci.yml). Ele entra no Azure por OIDC e, pelo Run Command (sem abrir a porta 22), atualiza o código da VM para o commit testado e roda o `deploy.sh`. O log do Actions é público, então mostra só as linhas `==>`. Logs da API: pelo Bastion.

Para ativar, uma vez:

1. Federated credential no app registration do service principal: issuer `https://token.actions.githubusercontent.com`, subject `repo:ENRICO741/nodeLogin:environment:producao`, audience `api://AzureADTokenExchange`.
2. No GitHub, environment `producao` com _Deployment branches_ restrito a `main`.
3. Variables **do repositório** (Settings > Secrets and variables > Actions > Variables): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` e `AZURE_SUBSCRIPTION_ID`. São IDs, não segredos. Enquanto `AZURE_CLIENT_ID` não existir, o job fica pulado.

**Manual**, na VM pelo Bastion:

```bash
cd /opt/guardiao && git fetch -q origin main && git merge --ff-only origin/main && deploy/deploy.sh
```

O script faz backup do banco, reconstrói as imagens com `--pull` (traz as correções de segurança das imagens base), sobe a stack e espera a API ficar saudável. Se ela não subir, mostra os últimos logs e termina com erro. Ele aceita o commit a implantar (`deploy.sh <commit>`) e recusa um commit mais antigo que o atual.

### Voltar uma versão

O caminho seguro é `git revert` do commit com problema e push: o CI testa e implanta. Para voltar à mão, segure o CI primeiro (desative o workflow), senão o próximo push avança de novo. Depois:

```bash
git reset --hard <commit> && docker compose -f docker-compose.prod.yml up -d --build
```

Migrations não voltam junto. Se a versão com problema trouxe migration, restaure o backup que o deploy tirou antes dela (abaixo).

Migrações novas são aplicadas sozinhas quando a API sobe. Quem estiver com o app aberto vê o aviso "Nova versão disponível".

## 4. Backup

Faça um backup diário às 3h em `/var/backups/guardiao`. O `deploy.sh` também faz um antes de cada deploy, e ficam os 14 mais recentes:

```bash
chmod +x /opt/guardiao/deploy/backup.sh
sudo mkdir -p /var/backups/guardiao && sudo chown $USER /var/backups/guardiao
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/guardiao/deploy/backup.sh >> /var/log/guardiao-backup.log 2>&1") | crontab -
```

Copie os backups para fora da VM (por exemplo, um Azure Blob Storage). Se a VM for perdida, os backups que estiverem só nela vão junto.

### Restaurar

```bash
cd /opt/guardiao
docker compose -f docker-compose.prod.yml stop api
gunzip -c /var/backups/guardiao/banco-AAAA-MM-DD-HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE $POSTGRES_DB" -c "CREATE DATABASE $POSTGRES_DB" && psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose -f docker-compose.prod.yml start api
```

> **Atenção:** a restauração **apaga** o banco atual antes de carregar o backup. Confira a data do arquivo antes de rodar.

## 5. Logs e diagnóstico

```bash
docker compose -f docker-compose.prod.yml logs -f api   # uma linha JSON por requisição/evento
docker compose -f docker-compose.prod.yml logs -f web   # Caddy (certificado, acessos)
```
