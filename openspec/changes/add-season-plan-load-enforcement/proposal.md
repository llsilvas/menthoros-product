**Tamanho:** M · **Trilha:** Full

> **Ticket 9** do épico `add-season-plan-macrocycle`. Decisões 5, 6 e 7 do design do épico; esta proposal
> fecha o contrato que lá ficou em aberto e prevalece sobre o texto do épico onde divergir. Só backend.

## Status

- ready-for-agent (2026-11-23): spec reescrita depois do DoR (spec-reviewer + Codex NOT READY). As
  dependências (tickets 6, 7 e 8) estão em `develop`.

## Why

A temporada passa a guiar a carga da semana: o `targetTss` aprovado vira o alvo, com as proteções de
segurança por cima e sem compensação de semana perdida. Até aqui (ticket 8) a temporada só entra como texto
no prompt; o `LoadTargetResolver` continua calculando o alvo pelo CTL e pela progressão reativa, e o
compliance mede o plano contra esse alvo, não contra o da temporada.

## What Changes

Tasks do épico: **5.6–5.9, 5.11, 5.11a, 5.11b, 5.13–5.15, 10.4**. Nomes do épico em português (`tssAlvo`,
`SemanaPlanejada`, macro) correspondem a `targetTss`, `SeasonWeek` e "temporada" no código.

### Flag e matriz de estados

Flag nova `season-plan.enforcement.enabled` (env `SEASON_PLAN_ENFORCEMENT_ENABLED`, default `false`). O
épico a chamava `macrociclo.enforcement.enabled`; o prefixo segue `season-plan.enabled`.

| `season-plan.enforcement.enabled` | `planner-engine.enabled` | Efeito |
|---|---|---|
| `false` | qualquer | Idêntico ao ticket 8: fase da temporada, bloco do prompt, `season_week_id` e `target_deviation_pct` continuam; resolver e compliance legados |
| `true` | `false` | Sem skeleton pré-prompt, sem estágio 2. Com `planner-engine.shadow=true`, o skeleton auditado (`planner_metadata_json`) usa o alvo e as checagens novas; `VIOLATIONS_DETECTED` do shadow já veta a auto-aprovação hoje (`PlanGenerationPersister:307`) e passa a vetar também pelas checagens novas. Aceito: é o tenant do Design Partner em auditoria, e vetar auto-aprovação é o lado conservador |
| `true` | `true` | Alvo novo guia o skeleton pré-prompt e o "TSS Alvo" do prompt; compliance do estágio 2 com as checagens novas |
| `true` | `true`, planner falhou antes do LLM | Como hoje: `fail-open=true` grava `FALLBACK`, pula o estágio 2 e o plano não é auto-aprovado (`:308`), então vai para revisão; `fail-open=false` responde 422 |

- Só vale para semana com `SeasonWeekSnapshot` presente e `targetTss > 0`. Sem temporada, sem semana
  coincidente ou com `targetTss` nulo, tudo segue o caminho legado, com qualquer valor da flag.
- `planner-engine.fail-open` mantém o significado de hoje: `true` (default) persiste o plano com violação
  como `FAILED` + revisão obrigatória; `false` responde 422. Os critérios abaixo assumem `fail-open=true`.
- A flag controla resolver, composição (taper) e compliance juntos. O contexto do ticket 8 não depende dela.
- A flag chega ao `PlannerEngine` por um campo novo do `PlannerInputSnapshot`, com construtor compatível
  (como foi feito com `seasonWeek`). O compliance não lê a flag: as checagens novas rodam quando
  `loadTarget.seasonTargetTss() != null`, que só acontece no caminho novo.

### Alvo de carga (`LoadTargetResolver` + `PlannerEngine`)

Com a flag ligada e a semana elegível, o alvo é calculado nesta ordem (precedência segurança > temporada >
progressão reativa):

1. **Base:** `base = targetTss` da semana da temporada. Progressão reativa (`ajusteVolumePercentual` > 0) e
   step-back não se aplicam: a temporada já tem rampa e descargas.
