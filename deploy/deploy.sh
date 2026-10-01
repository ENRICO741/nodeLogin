#!/bin/sh
# Deploy manual na VM: baixa o código novo, faz backup do banco, reconstrói e confere se a API subiu.
# Uso (na VM):  /opt/guardiao/deploy/deploy.sh
set -eu
cd "$(dirname "$0")/.."
export COMPOSE_FILE=docker-compose.prod.yml

echo "==> Atualizando o código"
git pull --ff-only
git log -1 --oneline

# No primeiro deploy ainda não existe banco para copiar.
if [ -n "$(docker compose ps -q db)" ]; then
  echo "==> Backup do banco"
  ./deploy/backup.sh
fi

echo "==> Build (--pull traz as correções de segurança das imagens base)"
docker compose build --pull

echo "==> Subindo"
docker compose up -d

echo "==> Esperando a API ficar saudável"
for _ in $(seq 1 30); do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q api)")" = healthy ]; then
    docker image prune -f > /dev/null
    echo "==> Deploy concluído"
    exit 0
  fi
  sleep 5
done

echo "==> A API não ficou saudável em 2,5 minutos. Últimos logs:"
docker compose logs --tail 50 api
exit 1
