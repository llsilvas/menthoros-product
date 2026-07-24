# Design: add-retention-radar-lite

## Contexto

Este design cobre a decisão arquitetural central da change: **como encaixar um sinal composto
(6 sub-checks) no evaluator de sinal único que a fila de atenção usa hoje**, sem duplicar a
infraestrutura de scoring nem quebrar o contrato do consumidor atual (`GET /api/v1/coach/attention-queue`).

Escrito antes do DoR (`spec-reviewer`); as três Open Questions do `proposal.md` (Q1 corte de
exibição, Q2 threshold de baseline, Q3 peso do motivo) são decisões de produto do founder, não
técnicas — ficam registradas lá, não resolvidas aqui.

## Decisão 1 — Reaproveitar `SinalAtencao`/`MotivoAtencao` em vez de criar um subsistema paralelo

**Alternativa considerada e rejeitada:** um novo endpoint/DTO/tabela `RetentionRadarItem`,
espelhando o `CoachAttentionItemOutputDto`, dedicado só a retenção.

**Por que rejeitada:** o PRD (RF3) pede exatamente "card na fila de atenção" — não uma tela nova.
Duplicar a infraestrutura de severidade/priorização/corte que `CoachAttentionQueueServiceImpl` já
resolve (ordenação por severidade + `priorityScore`, cap de 20 itens, filtro por tenant) seria
recriar lógica já testada (38+ testes existentes) para o mesmo problema. A decisão de
`add-recommendation-explainability` (Full, 2026-06-19) de estender o mesmo DTO em vez de criar um
paralelo é o precedente direto — mesma lógica se aplica aqui, um nível abaixo (novo *motivo*, não
novo *campo*).

**Consequência:** `RISCO_RETENCAO` compete por `primaryReason` com os outros 6 motivos pela mesma
regra (`max` por severidade, peso como desempate). Isso significa que um atleta com fadiga aguda
E risco de retenção mostra fadiga primeiro se a severidade empatar a favor dela — aceitável,
fadiga/lesão é sempre prioridade clínica sobre retenção.

## Decisão 2 — Composição por contagem de sub-sinais, não por soma ponderada

**Alternativa considerada e rejeitada:** score numérico ponderado (ex.: cada sub-sinal vale um peso
diferente, soma normalizada 0–100 vira `baixo/médio/alto/crítico` por faixa).

