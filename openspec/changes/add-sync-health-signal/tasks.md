# Tasks — add-sync-health-signal

Branch `feature/add-sync-health-signal` nos dois repos, **só depois do gate (0)**. Backend primeiro.

## 0. Gate — medir a hipótese (antes de qualquer código)
- [ ] 0.1 Consulta no homelab: lacunas/`INATIVIDADE` dos últimos 60 dias × estado das conexões (D0); registrar a tabela aqui
  - verify: ≥ 20% das lacunas de atletas com integração com conexão com erro/desativada → segue; senão, arquivar como "hipótese não confirmada"

## 1. Backend
- [ ] 1.1 Migration `ultimo_pull_sucesso_em` (V98 ou a próxima livre) + campo na entidade
- [ ] 1.2 Schedulers de pull (intervals.icu, Strava + webhook) gravam o campo no sucesso; push não grava
  - verify: testes do scheduler — CA1, CA2 (401 e exceção transitória)
- [ ] 1.3 `SyncHealthResolver` (D2) + categorização de erro
  - verify: CA3, CA5, CA6
- [ ] 1.4 Perfil do coach: `syncHealth` via `buscarNullable`
  - verify: `CoachAthleteProfileServiceImplTest` — presente, ausente, falha vira aviso
- [ ] 1.5 Validação: `./mvnw clean verify`

## 2. Front
- [ ] 2.1 Tipo `syncHealth`; `formatGapCaption` e motivo do ACWR com a saúde (D3)
  - verify: CA4 nos testes de `diagnosisChartsAdapters` e `DiagnosisTabPanel`
- [ ] 2.2 Validação: `npm run lint && npm run build && npm run test:run`

## 3. Pós-deploy
- [ ] 3.1 Métrica: lacunas `COM_ERRO` nas 4 semanas seguintes — o coach pediu reconexão em vez de cobrar o atleta (coaches do piloto)