2. **Redução por fase:** fase `RECOVERY` ou `POST_RACE` (lesão ou pós-prova, que já prevalecem sobre a fase
   da temporada desde o ticket 8) → `alvo = base × 0,5` (o mesmo `FATOR_REDUCAO` de hoje, sobre a base da
   temporada em vez de `ctl × 7`).
3. **Estado `REDUZIR` da progressão:** `alvo = min(alvo, ctl × 7 × (1 + ajuste))`, com `ajuste ≤ 0`.
4. **Teto de rampa:** `alvo = min(alvo, 7 × (ctl + 8))`, sempre (hoje só se aplica quando a progressão
   permite aumento).
5. **Cold-start:** com `calibrationStage` presente, os passos 3 e 4 **não** se aplicam (o CTL de PMC não é
   confiável em calibração; é o mesmo motivo do retorno antecipado de hoje) e
   `alvo = min(alvo, alvoColdStart)`, onde `alvoColdStart` é o cálculo atual (CTL baseline capado em 40,
   rampa por estágio, redução por fase, piso 120). O piso de 120 não sobe o alvo acima do passo 6. O gate do
   ticket 4 impede gerar ou aprovar temporada em calibração, então este caso só ocorre se a calibração
   recomeçar com temporada ativa.
6. **Teto da temporada:** `alvo = min(alvo, base)`. O alvo resolvido nunca passa do `targetTss`.

- **Taper:** com a flag ligada e a semana elegível, o `PlannerEngine` não chama `aplicarTaperSeAplicavel`.
  A curva de taper já está no `targetTss` da temporada.
- **Banda:** `minTss`/`maxTss` = alvo resolvido ±10% (±25% em cold-start), como hoje. A faixa é centrada no
  alvo **resolvido**, não no `targetTss`: um corte de segurança não gera violação contra o próprio corte.
- **Desvio no skeleton:** o `WeeklyLoadTarget` ganha `seasonTargetTss` (o `targetTss` usado como base) e
  `seasonCutReason`, ambos nulos fora deste caminho. `seasonCutReason` registra o passo mais restritivo
  que tirou o alvo da base: `REDUCAO_FASE`, `PROGRESSAO_REDUZIR`, `TETO_RAMPA` ou `COLD_START`; nulo quando
  `alvo == base`. Os construtores atuais continuam (sem quebrar testes existentes). O desvio é
  `alvo − seasonTargetTss`, derivado.
- **Prompt:** com o skeleton no caminho novo (`seasonTargetTss != null`), o "TSS Alvo" do bloco de posição
  no ciclo é o `targetTss` **resolvido** do skeleton, sem as reduções por fadiga do
  `PlanoTreinoPromptBuilder` por cima (o resolver já é a autoridade; sem isso o prompt anunciaria 620
  enquanto os slots somam 546). Sem skeleton ou fora do caminho novo, a conta do ticket 8 continua.
- **Semana perdida:** a semana anterior realizada abaixo do alvo não altera a base. O CTL mais baixo pode
  reduzir o teto de rampa (passo 4), mas não há acréscimo compensatório.
- A semana da temporada nunca é alterada pelo planner.

### Sessões-chave e longão

- `SeasonWeekSnapshot` ganha `keySessions` (texto livre do treinador, nulo se vazio). O bloco de posição no
  ciclo do `PeriodizacaoPromptFormatter` imprime a linha "Sessões-chave" quando presente. Vale com a flag
  desligada também: é contexto, como o longão, que o bloco já imprime.
- O `SessionCompositionResolver` **não** interpreta as sessões-chave nem converte o longão de km para
  duração nesta change. Isso exigiria parsear texto livre e um pace por atleta. O épico 5.6 fica reduzido
  ao transporte para o prompt; a composição estruturada vai para fora do escopo.

### Compliance (estágio 2, pós-redistribuição)

As checagens novas rodam sempre que o skeleton está no caminho novo (`seasonTargetTss != null`), em dois
lugares: **enforcement** no estágio 2 do persister (`planner-engine.enabled=true`; `FAILED` + revisão ou
422 pelo `fail-open`) e **auditoria** no shadow (`planner-engine.shadow=true`; `VIOLATIONS_DETECTED`, que
veta a auto-aprovação como hoje). O checker é o mesmo; só o chamador muda.

