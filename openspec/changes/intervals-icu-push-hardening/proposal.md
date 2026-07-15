# Proposal: intervals-icu-push-hardening

**Tamanho:** S · **Trilha:** Fast (backend-only, zero migration, zero contrato novo; os três
mecanismos já foram especificados nos reviews registrados da change-mãe)

## Status

Proposed (2026-07-15). Follow-ups priorizados de `intervals-icu-workout-push` (arquivada em
`archive/2026-07/2026-07-15-intervals-icu-workout-push/` — ver seção de QA do `tasks.md` de lá).
O item 1 teve **convergência cross-model** (Claude opus no review da Task 10 + Codex no QA gate),
o que elevou sua prioridade; o item 2 é achado do walking skeleton no relógio real do founder.

## Why

A change-mãe entregou o push funcional, mas três arestas conhecidas degradam a promessa "o coach
aprova e o treino aparece fiel no pulso":

1. **Lote em transação única com HTTP no meio.** Listener e scheduler processam todos os treinos
   do lote numa TX só; um `OptimisticLockingFailureException` engolido (claim perdido em corrida
   real) pode marcar a TX rollback-only e **descartar no commit as marcações dos treinos já
   processados** — enquanto os eventos externos já existem. Hoje há auto-cura (claims revertem
   juntos e a guarda de listagem por `external_id` readota os eventos via PUT no ciclo seguinte,
   sem duplicar), mas é trabalho desperdiçado e estado atrasado nas duas superfícies.
2. **Debounce do uploader Garmin do intervals.icu.** Comprovado no walking skeleton: dois eventos
   criados com ~600ms de diferença → o upload ao Garmin disparou entre os dois e **não
   re-disparou** para o segundo (`icu_garmin_last_upload` anterior à criação do 2º evento). Um
   PUT no-op no evento re-disparou o upload e o treino chegou. Sem mitigação, todo plano com 2+
   treinos pode entregar só o primeiro ao relógio até alguém cutucar.
3. **"Último push" mente após retry.** Push que sucede via scheduler de retry não atualiza
   `IntegracaoExterna.ultimaSincronizacao` — o card do atleta mostra um "Último push" defasado.

Valor para o coach: estado fiel no chip e no card (confiança na entrega), e o principal — **todos
os treinos do plano aprovado chegam ao relógio sem intervenção manual**.

## What Changes (backend `apps/menthoros-backend`)

1. **TX por treino:** `IntervalsIcuPushProcessor.processar` passa a abrir transação própria
   (`@Transactional(propagation = REQUIRES_NEW)`) e a **recarregar o treino fresco por id dentro
   da própria TX** (o reload sai do listener/scheduler para o processor — entidade nunca cruza
   fronteira de TX). Listener e scheduler viram orquestradores: carregam ids/janela em TX de
   leitura e iteram chamando o processor (bean separado — proxy AOP funciona). Claim perdido ou
   erro em um treino não afeta o commit dos demais.
2. **Nudge anti-debounce:** ao fim do lote no listener, se **2+ eventos foram CRIADOS (POST)**,
   o adapter faz um re-PUT no-op no **último** evento criado (`WorkoutChannel.tocarEvento` ou
   reuso de `atualizarEvento` com payload mínimo) — best-effort, falha apenas loga. Re-PUTs de
   re-aprovação não precisam de nudge (PUT já re-dispara o upload individualmente — premissa
   comprovada no diagnóstico de 2026-07-15).
3. **`ultimaSincronizacao` no retry:** o scheduler grava o timestamp na(s) conexão(ões) dos
   atletas que tiveram ≥1 treino `SINCRONIZADO` no ciclo (mesma semântica do listener).

### Fora de escopo

- Resilience4j/circuit breaker (pertence a `add-external-call-resilience`, junto com a validação
  de baseUrl anti-SSRF).
- Criptografia at-rest da credencial (débito transversal já registrado).
- Qualquer mudança de contrato REST, front ou schema.

## Critérios de aceite

- **CA1 — Isolamento de TX:** teste de integração (Testcontainers, padrão do repo) com lote de 2
  treinos onde o 1º sofre `OptimisticLockingFailureException` forçada no claim → o 2º treino
  termina `SINCRONIZADO` **persistido** (visível em nova TX), e o 1º permanece no estado
  anterior, elegível a retry. Nenhuma marcação do lote é descartada por rollback alheio.
- **CA2 — Nudge de rajada:** lote que cria 2+ eventos → exatamente 1 re-PUT no último evento
  criado; lote com 1 criação → zero nudge; lote só de atualizações (re-aprovação) → zero nudge;
  falha do nudge não altera estado de nenhum treino (best-effort, log apenas).
- **CA3 — Último push fiel:** retry bem-sucedido atualiza `ultimaSincronizacao` da conexão;
  ciclo de retry todo-falha não atualiza.
- **CA4 — Sem regressão:** os 15 testes do listener, 26 do scheduler e demais continuam verdes
  sem afrouxar asserções; `./mvnw clean test` verde.

## Métrica de sucesso

- **Entrega completa sem intervenção:** 100% dos treinos exportáveis de um plano aprovado chegam
  ao Garmin sem nudge manual (verificável no smoke com plano de 2+ treinos: `icu_garmin_last_upload`
  posterior à criação do último evento).
- **Estado fiel:** zero ocorrências de lote descartado por rollback (log do listener/scheduler)
  em 2 semanas; "Último push" do card corresponde ao último sucesso real (incluindo via retry).

## Open Questions & Assumptions

- **Assumido (comprovado 1×, validar no smoke): PUT re-dispara o upload ao Garmin.** Se o
  intervals.icu também debouncar PUTs em rajada, o nudge do CA2 pode precisar de um pequeno
  delay (segunda iteração, não bloqueia esta).
- **Assumido: lotes pequenos.** REQUIRES_NEW por treino abre N transações por lote (plano ≈ 5-7
  treinos) — custo irrelevante no volume atual; scheduler processa por varredura igualmente
  pequena.
- **Assumido: mocks atuais não fixam a TX.** Os testes unitários existentes do listener/scheduler
  não assertam fronteira transacional — a mudança não deve afrouxá-los; o CA1 cobre a semântica
  nova com TX real.

## Rollback

Aditiva/localizada: reverter o PR restaura a TX única e remove o nudge — nenhum dado a migrar,
nenhum estado novo persistido além dos já existentes campos de sync.
