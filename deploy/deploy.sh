#!/bin/sh
# Deploy manual na VM: baixa o código novo, faz backup do banco, reconstrói e confere se a API subiu.
# Uso (na VM):  /opt/guardiao/deploy/deploy.sh [commit]
# Sem commit, vai para o último do main. O CI passa o commit exato que testou.
set -eu
cd "$(dirname "$0")/.."
export COMPOSE_FILE=docker-compose.prod.yml

echo "==> Atualizando o código"
git fetch --quiet origin main
git merge --ff-only "${1:-origin/main}"
# Commit mais antigo que o atual não volta a versão (o merge só diz "Already up to date"): falha em vez de
# fingir que publicou. Para voltar, veja "Voltar uma versão" no deploy/README.md.
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "${1:-origin/main}^{commit}")" ]; then
  echo "==> A VM já está num commit mais novo que ${1:-origin/main}; nada foi alterado"
  exit 1
fi
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

# Caddy no ar: o admin (127.0.0.1:2019, dentro do container) só responde com a configuração carregada
# (um Caddyfile inválido deixa o container reiniciando em loop), e o proxy alcança a API pela rede interna.
# Não dá para testar o site em http://localhost: ele só atende o $DOMAIN e redireciona para HTTPS.
caddy_no_ar() {
  docker compose exec -T web wget -qO /dev/null http://127.0.0.1:2019/config/ 2> /dev/null &&
    docker compose exec -T web wget -qO /dev/null http://api:4000/api/saude 2> /dev/null
}

echo "==> Esperando a API ficar saudável e o Caddy responder"
for _ in $(seq 1 30); do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q api)")" = healthy ] && caddy_no_ar; then
    docker image prune -f > /dev/null
    echo "==> Deploy concluído"
    exit 0
  fi
  sleep 5
done

echo "==> A API ou o Caddy não ficaram no ar em 2,5 minutos. Últimos logs:"
docker compose logs --tail 50 api web
exit 1