**Por que rejeitada:** os outros 6 evaluators do arquivo são todos regras determinísticas simples
(if/else sobre thresholds), não scores ponderados — introduzir um segundo paradigma de cálculo no
mesmo arquivo aumenta a carga cognitiva para quem for adicionar o 8º sinal depois. Contagem simples
(quantos dos 6 sub-sinais dispararam) é mais fácil de explicar ao coach ("3 de 6 sinais de risco
ativos") do que um score opaco, e é consistente com o requisito de explicabilidade do RF2 ("regras
transparentes").

**Trade-off aceito:** contagem trata todos os sub-sinais como igualmente importantes — um atleta
sem prova futura conta o mesmo que um atleta com queda de baseline. O founder pode ajustar isso
depois (pesos por sub-sinal) sem mudar a interface pública do método.

## Decisão 3 — Sub-sinal de baseline só dispara com baseline calculado (fail-closed) + ressalva do pre-mortem

A calibração de baseline (`athlete-onboarding-baseline`) roda numa janela dos primeiros dias do
atleta — pode não estar pronta ainda em D1-D30. Se o sub-sinal tratasse "sem baseline" como "queda
detectada" (fail-open), todo atleta em calibração ganharia um falso positivo. Por isso o sub-sinal
só conta quando `AthleteBaselineStateRepository.findByAtletaIdAndTenantId` retorna presente — mesmo
padrão de "histórico insuficiente → não afirmar risco" do RF2 (História 2, CA da "queda vs baseline").

**Ressalva do pre-mortem (Codex, verificada):** `PlanoMetaDados.ctlAtual` e
`AthleteBaselineState.ctlEstimado` estão na mesma unidade (ambos derivam de `MetricasDiarias.getCtl()`
— `BaselineCalculatorImpl.java:62` e `TsbServiceImpl.java:240`), então a comparação numérica é
coerente. **Mas** `AthleteBaselineState` é um "estado atual", sobrescrito a cada re-baseline
(`OnboardingServiceImpl.java:440`), **não** um snapshot congelado do início. Consequência ambígua: se
o baseline for recalculado *depois* da queda de CTL, ele "persegue" o valor atual e o sinal nunca
dispara (falso negativo); se nunca for recalculado, a queda vira permanente (falso positivo que não
sai). Esta é a **Q5** nas Open Questions do `proposal.md` — o founder precisa definir a referência de
comparação (baseline inicial imutável vs. rolling vs. média recente de N dias) antes de implementar o
sub-sinal. **Mitigação conservadora sugerida para o lite:** se a semântica não for resolvível
barato, **cortar o sub-sinal de baseline da v1** (fica com 5 sub-sinais, ainda entrega valor) e
tratá-lo no bloco completo com uma fonte de referência bem definida — melhor 5 sinais corretos que 6
com um ambíguo.

## Decisão 4 — Sinal de "sem plano vigente" precisa de query nova (corrigido pelo pre-mortem)

**Versão original desta decisão (ERRADA):** reaproveitar `findMostRecentRelevantPlano(atletaId,
tenantId)`, presumindo que "sem resultado" cobre "vencido ou inexistente".

**Achado do pre-mortem cross-model (Codex, verificado no código):** essa query filtra apenas
`semanaFim >= CURRENT_DATE` — **não filtra `status` nem `reviewStatus`**
(`PlanoSemanalRepository.java:171-178`). Como `PlanoStatus.CONCLUIDO` é inativo e
`PlanoReviewStatus.REJEITADO` também, um plano concluído ou rejeitado cujo `semanaFim` ainda é futuro
seria contado como "plano vigente" → **falso negativo de risco** (o atleta parece coberto quando não
está). Além disso, a query usa `CURRENT_DATE` do banco, enquanto a fila calcula `hoje` com
`LocalDate.now(clock)` (`CoachAttentionQueueServiceImpl.java:80`) — divergência de fuso/virada de dia
entre sub-sinais, e testes com `Clock` fixo não controlam `CURRENT_DATE`.

**Decisão corrigida:** o sub-sinal exige um **finder novo, tenant-aware, com `:hoje` explícito**
(derivado do mesmo `Clock` da fila), filtrando plano vigente **acionável**: `semanaInicio <= :hoje AND
semanaFim >= :hoje AND status <> CONCLUIDO AND reviewStatus <> REJEITADO`. "Sem resultado" = sem plano
vigente acionável. Redefine também a semântica do sub-sinal: não é "vencido ou inexistente" genérico,
é "não há hoje um plano ativo e aprovável cobrindo a semana corrente". A task 4.3 e o bloco 3 refletem
essa query nova (não a reutilização de `findMostRecentRelevantPlano`).

## Decisão 5 — RF4 estático via `suggestedActionOverride` opcional em `SinalAtencao`

O `suggestedAction` que chega ao card vem hoje de `MotivoAtencao.getSuggestedAction()` — um campo
**fixo por valor de enum**. Para o RF4 (ação por causa dominante), `RISCO_RETENCAO` precisa de ações
*diferentes* conforme qual sub-sinal domina — impossível num campo único do enum.

**Alternativa rejeitada:** criar 6 valores de enum (`RISCO_RETENCAO_SEM_PLANO`, `..._LACUNA`, etc.).
Poluiria o enum, quebraria a semântica de "um motivo = uma linha na fila" e multiplicaria a lógica de
peso/severidade.

**Decisão:** `SinalAtencao` (record interno, não é contrato de API) ganha um 6º campo opcional
`suggestedActionOverride: String`. Um construtor de conveniência de 5 args (delegando com
`override = null`) mantém os **6 call sites existentes do evaluator compilando sem tocar em nenhum**.
Só `avaliarRetencao` usa o construtor de 6 args. Em `montarItem`, o `suggestedAction` do DTO passa a
ser `principal.suggestedActionOverride() != null ? override : principal.motivo().getSuggestedAction()`.
O contrato do DTO de saída (`CoachAttentionItemOutputDto`) **não muda** — o override alimenta o mesmo
campo `suggestedAction` já existente.

**Tabela causa-dominante → ação (RF4, ordem de prioridade fixa):**

| Prioridade | Sub-sinal dominante | `suggestedAction` |
|---:|---|---|
| 1 | sem plano vigente | "Atleta sem plano vigente: gerar ou ativar um plano para retomar a cadência." |
| 2 | lacuna de treino (≥14d) | "14+ dias sem treino: enviar contato pessoal sobre barreira de agenda antes de ajustar o plano." |
| 3 | queda vs baseline | "Queda de condicionamento vs. baseline: revisar o plano e conversar sobre consistência." |
| 4 | readiness baixo / sem check-in | "Prontidão baixa ou sem check-in recente: verificar energia/dores e recalibrar a carga." |
| 5 | baixa aderência (≥3 perdidos) | "Treinos perdidos recorrentes: ajustar carga/agenda à rotina real do atleta." |
| 6 | sem prova/meta futura | "Sem prova ou meta futura: definir um objetivo de 30/60/90 dias com o atleta." |

A ordem prioriza a ação de maior alavanca operacional (plano ausente trava tudo) e deixa "definir
meta" por último — o que também suaviza o falso-positivo Q4 (atleta de saúde sem prova só recebe a
ação "definir meta" se nenhum outro sub-sinal mais forte tiver disparado).

