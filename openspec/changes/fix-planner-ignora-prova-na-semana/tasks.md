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

### 3b. Dia seguinte à prova, na fronteira da semana (legado) — design.md Decisão 4b

- [x] 3.2 `ProvaNoPlanoService.provaNoDiaAnteriorAoInicio(Atleta, LocalDate inicioSemana)`:
  `Optional<Prova>` da prova não cancelada em `inicioSemana − 1` (consulta de um dia só).
  - verify: `ProvaNoPlanoServiceDiaAnteriorTest` (4 casos) — prova em `inicioSemana − 1` →
    presente; sem prova → vazio; a consulta usa exatamente `[inicioSemana−1, inicioSemana−1]`; duas
    no mesmo dia → a primeira.
- [x] 3.3 `WeeklyCoverageContext.posProva` (+ record `PosProvaSemanaAnterior`, construtores de 5 e 6
  argumentos preservados); `PlanoTreinoPromptBuilder` o preenche quando a prova do item 3.2 existe e
  o `DiaSemana` de `inicioSemana` está entre os dias a cobrir (sem a consulta quando não está);
  `PlanoPromptArquetipos.builder` ganhou overload com `ProvaRepository` (o padrão é um mock que
  devolve lista vazia).
  - verify: `PlanoTreinoPromptBuilderDiaDeProvaTest` — prova no domingo anterior + segunda entre os
    dias → `posProva` preenchido (dia SEGUNDA, nome, data); sem prova → nulo; segunda fora dos dias
    → nulo e a consulta nunca é feita; `SEMANA_ATUAL` com a segunda passada → nulo; `skeleton` →
    sem cobertura. (Prova cancelada: a consulta do repositório já a exclui.)
- [x] 3.4 `PeriodizacaoPromptFormatter.formatarPosProvaSemanaAnterior(posProva)` + builder o anexa ao
  bloco do evento competitivo (só com cobertura). Sem `posProva`, prompt byte-idêntico.
  - verify: `PeriodizacaoPromptFormatterPosProvaTest` (4 casos) — bloco cita nome (sanitizado), data
    e o dia do plano, proíbe LONGO e intenso; nulo → string vazia. Golden-masters inalterados (os 5
    arquétipos passam sem regeneração). Builder: o bloco aparece com `posProva` e não aparece sem.
- [x] 3.5 `WeeklyCoverageValidator`: intenso nesse dia → `INTENSOS_ADJACENTES` citando a prova e a
  data (nome sanitizado, porque a mensagem volta ao LLM no reparo); `PROVA` isenta.
  `LongRunAnchor`: preferido == `posProva.diaDoPlano` → intacto.
  - verify: `WeeklyCoverageValidatorTest$DiaAposProvaDaSemanaAnterior` — LONGO/INTERVALADO/TIRO/
    SUBIDA/FARTLEK/TEMPO_RUN na segunda → violação; REGENERATIVO/FACIL/CONTINUO → passa; PROVA →
    passa; sem `posProva` → como antes; pesado em outro dia → passa. `LongRunAnchorTest` — preferido
    segunda + `posProva` segunda → não move; preferido terça → ancora como antes.
    `PlanoLlmValidatorTest` — fim a fim do CA13 (segunda com LONGO reprova; com treino leve passa).
- [x] 3.6 Revisão da 3b (`code-reviewer` + `clean-code-reviewer`, 2026-10-11): sanitização do nome
  da prova centralizada e endurecida em `PosProvaSemanaAnterior.literalDePrompt` (controle,
  separadores Unicode, aspas, colapso de espaços, 80 chars) e reusada por
  `PeriodizacaoPromptFormatter.sanitizarNomeProva`; `dataFormatada()` no record; `exigeDiaLeveAoLado`
  no validador; helper do builder renomeado para `resolverPosProva`. Verificado: `inicioSemana` é
  sempre segunda (`PlanGenerationContextLoader:176-177`); `nomeProva` é `NOT NULL`. Recusado, com os
  revisores: builder para `WeeklyCoverageContext`; chave de violação nova. Shadow sem `posProva`:
  justificativa corrigida no proposal (leve por composição das fases, não por restrição).
  - verify: `PosProvaSemanaAnteriorTest` (nome longo, tab, U+2028, aspas, nulo);
    `PlanoTreinoPromptBuilderDiaDeProvaTest.comSkeletonNaoHaCobertura` — sem bloco e sem consulta.

## 4. Shadow — provas da semana por data real

- [x] 4.1 `PlannerEngine.provasDaSemana`: determinante se `data ∈ [referenceDate, referenceDate+6]`
  ∪ `provasPreparatoriasNaSemana` (o `PeriodizationPlanner` já filtra a janela), sem duplicata,
  ordenada por data; 11º componente de `WeekPlanSkeleton`, com o construtor de 10 argumentos
  preservado (6 construções em testes intocadas). No shadow, `referenceDate == semanaInicio`
  (`PlannerShadowService.mapToSnapshot`), então a janela é a semana planejada.
  - verify: `PlannerEngineTest$ProvasDaSemana` — determinante a 90 dias → vazia (e continua como
    `provaDeterminante`); preparatória no domingo → só ela; determinante no domingo → ela; CA8 pelo
    engine inteiro: atleta SEG/QUI + alvo no domingo → PROVA ancorada no domingo e zero
    `DIA_INDISPONIVEL` em `skeleton.constraints()`.
