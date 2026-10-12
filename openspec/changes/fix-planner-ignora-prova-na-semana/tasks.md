# Tasks — fix-planner-ignora-prova-na-semana (v3.2)

Repo: `apps/menthoros-backend`. Gate por bloco: `./mvnw clean test`. Ordem = dependência
(1 → 2 → 3 no legado; 4 → 5 no shadow; 6 fecha). Cada task traz `verify:`.

> v3.2 (2026-10-11): incorpora o DoR (Codex rodada 3 + `spec-reviewer`). Mudanças vs. v3.1:
> descarte antes da normalização (2.2), v2 sem skeleton coberto (2.3), âncora com D+1 (3.1),
> passo 4 do allocator pula pesadas e pesada inviável sai do skeleton (5.2/5.3).

## 1. Dia de prova é dia efetivo (legado)

- [x] 1.1 `PlanoTreinoPromptBuilder` (~254, variável `diasEfetivos`): união com os dias das provas
  não canceladas na janela `[inicio, fim]` (`PROXIMA_SEMANA`) ou `[max(inicio, amanhã), fim]`
  (`SEMANA_ATUAL` — hoje já conta como passado, como em `diaSemanaJaPassou`); "hoje" =
  `ctx.dataReferencia()`. Reusar a lista de provas já carregada no builder.
  - verify: `PlanoTreinoPromptBuilderDiaDeProvaTest` (9 casos) — SEG/QUA/SEX/SÁB + prova domingo →
    `effectiveDays` contém DOMINGO; prova passada e prova de hoje em `SEMANA_ATUAL` → não entram
    (CA6); cancelada e fora da semana → não entram; sem prova → idêntico. Golden-master sem prova
    inalterado (só `taper-semana-prova`, que tem prova no domingo, mudou).
- [x] 1.2 `DisponibilidadePromptFormatter`: sobrecarga com `diasDeProva`; linha "Dia de prova na
  semana: … (prova)" e a marca na lista de dias restantes de `SEMANA_ATUAL`. Sem prova, saída
  byte-idêntica à de antes. **Bump de `prompt_version` NÃO feito** — `PromptVersion` espelha o hash
  do template system estático (`prompt.sha256`, inalterado); esta mudança só toca o bloco user.
  Decisão pendente do usuário (ver relatório da Seção 1).
  - verify: `DisponibilidadePromptFormatterDiaDeProvaTest` (5 casos); golden `taper-semana-prova`
    atualizado deliberadamente (diff de 5 linhas: dias restantes, linha de prova, dias a cobrir).

## 2. PROVA visível à validação (legado, v1 e v2 sem skeleton)

- [x] 2.1 `WeeklyCoverageContext`: campo `provasDaSemana: List<TreinoPlanejadoLlmDto>` (construtor de
  5 argumentos preservado); montado no builder (1.1) com `ProvaNoPlanoService.construirTreinoProva`
  para a mesma janela efetiva. Injeção direta, sem extração: `PlanoReviewServiceImpl` só depende de
  repositórios, mapper, publisher e resolver — nenhum caminho até o builder.
  - verify: `PlanoTreinoPromptBuilderDiaDeProvaTest` (11 casos: DTO com `provaId`, `PROVA` e dia
    certo; passada/hoje/cancelada/sem prova → lista vazia, nunca null); suíte completa sobe.
- [x] 2.2 `PlanoLlmValidator`: com `cobertura != null`, **antes** de
  `descansoNaoAutorizadoConverter.converter` (`:120`) descartar treinos e `restDays` do LLM nos dias
  de `provasDaSemana`; no início de `aplicarCobertura` (`:74`, antes da âncora) inserir as PROVAs.
  - verify: `PlanoLlmValidatorTest$ProvasDaSemana` — LONGO no domingo → sai PROVA com `provaId`,
    sem outro treino nesse dia; INTERVALADO/FACIL **malformado** no domingo → descartado, sem
    `NORMALIZACAO_*` nem reparo (CA4); `restDay` no domingo descartado; `cobertura == null` →
    nada muda.
