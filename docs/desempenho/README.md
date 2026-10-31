# Testes de carga (k6)

Todos rodaram numa VM descartável, cópia da de produção (Azure D2s_v4, 2 vCPU, 8 GB), sem tocar na produção.

| Data | Cenário | Resultado | Saída |
|---|---|---|---|
| 04/10/2026 | 100 usuários, primeiras execuções | Login/cadastro com p95 de **1,8 s**, chegando a **4,9 s** no cenário mais agressivo | [k6-2026-10-05](k6-2026-10-05.txt), resultados 1 e 3 |
| 04/10/2026 | 100 usuários, depois do ajuste de rate limit e pool (commit `f5699bf`) | Login/cadastro com p95 de 280 a 500 ms; 0 falhas | resultados 6 e 9 |
| 05/10/2026 | **Teste principal:** 100 usuários por 3 min (50 novos, 50 existentes), aulas e trivia | 100% dos checks; app com p95 de 20 ms e p99 de 25 ms; auth com p95 de 150 ms; 0 falhas e 0 respostas 429 | resultado 12 |
| 05/10/2026 | Estresse de 250 a 1000 usuários | Em 1000: p95 de 41 ms e p99 de 76 ms; 99,99% dos checks (1 resposta 429 por 10 VUs dividindo a mesma conta) | resultado 14 |
| 30/10/2026 | Estresse caótico de 100 a 1500 usuários | Até 1400 usuários: p99 de 275 ms e 0 falhas. Em 1500 travou | [k6-2026-10-30](k6-2026-10-30.txt) |

## Limite encontrado em 30/10

Com 1500 usuários simultâneos, a consulta de `concederBadges` (`backend/src/modulos/pontuacao.js`), chamada ao finalizar a trivia, passou a estourar o `statement_timeout` de 10 s do Postgres e a API respondeu 503 no `/api/saude` por cerca de 12 s. É o próximo gargalo conhecido; o uso real previsto é de dezenas de usuários.

O teste de 30/10 usou `BCRYPT_CUSTO=4` e removeu o limite de auth por IP **só na VM de teste**, para medir API, front e banco e não o bcrypt. Os tempos foram medidos do notebook e incluem a internet até a Azure.

## Sobre os arquivos

- `k6-2026-10-05.txt` é a saída bruta de 14 execuções do dia 04 e 05/10, incluindo tentativas intermediárias. Os horários nos cabeçalhos estão em UTC. As execuções que importam estão listadas na tabela acima.
- `k6-2026-10-30.txt` traz o cenário, a tabela por patamar, a causa do travamento e o script usado.
