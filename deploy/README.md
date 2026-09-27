# Deploy numa VM Azure

Três contêineres rodam numa única VM:

- **web** (Caddy): serve o PWA, faz o proxy de `/api` para a API e emite o certificado HTTPS automaticamente com Let's Encrypt.
- **api** (Node): aplica as migrações e o seed ao subir.
- **db** (Postgres 17): guarda os dados num volume Docker.

Só as portas 80 e 443 ficam expostas. A API e o banco ficam na rede interna do compose.

## 1. VM e rede

1. Crie a VM. Ubuntu 24.04 LTS com 2 vCPU e 4 GB de RAM (B2s) é suficiente para começar.
2. No **NSG**, libere a entrada TCP 80 e 443, e UDP 443 (HTTP/3).
3. Deixe a porta 22 liberada só para o seu IP.
4. No DNS do domínio, crie um registro **A** apontando para o IP público da VM. Use um IP estático.
5. Instale o Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER   # saia e entre de novo na sessão SSH
   ```

## 2. Primeiro deploy

1. Clone o repositório e crie o `.env`:
   ```bash
   sudo mkdir -p /opt/guardiao && sudo chown $USER /opt/guardiao
   git clone <url-do-repositorio> /opt/guardiao
   cd /opt/guardiao/deploy
   cp ../.env.example .env
   ```
2. Edite o `.env` e preencha no mínimo:

   | Variável | Valor |
   |---|---|
   | `DOMAIN` | O domínio, por exemplo `guardiao.suaempresa.com` |
   | `POSTGRES_PASSWORD` | Gere com `openssl rand -hex 24` |
   | `JWT_SECRET` | Gere com `openssl rand -base64 48` |
   | `SMTP_*` | Os dados do provedor de e-mail |

   Remova a linha `DATABASE_URL`: em produção o compose monta a URL sozinho.
3. Suba a stack:
   ```bash
   docker compose up -d --build
   docker compose ps               # api e db devem ficar "healthy"
   curl https://$DOMAIN/api/saude  # {"status":"ok"}
   ```
4. Crie o primeiro admin. Cadastre-se pelo app e depois rode:
   ```bash
   docker compose exec api node src/scripts/promover-admin.js email@empresa.com
   ```

## 3. Atualizar

```bash
cd /opt/guardiao && git pull
cd deploy && docker compose up -d --build
```

Migrações novas são aplicadas sozinhas quando a API sobe. Quem estiver com o app aberto vê o aviso "Nova versão disponível".

## 4. Backup

Faça um backup diário às 3h, mantendo os 7 mais recentes em `/var/backups/guardiao`:

```bash
chmod +x /opt/guardiao/deploy/backup.sh
sudo mkdir -p /var/backups/guardiao && sudo chown $USER /var/backups/guardiao
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/guardiao/deploy/backup.sh >> /var/log/guardiao-backup.log 2>&1") | crontab -
```

Copie os backups para fora da VM (por exemplo, um Azure Blob Storage). Se a VM for perdida, os backups que estiverem só nela vão junto.

### Restaurar

```bash
cd /opt/guardiao/deploy
docker compose stop api
gunzip -c /var/backups/guardiao/banco-AAAA-MM-DD.sql.gz | \
  docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE $POSTGRES_DB" -c "CREATE DATABASE $POSTGRES_DB" && psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose start api
```

> **Atenção:** a restauração **apaga** o banco atual antes de carregar o backup. Confira a data do arquivo antes de rodar.

## 5. Logs e diagnóstico

```bash
docker compose logs -f api   # uma linha JSON por requisição/evento
docker compose logs -f web   # Caddy (certificado, acessos)
```
