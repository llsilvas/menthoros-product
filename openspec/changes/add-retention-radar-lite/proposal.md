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
entregue em `add-daily-readiness-checkin`), `queda_vs_baseline_individual` (`AthleteBaselineState`,
entregue há 2 dias em `athlete-onboarding-baseline`). Um sexto sinal (`plano_vencido_ou_inexistente`)
também está pronto — `PlanoSemanalRepository.findMostRecentRelevantPlano` já resolve as duas metades
(vencido **e** inexistente) numa query só, achado desta pesquisa que corrige a suposição original do
CPO weekly de que precisaria de um join novo. Só o sétimo sinal (`sem_mensagem_ou_checkin_14_dias`,
metade "mensagem") depende de `add-athlete-coach-messaging`, que não existe.

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

3. **`CoachAttentionSignalEvaluator.avaliarRetencao(...)` (novo método):** conta quantos dos 6 sinais
   disponíveis dispararam para o atleta e mapeia para `Severidade`:
   - `dias_sem_treino ≥ 14` (reaproveita `diasInativos`, já calculado em `montarItem`);
   - `perdidos ≥ 3` na janela de 14 dias (reaproveita `perdidos`, já calculado);
   - sem prova/meta futura: sem prova futura (`ProvaRepository.findUpcomingByAtletaIdAndTenantId`
     vazia) E sem prova-alvo **futura** — o pre-mortem mostrou que `findByAtletaAndProvaAlvoTrue` não
     filtra data (uma prova-alvo passada mascararia o sinal); precisa de um finder novo com
     `dataProva >= :hoje` (ver design, tabela de risco);
   - sem plano vigente **acionável**: o pre-mortem mostrou que `findMostRecentRelevantPlano` não
     filtra `status`/`reviewStatus` (contaria um plano `CONCLUIDO`/`REJEITADO` como vigente → falso
     negativo); precisa de um finder novo tenant-aware com `:hoje` explícito filtrando
     `status <> CONCLUIDO AND reviewStatus <> REJEITADO` (ver design, Decisão 4);
   - sem check-in nos últimos 14 dias OU último check-in com `NivelProntidao.DESCANSAR`
     (`CheckinProntidaoRepository.findTopByAtletaIdOrderByDataDesc`);
   - queda de CTL vs baseline individual, **só quando há baseline calculado**
     (`AthleteBaselineStateRepository.findByAtletaIdAndTenantId` presente E `PlanoMetaDados.ctlAtual`
     abaixo do baseline por uma margem a definir — ver Q2). **Ressalva do pre-mortem:** o baseline é
     "estado atual sobrescrito", não snapshot inicial — a semântica de "queda" é ambígua (Q5); se não
     for resolvível barato, este sub-sinal **sai da v1** (fica com 5 sub-sinais).

   Contagem → severidade: 0–1 sinal = sem card (mesmo padrão de silêncio dos outros evaluators);
   2 sinais = `MEDIA`; 3–4 = `ALTA`; 5–6 = `CRITICA`. `rationale` lista a fase (`FaseRetencao`) e os
   motivos específicos que dispararam; `sourceRules` lista cada sub-sinal disparado. O evaluator também
   resolve o **sub-sinal dominante** (ordem de prioridade fixa: sem plano vigente > lacuna de treino >
   queda de baseline > readiness baixo > baixa aderência > sem prova futura) e produz o
   `suggestedActionOverride` do RF4 correspondente.

4. **`CoachAttentionQueueServiceImpl.montarItem`:** injeta os 4 repositórios novos
   (`ProvaRepository`, `CheckinProntidaoRepository`, `AthleteBaselineStateRepository` e
   `PlanoSemanalRepository` — este **não** é injetado hoje, só o `PlanoMetadadosRepository`, confirmado
   pelo pre-mortem) e chama `evaluator.avaliarRetencao(...)` junto dos 6 evaluators existentes. Zero
   mudança de assinatura pública — `RISCO_RETENCAO` entra na mesma disputa de `primaryReason` por
   severidade que os outros motivos já usam.

