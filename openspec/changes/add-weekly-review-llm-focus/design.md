## Context

Fatia 2 de 3 do `weekly-athlete-review`. A Fatia 1 (`add-weekly-review-consolidation`) já entrega a revisão determinística congelada (`recommendationType`, `adherenceStatus`, `dadosSuficientes`) em `tb_revisao_semanal`, 1:1 com o `PlanoSemanal` — **sem narrativa**. Esta fatia adiciona a narrativa `nextWeekFocus` (LLM atrás de flag), injeta a revisão na geração do próximo plano e captura o sinal de aprendizado.

## Code Anchors (reancorados contra a F1 entregue — 2026-07-25)

- **Ponto de extensão da F1 (o que esta fatia estende).** A geração da revisão **não** está em `EncerramentoSemanaService` — ele apenas publica `SemanaEncerradaEvent`. Quem gera é `RevisaoSemanalListener.aoEncerrarSemana` (`RevisaoSemanalListener.java:25`, `@TransactionalEventListener(phase = AFTER_COMMIT)`, com `try/catch` que engole a falha para não desfazer o encerramento) → `RevisaoSemanalService.gerarNoEncerramento(planoId, tenantId)` (impl `RevisaoSemanalServiceImpl.java:83`), que é idempotente por insert-if-absent (`:88`) e preserva o congelamento do ADR-0006. A consolidação determinística vive em `RevisaoSemanalCalculator`. Entidade `RevisaoSemanal.java` (campos atuais: `recommendationType`, `adherenceStatus`, `percentualRealizacao`, `dadosSuficientes`, `geradaEm`) — as colunas desta fatia são aditivas nela. Leitura pelo coach: `RevisaoSemanalServiceImpl.buscarUltima` (`:99`) → `CoachRevisaoSemanalController`.
- **Precedente de LLM assíncrono.** `WorkoutAnalysisListener` (`:72`) usa `@Async("workoutAnalysisExecutor")` sobre um listener de evento para chamada LLM, com executor dedicado em `config/external/WorkoutAnalysisAsyncConfig.java:17`. É o padrão a replicar (ver D8).
- **Captura do desfecho (`consumedReviewOutcome`).** Aprovação do plano pelo coach: `PlanoReviewServiceImpl.aprovarPlano(planoId, tenantId)` (`:68`), exposto por `CoachPlanoReviewController:95`. Geração: `PlanoServiceImpl.java:129` (unitário) e `BatchPlanProcessor.java:80` (lote).
- **Integração da geração de plano.** `IaService.geraPlanoSemanalAvancado(Atleta, PlanoMetaDados, Prova, ModoGeracaoPlano, @Nullable DecisaoProgressao)` (`IaService.java:22`, impl `IaServiceImpl.java:309`) → `PlanoTreinoPromptBuilder.buildOptimizedPrompt(...)` (`:171`), que acumula `historicoFinal` e retorna `PromptGerado(String, List<Constraint>)` (`:336`). O insumo da revisão entra como novo bloco `historicoFinal.append(...)` / novo formatter (padrão de ~10 formatters injetados) ou parâmetro extra. Caminho unitário síncrono `@Transactional` (`PlanoServiceImpl.java:129`); lote `@Async` (`BatchPlanProcessor.java:80`).
- **Feature flag.** Padrão `@Value("${...enabled:true}")` + `@ConditionalOnProperty` (ex.: `EncerramentoSemanaScheduler.java:41`). Usar `menthoros.weekly-review.llm.enabled`.
- **Custo LLM.** `CostTrackingAdvisor` (`ai/cost/CostTrackingAdvisor.java`) publica contadores Micrometer (`llm.tokens.*`, `llm.cost.estimated.usd`) com tags `model`+`route` em toda chamada roteada (`MultiModelConfig.java:52`); preços em `llm-pricing.yml`; log `[llm-usage]` via `LlmUsageLogger`. Para custo por atleta/mês, estender tags (cardinalidade) ou persistir por chamada (precedente `SkillExecution`).

## Goals / Non-Goals

**Goals:**
- narrativa `nextWeekFocus` por IA, restrita pelo `recommendationType`, atrás de flag
- revisão como insumo da geração do próximo plano
- captura do desfecho da revisão consumida (`consumedReviewOutcome`) como sinal de aprendizado

**Non-Goals:**
- recalcular números no LLM (a consolidação é da Fatia 1, determinística)
- superfície visual (Fatia 3); métricas `.fit`; notificação ao atleta

## Decisions