## Decisão 6 — `RISCO_RETENCAO` NÃO gera `SugestaoCoach` na v1 (corrige premissa "read-only" do pre-mortem)

**Premissa original ERRADA:** a proposta afirmava que a fila é "read-only/on-demand, não persiste
nada". **Achado do pre-mortem (Codex, verificado):** existe um job diário
(`SugestaoCoachGeneratorJob.java:29`) que consome os motivos da fila e os converte em `SugestaoCoach`
persistidas (o inbox de sugestões do coach). Ele mapeia motivo → `TipoSugestao` por um `Map`
estático `MOTIVO_TIPO` (`:51`) que hoje só tem os 6 motivos atuais; um motivo sem mapeamento é
**silenciosamente ignorado** (`:90-94`). Sem uma decisão explícita, `RISCO_RETENCAO` cairia nesse
buraco — apareceria na fila on-demand mas nunca no inbox persistido, de forma acidental (não por
design).

**Decisão:** na v1, `RISCO_RETENCAO` **não** gera `SugestaoCoach` — é intencional, consistente com o
escopo "lite" (radar de triagem, não item de inbox aprovável). Mas isso vira **explícito e testado**:
uma task garante que o job ignora `RISCO_RETENCAO` de propósito (teste de regressão), para que o dia
em que alguém quiser promover retenção ao inbox seja uma decisão consciente, não um mapeamento
esquecido. Levar `RISCO_RETENCAO` ao inbox de sugestões (com o loop de aceitar/rejeitar) é
naturalmente o gancho do bloco completo (RF9).

## Decisão 7 — Fase D1-D120 precisa de proteção contra `createdAt` de atleta legado (crítico do pre-mortem)

