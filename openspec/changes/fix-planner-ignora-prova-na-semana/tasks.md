# Tasks — fix-planner-ignora-prova-na-semana (v3.1)

Repo: `apps/menthoros-backend`. Validação de cada bloco: `./mvnw clean test`.

> v3.1 (2026-10-11): incorpora o 2º pre-mortem. Mudanças vs. v3: PROVA entra em `aplicarCobertura`
> (não no callback), intervalo efetivo com "hoje", PROVA/PROVA isento, âncora com regra fina,
> allocator filtra em vez de excluir, `provasDaSemana` propagada no shadow.

## 1. Dia de prova é dia efetivo (legado)

- [ ] 1.1 `PlanoTreinoPromptBuilder` (~254): `effectiveDays` = dias configurados ∪ dias das provas
  não canceladas em `[max(inicio, hoje), fim]`, usando a mesma referência de "hoje" que o chamador
  já aplica em `SEMANA_ATUAL`. Reusar a lista de provas já carregada no builder.
  - Teste: `PlanoTreinoPromptBuilderTest` — SEG/TER/QUI/SÁB + prova domingo → contém DOMINGO;
    `SEMANA_ATUAL` gerada na quarta com prova na segunda → não contém SEGUNDA (CA6).
- [ ] 1.2 `DisponibilidadePromptFormatter` (~76): dia da prova com a marca "(prova)". Bump de
  `prompt_version`.
  - Teste: snapshot do bloco com e sem prova.

## 2. PROVA visível à validação (legado)

- [ ] 2.1 `WeeklyCoverageContext`: campo `provasDaSemana: List<TreinoPlanejadoLlmDto>`; montado no
  builder (1.1) com `ProvaNoPlanoService.construirTreinoProva` para o mesmo intervalo efetivo. Se a
  injeção criar ciclo, extrair `construirTreinoProva` para componente só com `TreinoMapper`.
- [ ] 2.2 `PlanoLlmValidator.aplicarCobertura` (~74): antes de `longRunAnchor.ancorar`, para cada
  PROVA do contexto remover treinos e `restDays` do LLM no mesmo `diaSemana` e inserir a PROVA.
  - Teste: `PlanoLlmValidatorTest` — LONGO no dia da prova → sai PROVA com `provaId`, sem outro
    treino nesse dia; `restDay` no dia da prova descartado sem violação (CA4); `cobertura == null`
    (skeleton) → nada muda (CA7).
- [ ] 2.3 Reprodução real (CA1/CA2): LONGO na véspera + PROVA inserida → `PlanoNaoConformeException`
  com `INTENSOS_ADJACENTES` citando `PROVA`; leve na véspera → passa; `provaAlvo` true e false.
  - Teste: `WeeklyCoverageValidatorTest` + `PlanoLlmValidatorTest`.
- [ ] 2.4 `WeeklyCoverageValidator.validarIntensosAdjacentes` (~192): par PROVA/PROVA não é
  violação (log WARN); LONGO/PROVA continua.
  - Teste: provas sábado e domingo → sem violação (CA5).
- [ ] 2.5 `PlanGenerationPersister.java:366` sobre lista já com PROVA → uma PROVA por prova.
  - Teste: `PlanGenerationPersisterCoberturaTest`.

## 3. `LongRunAnchor` (legado)

- [ ] 3.1 `ancorar`: se `diaPreferidoLongo` é dia de PROVA da lista ou sua véspera, devolver intacto.
  - Teste: `LongRunAnchorTest` — preferido = véspera → não move; preferido = dia da prova → não
    move; preferido em outro dia → move como hoje (CA3).

## 4. Shadow — provas da semana por data real

- [ ] 4.1 `PlannerEngine`: `provasDaSemana` = determinante se `data ∈ [referenceDate,
  referenceDate+6]` ∪ `provasPreparatoriasNaSemana`; novo campo em `WeekPlanSkeleton`.
- [ ] 4.2 `ComplianceContext`: campo `provasDaSemana`; `PlannerShadowService` propaga em `:151`,
  `:207`, `:228`.
- [ ] 4.3 `ConstraintValidator.validate` (~22) e `SkeletonComplianceChecker.checarConstraintsDuras`/
  `checarDiasPermitidos` (~137-157): isentar sessão cuja data real é a de uma prova da semana.
  - Teste: `SkeletonComplianceCheckerTest` / `ConstraintValidatorTest` — PROVA no domingo com
    atleta sem domingo → zero violação; PROVA em data errada → violação; determinante daqui a 3
    meses → sem isenção (CA8).

## 5. Shadow — materializar e proteger

- [ ] 5.1 `SessionCompositionResolver`: slot `PROVA` por preparatória, independente da fase; TSS
  pela distância; sem somar ao `loadTarget`.
  - Teste: fase `PEAK` + preparatória → slot `PROVA`.
- [ ] 5.2 `SessionDayAllocator.allocate(…, List<DayOfWeek> diasDeProva)`: ancora todos; `proibidos`
  = D-1 de cada; passos 2–3 escolhem em `livres \ proibidos`; passo 4 usa `livres` inteira.
  - Teste: (a) determinante + preparatória ancoradas, nenhuma dura no D-1; (b) REGENERATIVO pode
    cair no D-1; (c) LONGO sem candidato → slot sem dia.
- [ ] 5.3 `PlannerEngine`: slot-chave sem dia → `requiresCoachReview=true` + motivo (CA9);
  `comporSessoes` deriva os dias de `provasDaSemana` (4.1).
  - Teste: `PlannerEngineTest` — caso real (`PEAK`, preparatória domingo) → slot ancorado, sem
    LONGO no sábado; cenário sem candidato → `requiresCoachReview`.

## 6. Validação final

- [ ] 6.1 Integração reproduzindo a geração real: atleta SEG/TER/QUI/SÁB, `dia_preferido_longo=SÁBADO`,
  preparatória domingo, sem skeleton; LLM mockado com as respostas das tentativas 1 e 2 de
  `tb_llm_call` → tentativa 1 não é rejeitada pelo dia da prova; LONGO no sábado é rejeitado por
  `INTENSOS_ADJACENTES`; persistido sem intenso na véspera, uma PROVA com `provaId`.
- [ ] 6.2 Integração `SEMANA_ATUAL` com prova já passada na semana → converge e persiste (CA6).
- [ ] 6.3 Suites de CA10 + `./mvnw clean test`.
- [ ] 6.4 Atualizar este `tasks.md` antes de arquivar.

## Fora de escopo (ver proposal.md "Non-goals")

- Check novo de D-1; Estágio 2; cobertura desligada; LONGO + PROVA não vizinhos; correção
  retroativa; prova na fronteira da semana; taper para preparatória.