- **`distanciaKm`** entra no `GeneratedSessionSnapshot`, nos **dois** mappers do `PlannerShadowService`: o do
  `TreinoPlanejadoLlmDto` (pré-redistribuição) e o de `TreinoPlanejado` (pós-redistribuição, usado pelo
  estágio 2).
- **`TSS_FORA_DA_FAIXA`:** código inalterado; passa a usar a banda do alvo resolvido acima.
- **`LONGAO_DIVERGENTE_DA_TEMPORADA`** (chave nova; o épico a chamava `LONGAO_DIVERGENTE_DO_MACRO`). Avaliada
  só quando `longRunKm` da semana é > 0:
  - nenhuma sessão `LONGO` no plano → violação;
  - várias sessões `LONGO` → avalia a de maior `distanciaKm`;
  - sessão `LONGO` sem `distanciaKm` → não avalia (sem violação);
  - violação quando `|distanciaKm − longRunKm| × 100 > tolerância × longRunKm`, em `BigDecimal` (sem
    divisão, para o limite não depender de ponto flutuante). Tolerância em
    `season-plan.enforcement.long-run-tolerance-pct`, default `15` (limite inclusivo: 15% exatos passa).
- **Transporte:** `ComplianceContext` ganha `Optional<SeasonWeekSnapshot> seasonWeek` e a tolerância;
  `PlannerShadowService.checkPostRedistribution` passa a receber `Optional<SeasonWeekSnapshot>` (o persister
  já tem `ctx.seasonWeek()`), e o `executar` do shadow monta o contexto com eles.
- **`LONGO_ACIMA_TETO`** é suspenso para a sessão `LONGO` cuja distância está dentro da tolerância do
  `longRunKm`. Fora da tolerância, ou sem distância, a checagem de hoje (40% do alvo) continua. O longão da
  temporada já passou pela validação `LONG_RUN_SHARE` do ticket 3 na aprovação da temporada.
- **Registro da violação sem depender do shadow:** o estágio 2 passa a contar
  `planner.compliance.violation.count` com tag `key` (uma por violação) e a logar as chaves e mensagens em
  `INFO`, além do `FAILED` + revisão obrigatória que já grava. O detalhe em `planner_metadata_json` continua
  dependendo do shadow.

### Delta entre o alvo e o plano aprovado

- Na transição para `APROVADO` (`PlanoReviewServiceImpl.aprovarTransicao`), se o plano tem
  `season_week_id` e a semana tem `targetTss > 0`: `deltaPct = (TSS planejado aprovado − targetTss) /
  targetTss × 100`, com treino sem `tssPlanejado` contando 0 (a mesma regra do `target_deviation_pct`).
- Registrado como `DistributionSummary` `season-plan.approved.deviation.abs.pct` com o **módulo** do delta
  (o `DistributionSummary` do Micrometer descarta valores negativos) e tags `origem` = `COACH` |
  `AUTO_CONFIANCA_ALTA` e `direcao` = `ACIMA` | `ABAIXO` | `NO_ALVO` (`NO_ALVO` quando `deltaPct == 0`), e
  log `season-plan.week-approved` com `deltaPct` com sinal, o `target_deviation_pct` da geração e a origem.
  Sem migration e sem coluna nova.
- **Ordem no persister:** hoje a auto-aprovação (`PlanGenerationPersister:202`) roda antes de
  `registrarSemanaDaTemporada` (`:216`), então o plano auto-aprovado ainda não tem `season_week_id`.
  `registrarSemanaDaTemporada` passa para antes da auto-aprovação; continua depois de todas as
  transformações dos treinos (redistribuição, prova garantida e estágio 2 ficam antes).
- O `target_deviation_pct` da geração não muda. Edições depois da aprovação (`editedAfterApprovalAt`) não
  são medidas.
- Vale com a flag desligada também, para formar o baseline da métrica de sucesso antes de ligá-la.

### ADR