### D5: Narrativa LLM restrita pelo `recommendationType`, atrás de flag (kill-switch)

**Decisão:** O `nextWeekFocus` é redigido por LLM sobre os sinais já consolidados, recebendo o `recommendationType` como restrição (a narrativa não pode contrariar o tipo determinístico). A geração fica atrás de `menthoros.weekly-review.llm.enabled`; desligada, usa um **template determinístico derivado do `recommendationType`** (fallback desta fatia — a F1 não tem template). Uma segunda flag controla a injeção da revisão na geração de plano.

**Rationale:** Isola custo/qualidade de LLM; permite implementar sem esperar o gate A1 (aferido em canary) e rollback imediato sem perder o núcleo determinístico.

### D8: Chamada LLM fora da thread do encerramento (`@Async` + timeout/retry)

**Decisão:** A narrativa é gerada em `@Async` com executor dedicado (padrão `WorkoutAnalysisListener` + `WorkoutAnalysisAsyncConfig`), **não** na thread do `RevisaoSemanalListener`. A chamada LLM tem timeout de resposta e retry só de falha transitória, conforme a seção *External Call Resilience* do `apps/menthoros-backend/CLAUDE.md`. A revisão é **persistida primeiro** (sinal determinístico da F1, intacto) e o `nextWeekFocus` é gravado depois, num update do mesmo registro.

**Rationale:** O listener roda na thread que comitou o encerramento — que é tanto o clique manual do coach quanto o `EncerramentoSemanaScheduler`, que encerra N planos em lote. Uma chamada LLM síncrona ali serializaria N chamadas no job e seguraria a resposta do coach. Consequência aceita: existe uma janela em que a revisão existe sem narrativa; o card da F3 já trata campo ausente, e a flag desligada preenche o template determinístico de imediato.

**Consequência de falha:** falha do LLM deixa a revisão com o **template determinístico** (nunca sem `nextWeekFocus`), sem desfazer nada — mesma filosofia do `try/catch` do listener da F1.

### D9: `consumedReviewOutcome` no plano, por heurística automática (sem superfície nova)

**Decisão:** O desfecho é **inferido pelo backend**, não escolhido pelo coach, e vive no **`PlanoSemanal`** que consumiu a revisão — não na `RevisaoSemanal`. Valores: `PENDING` (consumida, plano ainda não decidido), `NO_ADJUSTMENT` (aprovado pelo coach sem treino editado/adicionado), `ADJUSTED` (aprovado pelo coach com `editadoPeloCoach`/`adicionadoPeloCoach`), `PLAN_REJECTED` (coach rejeitou), `NOT_CONSUMED` (revisão não entrou no insumo), `NO_COACH_IN_LOOP` (auto-aprovado por `AUTO_CONFIANCA_ALTA`).

**Rationale:** A Fatia 3 já foi mergeada — o card renderiza `nextWeekFocus` quando presente, mas não tem **controle** para o coach declarar o desfecho, e um endpoint sem consumidor deixaria o CA8 sem loop fechado. A heurística reusa sinais que já existem no domínio (`PlanoReviewStatus`, `editadoPeloCoach` de `coach-edit-planned-workout`, `adicionadoPeloCoach` de `coach-add-workout-to-plan`).

**Por que no plano e não na revisão:** uma revisão é **1:N** com os planos que a consomem — rejeitar e regerar faz dois planos consumirem a mesma revisão. Num campo único da revisão, o segundo desfecho sobrescreveria o primeiro, apagando justamente a rejeição que interessa ao moat. No plano, cada consumo é uma linha com seu próprio desfecho. Bônus: a `RevisaoSemanal` deixa de sofrer escrita pós-congelamento, ficando estritamente "o que foi proposto" (espírito do ADR-0006).

**Vínculo plano→revisão:** o plano **novo** ganha `revisao_semanal_id` (FK nullable), gravado na geração, junto com o `RevisaoConsumidaEvent`. A aprovação/rejeição lê esse FK; FK nulo ⇒ `NOT_CONSUMED`. O `RevisaoConsumidaEvent` carrega `revisaoId` + `planoId` (o payload original `{tenant, atleta, semanaInicio}` não bastava como registro do vínculo).

**Auto-approve não conta como aceitação:** `aprovarTransicao` é compartilhado entre o clique do coach e o auto-approve (`aplicarAutoApproveSeElegivel`, `OrigemAprovacao.AUTO_CONFIANCA_ALTA`), onde nunca há edição do coach — registrar `NO_ADJUSTMENT` ali inflaria a taxa de aceitação com planos que nenhum coach revisou. Esse caminho grava `NO_COACH_IN_LOOP`. Um `PENDING` que nunca resolve seria dado sujo disfarçado de dado pendente.

