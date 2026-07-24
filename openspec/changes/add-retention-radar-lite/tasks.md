## Âncoras de código (backend)

- **`MotivoAtencao`** — `enums/MotivoAtencao.java`; ganha `RISCO_RETENCAO(45, "<default genérico>")` (o
  default só é usado se por bug não vier override — na prática `RISCO_RETENCAO` sempre traz o override RF4).
- **`FaseRetencao`** — novo, `enums/FaseRetencao.java`.
- **`SinalAtencao`** — `services/helper/SinalAtencao.java`; **ganha 6º campo opcional
  `suggestedActionOverride: String`** + construtor de conveniência de 5 args (`override = null`), para os 6
  call sites existentes compilarem sem mudança.
- **`CoachAttentionSignalEvaluator`** — `services/helper/CoachAttentionSignalEvaluator.java`; novo método
  `avaliarRetencao(...)` que também resolve o sub-sinal dominante → `suggestedActionOverride` (RF4).
- **`CoachAttentionQueueServiceImpl`** — `services/impl/CoachAttentionQueueServiceImpl.java`; `montarItem`
  injeta 3 repositórios novos (`ProvaRepository`, `CheckinProntidaoRepository`, `PlanoSemanalRepository`),
  chama o 7º evaluator e usa o override no `suggestedAction`; **o filtro compartilhado de
  `getAttentionQueue`/`getSinaisParaAtleta` muda** para o corte por-motivo (Q1).
- **Finders novos** — `PlanoSemanalRepository` (plano vigente acionável, tenant + `:hoje` + filtro de
  status) e `ProvaRepository` (tem prova passada? / tem prova-alvo futura?, Q4). **Não** reusar
  `findMostRecentRelevantPlano` nem `findByAtletaAndProvaAlvoTrue` (achados do pre-mortem).
- **`CoachAttentionItemOutputDto`** — **sem mudança** (motivo novo + override alimentam o campo
  `suggestedAction` já existente).
- **`AthleteBaselineStateRepository`** — **não usado** (sub-sinal de baseline cortado, Q5).
- **Sem migration.** Sem novo endpoint. Sem novo controller.

Depende de (já em `develop`): `add-coach-attention-queue` ✅, `add-recommendation-explainability` ✅,
`add-athlete-engagement-signals` ✅ (provas), `add-daily-readiness-checkin` ✅, `athlete-onboarding-baseline` ✅
(relógio de retenção), `coach-encerrar-semana` ✅ (padrões de query de `PlanoSemanal`).

---

## 0. Pré-requisito — Open Questions (RESOLVIDAS no DoR, 2026-07-24)

- [x] 0.1 Founder decidiu as 6 Open Questions (registradas em `proposal.md` → "Decididas no DoR"):
  **Q1** corte por-motivo (retenção a partir de `MEDIA`); **Q2** sem efeito (baseline cortado);
  **Q3** peso 45; **Q4** condicionar "sem prova" a histórico de prova; **Q5** cortar o sub-sinal de
  baseline (v1 fica com **5** sub-sinais); **Q6** relógio = data de onboarding + fallback de exclusão.
  Nada bloqueante restante.

---

## 1. `FaseRetencao` (novo enum)

- [ ] 1.1 Criar `FaseRetencao` em `enums/`: `FUNDACAO` (D1-D30), `HABITO` (D31-D60), `VINCULO`
  (D61-D90), `RENOVACAO` (D91-D120). Método estático `FaseRetencao.deDias(long diasDesdeInicio)`
  retornando `Optional<FaseRetencao>` — vazio se fora de D1-D120.
  - verify: `./mvnw clean compile` ok; `@ParameterizedTest` cobrindo os limites de cada faixa (D1,
    D30, D31, D60, D61, D90, D91, D120, D121, D0/negativo).

- [ ] 1.2 **Relógio de retenção confiável (Q6, crítico do pre-mortem).** Implementar a resolução de
  "dias desde o início de acompanhamento" conforme a decisão de 0.1: preferir a data de
  onboarding/baseline quando presente; excluir (não avaliar retenção) atletas cujo `createdAt` seja o
  backfill da V25 sem data confiável. NÃO usar `atleta.getCreatedAt()` cru como relógio.
  - verify: teste com atleta legado (createdAt = data de backfill, sem onboarding) → fase vazia, sem
    `RISCO_RETENCAO`; atleta com onboarding real em D45 → fase `HABITO`.

- **Validação do bloco:** `./mvnw clean test`.

---

## 2. `MotivoAtencao.RISCO_RETENCAO` (novo valor de enum)

