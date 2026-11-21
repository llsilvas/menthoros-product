# Tasks — garantir-cobertura-sete-dias-plano

- [x] 1.1 Teste do preenchimento de `restDays` (CA1, CA2); implementação no pós-processamento do plano.
- [x] 1.2 Check no `EvalDeterministicGrader` (CA3).
- [x] 2.1 `./mvnw clean verify`; PR → `develop`.

## Notas de entrega (2026-11-18)

- 1.1: `PlanGenerationPersister.completarDescansos`, chamado depois de `removerDescansosDeDiasComTreino`;
  motivo "Sem treino prescrito para este dia" (visível ao coach — Open Question respondida).
- 1.2: em vez de violação no grader (CA3), o grader espelha o preenchimento; a lacuna deixa de existir.
- 2.1: `verify` verde (6721 + 342); PR menthoros-backend#247.
- Mergeado no #247 em 2026-11-20.