**Trade-off aceito (e nomeado):** é um **proxy de segunda ordem** — mede "algum treino deste plano foi mexido", que capta tanto discordância do foco quanto ajuste por logística (o atleta viajou e o coach trocou o treino de terça, concordando com o foco). O nome original `focusOutcome` foi rejeitado por prometer um sinal de primeira ordem que a heurística não entrega; `consumedReviewOutcome` nomeia o que de fato se mede. Uso é agregado, não decisão individual. Uma superfície de captura explícita pode substituí-lo depois sem mudar o contrato do campo.

### D11: Janela de validade da revisão consumida

**Decisão:** Um plano só consome a revisão quando ela é da **semana imediatamente anterior** à do plano sendo gerado — comparando `semana_fim` da revisão com `semana_inicio` do plano, com folga de **7 dias** para absorver encerramento atrasado. Fora da janela: não consome, FK nulo, `NOT_CONSUMED`, sem chamada nem custo de LLM.

**Rationale:** O `recommendationType` é derivado do `tsb_fim` daquela semana e apodrece rápido. Atleta que se machuca e fica três semanas sem plano teria "a revisão mais recente" com `RECOVERY` derivado de um TSB que já subiu — o prompt receberia "reduza carga" para quem passou três semanas destreinando. Não é caso exótico: lesão, férias, pausa na assessoria e o próprio fallback automático de encerramento em lote produzem exatamente isso. Sem a janela, a revisão obsoleta ainda geraria `ADJUSTED` quase certo, sujando a taxa com casos em que o coach corrigia a *obsolescência*, não a proposta. O coach não vê o prompt, então não tem como exercer esse julgamento por fora.

### D12: `focusSource` — distinguir narrativa de template no dado

**Decisão:** Gravar `focusSource` (`LLM` | `TEMPLATE`) junto com o `nextWeekFocus`.

**Rationale:** Com o gate A1 em aberto, o cenário realista do piloto é a flag desligada — todo foco é template. Uma vez persistidos, os dois regimes ficam indistinguíveis, e a série histórica mistura os dois sem separador quando a flag ligar em canary. É o mesmo problema que o glossário já resolveu em **Origem da Aprovação** ("sem esse campo, as duas origens são indistinguíveis uma vez persistidas"). Com `focusSource`, o A1 passa a ser respondível com dado dos dois lados: hoje o critério de decisão é só custo, sem nenhuma medida de benefício para contrapor.

### D6: Coach-in-the-loop — insumo, nunca aplicação automática

**Decisão:** A revisão alimenta o contexto da geração do próximo plano, mas não altera o plano automaticamente, e não é exposta ao atleta.

### D7: Loop de aprendizado — desfecho da revisão consumida

**Decisão:** Ao aprovar/rejeitar o próximo plano, registrar o que ele fez com a revisão que consumiu. **Superada em detalhe pela D9** (nome `consumedReviewOutcome`, 6 valores, coluna no `PlanoSemanal` e não na `tb_revisao_semanal`) — mantida aqui como a decisão de *existir* um sinal de aprendizado.

**Rationale:** Sinal proposta-IA vs. correção-do-coach — o moat que compõe com o sinal de revisão de plano do coach (`PlanoReviewStatus`/`origemAprovacao`).

### D10: Consistência da narrativa verificada por checker determinístico

**Decisão:** A saída do LLM passa por um checker determinístico antes de ser persistida — no espírito do `PlanQualityChecker` (`services/quality/PlanQualityChecker.java`), que já é o padrão do módulo para validar saída de LLM offline. O checker reprova a narrativa quando ela sugere progressão (aumento de volume/intensidade/carga) e o `recommendationType` é `RECOVERY` ou `MAINTAIN`. **Narrativa reprovada ⇒ fallback para o template determinístico** (nunca persiste narrativa inconsistente), com contador Micrometer da reprovação.

**Rationale:** Sem isso o CA-LLM não é testável — "narrativa consistente" viraria julgamento subjetivo. Com o checker, o teste é determinístico em dois níveis: (a) unitário do checker sobre textos fixos; (b) do fluxo, com o `ChatClient` mockado devolvendo uma narrativa que contraria o tipo e assertando que o resultado persistido é o template.

## Technical Notes

### Delta de contrato — colunas aditivas em `tb_revisao_semanal`