**Premissa original:** computar a fase via `atleta.getCreatedAt()` (herda de `AuditableEntity`,
`LocalDateTime`). Confirmado que a herança existe. **Achado do pre-mortem (Codex, verificado):** a
migration `V25__Add_Audit_Columns_To_Atleta.sql:3` adiciona `created_at TIMESTAMP NOT NULL DEFAULT
CURRENT_TIMESTAMP` — então **todo atleta que já existia antes da V25 recebeu a data da migração, não
a data real de cadastro**. Resultado: um coorte inteiro de atletas legados apareceria em `FUNDACAO`
(D1-D30) de uma vez, com sinais de retenção enviesados, no dia em que a feature subir.

**Decisão:** a fase de retenção **não** pode confiar cegamente em `createdAt`. Antes de implementar,
resolver a **Q6** (Open Questions): qual é a data de início de acompanhamento confiável? Opções: (a)
usar a data de onboarding/baseline (`AthleteBaselineState.criadoEm` ou marco de conclusão do
onboarding introduzido por `athlete-onboarding-baseline`) como relógio de retenção quando presente;
(b) excluir da avaliação de retenção atletas cujo `createdAt` coincide com o backfill da V25 (ou
`createdBy = 'migration'`, se disponível) até haver data confiável. Recomendação: (a) com fallback
(b). Sem essa proteção, o guardrail de over-alerting (>40% do roster) quase certamente dispararia no
primeiro deploy sobre uma base com atletas legados.

## Custo real de queries (corrigido pelo pre-mortem)

A proposta falava em "3 repositórios novos". O pre-mortem apontou que o custo real por atleta no loop
de `montarItem` é maior: prova futura + prova-alvo + plano vigente + check-in + baseline = **até 5
consultas novas por atleta**, somadas às já existentes. Continua sendo o mesmo *padrão* N+1 já aceito
hoje (a fila é on-demand, não roda em cron), mas o número honesto é 5, não 3. Se o smoke acusar
lentidão em rosters grandes, o follow-up é converter para batch-por-tenant (carregar provas/checkins/
planos/baselines do tenant inteiro antes do `map`) — registrado como follow-up, fora do escopo da v1.

## Future-proofing — persistência do sinal (fora do escopo, mas preparado)

O moat do Menthoros é o loop proposta-IA → ação-do-coach (`SugestaoCoach`). Retenção deveria, no
bloco completo, alimentar o mesmo loop de aprendizado (RF9: `retention_action_accepted/dismissed`) —
exatamente via o `SugestaoCoachGeneratorJob` que a Decisão 6 deixa intencionalmente de fora agora. A
escolha de manter `RISCO_RETENCAO` como um motivo na fila existente — em vez de um subsistema
paralelo — significa que promover ao inbox depois é aditivo (um mapeamento em `MOTIVO_TIPO` + o loop
de aceite), sem reescrever a detecção. Nenhuma decisão desta change fecha essa porta.

## Impacto em `CoachAttentionQueueServiceImpl`

O arquivo tem hoje 198 linhas e injeta 6 colaboradores (`AtletaRepository`, `MetricasDiariasRepository`,
`PlanoMetadadosRepository`, `TreinoPlanejadoRepository`, `TreinoRealizadoRepository`,
`CoachAttentionSignalEvaluator`). Esta change adiciona 3 (`ProvaRepository`,
`CheckinProntidaoRepository`, `AthleteBaselineStateRepository`) — chega a 9. Não cruza o limiar de
"god service" descrito no `CLAUDE.md` do backend (~400 linhas / muitas responsabilidades
heterogêneas misturadas) — continua sendo um único tipo de responsabilidade (agregação read-only de
sinais), só com mais fontes de dado. Se um 8º ou 9º sinal precisar de mais colaboradores no futuro,
vale revisitar extrair um `RetentionSignalEvaluator` dedicado (mesmo padrão de
`CoachAttentionSignalEvaluator`) para não sobrecarregar `montarItem` — não necessário nesta v1
(6 sub-checks, método único, sem lógica cruzada com os outros evaluators).

## Impacto no frontend (verificado no código)

