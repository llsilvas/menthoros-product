# Tasks: fix-intervalado-tiro-shrink-normalizacao

TDD (teste primeiro). Em `apps/menthoros-backend`:

- **Inner loop:** `./mvnw clean test`
- **Gate de entrega:** `./mvnw clean verify`.

Branch: `fix/intervalado-tiro-shrink-normalizacao` (criar a partir de `develop`).

---

## 1. Trava contra o encolhimento de INTERVALADO

- [x] 1.1 Teste primeiro (CA1): reproduzir o cenário do log — treino INTERVALADO com tiros de
      0,8 km, soma de etapas maior que `distanciaKm` declarado pelo LLM (gap negativo). Após
      `normalizarTreinoIntervalado`, toda etapa `INTERVALADO` mantém `distanciaKm == 0.8`.
- [x] 1.2 Teste primeiro (CA2): no mesmo cenário, etapas `RECUPERACAO` continuam sendo ajustadas
      pela distribuição de delta existente (comportamento inalterado — confirma que só o tipo
      `INTERVALADO` foi excluído do encolhimento).
- [x] 1.3 Teste primeiro (CA4): cenário em que a soma já está dentro de 0,05 km do alvo — nenhuma
      etapa é alterada.
- [x] 1.4 CA5 (gap positivo, tiro cresce): adicionado teste explícito (CA3 da suíte,
      `gapPositivoCresceTiros`) no QA — code-reviewer e clean-code-reviewer convergiram que o
      caminho `gap > 0` não tinha regressão dedicada.
- [x] 1.5 Implementado: em `IaServiceImpl.normalizarTreinoIntervalado`, a chamada de
      `distribuirDeltaPorTipo` para `"INTERVALADO"` agora só roda quando `gap > 0` (crescimento);
      quando `gap < 0`, a distribuição de sobra atua apenas sobre `"RECUPERACAO"`.
- **Validação:** `./mvnw clean test` — `IaServiceImplNormalizarIntervaladoTest` (4/4) e suíte
  `IaServiceImpl*Test` (64/64) verdes.

## 2. Reconciliação efetiva

- [x] 2.1 CA3 já é coberto pelo comportamento existente de `reconciliarDistanciaComEtapas`, que
      agora recebe etapas não corrompidas — sem teste novo necessário (ela já tinha cobertura própria
      e nenhuma linha dela mudou).
- [x] 2.2 Confirmado: nenhuma mudança foi necessária em `reconciliarDistanciaComEtapas` — ela já
      implementava o comportamento correto; só precisava parar de receber etapas já corrompidas.
- **Validação:** `./mvnw clean test`

## 3. Fechamento

- [x] 3.1 `./mvnw clean verify` — BUILD SUCCESS, sem nenhuma falha (unit + `*IT`).
- [x] 3.2 Confirmado por teste unitário determinístico (1.1) reproduzindo a estrutura real do log
      (5 tiros de 0,8 km + folga excedente) — mais confiável que reexecutar a geração completa via
      LLM, que é não-determinística e leva ~20min. `EXPANSÃO NxDist` (extração de 0,8 km da
      descrição) não foi tocada; só o passo posterior de normalização.
- [x] 3.3 `/qa` — `code-reviewer` + `security-reviewer` + `clean-code-reviewer` (Claude) +
      `/codex:review` (cross-model) em paralelo. Nenhum finding Critical. Um Important
      pré-existente (não introduzido por este fix: `RECUPERACAO` pode não absorver todo o gap
      residual quando é grande — `reconciliarDistanciaComEtapas` já cobre isso corrigindo a
      `distanciaKm` do treino). Um Important real de cobertura (falta de teste para `gap > 0`) —
      corrigido na hora (task 1.4). Codex: **GO, sem blocking findings**.
- [ ] 3.4 PR para `develop`, sem merge local.
- **Validação:** CI verde.
