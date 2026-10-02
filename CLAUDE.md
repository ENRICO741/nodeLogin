# Guardião Digital

PWA de conscientização em segurança da informação (TCC). Visão geral e arquitetura: [README.md](README.md).

## Estrutura

- `frontend/`: React 19 + Vite. `backend/`: Node 24 + Express 5 + Postgres (`pg`), API em `/api`.
- `deploy/`: Caddyfile, scripts da VM e `deploy/azure/` (criar-vm.sh, cloud-init.yaml).
- `conteudo/`: aulas em HTML. `docs/`: modelo relacional.
- Front e API na mesma origem (`/api`); não há CORS.

## Comandos

- Raiz: `npm run lint`, `npm run format`, `npm run format:check`.
- Backend (`cd backend`): `npm run dev`, `npm test`, `npm run migrar`, `npm run seed`.
- Frontend (`cd frontend`): `npm run dev`, `npm test`, `npm run build`.
- Dev completo: `docker compose up` (Postgres, API, Vite, Mailpit). Prod: `docker-compose.prod.yml`.

## Restrições

- Rodar `az` só com o service principal do devcontainer (`AZURE_CONFIG_DIR=/home/node/.azure-claude`). Nunca usar outra conta logada.
- Antes de qualquer deploy Azure, rodar `az deployment group what-if`.
- Não ler nem commitar `.env*`, `*.tfvars`, `*.tfstate`, chaves `.pem`/`.key`. Só `.env.example` é versionado.
- Guardrails em `/etc/claude-code/managed-settings.json` (somente leitura, root); não tente contornar.

## Armadilhas

- Firewall do devcontainer libera só domínios listados em `.devcontainer/init-firewall.sh`. `az` com timeout: falta domínio ou IP de CDN mudou; reinicie o container.
- Pontuação é garantida no banco, não no cliente. Não mover regra de pontos para o front.
- Migrations em `backend/src/db/migrations/*.sql` rodam em ordem na subida da API. Nunca editar migration já aplicada; criar nova.
- `PESQUISA_SEGREDO` define os pseudônimos dos CSVs. Trocar muda todos.