- [x] 4.2 `ComplianceContext.provasDaSemana` (+ `datasDeProva()`, construtor de 3 argumentos
  preservado); `PlannerShadowService` propaga `skeleton.provasDaSemana()` nas três construções.
  - verify: `PlannerShadowServiceTest$ProvasDaSemanaNoContexto` — estágio 1 e estágio 2 pelos
    métodos públicos do service (atleta sem domingo, prova no domingo → sem violação); `aplicarShadow`
    com o caso Leandro → `planner_metadata_json` sem `DIA_INDISPONIVEL`/`CONSTRAINT_DURA_VIOLADA`;
    e o controle: skeleton **sem** `provasDaSemana` → o mesmo plano volta a acusar — é a propagação
    que isenta.
- [x] 4.3 `ConstraintValidator.validate(constraints, sessoes, Set<DayOfWeek> diasDeProva)` (a de 2
  argumentos delega com conjunto vazio); `SkeletonComplianceChecker.checarConstraintsDuras`/
  `checarDiasPermitidos` isentam pela **data real** (`context.datasDeProva()`), não pelo tipo.
  - verify: `ConstraintValidatorTest$DiaDeProva` — domingo isento; prova no sábado não isenta o
    domingo; sobrecarga antiga igual. `SkeletonComplianceCheckerTest$DiaDeProva` — pré e pós: PROVA
    no domingo com atleta sem domingo → zero violação; PROVA no sábado (data errada) com atleta sem
    sábado → `CONSTRAINT_DURA_VIOLADA`; determinante a 70 dias com lista vazia → `DIA_INDISPONIVEL`
    mantido (CA8).

## 5. Shadow — materializar e proteger

- [x] 5.1 `SessionCompositionResolver`: `CompositionRequest` ganha `provasPreparatorias` (lista de
  `ProvaPreparatoriaSlot(Double horas)`, construtor de 7 argumentos preservado); `compose` acrescenta
  um slot `PROVA` (`chave=false`) por preparatória, fora da repartição de `tipos`/`targetTss` —
  TSS pela mesma fórmula do determinante (`fatorImpacto × TAXA_BASE × horas`).
  - verify: `SessionCompositionResolverTest$ProvasPreparatorias` (5 casos) — fase `PEAK` + 1
    preparatória → slot `PROVA` extra, `loadTarget`/tipos normais inalterados; preparatória não
    rouba a chave; duas preparatórias → dois slots; horas nulo → TSS zero; lista vazia → idêntico
    ao construtor antigo.
- [x] 5.2 `SessionDayAllocator.allocate(…, List<DayOfWeek> diasDeProva)` (assinatura trocada; os 2
  chamadores — `PlannerEngine` e os testes diretos — atualizados): passo 1 ancora **cada** slot
  `PROVA` no próximo dia de `diasDeProva`, na mesma ordem (determinante, depois preparatórias, a
  mesma ordem em que `compose`/`comporSessoes` as produz — zip posicional, documentado); `proibidos`
  = D-1 de cada dia em `diasDeProva` (`DayOfWeek.minus(1)`, sem wrap especial); passo 2 cobre **todo**
  LONGO em duas rodadas (chave primeiro, depois sem chave — cobre o caso TAPER); passos 2–3 escolhem
  em `livres \ proibidos`; passo 4 usa `livres` inteira mas **nunca** aloca LONGO/`DURAS` — essas,
  se não couberam nos passos 2–3, saem com `day == null` e não são recicladas. `DURAS` passou a ser
  package-private (reuso pelo `PlannerEngine`, 5.3).
  - verify: `SessionDayAllocatorTest` (16 casos) — (a) determinante + preparatória ancoradas,
    `duasProvasNaSemana`; (b) `preferidoNoDMenosUmDaProva`/`duraNuncaNoDMenosUmDaProva`; (c)
    `FixtureCA9` (QUI/SÁB/DOM, PROVA no domingo + LONGO + dura + leve) → LONGO na quinta, dura
    `null`, leve pode cair no sábado; (d) `longoSemChaveGanhaDia`/`longoSemChaveNaoCaiNaVespera`
    (CA12).
- [x] 5.3 `PlannerEngine`: `provasDaSemana` computada **antes** de `comporSessoes` (que agora a
  recebe, junto com a lista de preparatórias derivada dela menos a determinante, para montar
  `ProvaPreparatoriaSlot` e o `diasDeProva` do allocator); slot `LONGO`/dura com `day == null` após
  a alocação é **removido** de `sessoes` (nunca chega ao skeleton) e o motivo
  ("`<TIPO>` sem dia elegível fora da véspera de uma prova da semana (`<data>`).") entra na
  hierarquia de `requiresCoachReview` depois de lesão e risco fisiológico.
  - verify: `PlannerEngineTest$ProvasDaSemana` — `preparatoriaGanhaSlotAncoradoSemLongoNoD1` (fase
    `PEAK`, preparatória no domingo **fora** dos dias configurados do atleta → slot `PROVA`
    ancorado, nenhum LONGO/dura no sábado); `nenhumaSessaoFicaComDiaNulo` (fase `BUILD`, mesmo
    padrão) → nenhum slot chega com `day == null`, nada pesado no sábado.
  - achado (não bug, erro de fixture): a 1ª tentativa desse teste incluiu o dia da prova **também**
    nos dias configurados do atleta — dupla contagem (a composição reserva `sessionCount` pelos
    dias configurados, mas o slot `PROVA` da preparatória consome um dia físico da semana **fora**
    desse orçamento quando o atleta não treina nesse dia, como no caso real). Corrigido excluindo o
    dia da prova dos dias configurados na fixture, como no cadastro real do Leandro.

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
