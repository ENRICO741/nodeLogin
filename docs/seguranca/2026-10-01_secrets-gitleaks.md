# Segredos — Gitleaks

Fonte: sessão Claude Code 7f4578ef-853c-4466-bcc6-411465373ed3 (projeto nodeLogin / Guardião Digital), 01/10/2026.
Reconstruído do histórico da conversa: os arquivos originais do scanner foram apagados com a limpeza da pasta temporária.

```
=== gitleaks

3:33PM INF 14 commits scanned.
3:33PM INF scanned ~1826956 bytes (1.83 MB) in 4.58s
3:33PM WRN leaks found: 1
generic-api-key .env.example:14 commit aeeafbb
match: JWT_SECRET=
JWT_EXPIRA_EM=7d…  len=16  date=09/27/2026 21:27:14
```

Conclusão: falso positivo. Em `.env.example` (commit aeeafbb) a linha `JWT_SECRET=` estava vazia e a regra juntou a linha seguinte `JWT_EXPIRA_EM=7d`.
