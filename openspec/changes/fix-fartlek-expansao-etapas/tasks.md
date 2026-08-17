# tasks — fix-fartlek-expansao-etapas

Repo afetado: `apps/menthoros-backend` · branch `feature/fix-fartlek-expansao-etapas`

## 1. Expansão de fartlek tipado como PRINCIPAL

- [x] **1.1** Teste que falha: `IaServiceImplFartlekExpansaoTest` cobrindo CA1 e CA2 —
      etapa `PRINCIPAL` + descrição `"Fartlek leve Z2-Z3, 4x (1min forte + 2min leve)"` deve expandir
      em 8 etapas; etapa `PRINCIPAL` + `"Corrida contínua em Z2"` deve permanecer intacta.
      Invocar `expandirEtapasAgregadas` por reflexão, como já faz `IaServiceImplFcValidationTest`.
      → falhou com `Expected size: 8 but was: 1`, confirmando o diagnóstico.
- [x] **1.2** Ampliar o guard de `IaServiceImpl:902`: `PRINCIPAL` entra nos detectores, mas só
      prossegue se a descrição casar um dos padrões.
      **Decisão sobre a Open Question: a ambiguidade entrou nesta change.** Ampliar o guard sem
      fechá-la criaria regressão nova — qualquer etapa `PRINCIPAL` com "Nx M min" na descrição
      viraria N tiros de M metros. Fix mínimo: lookahead `(?!\s*min)` no `REPETICOES_PATTERN`,
      posicionado antes do `\s*` para que `\s*min` não seja contornado por backtracking.
      Efeito colateral positivo: `"5 x 2 min forte + 2 min leve"` passa a cair no caminho por tempo,
      que é o correto — antes vencia o `NxDist` por ser avaliado primeiro.
- [x] **1.3** Teste de não-regressão (CA5): `INTERVALADO` com `"6x400m Z5"` continua produzindo o
      mesmo resultado pelo caminho `NxDist`. Adicionado também teste da desambiguação minuto/metro.
- [x] **Validação:** `./mvnw clean test -Dtest='IaServiceImplFartlekExpansaoTest,IaServiceImplFcValidationTest,IntervalsIcuWorkoutConverterTest,TreinoServiceConsistenciaValidatorTest'`
      → **Tests run: 77, Failures: 0, Errors: 0** · BUILD SUCCESS

## 2. Agrupamento inferido no converter

> Abordagem revista durante a implementação — ver "Revisão da abordagem" no `proposal.md`.
> Motivo: `EtapaTreinoLlmDto` alimenta o JSON schema do LLM (`IaServiceImpl:146` +
> `enforceAllRequired:120-125`), então adicionar `blocoId` ao record obrigaria o modelo a inventá-lo.
> Caminho mapeado e descartado: `PlanoServiceImpl:551` → `TreinoMapper.toEntity` (MapStruct, mapeia
> por nome, sem DTO intermediário) → `EtapaTreino`.

- [x] **2.1** Teste que falha (CA3): 8 etapas sem `blocoId` formando 4 pares idênticos viram
      `WorkoutStep.bloco(reps=4)` com 2 sub-steps. → falhou antes do fix, junto com o teste de
      convivência com aquecimento/desaquecimento avulsos.
- [x] **2.2** `IntervalsIcuWorkoutConverter.inferirBloco()` — no ramo `blocoId == null`, escolhe a
      janela que cobre mais etapas (empate → mais repetições) e monta o bloco; sem ao menos duas
      janelas equivalentes, emite a etapa isolada. Reusa `etapasEquivalentes`.
- [x] **2.3** Testes de guarda: CA4 (progressivo heterogêneo não vira bloco falso) e CA4b (`blocoId`
      explícito mantém precedência — coberto pelos testes pré-existentes `desExpandeBlocoConsistente`
      e `fallbackParaBlocoInconsistente`, que seguem verdes).
- [x] **Validação:** `./mvnw clean test -Dtest='IntervalsIcuWorkoutConverterTest'`
      → **Tests run: 22, Failures: 0, Errors: 0** · BUILD SUCCESS

## 3. Fechamento

- [ ] **3.1** `./mvnw clean verify` (gate — `test` não roda os `*IT`)
- [ ] **3.2** `/qa` — reviewers em paralelo
- [ ] **3.3** PR `feature/fix-fartlek-expansao-etapas` → `develop`
- [ ] **3.4** Registrar no `proposal.md` a decisão tomada na task 1.2 sobre o `REPETICOES_PATTERN`

## Follow-ups fora do escopo (não fazer aqui)

- `aplicarEtapasPatch` (`TreinoPlanejadoServiceImpl:410-423`) descarta `blocoId` ao editar na tela de
  revisão — desfaz o agrupamento no push seguinte.
- `TreinoEditDialog` (`:407-450`) colapsa qualquer série em um único par esforço/recuperação,
  perdendo heterogeneidade ao salvar.