- [x] 2.3 Mesmo descarte em `validarPlanoV2` antes do loop de `validarEstruturaV2` (`:184`); a
  inserção já acontece por `aplicarCobertura` (`:202`).
  - verify: `PlanoLlmValidatorTest$ProvasDaSemana.v2SemSkeletonComCobertura` — tenant v2,
    `skeleton=null`, `cobertura != null` → CA4 vale; v2 com skeleton segue coberto pelos testes v2
    existentes, inalterados (CA7).
- [x] 2.4 Reprodução real (CA1/CA2): LONGO no sábado + PROVA inserida → `PlanoNaoConformeException`
  com `INTENSOS_ADJACENTES` citando `PROVA`; REGENERATIVO no sábado → passa. A regra não lê
  `provaAlvo` (o DTO da PROVA não o carrega), então CA2 vale por construção.
  - verify: `PlanoLlmValidatorTest$ProvasDaSemana.longoNaVesperaReprova`/`leveNaVesperaPassa` +
    `WeeklyCoverageValidatorTest`.
- [x] 2.5 `WeeklyCoverageValidator`: `validarIntensosAdjacentes` não acusa par PROVA/PROVA (log
  WARN); a contagem de ocupação em `validar` (via `diasDosTreinos`) conta `PROVA` no máximo uma
  vez por dia — `registrarDias` não mudou de assinatura.
  - verify: provas sábado e domingo → sem violação (CA5); duas provas no domingo → sem "aparece
    mais de uma vez" (CA11); LONGO + PROVA no mesmo dia e PROVA + FACIL no mesmo dia continuam
    acusados.
- [x] 2.6 `ProvaNoPlanoService.garantirProvasNaSemana`: remove os DTOs dos dias de todas as provas
  **uma vez**, depois insere todas as PROVAs; reaplicar não duplica (o dia é limpo antes de
  inserir). Javadoc corrigido.
  - verify: `ProvaNoPlanoServiceGarantirTest` (5 casos) — provas A e B no domingo → duas PROVAs,
    uma por `provaId` (CA11); reaplicar sobre a saída → mesma lista; entrada já com a PROVA de A +
    B → uma por `provaId`; provas em dias diferentes; sem prova → mesma lista. O persister só
    delega, então `PlanGenerationPersister*Test` (mocka o service) segue inalterado.

## 3. `LongRunAnchor` (legado)

- [x] 3.1 `ancorar`: se `diaPreferidoLongo` é D-1, D ou D+1 de alguma PROVA da lista
  (`ctx.provasDaSemana()`), devolver intacto. Vizinhança sem wrap: a semana é segunda a domingo e o
  domingo não encosta na segunda seguinte.
  - verify: `LongRunAnchorTest$SemanaDeProva` — preferido sábado/prova domingo → não move; preferido
    domingo → não move; prova quarta + preferido quinta + longo domingo → não move (CA3); preferido
    terça + prova domingo → move como hoje; sem PROVA no contexto → como antes. E
    `PlanoLlmValidatorTest$ProvasDaSemana.ancoraNaoDevolveOLongoAVesperaDaProva` — o caso real
    (preferido sábado, prova domingo, longo na segunda) termina com o longo na segunda.
  - nota: rodar os testes **com `clean`**; o `target/` incremental deste módulo quebra a descoberta do
    JUnit (`NoClassDefFoundError: PlanoSemanalLlmDto`) depois de editar `LongRunAnchorTest`.

## 4. Shadow — provas da semana por data real

- [ ] 4.1 `PlannerEngine` (~91-101): `provasDaSemana` = determinante se `data ∈ [referenceDate,
  referenceDate+6]` ∪ `provasPreparatoriasNaSemana`; novo campo em `WeekPlanSkeleton`.
  - verify: `PlannerEngineTest` — determinante daqui a 3 meses → lista vazia; preparatória na semana
    → lista com ela.
