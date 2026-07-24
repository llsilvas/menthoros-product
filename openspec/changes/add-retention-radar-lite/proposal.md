**Tamanho:** M · **Trilha:** Full

## Why

O discovery de retenção (`prd/product-discovery-retencao-atletas-90d.md`) e o PRD completo
(`prd/prd-retention-loop-90d.md`) mostram que o maior ROI para reduzir churn após 90 dias é dar ao
coach um **radar de risco explicável** — não descontos, não notificações genéricas. O bloco completo
(`Retention Loop 90d`, `prd/roadmap-retencao-atletas-90d.md`) está desenhado como 7 sprints
(radar → next best action → jornada 0-30-60-90 → barreiras → marcos → dashboard), sequenciado **atrás**
de `add-workout-metrics-analyzer` e `add-athlete-coach-messaging` — ambos 0% e parados há semanas
(CPO weekly `artifacts/cpo-weekly/2026-07-24.md`, §4).

Uma auditoria de código feita durante a análise do CPO weekly (mesma sessão) mostrou que **5 dos 7
sinais de risco do RF2** do PRD já têm dado pronto hoje, sem ingestão nova: `dias_sem_treino` e
`aderencia_14d` (já calculados em `CoachAttentionQueueServiceImpl`), `sem_meta_ou_prova_futura`
(`ProvaRepository`, entregue em `add-athlete-engagement-signals`), `readiness_baixo` (`CheckinProntidaoRepository`,
entregue em `add-daily-readiness-checkin`) e `plano_vencido_ou_inexistente` (via `PlanoSemanalRepository`).
Dois sinais foram ajustados na revisão da spec: `queda_vs_baseline_individual` (`AthleteBaselineState`)
**foi cortado da v1** — o baseline é sobrescrito a cada recálculo, tornando "queda" ambígua (Q5); e
`plano_vencido` exige uma query nova (filtro de `status`/`reviewStatus`), não a reutilização direta que
o pre-mortem refutou. Só o sinal `sem_mensagem_ou_checkin_14_dias` (metade "mensagem") depende de
`add-athlete-coach-messaging`, que não existe. Resultado: a v1 roda com **5** sub-sinais prontos hoje.

Esta change entrega a fatia "Fora da caixa #1" recomendada no CPO weekly: um **Retention Radar lite**
que roda hoje, reaproveitando o padrão já existente `SinalAtencao` / `CoachAttentionSignalEvaluator`
da fila de atenção (Sprint 9a), sem esperar o bloco completo.

## What Changes

**Backend (o grosso) + um ajuste mínimo de frontend (sem migration, sem novo endpoint, sem campo novo
no DTO de saída, sem componente novo de UI).** A change toca os dois repos — por isso é Full, multi-repo
— mas não vale dividir: o front é um wiring de 3 pontos, sem componente novo (dividir cairia no
anti-padrão "peça trivial em change própria").

### Backend

1. **`FaseRetencao` (novo enum, `enums/`):** `FUNDACAO` (D1-D30), `HABITO` (D31-D60), `VINCULO`
   (D61-D90), `RENOVACAO` (D91-D120) — espelha RF1 do PRD. Atletas fora de D1-D120 (`Atleta.getCreatedAt()`
   mais de 120 dias, ou menos de 1 dia) não entram na avaliação de risco de retenção (v1 não cobre
   "Maduro D121+", conforme o próprio PRD).