- [ ] 2.1 Adicionar `RISCO_RETENCAO(45, "<default genérico de fallback>")` a `MotivoAtencao` — o
  `suggestedAction` do enum é só fallback; a ação real vem do `suggestedActionOverride` (RF4, bloco 3).
  Confirmar que nenhum `switch` exaustivo sobre `MotivoAtencao` existe no código sem `default`
  (checar `grep -rn "MotivoAtencao" --include=*.java` por switch statements) — se existir, adicionar o
  case novo no mesmo commit.
  - verify: `./mvnw clean compile` ok; nenhum switch quebrado.

- **Validação do bloco:** `./mvnw clean test`.

---

## 2b. `SinalAtencao.suggestedActionOverride` (campo opcional)

- [ ] 2b.1 Adicionar 6º campo `suggestedActionOverride: String` (nullable, `@Nullable` do
  `org.jspecify.annotations`) ao record `SinalAtencao`. Manter a validação do compact constructor
  (rationale/sourceRules). Adicionar construtor de conveniência de 5 args que delega com
  `override = null` — os 6 call sites existentes do evaluator NÃO mudam.
  - verify: `./mvnw clean compile` ok; os 6 `new SinalAtencao(...)` de 5 args continuam compilando.

- **Validação do bloco:** `./mvnw clean test` (suíte existente verde, zero regressão).

---

## 3. `CoachAttentionSignalEvaluator.avaliarRetencao(...)`

- [ ] 3.1 Assinatura: `Optional<SinalAtencao> avaliarRetencao(FaseRetencao fase, boolean lacunaTreino,
  boolean aderenciaBaixa, boolean semProvaFutura, boolean semPlanoVigente, boolean readinessBaixoOuSemCheckin)`
  — os **5** booleans já pré-computados pelo caller (mesmo padrão de `avaliarSobrecarga`, que recebe
  booleans prontos). O 6º candidato (queda de baseline) foi cortado (Q5) — não entra na assinatura.
  - verify: `./mvnw clean compile` ok.

- [ ] 3.2 Lógica de contagem (5 sub-sinais): `count = número de booleans true`; `count <= 1` →
  `Optional.empty()`; `count == 2` → `Severidade.MEDIA`; `count == 3` → `ALTA`; `count in [4,5]` →
  `CRITICA`.
  - verify: `@ParameterizedTest` cobrindo `count` de 0 a 5 (BVA nos limites 1/2, 3, 3/4).

