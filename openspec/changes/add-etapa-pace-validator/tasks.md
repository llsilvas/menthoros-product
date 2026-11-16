# Tasks — add-etapa-pace-validator (M · Full · backend)

Reescrito em 2026-11-16 (reabertura): a correção passa a reparar a **distância** a partir do
`ritmoAlvo`, não o `ritmoAlvo`. Bloqueia o rollout (7.3) de `migrate-openai-retired-models`.
Branch: `feat/add-etapa-pace-validator`, em worktree, a partir de `develop`.

## 0. Discovery

- [ ] **0.1** Ler `EtapaFcValidator.java` e `EtapaFcValidatorTest.java` por completo — reproduzir o
  padrão de `@Nested`/`@DisplayName` no `EtapaPaceValidatorTest`.
- [ ] **0.2** Confirmar em `NormalizacaoDeTreino.java` a lista de `Passo`s da `caudaComum` e inserir o
  novo passo **antes** de `reconciliarDistancia` (o total do treino precisa ser recalculado depois do
  reparo por etapa — CA10).
- [ ] **0.3** Confirmar onde o eval aplica (ou não) a normalização de produção: `EvalCandidateRunner`
  grada a resposta bruta da LLM. Decidir se o grader passa a receber o plano normalizado ou se o
  check novo roda sobre o bruto (CA11, CA12).

## 1. `EtapaPaceValidator` — parse, checagem e reparo (TDD)

- [ ] **1.1** `parsePaceRange("6:30-7:00/km")` → `[390, 420]` s/km; `null` e `"moderado"` → `null`
  sem exceção (CA4).
- [ ] **1.2** Pace implícito dentro da faixa ±10% → etapa inalterada, sem log (CA8). BVA na borda
  dos ±10%.
- [ ] **1.3** Lento demais (2,5 km em 40 min, faixa 6:30–7:00) → distância = duração ÷ pace médio
  (≈ 5,93 km); `ritmoAlvo` e duração intactos; `WARN` com o pace antigo e a distância nova (CA6).
- [ ] **1.4** Rápido demais (7,5 km em 30 min, faixa 5:38–6:00) → ≈ 5,17 km (CA7).
- [ ] **1.5** Distância 0 ou nula com duração e `ritmoAlvo` → distância derivada; sem `ritmoAlvo`
  parseável ou sem duração → inalterada (CA9, CA3).
- [ ] **1.6** Etapas repetidas (`repeticoes > 1`): confirmar se `duracaoMin`/`distanciaKm` são por
  repetição ou totais antes de calcular — teste explícito.
- [ ] Validação: `./mvnw test -Dtest=EtapaPaceValidatorTest`

## 2. Integração na normalização de produção

- [ ] **2.1** `EtapaPaceValidator` como `@Component`, injetado em `NormalizacaoDeTreino`.
- [ ] **2.2** Passo novo na `caudaComum`, antes de `reconciliarDistancia`.
- [ ] **2.3** Teste: um treino de cada família (`FARTLEK`, `INTERVALADO_TIRO`, `TRES_ETAPAS`) com
  etapa incoerente sai reparado, e o total do treino = soma das etapas (CA5, CA10).
- [ ] **2.4** Suíte de caracterização existente (`NormalizacaoDeTreinoCaracterizacaoTest`,
  `PlanoTreinoPromptBuilderGoldenTest`) sem mudança para treinos coerentes.
- [ ] Validação: `./mvnw clean test`

## 3. Eval

- [ ] **3.1** Check de pace implícito no `EvalDeterministicGrader` como violação de qualidade (CA11).
- [ ] **3.2** Regerar os 15 pares da revisão cega com a normalização aplicada
  (`RevisaoCegaPlanosRealTest`, branch de `migrate-openai-retired-models`) e conferir CA12.
- [ ] **3.3** Nova leitura cega do coach sobre os pares regerados — fecha a 3.5 da migração.

## 4. Fechamento

- [ ] **4.1** `./mvnw clean verify`.
- [ ] **4.2** Revisar `*IT` de geração de plano para uma asserção end-to-end do reparo.
- [ ] **4.3** Atualizar este `tasks.md` antes do `/done`.