2. **`MotivoAtencao` ganha o valor `RISCO_RETENCAO`** (`enums/MotivoAtencao.java`) — peso 45 (entre
   `SOBRECARGA`=40 e `FADIGA`=50; sinal de retenção é prioritário, mas fadiga/lesão continuam na frente).
   O `suggestedAction` **não** é uma string genérica fixa: implementa o **RF4 do PRD (Next Best Action
   estático — tabela causa-dominante → ação)**. O card carrega a ação específica ao sub-sinal dominante
   (ex.: sem plano vigente → "gerar/ativar um plano"; lacuna de treino → "contato de barreira antes de
   ajustar o plano"). Só o **RF5** (templates editáveis PT-BR com UI de edição + envio) fica para o
   bloco completo, porque exige mensageria (0%, inexistente hoje).

   Mecanismo: `MotivoAtencao.suggestedAction` é um campo fixo por valor de enum, então o RF4 não cabe
   nele. `SinalAtencao` ganha um campo opcional `suggestedActionOverride` (aditivo, `null` para os 6
   sinais existentes via construtor de conveniência — zero mudança nos call sites atuais); `montarItem`
   usa o override quando presente, senão cai no `motivo().getSuggestedAction()` de hoje. Contrato do
   DTO de saída permanece intacto (o override alimenta o mesmo campo `suggestedAction` já existente).

3. **`CoachAttentionSignalEvaluator.avaliarRetencao(...)` (novo método):** conta quantos dos **5**
   sub-sinais dispararam para o atleta e mapeia para `Severidade`:
   - `dias_sem_treino ≥ 14` (reaproveita `diasInativos`, já calculado em `montarItem`);
   - `perdidos ≥ 3` na janela de 14 dias (reaproveita `perdidos`, já calculado);
   - sem prova/meta futura **condicionado a histórico de prova** (decisão Q4): só conta quando o atleta
     **já teve** prova registrada (`ProvaRepository`) E não tem nenhuma prova futura
     (`findUpcomingByAtletaIdAndTenantId` vazia) nem prova-alvo **futura** (finder novo com
     `dataProva >= :hoje` — o pre-mortem mostrou que `findByAtletaAndProvaAlvoTrue` não filtra data).
     Atleta que nunca correu (treina por saúde) **não** é penalizado;
   - sem plano vigente **acionável**: o pre-mortem mostrou que `findMostRecentRelevantPlano` não
     filtra `status`/`reviewStatus` (contaria um plano `CONCLUIDO`/`REJEITADO` como vigente → falso
     negativo); precisa de um finder novo tenant-aware com `:hoje` explícito filtrando
     `status <> CONCLUIDO AND reviewStatus <> REJEITADO` (ver design, Decisão 4);
   - sem check-in nos últimos 14 dias OU último check-in com `NivelProntidao.DESCANSAR`
     (`CheckinProntidaoRepository.findTopByAtletaIdOrderByDataDesc`).

   (O 6º sinal candidato — queda de CTL vs baseline — foi **cortado da v1**, decisão Q5.)

   Contagem → severidade: 0–1 sinal = sem card (mesmo padrão de silêncio dos outros evaluators);
   2 sinais = `MEDIA`; 3 = `ALTA`; 4–5 = `CRITICA`. `rationale` lista a fase (`FaseRetencao`) e os
   motivos específicos que dispararam; `sourceRules` lista cada sub-sinal disparado. O evaluator também
   resolve o **sub-sinal dominante** (ordem de prioridade fixa: sem plano vigente > lacuna de treino >
   readiness baixo > baixa aderência > sem prova futura) e produz o `suggestedActionOverride` do RF4
   correspondente.

4. **`CoachAttentionQueueServiceImpl.montarItem`:** injeta os 3 repositórios novos
   (`ProvaRepository`, `CheckinProntidaoRepository` e `PlanoSemanalRepository` — este **não** é
   injetado hoje, só o `PlanoMetadadosRepository`, confirmado pelo pre-mortem; o
   `AthleteBaselineStateRepository` **não** é mais necessário após o corte do sub-sinal de baseline) e
   chama `evaluator.avaliarRetencao(...)` junto dos 6 evaluators existentes. `RISCO_RETENCAO` entra na
   mesma disputa de `primaryReason` por severidade que os outros motivos já usam.

5. **Corte de exibição por-motivo (decisão Q1):** o filtro compartilhado da fila
   (`CORTE_SEVERIDADE = Severidade.ALTA.getPeso()` em `getAttentionQueue`/`getSinaisParaAtleta`) passa a
   deixar passar `RISCO_RETENCAO` a partir de `MEDIA`, mantendo `ALTA+` para os demais 6 motivos.
   Mudança pontual e testada — é a única alteração de lógica compartilhada da change (registro de risco
   de regressão no design).

### Frontend (wiring mínimo, sem componente novo)

O coach é informado pela **fila de atenção que ele já usa** — duas superfícies existentes que renderizam
o card automaticamente: `CoachAttentionQueuePage` (fila dedicada) e `DashboardAttentionQueueRow` (top-3
no inbox do dashboard). `suggestedAction` (RF4), `explanation.rationale` e `evidence[]` são exibidos
direto do DTO — **aparecem sem trabalho de front**. Não há mapa de ícone/cor por motivo; severidade é
ortogonal ao motivo.

O único trabalho de front é registrar o novo valor de motivo (o tipo é **curado à mão**, não gerado do
OpenAPI — então não é regen de cliente):

6. **`src/types/Coach.ts`:** adicionar `'RISCO_RETENCAO'` ao union `AttentionReason`.
7. **Dois `Record<AttentionReason, string>` de label** (exaustivos — sem a entrada, o `tsc -b` quebra):
   `REASON_LABEL` em `CoachAttentionQueuePage.tsx` e `ATTENTION_REASON_LABEL` em
   `DashboardAttentionQueueRow.tsx` — adicionar `RISCO_RETENCAO: 'Risco de retenção'` (ou similar) nos dois.

## Non-Goals

- **Templates editáveis PT-BR com UI de edição + envio (RF5 do PRD)** — fica para o bloco completo;
  depende de mensageria (`add-athlete-coach-messaging`, 0%). O RF4 estático (ação sugerida por causa
  dominante, sem edição) **está no escopo** desta v1 — ver What Changes item 2.
- **Jornada de check-ins 0-30-60-90 (RF6)** e **micro-check-ins de barreiras dedicados (RF7)** — não
  entram; v1 só *lê* check-ins de readiness já existentes, não cria um novo tipo de check-in.
- **Marcos de progresso visíveis (RF8)** — fora do escopo.
- **Sinal de silêncio/mensagem (metade "mensagem" de RF2)** — depende de `add-athlete-coach-messaging`
  (0%, não existe `Mensagem`/entidade de messaging no código hoje); v1 usa só a metade "check-in".
- **Dashboard/analytics de coorte D90/D120 (RF9, História 8)** — fica para depois; eventos analíticos
  (`retention_risk_calculated` etc.) não são emitidos nesta v1.
- **`RISCO_RETENCAO` não gera `SugestaoCoach` persistida na v1** — o pre-mortem corrigiu a premissa de
  que "a fila é read-only": existe o `SugestaoCoachGeneratorJob` (diário) que persiste motivos da fila
  no inbox de sugestões. Na v1, `RISCO_RETENCAO` fica **de fora do inbox de propósito** (radar de
  triagem, não item aprovável) — mas isso vira explícito e testado (o job deve ignorá-lo
  conscientemente, não por mapeamento esquecido). Promover ao inbox é o gancho do bloco completo (ver
  design, Decisão 6). O sinal em si continua calculado on-demand a cada request, não persistido —
  mesma decisão de `add-recommendation-explainability`.
- **Sub-sinal de queda vs baseline** — **cortado da v1** (decisão Q5): o `AthleteBaselineState` é
  sobrescrito a cada recálculo, tornando a semântica de "queda" ambígua. O radar roda com **5**
  sub-sinais corretos; o de baseline volta no bloco completo com uma referência bem definida.
- **ML preditivo** — fora do MVP do PRD, fora também desta fatia.

## Critérios de aceite

**CA-1: Atleta fora da janela D1-D120 nunca recebe `RISCO_RETENCAO`**
- **Dado** um atleta com `createdAt` há 200 dias, **quando** a fila for calculada, **então** nenhum
  sinal `RISCO_RETENCAO` é avaliado para ele (outros motivos continuam funcionando normalmente).

**CA-2: Contagem de sinais mapeia corretamente para severidade (5 sub-sinais na v1)**
- **Dado** um atleta em D45 com exatamente 2 sub-sinais disparados (lacuna de treino + sem plano
  vigente), **quando** `avaliarRetencao` rodar, **então** o sinal retorna `Severidade.MEDIA`.
- **Dado** um atleta com 3 sub-sinais, **quando** `avaliarRetencao` rodar, **então** retorna
  `Severidade.ALTA`.
- **Dado** um atleta com 4 ou 5 sub-sinais, **quando** `avaliarRetencao` rodar, **então** retorna
  `Severidade.CRITICA`.

**CA-3: `RISCO_RETENCAO` em nível `MEDIA` aparece na fila (decisão Q1 — corte por-motivo)**
- **Dado** um atleta cujo `primaryReason` é `RISCO_RETENCAO` em `MEDIA` e nenhum outro motivo em
  `ALTA+`, **quando** a fila for consultada, **então** o item **aparece** (retenção é exibida a partir
  de `MEDIA`), enquanto um item cujo `primaryReason` seja qualquer outro motivo em `MEDIA` continua
  filtrado (corte `ALTA+` inalterado para os demais).

**CA-8: "sem prova futura" só dispara com histórico de prova (decisão Q4)**
- **Dado** um atleta que **nunca** teve prova registrada, **quando** `avaliarRetencao` rodar, **então**
  o sub-sinal "sem prova/meta futura" **não** conta (atleta de saúde não é penalizado).
- **Dado** um atleta com prova(s) passada(s) mas nenhuma futura, **quando** `avaliarRetencao` rodar,
  **então** o sub-sinal conta.

**CA-9: Atleta legado sem data confiável fica fora do radar (decisão Q6)**
- **Dado** um atleta cujo `createdAt` é o backfill da migração V25 e que não tem data de
  onboarding/baseline, **quando** a fila for calculada, **então** nenhum `RISCO_RETENCAO` é avaliado
  (a fase de retenção usa a data de onboarding, com fallback de exclusão).

**CA-4: `rationale` e `sourceRules` são concretos**
- **Dado** um sinal `RISCO_RETENCAO` com fase `HABITO` e 3 sub-sinais disparados, **quando** o item
  for consultado, **então** `rationale` menciona a fase e cada motivo específico, e `sourceRules`
  lista uma entrada por sub-sinal disparado.

**CA-5: Contrato aditivo — zero regressão**
- **Dado** consumers que já leem `CoachAttentionItemOutputDto` hoje, **quando** a fila for consultada,
  **então** o shape do DTO permanece idêntico (nenhum campo novo, nenhum campo removido) — a única
  mudança observável é um novo valor possível de `primaryReason`.

**CA-6: `RISCO_RETENCAO` disputa `primaryReason` pela mesma regra de severidade dos outros motivos**
- **Dado** um atleta com `RISCO_RETENCAO` em `ALTA` e `FADIGA` em `MEDIA` simultaneamente, **quando**
  o item for montado, **então** `primaryReason = RISCO_RETENCAO` (maior severidade vence, peso como
  desempate — mesma regra já existente em `montarItem`).

**CA-7: `suggestedAction` reflete o sub-sinal dominante (RF4 estático)**
- **Dado** um atleta em `RISCO_RETENCAO` cujo sub-sinal de maior prioridade disparado é "sem plano
  vigente", **quando** o card for montado, **então** `suggestedAction` é a ação de "gerar/ativar
  plano" (não uma ação genérica), mesmo que outros sub-sinais também tenham disparado.
- **Dado** um atleta em `RISCO_RETENCAO` cujo único/dominante sub-sinal é "lacuna de treino",
  **quando** o card for montado, **então** `suggestedAction` é a ação de "contato de barreira".

## Valor de produto & dependência com o bloco completo

Com o RF4 estático incluído, o lite tem **valor isolado real**, não só "mais um dado": o coach vê
*quem* está em risco (radar), *por quê* (rationale + sinais) e *qual a próxima ação* (RF4) — os três
critérios do North Star, dentro da fila que ele já abre todo dia. O que ainda depende do bloco
completo é o *fechamento do loop* — editar/enviar a mensagem sem sair do produto (RF5 + mensageria),
a jornada programada 0-30-60-90 e a medição de coorte. Ou seja: o lite muda a **triagem** do coach
hoje; o bloco completo muda a **execução** depois. Achado do product-review a proteger: se o Next
Best Action editável (RF5) demorar mais de ~2-3 sprints após o merge, revisitar a priorização — um
radar que aponta ação mas obriga o coach a executá-la fora do produto perde força com o tempo.

## Critério de sucesso (v1, sem analytics de evento)

Esta v1 não emite eventos analíticos (Non-Goal), então a medição é grosseira e observacional — não
um dashboard de coorte (isso é RF9, bloco completo). Sinais mínimos de que o lite funcionou:

- **Precisão percebida:** no smoke/piloto, os atletas marcados com `RISCO_RETENCAO` batem com a
  percepção manual do coach (não é falso alarme sistemático). Guardrail: se `RISCO_RETENCAO` disparar
  para **> 40% do roster** de uma assessoria no piloto, os thresholds (contagem 2/3/4-5) estão frouxos —
  revisar antes de generalizar.
- **Acionabilidade:** o coach consegue dizer, olhando o card, qual é o próximo passo (o RF4 dá a ação;
  o rationale dá o porquê) — sem precisar abrir o perfil para decidir.
- **North Star:** contribui para "risco visível + próxima ação do coach" e "qualidade de decisão"
  (`knowledge/product/north-star.md`). O ganho de retenção D90/D120 em si (métrica-fim do PRD) só é
  mensurável no bloco completo com coorte + eventos.

## Open Questions & Assumptions

**Decididas no DoR (founder, 2026-07-24) — todas fechadas, nada bloqueante restante:**
- **Q1 — Corte de exibição → corte POR-MOTIVO.** `RISCO_RETENCAO` é exibido a partir de `MEDIA`; os
  demais 6 motivos continuam em `ALTA+`. Mais alinhado ao RF3 do PRD. Custo: é a única alteração de
  lógica compartilhada da change (filtro de `getAttentionQueue`/`getSinaisParaAtleta`) — risco de
  regressão registrado no design, coberto por teste. Ver What Changes item 5.
- **Q2 — Threshold de queda de baseline → SEM EFEITO.** O sub-sinal de baseline foi cortado (Q5);
  a pergunta do threshold deixa de existir na v1.
- **Q3 — Peso de `RISCO_RETENCAO` → 45.** Entre `SOBRECARGA` (40) e `FADIGA` (50): retenção importa,
  mas não ofusca sinais de lesão/fadiga aguda.
- **Q4 — Falso-positivo de "sem prova futura" → CONDICIONAR A HISTÓRICO DE PROVA.** O sub-sinal só
  conta quando o atleta **já teve** prova registrada mas não tem nenhuma futura. Atleta que nunca
  correu (treina por saúde) não é penalizado. Escolhido em vez de condicionar ao `objetivo` porque
  esse campo é **texto livre** (`String` de 500 chars, verificado no código) — classificá-lo seria
  frágil; histórico de prova é dado limpo (`ProvaRepository`). Ver What Changes item 3.
- **Q5 — Referência de comparação do baseline → CORTAR O SUB-SINAL DA V1.** O `AthleteBaselineState` é
  sobrescrito a cada re-baseline (semântica de "queda" ambígua); melhor 5 sub-sinais corretos que 6 com
  um ambíguo. O sinal volta no bloco completo com uma referência bem definida. Ver Non-Goals.
- **Q6 — Relógio de retenção para atletas legados → DATA DE ONBOARDING + FALLBACK DE EXCLUSÃO.** A fase
  D1-D120 usa a data de onboarding/baseline (não o `createdAt` cru, que para atletas legados é o
  backfill da V25); atletas sem data confiável ficam fora do radar. Protege o primeiro deploy do viés
  de "todos legados em FUNDACAO". Ver What Changes item 3 / design Decisão 7.

**Resolvidas para esta change (contexto):**
- A: v1 cobre só D1-D120 (RF1 do PRD). O recorte não é arbitrário: o próprio PRD (RF1) classifica
  D121+ como fase "Maduro = acompanhamento normal" — o radar de churn mira exatamente a janela de
  risco concentrado (os primeiros 90-100 dias, evidência §2.1 do discovery). Estender a fase Maduro é
  uma pergunta separada ("os mesmos sinais predizem churn em atleta veterano?") que o bloco completo
  pode testar com dado de coorte.
- B: "sem plano vigente" **exige query nova** (finder tenant-aware com `:hoje` + filtro de
  `status`/`reviewStatus`) — a suposição inicial de reutilizar `findMostRecentRelevantPlano` foi
  refutada pelo pre-mortem (contaria plano `CONCLUIDO`/`REJEITADO` como vigente). Ver design Decisão 4.
- C: nenhuma persistência de evento nesta v1 — mesma decisão já tomada em `add-recommendation-explainability`.
- D: `RISCO_RETENCAO` é um motivo entre outros 6 na mesma fila — não cria endpoint, tela ou contrato novo.
