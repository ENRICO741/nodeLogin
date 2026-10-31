# SAST — Semgrep

Fonte: sessão Claude Code 7f4578ef-853c-4466-bcc6-411465373ed3 (projeto nodeLogin / Guardião Digital), 01/10/2026.
Reconstruído do histórico da conversa: os arquivos originais do scanner foram apagados com a limpeza da pasta temporária.

Rulesets: p/javascript, p/nodejs, p/react, p/owasp-top-ten, p/secrets, p/dockerfile.

## Comando
```
{
 "command": "$s='<pasta-temporaria>\\sec'; New-Item -ItemType Directory -Force $s | Out-Null; Set-Location <repo>\ndocker run --rm -v \"${PWD}:/src\" -v \"${s}:/out\" semgrep/semgrep semgrep scan --metrics=off --config p/javascript --config p/nodejs --config p/react --config p/owasp-top-ten --config p/secrets --config p/dockerfile --exclude node_modules --json -o /out/semgrep.json /src *> \"$s\\semgrep.log\"\ndocker run --rm -v \"${PWD}:/src:ro\" -v \"${s}:/out\" aquasec/trivy fs --scanners vuln,secret,misconfig --skip-dirs node_modules --format json -o /out/trivy.json /src *> \"$s\\trivy.log\"\ndocker run --rm -v \"${PWD}:/repo:ro\" -v \"${s}:/out\" zricethezav/gitleaks detect --source /repo --report-format json --report-path /out/gitleaks.json *> \"$s\\gitleaks.log\"\nforeach ($img in 'guardiao-local-api','guardiao-local-web') { docker run --rm -v //var/run/docker.sock:/var/run/docker.sock -v \"${s}:/out\" aquasec/trivy image --scanners vuln --format json -o \"/out/trivy-$img.json\" $img *> \"$s\\trivy-$img.log\" }\n'SAST fim'",
 "run_in_background": true,
 "timeout": 3600000
}
```

## Saída
```
resultados: 4  erros: 0
WARNING | github-actions-mutable-action-tag | /src/.github/workflows/ci.yml:21
WARNING | github-actions-mutable-action-tag | /src/.github/workflows/ci.yml:22
ERROR | missing-user | /src/backend/Dockerfile:14
ERROR | missing-user | /src/frontend/Dockerfile:8

│ Scan Status │
  Scanning 130 files tracked by git with 601 Code rules:
  Language      Rules   Files          Origin      Rules                                                               
 
│ Scan Summary │
✅ Scan completed successfully.
 • Findings: 4 (4 blocking)
```

## Análise
Não achou nenhuma vulnerabilidade real no código da aplicação. Varreu 130 arquivos com 601 regras (JS, Node, React, OWASP Top 10, segredos e Dockerfile) e deu 4 alertas, todos de configuração:

| Gravidade | Regra | Onde | Avaliação |
|---|---|---|---|
| ERROR | `missing-user` | [backend/Dockerfile:14](backend/Dockerfile#L14) | Falso positivo na prática. A linha 14 é o estágio `dev`. O estágio `prod`, que vai para a VM, já tem `USER node` (linha 22). |
| ERROR | `missing-user` | [frontend/Dockerfile:8](frontend/Dockerfile#L8) | Esse Dockerfile só é usado em dev (Vite). Em prod o frontend sai pelo `deploy/web.Dockerfile` (Caddy). Não chega à produção. |
| WARNING | `github-actions-mutable-action-tag` | [ci.yml:21-22](.github/workflows/ci.yml#L21-L22) | `actions/checkout@v4` e `setup-node@v4` usam tag, que pode mudar. A correção completa seria fixar pelo SHA do commit. Como são actions oficiais do GitHub, o risco é baixo. |

Nenhum alerta de SQL injection, XSS, segredo no código, `eval` ou criptografia fraca.

Se você quiser zerar o relatório:
- Posso pôr `USER node` também no estágio `dev` do backend e no Dockerfile do frontend.
- Posso fixar as duas actions do CI pelo SHA.

Nenhum desses dois muda a segurança de produção. O Trivy continua rodando.