### Frontend (wiring mínimo, sem componente novo)

O coach é informado pela **fila de atenção que ele já usa** — duas superfícies existentes que renderizam
o card automaticamente: `CoachAttentionQueuePage` (fila dedicada) e `DashboardAttentionQueueRow` (top-3
no inbox do dashboard). `suggestedAction` (RF4), `explanation.rationale` e `evidence[]` são exibidos
direto do DTO — **aparecem sem trabalho de front**. Não há mapa de ícone/cor por motivo; severidade é
ortogonal ao motivo.

O único trabalho de front é registrar o novo valor de motivo (o tipo é **curado à mão**, não gerado do
OpenAPI — então não é regen de cliente):

5. **`src/types/Coach.ts`:** adicionar `'RISCO_RETENCAO'` ao union `AttentionReason`.
6. **Dois `Record<AttentionReason, string>` de label** (exaustivos — sem a entrada, o `tsc -b` quebra):
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
- **Alterar o corte de exibição global da fila (`CORTE_SEVERIDADE = Severidade.ALTA.getPeso()`)** —
  ver Open Question Q1: nesta v1, um atleta cujo **único** sinal ativo seja retenção em nível `MEDIA`
  não aparece na fila (mesmo comportamento hoje para qualquer motivo isolado em `MEDIA`), embora o PRD
  (RF3) peça exibição a partir de risco médio.
- **ML preditivo** — fora do MVP do PRD, fora também desta fatia.

## Critérios de aceite

**CA-1: Atleta fora da janela D1-D120 nunca recebe `RISCO_RETENCAO`**
- **Dado** um atleta com `createdAt` há 200 dias, **quando** a fila for calculada, **então** nenhum
  sinal `RISCO_RETENCAO` é avaliado para ele (outros motivos continuam funcionando normalmente).

**CA-2: Contagem de sinais mapeia corretamente para severidade**
- **Dado** um atleta em D45 com exatamente 2 sub-sinais disparados (lacuna de treino + sem prova
  futura), **quando** `avaliarRetencao` rodar, **então** o sinal retorna `Severidade.MEDIA`.
- **Dado** o mesmo atleta com 5 sub-sinais disparados, **quando** `avaliarRetencao` rodar, **então**
  o sinal retorna `Severidade.CRITICA`.

**CA-3: Sinal de queda de baseline não dispara sem baseline calculado**
- **Dado** um atleta em D20 sem `AthleteBaselineState` (calibração ainda em andamento), **quando**
  `avaliarRetencao` rodar, **então** o sub-sinal de queda vs baseline nunca conta como disparado.

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
  para **> 40% do roster** de uma assessoria no piloto, os thresholds (Q2, contagem) estão frouxos —
  revisar antes de generalizar.
- **Acionabilidade:** o coach consegue dizer, olhando o card, qual é o próximo passo (o RF4 dá a ação;
  o rationale dá o porquê) — sem precisar abrir o perfil para decidir.
- **North Star:** contribui para "risco visível + próxima ação do coach" e "qualidade de decisão"
  (`knowledge/product/north-star.md`). O ganho de retenção D90/D120 em si (métrica-fim do PRD) só é
  mensurável no bloco completo com coorte + eventos.

## Open Questions & Assumptions

**Abertas (bloqueantes para a implementação — decidir no DoR / `/implement init`):**
- **Q1 — Corte de exibição:** aceitar que risco de retenção `MEDIA` isolado não aparece na fila v1
  (Non-Goal), ou vale a pena introduzir um corte por-motivo (`RISCO_RETENCAO` visível a partir de
  `MEDIA`, os demais continuam em `ALTA`+)? Essa segunda opção tem mais risco de regressão (toca a
  lógica de filtro compartilhada por todos os 7 motivos). **Recomendação (proposta + product-review):
  não fazer agora** — aceitar Q1 como Non-Goal, reduz ruído; reavaliar se o piloto mostrar que
  MEDIA+retenção é acionável. O founder decide.