- [ ] 4.2 `ComplianceContext`: campo `provasDaSemana`; `PlannerShadowService` propaga em `:151`,
  `:207`, `:228`.
  - verify: `PlannerShadowServiceTest` — os três contextos carregam a lista.
- [ ] 4.3 `ConstraintValidator.validate` (~22) e `SkeletonComplianceChecker.checarConstraintsDuras`/
  `checarDiasPermitidos` (~137-157): isentar sessão cuja data real é a de uma prova da semana.
  - verify: `SkeletonComplianceCheckerTest`/`ConstraintValidatorTest` — PROVA no domingo com atleta
    sem domingo → zero violação; PROVA em data errada → violação; determinante fora da semana →
    sem isenção (CA8).

## 5. Shadow — materializar e proteger

- [ ] 5.1 `SessionCompositionResolver`: slot `PROVA` por preparatória, independente da fase; TSS
  pela distância; sem somar ao `loadTarget`.
  - verify: `SessionCompositionResolverTest` — fase `PEAK` + preparatória → slot `PROVA`;
    `loadTarget` inalterado.
- [ ] 5.2 `SessionDayAllocator.allocate(…, List<DayOfWeek> diasDeProva)`: ancora todos; `proibidos`
  = D-1 de cada; passo 2 cobre **todo** LONGO (chave primeiro); passos 2–3 escolhem em
  `livres \ proibidos`; passo 4 usa `livres` inteira e pula LONGO ∪ `DURAS` — pesadas sem dia
  permanecem `null`.
  - verify: `SessionDayAllocatorTest` — (a) determinante + preparatória ancoradas, nenhuma pesada
    no D-1; (b) REGENERATIVO cai no D-1; (c) fixture QUI/SÁB/DOM + prova domingo + LONGO + dura +
    leve → LONGO na quinta (passo 2 roda antes), a **dura** fica `null`, a leve pode cair no sábado;
    nada pesado no sábado; (d) TAPER com LONGO sem chave, SEG/QUA/SEX, sem prova → LONGO ganha dia;
    com prova no sábado → LONGO não cai na sexta (CA12).
- [ ] 5.3 `PlannerEngine`: slot pesado sem dia é **removido** de `sessoes` e o skeleton sai com
  `requiresCoachReview=true` + motivo; `comporSessoes` deriva os dias de `provasDaSemana` (4.1).
  - verify: `PlannerEngineTest` — caso real (`PEAK`, preparatória domingo) → slot ancorado, sem
    LONGO no sábado; fixture de 5.2(c) → `sessoes` sem a dura, `requiresCoachReview`, motivo cita
    o tipo da dura e a prova; `PlanoTreinoPromptBuilderTest` — bloco de slots sem "(dia a definir)"
    (CA9).

## 6. Validação final

- [ ] 6.1 Integração reproduzindo a geração real: atleta SEG/TER/QUI/SÁB, `dia_preferido_longo=SÁBADO`,
  preparatória domingo, sem skeleton, v1; LLM mockado com as respostas das tentativas 1 e 2 de
  `tb_llm_call`.
  - verify: tentativa 1 não é rejeitada pelo dia da prova; LONGO no sábado rejeitado por
    `INTENSOS_ADJACENTES`; persistido sem intenso na véspera, uma PROVA com `provaId`.
- [ ] 6.2 Integração `SEMANA_ATUAL` com prova já passada na semana.
  - verify: converge e persiste a PROVA passada (CA6).
- [ ] 6.3 Regressão de risco: 3 dias + prova → `limiteDescansos()` continua 1.
  - verify: `WeeklyCoverageContextTest`.
- [ ] 6.4 Suites de CA10 + `./mvnw clean test`.
  - verify: 0 falhas.
- [ ] 6.5 Atualizar este `tasks.md` antes de arquivar.

## Fora de escopo (ver proposal.md "Non-goals")

- Check novo de D-1; Estágio 2; cobertura desligada; LONGO + PROVA não vizinhos; correção
  retroativa; prova na fronteira da semana; taper para preparatória.