```text
tb_revisao_semanal (F1)
+ next_week_focus     TEXT     → narrativa (LLM atrás de flag; template determinístico como fallback)
+ focus_source        VARCHAR  (LLM|TEMPLATE)                             ← D12
~ dados_suficientes   → sufficient_data    ┐ rename (padronização de idioma,
~ percentual_realizacao → completion_rate  ┘ ver CLAUDE.md "Identifier Language")

tb_plano_semanal
+ revisao_semanal_id       UUID NULL REFERENCES tb_revisao_semanal(id) ON DELETE SET NULL
                                    → revisão consumida na geração deste plano (vínculo da D9)
+ consumed_review_outcome  VARCHAR  (PENDING|NO_ADJUSTMENT|ADJUSTED|
                                     PLAN_REJECTED|NOT_CONSUMED|NO_COACH_IN_LOOP)   ← D9

                                    ← tudo na migration V72
```

> **Estado inicial:** `consumed_review_outcome` nasce `PENDING` no plano que consumiu a revisão; nulo em plano que não consumiu nada. Os terminais são escritos na aprovação/rejeição.
>
> **A revisão nunca é reescrita depois do congelamento** — `next_week_focus` e `focus_source` são gravados na geração (o foco por LLM chega por update assíncrono da mesma geração, D8); o desfecho vive no plano.

### D13: Renomeação dos campos PT da `RevisaoSemanal` (padronização de idioma)

**Decisão:** `dadosSuficientes` → `sufficientData` e `percentualRealizacao` → `completionRate`, com rename de coluna na V72 e **PR coordenado nos dois repos** — o card da F3 consome os nomes atuais (18 referências no front, 47 no backend). A change deixa de ser backend-only e passa a **backend + front mínimo**.

**Rationale:** Decisão de convenção tomada em 2026-07-25 (ver `apps/menthoros-backend/CLAUDE.md`, "Identifier Language"): identificador novo nasce em inglês, e campo legado em PT é normalizado quando a change **já está mexendo naquela entidade** por outro motivo — que é exatamente o caso aqui. A `RevisaoSemanal` nasceu bilíngue na F1 (`recommendationType`/`adherenceStatus` em inglês, `dadosSuficientes`/`percentualRealizacao` em português, na mesma entidade).

**Sequenciamento:** merge coordenado — backend e front mergeados em sequência, aceitando uma janela curta em que o card lê `undefined` nesses dois campos. Alternativas descartadas: alias `@JsonProperty` duplo no backend (sujaria justamente a entidade que se está limpando) e tolerância dupla no adapter do front (dívida a lembrar de apagar).

> A geração de `next_week_focus` roda no encerramento (mesmo hook da F1), atrás de flag. `focus_outcome` é escrito depois, na geração/aprovação do próximo plano.

## Risks / Trade-offs

- **[Risco] Custo LLM fora do envelope** → flag desligada mantém template (Fatia 1); gate A1 em canary.
- **[Risco] Narrativa contraria o tipo determinístico** → `recommendationType` como restrição no prompt + teste (CA-LLM).
- **[Risco] Revisão vira ruído se ninguém consome** → `RevisaoConsumidaEvent` + `consumedReviewOutcome` detectam adoção baixa cedo.

## Migration Plan

1. V72: aditivas (`next_week_focus`, `focus_source` em `tb_revisao_semanal`; `revisao_semanal_id`, `consumed_review_outcome` em `tb_plano_semanal`) + renames (`dados_suficientes`→`sufficient_data`, `percentual_realizacao`→`completion_rate`)
2. Template determinístico + geração LLM de `nextWeekFocus` atrás de flag (assíncrona, D8), com `focus_source`
3. Injeção na geração do próximo plano, respeitando a janela de validade (D11): grava `revisao_semanal_id` + `PENDING` no plano novo e emite `RevisaoConsumidaEvent{tenant, atleta, semanaInicio, revisaoId, planoId}`
4. Heurística de `consumedReviewOutcome` na aprovação/rejeição (D9), lendo o FK
5. Front: renomear os dois campos no tipo/adapter/testes do card (PR coordenado, D13)

## Rollback

- Flag da narrativa desligada ⇒ `nextWeekFocus` é o template determinístico (fallback desta fatia); a F1 segue intacta.
- Flag de injeção desligada ⇒ a revisão para de alimentar o plano, sem afetar planos existentes. Migration aditiva.

## Open Questions

- **A1 (gate de rollout)** — custo LLM real por atleta/mês vs. R$1,10; critério no proposal (§Gate do founder). Não bloqueia `/implement init`.