- **Q2 — Threshold de queda de baseline:** qual margem de queda de CTL vs `AthleteBaselineState.ctlEstimado`
  conta como sinal (ex.: 15%, 20%)? **Recomendação (proposta + product-review): 15%**, alinhado à faixa
  "queda relevante" já usada em outros gates + fail-closed (sem baseline não dispara) — não é constante
  clínica publicada, precisa do aval do founder.
- **Q3 — Peso de `RISCO_RETENCAO` (45):** colocação relativa entre `SOBRECARGA` (40) e `FADIGA` (50)
  é uma escolha de produto (retenção importa, mas não deve ofuscar sinais de lesão/fadiga aguda).
  **Recomendação (proposta + product-review): 45** — confirmar com o founder antes de implementar.
- **Q4 — Falso-positivo de "sem prova futura" (achado do product-review):** o sub-sinal
  `semProvaFutura` dispara para qualquer atleta sem prova no calendário — inclusive quem treina por
  saúde/manutenção, sem intenção de competir. Isso pode inflar `RISCO_RETENCAO` numa coorte que não
  está em risco real. Opções: (a) deixar como está no lite (o RF4 estático suaviza — a ação só vira
  "definir meta" se `semProvaFutura` for o sub-sinal *dominante*); (b) condicionar o sub-sinal ao
  campo `objetivo` do atleta (só conta se objetivo for competitivo). **Recomendação: (a) no lite,
  registrar (b) como refino** — mas o founder decide se (b) entra já.
- **Q5 — Referência de comparação do sub-sinal de baseline (achado do pre-mortem):** `AthleteBaselineState`
  é sobrescrito a cada re-baseline, então comparar `ctlAtual` contra `ctlEstimado` é ambíguo (falso
  negativo se o baseline for recalculado após a queda; falso positivo permanente se nunca for). Definir:
  baseline inicial imutável, rolling, ou média recente de N dias? **Recomendação: se não for resolvível
  barato, cortar o sub-sinal de baseline da v1** (5 sub-sinais corretos > 6 com um ambíguo) e tratá-lo
  no bloco completo.
- **Q6 — Relógio de retenção para atletas legados (crítico do pre-mortem):** a migration V25 preencheu
  `created_at` dos atletas pré-existentes com a data da migração, não a de cadastro real — todos cairiam
  em `FUNDACAO` (D1-D30) de uma vez, enviesando o radar no primeiro deploy. Definir a fonte de "início
  de acompanhamento": (a) data de onboarding/baseline quando presente; (b) excluir da avaliação de
  retenção atletas com `created_at` = backfill da V25 até haver data confiável. **Recomendação: (a) com
  fallback (b)** — bloqueante, sem isso o guardrail de over-alerting dispara no primeiro deploy.

**Resolvidas para esta change:**
- A: v1 cobre só D1-D120 (RF1 do PRD). O recorte não é arbitrário: o próprio PRD (RF1) classifica
  D121+ como fase "Maduro = acompanhamento normal" — o radar de churn mira exatamente a janela de
  risco concentrado (os primeiros 90-100 dias, evidência §2.1 do discovery). Estender a fase Maduro é
  uma pergunta separada ("os mesmos sinais predizem churn em atleta veterano?") que o bloco completo
  pode testar com dado de coorte.
- B: `plano_vencido_ou_inexistente` resolvido numa query só (`findMostRecentRelevantPlano`) — não
  precisa de um novo campo/flag em `PlanoSemanal` nem de um join adicional, como se supôs inicialmente
  no CPO weekly.
- C: nenhuma persistência de evento nesta v1 — mesma decisão já tomada em `add-recommendation-explainability`.
- D: `RISCO_RETENCAO` é um motivo entre outros 6 na mesma fila — não cria endpoint, tela ou contrato novo.
