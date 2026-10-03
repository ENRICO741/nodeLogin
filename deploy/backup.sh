#!/bin/sh
# Backup do Postgres de produção (diário pelo cron e antes de cada deploy), mantendo os 14 mais recentes.
# Cron na VM (crontab -e):  0 3 * * * /opt/guardiao/deploy/backup.sh >> /var/log/guardiao-backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
DESTINO="${DESTINO:-/var/backups/guardiao}"
mkdir -p "$DESTINO"

# Hora no nome: vários deploys no mesmo dia não sobrescrevem o backup anterior.
ARQUIVO="$DESTINO/banco-$(date +%F-%H%M%S).sql"
trap 'rm -f -- "$ARQUIVO.tmp"' EXIT
# Sem pipe: o sh não tem pipefail, e um pg_dump com erro viraria um .gz vazio dado como sucesso.
docker compose -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$ARQUIVO.tmp"
gzip -c "$ARQUIVO.tmp" > "$ARQUIVO.gz" && rm -- "$ARQUIVO.tmp"
echo "backup criado: $ARQUIVO.gz"

ls -1t "$DESTINO"/banco-*.sql.gz | tail -n +15 | xargs -r rm --
