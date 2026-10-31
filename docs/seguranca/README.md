# Varreduras de segurança (SAST, DAST, SCA e segredos)

Executadas em **01/10/2026** contra a stack de produção rodando localmente (`docker-compose.prod.yml` em `http://localhost:8080`, com o SMTP desligado para nenhum e-mail sair durante o scan ativo).

| Tipo | Ferramenta | Resultado | Relatório |
|---|---|---|---|
| DAST passivo | OWASP ZAP baseline | 0 falhas, 5 avisos, 62 regras sem alerta | [zap-baseline](2026-10-01_dast-zap-baseline.txt) |
| DAST ativo | OWASP ZAP full scan | 0 falhas, 2 avisos, 139 regras sem alerta | [zap-full-scan](2026-10-01_dast-zap-full-scan.txt) |
| SAST | Semgrep (JS, Node, React, OWASP Top 10, segredos, Dockerfile) | 601 regras em 130 arquivos; 0 alertas no código, 4 de configuração | [semgrep](2026-10-01_sast-semgrep.md) |
| SCA / imagens | Trivy | 0 CVEs nas dependências do app; 19 CVEs na imagem da API → **0** depois da correção | [trivy](2026-10-01_sca-trivy.md) |
| Segredos | Gitleaks (14 commits) | 1 alerta, falso positivo analisado | [gitleaks](2026-10-01_secrets-gitleaks.md) |

Resumo, análise e correções aplicadas: [resumo-sast-dast](2026-10-01_resumo-sast-dast.md).

## Correções que saíram das varreduras

- **npm removido da imagem de produção da API:** as 19 CVEs vinham do npm embutido na imagem `node:24-alpine`, que o app não usa em execução. Reexecução do Trivy: 0 CVEs.
- **Cabeçalho `Cross-Origin-Resource-Policy: same-origin`** no Caddy (aviso do ZAP).
- **`/api/saude` com verificação real** de banco e SMTP, com prazo. Testando ao vivo com o banco parado, apareceu um bug que derrubava a API (evento `error` do pool do `pg` sem listener), corrigido com `pool.on('error')`.

## Limitações

- **Os relatórios foram reconstruídos do histórico da sessão de trabalho**, porque os artefatos originais (HTML e JSON do ZAP, JSON do Semgrep, Trivy e Gitleaks) ficavam numa pasta temporária que foi apagada. As saídas de WARN/FAIL, os totais e os comandos são os originais; as linhas PASS do ZAP não foram guardadas.
- Caminhos locais foram trocados por `<repo>` e `<pasta-temporaria>`. Os comandos continuam reproduzíveis a partir da raiz do repositório.
- O ZAP testou só as páginas públicas, porque não faz login sozinho.
