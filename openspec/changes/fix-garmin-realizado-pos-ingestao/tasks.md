## 1. Conciliação do realizado Garmin/FIT

- [ ] 1.1 Teste em `FitTreinoPersisterTest`: FIT novo chama `CandidateSelector.buscarCandidatos` e
  `ReconciliationDecisionExecutor.executar` com o realizado salvo; duplicata não chama nenhum dos dois
  - verify: teste vermelho antes da 1.2
- [ ] 1.2 `FitTreinoPersister.persistir`: reconciliar quando `resultado.inserted()`
  - verify: `./mvnw test -Dtest=FitTreinoPersisterTest` verde
- [ ] 1.3 `GarminActivityIngestionIT`: ping processado com planejado no dia sai com `reconciliationStatus` não
  nulo e linha em `tb_treino_reconciliacao`; sem planejado sai `NAO_PLANEJADO`
  - verify: `./mvnw verify -Dit.test=GarminActivityIngestionIT` verde

## 2. Análise após o "Como foi?"

- [ ] 2.1 Teste em `AtletaTreinoFeedbackServiceImplTest`: `registrarFeedback` publica `TreinoRegistradoEvent`
  com id e tenant do realizado (ArgumentCaptor)
  - verify: teste vermelho antes da 2.2
- [ ] 2.2 `registrarFeedback` publica o evento após salvar; JavaDoc de Side Effects atualizado
  - verify: `./mvnw test -Dtest=AtletaTreinoFeedbackServiceImplTest` verde

## 3. Validação

- [ ] 3.1 `./mvnw clean verify`
  - verify: 0 falhas

## 4. Pós-merge (operacional, com confirmação)

- [ ] 4.1 Decidir e executar o backfill dos realizados já gravados (Open Questions) e pedir ao atleta que
  reenvie o "Como foi?" do treino de 2026-11-09
  - verify: leitura em produção — os 6 realizados com `reconciliation_status` não nulo; análise do
    `477922c0…` existe