- [ ] 3.3 `rationale`: menciona a fase (`fase.name()` ou label) + lista os motivos específicos
  disparados (ex.: "Atleta em HABITO com 3 sinais de risco de retenção: lacuna de treino, sem prova
  futura, sem plano vigente."). `sourceRules`: uma entrada por sub-sinal disparado, prefixo
  `"CoachAttentionSignalEvaluator.avaliarRetencao."` + nome do sub-sinal (ex.:
  `"...avaliarRetencao.lacunaTreino"`).
  - verify: teste com 3 sub-sinais disparados assertando `rationale` contém os 3 nomes e `sourceRules`
    tem exatamente 3 entradas (não 6 — só os disparados).

- [ ] 3.3b **RF4 — `suggestedActionOverride` por causa dominante.** Resolver o sub-sinal dominante
  pela ordem de prioridade fixa (sem plano vigente > lacuna de treino > readiness baixo > baixa
  aderência > sem prova futura) e produzir a ação correspondente da tabela do `design.md` (Decisão 5,
  5 linhas). Passar como 6º arg do `SinalAtencao`. Extrair as 5 strings como constantes privadas
  (mesmo padrão de `SOURCE_*` já usado no arquivo).
  - verify: `@ParameterizedTest` — para cada sub-sinal como dominante isolado, assertar a string exata;
    teste com "sem plano" + "lacuna" simultâneos → override é o de "sem plano" (prioridade 1 vence).

- [ ] 3.4 `Evidencia`: pelo menos uma entrada com a fase e a contagem (`"Fase" → "HABITO"`,
  `"Sinais de risco" → "3 de 5"`).
  - verify: teste assertando as duas evidências.

- [ ] 3.5 Testes de `CoachAttentionSignalEvaluatorTest` para `avaliarRetencao`: fase fora de D1-D120
  (não deveria nem ser chamado pelo caller, mas o método em si não precisa reforçar isso — documentar
  a responsabilidade no Javadoc: caller garante fase presente); todos os booleans false → empty;
  cada boundary de severidade (2/3/4/5 sinais).
  - verify: `./mvnw clean test` verde.

- **Validação do bloco:** `./mvnw clean test`.

---

## 4. Wiring em `CoachAttentionQueueServiceImpl`

- [ ] 4.1 Injetar `ProvaRepository`, `CheckinProntidaoRepository` e `PlanoSemanalRepository` no
  construtor (via `@RequiredArgsConstructor`, já usado pela classe). **Não** injetar
  `AthleteBaselineStateRepository` (sub-sinal de baseline cortado, Q5). São **3** repositórios novos.
  - verify: `./mvnw clean compile` ok.

- [ ] 4.2 Em `montarItem`: resolver o **relógio de retenção** via a lógica da task 1.2 (data de
  onboarding com fallback de exclusão, Q6 — **não** `atleta.getCreatedAt()` cru); resolver
  `FaseRetencao.deDias(...)`; se vazio (fora de D1-D120 OU sem data confiável), **não chamar**
  `avaliarRetencao`.
  - verify: teste com atleta em D200 → nenhum `RISCO_RETENCAO`; teste com atleta legado (sem data de
    onboarding) → nenhum `RISCO_RETENCAO`.

- [ ] 4.3 Se fase presente, computar os **5** sub-sinais:
  - `lacunaTreino = diasInativos != null && diasInativos >= 14` (reaproveita `diasDesdeUltimaAtividade`
    já chamado em `montarItem`);
  - `aderenciaBaixa = perdidos >= 3` (reaproveita `contarNaoCumpridos`, já chamado);
  - `semProvaFutura` **condicionado a histórico de prova (Q4)**: só `true` quando o atleta **tem**
    prova passada registrada E **não** tem prova futura (`findUpcomingByAtletaIdAndTenantId` vazia) nem
    prova-alvo **futura**. NÃO usar `findByAtletaAndProvaAlvoTrue` cru (não filtra data, achado do
    pre-mortem). Criar finder(s) que respondam "tem prova passada?" e "tem prova/alvo futura?" com
    `:hoje` explícito e tenant. Atleta sem nenhuma prova na história → sub-sinal `false`;
  - `semPlanoVigente`: **NÃO** usar `findMostRecentRelevantPlano` (não filtra status/reviewStatus,
    achado do pre-mortem → falso negativo). Criar finder novo em `PlanoSemanalRepository`, tenant-aware,
    com `:hoje` explícito (mesmo `Clock` da fila): `semanaInicio <= :hoje AND semanaFim >= :hoje AND
    status <> CONCLUIDO AND reviewStatus <> REJEITADO`;
  - `readinessBaixoOuSemCheckin`: `checkinProntidaoRepository.findTopByAtletaIdOrderByDataDesc(...)`
    vazio, OU `data` mais antiga que 14 dias (comparar com `hoje` do `Clock`, não `CURRENT_DATE`), OU
    `nivelProntidao == DESCANSAR`.
  - verify: teste (Mockito, sem Testcontainers) cobrindo cada boolean isoladamente (true/false), igual
    ao padrão dos outros evaluators; teste explícito de que plano `CONCLUIDO` com `semanaFim` futuro
    conta como "sem plano vigente" (regressão do falso-negativo); teste de que atleta sem histórico de
    prova NÃO dispara "sem prova futura" (Q4).

- [ ] 4.4 Chamar `evaluator.avaliarRetencao(fase, ...)` e adicionar ao `sinais` (mesma lista dos
  outros 6, `ifPresent(sinais::add)`).
  - verify: `./mvnw clean compile` ok; sem NPE no fluxo feliz.

- [ ] 4.4b **RF4 no DTO:** ao montar o `CoachAttentionItemOutputDto`, o `suggestedAction` passa a ser
  `principal.suggestedActionOverride() != null ? principal.suggestedActionOverride() :
  principal.motivo().getSuggestedAction()`. Não muda o comportamento dos outros 6 motivos (override é
  sempre `null` para eles).
  - verify: teste assertando que um item `RISCO_RETENCAO` com dominante "sem plano" carrega o
    `suggestedAction` do override; um item `FADIGA` carrega o `getSuggestedAction()` do enum (inalterado).

- [ ] 4.5 **Corte de exibição por-motivo (Q1).** Alterar o filtro compartilhado
  (`filter(item -> item.severity().getPeso() >= CORTE_SEVERIDADE)` em `getAttentionQueue` **e**
  `getSinaisParaAtleta`) para deixar passar `RISCO_RETENCAO` a partir de `MEDIA`, mantendo `ALTA+` para
  os demais 6 motivos. Documentar a nuance do `primaryReason` (design Decisão 8): só exibe quando
  retenção é o motivo dominante — se um motivo clínico empatar/vencer, é ele que aparece.
  - verify: teste — atleta com `RISCO_RETENCAO` MEDIA isolado aparece; atleta com outro motivo em MEDIA
    isolado continua filtrado; atleta com `RISCO_RETENCAO` MEDIA + `FADIGA` MEDIA → fadiga vira
    `primaryReason` e o item é filtrado (nuance documentada, não é bug).

- [ ] 4.6 Atualizar `CoachAttentionQueueServiceImplTest`: cenário com atleta em D45 com 3 sinais de
  retenção disparados e nenhum outro sinal → `primaryReason = RISCO_RETENCAO` (ALTA) + `suggestedAction`
  correto por causa dominante; cenário com fadiga CRITICA simultânea → fadiga vence (severidade maior).
  - verify: `./mvnw clean test` verde; suíte cresce em pelo menos 6 testes novos.

- **Validação do bloco:** `./mvnw clean test`.

---

## 4c. `SugestaoCoachGeneratorJob` ignora `RISCO_RETENCAO` de propósito (Decisão 6)

- [ ] 4c.1 Confirmar em `jobs/SugestaoCoachGeneratorJob.java` que o `Map` estático `MOTIVO_TIPO` NÃO
  ganha entrada para `RISCO_RETENCAO` nesta v1 (motivo sem mapeamento já é ignorado no job). Adicionar
  teste de regressão que prova: um item de fila com `primaryReason = RISCO_RETENCAO` NÃO gera
  `SugestaoCoach` persistida (comportamento intencional, não acidental).
  - verify: `./mvnw clean test` verde; teste do job assertando zero `SugestaoCoach` para `RISCO_RETENCAO`.

- **Validação do bloco:** `./mvnw clean test`.

---

## FE. Frontend — registrar o motivo na fila (repo `apps/menthoros-front`)

Branch própria no `apps/menthoros-front` (`feature/add-retention-radar-lite`). Só depois que o backend
já enviar `RISCO_RETENCAO` — ou coordenado, já que o `Record` exaustivo do TS obriga a entrada.

- [ ] FE.1 `src/types/Coach.ts`: adicionar `'RISCO_RETENCAO'` ao union `AttentionReason`.
  - verify: `npm run build` (`tsc -b`) acusa os 2 `Record` incompletos (esperado até FE.2).

- [ ] FE.2 Adicionar `RISCO_RETENCAO: 'Risco de retenção'` (texto final a confirmar) aos dois mapas
  exaustivos: `REASON_LABEL` (`src/features/coach/pages/CoachAttentionQueuePage.tsx`) e
  `ATTENTION_REASON_LABEL` (`src/features/coach/components/DashboardAttentionQueueRow.tsx`).
  - verify: `npm run lint && npm run build` verdes.

- [ ] FE.3 Verificação visual (com backend enviando pelo menos 1 atleta em `RISCO_RETENCAO`): o card
  aparece nas duas superfícies com nome, chip de severidade, `suggestedAction` (RF4), `rationale` em
  itálico e chips de evidência. Confirmar que o coach pode ignorar/adiar sem bloqueio.
  - verify: screenshot/registro do card renderizado nas duas telas.

- **Validação do bloco:** `npm run lint && npm run build` (não há suíte de unit no front — validação por
  lint+build+visual, conforme convenção do módulo).

---

## 5. Validação final

- [ ] 5.1 `./mvnw clean test` verde (baseline atual documentada no `SPRINTS.md`; confirmar delta).
- [ ] 5.2 Confirmar: `CoachAttentionItemOutputDto` inalterado (mesmo número de campos, mesma ordem).
- [ ] 5.3 Confirmar: nenhuma migration criada (`git status db/migration/` vazio).
- [ ] 5.4 Smoke manual (dev): pelo menos 1 atleta real/seed com sinais suficientes para disparar
  `RISCO_RETENCAO` na fila real (`GET /api/v1/coach/attention-queue`). Confirmar que o card mostra a
  ação por causa dominante (RF4) e que o coach pode ignorá-lo/adiá-lo sem bloqueio (coach-in-the-loop
  preservado — nenhuma automação dispara para o atleta).
- [ ] 5.5 **Guardrail de over-alerting (product-review):** no smoke/seed, conferir que `RISCO_RETENCAO`
  NÃO dispara para > 40% do roster. Se disparar, registrar como sinal de threshold frouxo (contagem
  2/3/4-5 ou relógio de retenção incluindo legados demais) antes de qualquer generalização — não
  bloqueia o merge, mas vira follow-up obrigatório.
- [ ] 5.6 Atualizar este `tasks.md` (implementado vs adiado) antes de arquivar.

---

## Itens adiados explicitamente

- Next Best Action com templates PT-BR editáveis (RF5) → bloco completo `Retention Loop 90d`.
- Jornada 0-30-60-90, micro-check-ins de barreiras dedicados, marcos de progresso → bloco completo.
- Sinal de silêncio/mensagem → depende de `add-athlete-coach-messaging` (0%).
- **Sub-sinal de queda vs baseline (Q5)** → bloco completo, com referência de comparação bem definida.
- Condicionar "sem prova" ao `objetivo` (texto livre) → descartado em favor de histórico de prova (Q4).
- Dashboard/analytics de coorte + eventos `retention_*` → bloco completo.
- Extração de um `RetentionSignalEvaluator` dedicado → follow-up se o produto crescer além de ~5 sub-sinais.