Nenhum componente novo. O coach é informado pela fila de atenção existente, que já renderiza
`suggestedAction`, `explanation.rationale` e `evidence[]` direto do DTO — o RF4 e a explicabilidade
aparecem sem código de front. A única mudança é registrar o novo valor de motivo: o tipo
`AttentionReason` é um union **curado à mão** em `src/types/Coach.ts` (não gerado do OpenAPI — o
cliente de attention-queue é fachada curada, não model gerado), e há dois `Record<AttentionReason,
string>` **exaustivos** de label (`CoachAttentionQueuePage.tsx`, `DashboardAttentionQueueRow.tsx`). Sem
a entrada nova, o `tsc -b` quebra (bom: força o trabalho); se o backend enviasse o motivo sem o front
atualizado, o card renderiza normalmente só com o rótulo do motivo em branco (degrada, não crasha).
Não há mapa de ícone/cor por motivo; severidade (`SEVERITY_CONFIG`) é ortogonal ao motivo. Bloco FE do
`tasks.md`.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| N+1 de queries: 3 repositórios novos consultados por atleta, dentro do loop `stream().map(...)` de `getAttentionQueue()` | Mesmo padrão já aceito hoje pelos 6 colaboradores existentes (nenhum usa batch fetch); fila é on-demand (não roda em cron), cap de tenant é o roster completo — se performance virar problema real, é um refactor de query em lote, não uma mudança de contrato. Fora do escopo desta v1 (registrar como follow-up se `./mvnw` ou smoke manual acusar lentidão). |
| `RISCO_RETENCAO` "rouba" `primaryReason` de sinais mais acionáveis (ex.: `SEM_PLANO`) por causa do peso 45 | Peso é uma Open Question (Q3) — o founder decide antes da implementação; o design não trava o valor, só o método de comparação (max por severidade, peso como desempate — igual aos outros 6). |
| Falso positivo de "sem prova futura" para atletas que treinam sem objetivo de prova (ex.: saúde geral, sem calendário de corrida) | Parcialmente mitigado pelo RF4 (Decisão 5): "sem prova futura" é a menor prioridade da tabela de ação, então o atleta de saúde só recebe a ação "definir meta" se for o único/dominante sub-sinal. Mitigação total (condicionar ao `objetivo`) é a Open Question Q4 — founder decide se entra já. |
| Over-alerting: `RISCO_RETENCAO` disparando para grande parte do roster e entupindo a fila | Guardrail de produto: se > 40% do roster de uma assessoria entrar em `RISCO_RETENCAO` no piloto, os thresholds (Q2 + contagem 2/3/5) estão frouxos — revisar antes de generalizar (registrado no `proposal.md`, Critério de sucesso). Reforçado pela Decisão 7 (atletas legados). |
| `findByAtletaAndProvaAlvoTrue` não filtra data: uma prova-alvo **passada** bloquearia o sinal "sem meta/prova futura" (achado do pre-mortem) | Não reutilizar esse finder cru; o sub-sinal precisa de um finder que exija `dataProva >= :hoje` (prova-alvo futura). Task 4.3 corrigida. |
| `PlanoMetadadosRepository.findByAtletaId` usado hoje na fila não é tenant-aware (achado menor do pre-mortem); o novo sub-sinal amplia o uso de `plano.getCtlAtual()` | Trocar no wiring para o finder tenant-aware `findByAtletaIdAndAssessoriaId(atletaId, tenantId)` já existente, ou justificar por que o `atletaId` único basta (o roster já vem tenant-filtrado). |

## Fora deste design

Persistência de eventos analíticos, Next Best Action **editável** (RF5 — templates + UI + envio via
mensageria), jornada de check-ins programada e dashboard de coorte — nenhum desses precisa de decisão
arquitetural nesta change porque não entram no escopo (ver Non-Goals do `proposal.md`). O RF4
*estático* (ação por causa dominante, sem edição) **está** no escopo e é coberto pela Decisão 5.