`ADR-0014` "Temporada como teto da carga semanal, não piso": precedência segurança > temporada > progressão
reativa, a ordem dos 6 passos, sem compensação de semana perdida, e a suspensão do `LONGO_ACIMA_TETO`.
Referencia o ADR-0011 (composição) e o ADR-0012 (cold-start e recuperação), que ficam válidos.

### Decisões do QA (2026-11-24)

Casos que a spec não cobria, decididos depois da revisão de código:

- **Semana cortada por segurança:** com `seasonCutReason` `REDUCAO_FASE`, `PROGRESSAO_REDUZIR`, `COLD_START`
  ou `CONTENCAO_PROVA`, `LONGAO_DIVERGENTE_DA_TEMPORADA` não é avaliada e o `LONGO_ACIMA_TETO` não é
  suspenso (vale o teto de 40% do alvo cortado). Sem isso, o plano que encurta o longão na semana de lesão
  ia para revisão, e o longão cheio escapava do teto justo nela. `TETO_RAMPA` mantém a regra.
- **Contenção em taper/semana de prova:** no passo 4, fora de cold-start, `TAPER` e `RACE_WEEK` também
  aplicam `alvo = min(alvo, ctl × 7)`, como o legado, com o motivo novo `CONTENCAO_PROVA`.
- **Delta só na primeira aprovação:** reaprovação de plano reaberto (`origemAprovacao` já preenchida) não
  registra outra amostra de `season-plan.approved.deviation.abs.pct`.
- **Sessões-chave como dado:** a linha do prompt vira `Sessões-chave (texto do treinador): "<texto>"`,
  truncada em 500 caracteres (o limite da edição), com aspas do texto trocadas por apóstrofo.

## Critérios de aceite

Todos com `season-plan.enforcement.enabled=true`, `planner-engine.enabled=true`, `fail-open=true` e semana
da temporada com `targetTss > 0`, salvo onde indicado.

- **Dado** uma semana com `targetTss` 620 e CTL 70 (teto de rampa 7 × 78 = 546), **quando** o alvo é
  resolvido, **então** `targetTss` = 546, banda [491,4; 600,6], `seasonTargetTss` = 620 e
  `seasonCutReason` = `TETO_RAMPA`; a semana da temporada continua com 620.
- **Dado** uma semana de fase `TAPER` da temporada com `targetTss` 300, CTL 50 (teto 406), progressão
  `MANTER` e dentro da janela de taper da prova, **quando** o alvo é resolvido, **então** `targetTss` = 300 e a `TaperStrategy` não é aplicada.
- **Dado** `targetTss` 400, CTL 60 e progressão `AUMENTAR` com ajuste +10%, **quando** o alvo é resolvido,
  **então** `targetTss` = 400 e `seasonCutReason` nulo.
- **Dado** a semana anterior realizada a 40% do alvo, `targetTss` 400 e CTL 60 (teto 476), **quando** a
  semana é gerada, **então** o alvo é 400.
- **Dado** lesão ativa (fase `RECOVERY`), `targetTss` 400 e CTL 60, **quando** o alvo é resolvido, **então**
  `targetTss` = 200 e `seasonCutReason` = `REDUCAO_FASE`.
- **Dado** cold-start (`calibrationStage` presente, CTL de PMC 0) com `alvoColdStart` 120 (piso) e
  `targetTss` 100, **quando** o alvo é resolvido, **então** `targetTss` = 100 (o teto de rampa do passo 4,
  56, não se aplica em cold-start) e `seasonCutReason` nulo.
- **Dado** cold-start com `alvoColdStart` 150 e `targetTss` 300, **quando** o alvo é resolvido, **então**
  `targetTss` = 150, banda ±25% e `seasonCutReason` = `COLD_START`.
- **Dado** o exemplo 620 → 546, **quando** o prompt é montado com o skeleton, **então** o "TSS Alvo" do bloco
  de posição no ciclo é 546.
- **Dado** um plano com TSS total fora da banda do alvo resolvido, **quando** é persistido, **então**
  nasce `FAILED` com revisão obrigatória, sem 422, e `planner.compliance.violation.count{key=TSS_FORA_DA_FAIXA}`
  é incrementado com `planner-engine.shadow=false`.
