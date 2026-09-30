# Tasks — fix-sync-cursor-data-loss

Branch `feature/fix-sync-cursor-data-loss` no backend. Prioridade sobre `add-sync-health-signal` e
`add-attention-reason-sem-sincronizacao` (em espera da medição que esta change viabiliza).

## 0. Antes de implementar
- [ ] 0.1 Validar a ordenação do Strava com `after` + `page` numa chamada real (ascendente?); registrar aqui e ajustar D3
- [ ] 0.2 Linha de base da métrica: amostra de atividades de corrida dos últimos 60 dias na API × importadas, por atleta do piloto com integração; registrar aqui

## 1. Migration e cursor
- [ ] 1.1 Migration (V98 ou a próxima livre): `pull_cursor` com backfill + `tb_sync_pull_log` com índices (D1, D5)
  - verify: IT de migration contra o schema real
- [ ] 1.2 Update pontual do `pull_cursor` no repositório (D1)
  - verify: IT — escritor concorrente salvando a entidade não sobrescreve o cursor

## 2. intervals.icu
- [ ] 2.1 Scheduler lê e avança `pull_cursor`; push/retry seguem em `ultimaSincronizacao` (D1)
  - verify: CA1
- [ ] 2.2 Scheduler sem o limite de retroatividade do import manual (D4)
  - verify: CA5; import manual continua recusando além de 90 dias

## 3. Strava
- [ ] 3.1 Paginação pela página original; `start_date` UTC; cursor por progresso confirmado (D3, conforme 0.1)
  - verify: CA2, CA3, CA4, CA6
- [ ] 3.2 Relistar sem duplicar nem apagar RPE/sensações/feedback; contagem por inserção real
  - verify: CA7

## 4. Registro do pull
- [ ] 4.1 Gravado pelo orquestrador após a transação do pull, em `REQUIRES_NEW` (D5)
  - verify: CA8, CA9; webhook e push não gravam
- [ ] 4.2 Expurgo diário em lotes (> 90 dias)

## 5. Validação
- [ ] 5.1 `./mvnw clean verify`

## 6. Pós-deploy
- [ ] 6.1 4 semanas depois: repetir a amostra da 0.2 (meta 0 faltantes) e contar lacunas/`INATIVIDADE` de atletas com treino na API
- [ ] 6.2 Iniciar a medição prospectiva de `add-sync-health-signal` com `tb_sync_pull_log`
