# Decision Memo — Antecipar `add-post-workout-debrief` ou `add-daily-readiness-checkin`?

**Produto:** Menthoros
**Data:** 2026-07-02
**Decisor:** founder
**Preparado por:** CPO (agente)

## 1. Decisão necessária

Ambas as changes já têm proposal/design/tasks completos no OpenSpec, mas nenhuma tem
sprint alocado no `SPRINTS.md` — o Radar já sinaliza as duas como candidatas a
repriorização. Dado 1 dev/sprint disponível de cada vez, qual antecipar primeiro
(ou antecipar ambas, em que ordem) em vez de seguir a posição atual do roadmap
(`debrief` no Sprint 24, `readiness` no pós-MVP)?

## 2. Contexto mínimo

**`add-post-workout-debrief`** (~9 tasks, S/M): compara `TreinoPlanejado` vs.
`TreinoRealizado` (prioriza `EtapaRealizada`) e gera score/status/risco/recomendação de
sequência. É **reativo** — interpreta o que já aconteceu. Depende hoje de
`add-workout-metrics-analyzer` (Sprint 23) no roadmap atual, mas o Radar já observa que
uma versão simplificada (sem métricas de zona/FIT) roda só com o log manual (9d, já
entregue) — a dependência dura é do dado, não da infra de metrics-analyzer em si.
Open question do próprio `design.md`: debrief é recalculável ou snapshot imutável?
Persistência em colunas de `TreinoRealizado` ou tabela dedicada?

**`add-daily-readiness-checkin`** (~26 tasks, M): check-in subjetivo diário
(sono/humor/dores/energia/estresse) → `readinessScore` + `NivelProntidao`. É
**preditivo** — antecipa queda de prontidão em 24–48h, antes do TSB reagir. Integra em
dois pontos já existentes no motor: portão de elegibilidade de intervalado (bloqueio/
atenuação) e prompt builder da geração de plano. Zero dependência de changes futuras —
roda hoje sobre a base já entregue (Sprint 9). Escopo tecnicamente maior (2 migrations,
service com pesos configuráveis, 3 endpoints, integração em 2 pontos do motor) mas
totalmente desacoplado do restante do roadmap.

## 3. Recomendação

**Antecipar `add-daily-readiness-checkin` primeiro; manter `add-post-workout-debrief`
no Sprint 24 (ou reavaliar sua versão simplificada só depois do readiness estar em
produção).**

Justificativa pelo framework de priorização:

1. **North Star:** os dois atendem ao critério 2 (qualidade de decisão) e 4 (risco
   visível). O readiness atende com vantagem ao critério 4 — "risco" antecipado em
   24–48h é mais valioso do que "risco" explicado depois do fato. O debrief é mais forte
   em qualidade de decisão retrospectiva (ajuste do próximo estímulo), mas não antecipa
   nada.
2. **Momento do produto:** readiness **não tem dependência não-resolvida** — spec
   completo, integra sobre infra já entregue, pode começar amanhã. O debrief depende de
   metrics-analyzer para a versão completa (Sprint 23, ainda não implementado); a versão
   simplificada existe só como observação do Radar, não como spec — exigiria retrabalho
   de escopo antes de começar.
3. **Custo/risco:** o readiness é maior em tasks (26 vs. 9) mas o risco é baixo — é
   aditivo (sexto portão, não substitui nada) e desacoplado. O debrief tem 2 perguntas
   em aberto no próprio `design.md` (recalculável vs. snapshot; onde persistir) que
   precisam de decisão antes de virar tasks — risco de retrabalho se começar sem
   resolver.
4. **Reversibilidade:** ambos são two-way door (aditivos, sem migração destrutiva).
   Empate — não desempata a favor de nenhum.

Desempate final pelo critério do charter ("encurta o caminho até valor visível para o
coach"): readiness aparece na fila de atenção como sinal imediato assim que o atleta
faz o primeiro check-in — valor visível em dias. O debrief só fecha o ciclo completo
quando dados de sessão ricos existirem (FIT/metrics-analyzer), valor visível mais tarde.

## 4. Trade-off principal

Adiar o debrief mantém o coach sem uma leitura estruturada de "como foi o treino" por
mais alguns sprints — hoje essa leitura continua manual. Em troca, entregamos o sinal
preditivo (readiness) mais cedo, que é o que efetivamente evita a fadiga/lesão antes de
acontecer — o debrief só explica depois.

## 5. Alternativa relevante

**Rodar as duas em paralelo** (se a capacidade permitir 2 changes simultâneas) —
rejeitada por ora: o modelo assumido é 1 dev/sprint; paralelizar aumenta risco de
context-switch sem ganho real, já que nenhuma depende da outra tecnicamente.

## 6. Impacto se aprovado

- `SPRINTS.md`: inserir `add-daily-readiness-checkin` como próximo sprint disponível
  (após o sprint corrente), à frente de `add-post-workout-debrief`.
- Antes de abrir a branch: resolver os pesos de `ReadinessService` (sono 35%/energia
  25%/humor 20%/dores 15%/estresse 5%) como decisão de produto, não só técnica — vale
  registrar a fonte/racional em `knowledge/coaching/` ou `knowledge/physiology/` se
  vier de literatura, ou marcar como hipótese da equipe se for estimativa inicial.
- Debrief: antes de agendar, responder as 2 perguntas abertas do `design.md` (snapshot
  vs. recalculável; onde persistir) e decidir se a versão simplificada (sem
  metrics-analyzer) vale a pena como change própria ou se espera o Sprint 23.

---

**Decisão do founder:** aprovado (2026-07-02) — antecipar `add-daily-readiness-checkin` para Sprint 9k (antes de `add-llm-tool-use`); `add-post-workout-debrief` permanece no Sprint 24.