- **Dado** `longRunKm` 20 e um `LONGO` de 24 km, **quando** o plano é checado, **então** há
  `LONGAO_DIVERGENTE_DA_TEMPORADA`; com 23 km (15%), não há.
- **Dado** `longRunKm` 24 e um `LONGO` de 24 km com TSS acima de 40% do alvo, **quando** o plano é checado,
  **então** não há `LONGO_ACIMA_TETO`; o mesmo `LONGO` com 30 km tem as duas violações.
- **Dado** `longRunKm` 20 e um `LONGO` sem `distanciaKm`, **quando** o plano é checado, **então** não há
  `LONGAO_DIVERGENTE_DA_TEMPORADA` e o `LONGO_ACIMA_TETO` é avaliado como hoje.
- **Dado** `keySessions` "5x1km no limiar", **quando** o prompt é montado (qualquer valor da flag),
  **então** o bloco de posição no ciclo contém "Sessões-chave: 5x1km no limiar"; sem `keySessions`, a linha
  não aparece.
- **Dado** um plano com `season_week_id` (`targetTss` 400 e treinos somando 360) aprovado pelo treinador,
  **quando** a transição para `APROVADO` ocorre (qualquer valor da flag), **então**
  `season-plan.approved.deviation.abs.pct{origem=COACH,direcao=ABAIXO}` registra 10 e o log traz −10.
- **Dado** um plano auto-aprovado na geração com semana da temporada, **quando** é persistido, **então** já
  tem `season_week_id` e a métrica registra com `origem=AUTO_CONFIANCA_ALTA`.
- **Dado** `season-plan.enforcement.enabled=false`, **quando** o plano é gerado, **então** alvo, banda,
  taper e compliance são os de hoje, e o golden do prompt do ticket 8 só muda pela linha de sessões-chave.
- **Dado** um atleta sem temporada, com a flag ligada, **então** o plano é idêntico ao de hoje (regressão
  5.16 do épico).

## Fora do escopo

- Composição estruturada a partir das sessões-chave e conversão do longão de km para duração.
- Medir edições depois da aprovação.
- Coluna ou tabela para o delta da aprovação.
- Replanejamento por desvio acumulado (ticket 10).

## Métrica de sucesso

A primária do épico: queda relativa ≥ 20% na taxa de `consumedReviewOutcome = ADJUSTED` dos planos
semanais com `season_week_id`. Baseline: 4 semanas com a flag desligada; comparação: 4 semanas com a flag
ligada no tenant do Design Partner; mínimo de 20 planos em cada janela, senão o resultado é inconclusivo.
Secundária: mediana de `season-plan.approved.deviation.abs.pct` com `origem=COACH`.

## Riscos e mitigações

- **Suspender `LONGO_ACIMA_TETO` afrouxa uma proteção.** Só para o longão que segue o previsto, que já foi
  validado pelo `LONG_RUN_SHARE` na aprovação da temporada. Fora da tolerância, a checagem volta.
- **Alvo da temporada desatualizado** (CTL real muito abaixo do previsto): o teto de rampa corta e o skeleton
  registra `TETO_RAMPA`. O replanejamento fica para o ticket 10.
- **Taper duplo ou ausente:** com a flag ligada o taper vem só da temporada; o critério de taper cobre isso.
- **Compliance mais barulhento** com a chave nova: `fail-open=true` mantém o plano persistido e em revisão;
  a métrica por `key` mostra a taxa por regra antes de ligar em mais tenants.

## Rollback

`season-plan.enforcement.enabled=false` restaura o comportamento do ticket 8 sem deploy. Sem migration. A
linha de sessões-chave no prompt e a métrica do delta da aprovação ficam (são aditivas).

## Dependências e rollout

- Tickets 6, 7 e 8 em `develop`.
- Alvo e compliance enforçados só com `planner-engine.enabled=true`. Com só `planner-engine.shadow=true`, o
  efeito é a auditoria e o veto da auto-aprovação (matriz acima). Ligar no tenant do Design Partner depois de 4
  semanas de baseline da métrica do delta.
