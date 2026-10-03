#!/bin/sh
# Cria a VM do app no Azure (Ubuntu 24.04 + Docker, via cloud-init) pelo template vm.json.
# Uso:  ./deploy/azure/criar-vm.sh            mostra o what-if e pede confirmação antes de criar
#       ./deploy/azure/criar-vm.sh what-if    só o what-if
#       ./deploy/azure/criar-vm.sh create     cria direto (rode o what-if antes)
# SSH só pelo Bastion (portal: VM > Conectar > Bastion), com a chave ~/.ssh/guardiao_azure. Da internet, só 80/443.
set -eu
cd "$(dirname "$0")"

ACAO="${1:-create --confirm-with-what-if}"
NOME_DNS="${NOME_DNS:-guardiaoimpacta}"
# Grupo já existente (o service principal só tem permissão nele); a VM vai para a região do grupo.
GRUPO="${GRUPO:-TCC}"
REPO="${REPO:-$(git remote get-url origin)}"
CHAVE="$HOME/.ssh/guardiao_azure"
REGIAO="$(az group show -n "$GRUPO" --query location -o tsv)"
DOMINIO="$NOME_DNS.$REGIAO.cloudapp.azure.com"

[ -f "$CHAVE" ] || ssh-keygen -q -t rsa -b 4096 -N "" -C guardiao-vm -f "$CHAVE"
DADOS="$(sed -e "s|__REPO__|$REPO|" -e "s|__DOMINIO__|$DOMINIO|" cloud-init.yaml | base64 -w0)"

# shellcheck disable=SC2086
az deployment group $ACAO -g "$GRUPO" -n guardiao-vm --template-file vm.json \
  --parameters nomeDns="$NOME_DNS" chavePublica="$(cat "$CHAVE.pub")" customData="$DADOS"

[ "$ACAO" = what-if ] && exit 0
cat <<FIM

Pronto. A VM termina de se configurar sozinha em ~5 minutos (Docker, clone, .env).
1. Entre:            portal > guardiao-vm > Conectar > Bastion (usuário azureuser, chave $CHAVE)
2. Espere o fim:     cloud-init status --wait   (depois reconecte: libera o docker)
3. Preencha o SMTP:  nano /opt/guardiao/.env   (SMTP_USER, SMTP_SENHA, SMTP_REMETENTE do Brevo)
4. Suba o app:       /opt/guardiao/deploy/deploy.sh
5. Abra:             https://$DOMINIO
FIM
