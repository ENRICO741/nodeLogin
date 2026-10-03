#!/bin/sh
# Cria a VM do app no Azure (Ubuntu 24.04 + Docker, via cloud-init). Roda no seu PC, com o Azure CLI logado (az login).
# Uso:  NOME_DNS=guardiaoimpacta ./deploy/azure/criar-vm.sh
# Apagar tudo depois:  az group delete -n guardiao
set -eu
cd "$(dirname "$0")"

: "${NOME_DNS:?defina NOME_DNS, ex.: NOME_DNS=guardiao-tcc (vira o endereço do app)}"
GRUPO="${GRUPO:-guardiao}"
# Chile Central: a região mais próxima onde o Azure for Students libera a série B (no Brasil só há D/F, ~US$ 70+/mês).
REGIAO="${REGIAO:-chilecentral}"
# B2ats_v2 (2 vCPU AMD, 1 GB + 2 GB de swap): grátis por 12 meses na conta gratuita/estudante; ~US$ 10/mês fora dela.
# Folga para ~40 usuários / 10 simultâneos.
TAMANHO="${TAMANHO:-Standard_B2ats_v2}"
REPO="${REPO:-$(git remote get-url origin)}"
VM=guardiao-vm
DOMINIO="$NOME_DNS.$REGIAO.cloudapp.azure.com"
MEU_IP="$(curl -fsS https://api.ipify.org)"

sed -e "s|__REPO__|$REPO|" -e "s|__DOMINIO__|$DOMINIO|" cloud-init.yaml > cloud-init.gerado.yaml
trap 'rm -f cloud-init.gerado.yaml' EXIT

echo "==> Grupo $GRUPO em $REGIAO"
az group create -n "$GRUPO" -l "$REGIAO" -o none

echo "==> VM $TAMANHO (leva uns 2 minutos)"
az vm create -g "$GRUPO" -n "$VM" \
  --image Canonical:ubuntu-24_04-lts:server:latest \
  --size "$TAMANHO" \
  --os-disk-size-gb 64 --storage-sku Premium_LRS \
  --admin-username azureuser \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --public-ip-address-allocation static \
  --public-ip-address-dns-name "$NOME_DNS" \
  --custom-data cloud-init.gerado.yaml \
  -o none

echo "==> Portas: 80/443 abertas; SSH só do seu IP ($MEU_IP)"
az vm open-port -g "$GRUPO" -n "$VM" --port 80,443 --priority 900 -o none
az network nsg rule update -g "$GRUPO" --nsg-name "${VM}NSG" -n default-allow-ssh \
  --source-address-prefixes "$MEU_IP" -o none

cat <<FIM

Pronto. A VM termina de se configurar sozinha em ~5 minutos (Docker, clone, .env).
1. Entre:            ssh azureuser@$DOMINIO
2. Espere o fim:     cloud-init status --wait   (depois saia com exit e entre de novo: libera o docker)
3. Preencha o SMTP:  nano /opt/guardiao/.env   (SMTP_USER, SMTP_SENHA, SMTP_REMETENTE do Brevo)
4. Suba o app:       /opt/guardiao/deploy/deploy.sh
5. Abra:             https://$DOMINIO
FIM
