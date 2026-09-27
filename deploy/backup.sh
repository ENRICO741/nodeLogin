#!/bin/sh
# Backup diário do Postgres, mantendo os 7 mais recentes.
# Cron na VM (crontab -e):  0 3 * * * /opt/guardiao/deploy/backup.sh >> /var/log/guardiao-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
DESTINO="${DESTINO:-/var/backups/guardiao}"
mkdir -p "$DESTINO"

ARQUIVO="$DESTINO/banco-$(date +%F).sql.gz"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$ARQUIVO"
echo "backup criado: $ARQUIVO"

ls -1t "$DESTINO"/banco-*.sql.gz | tail -n +8 | xargs -r rm --
