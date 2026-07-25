**Tamanho:** S · **Trilha:** Fast

> Fast porque é frontend-only, sem contrato de banco e com risco baixo (card read-only). Fatia 3 de 3 do `weekly-athlete-review` — **depende de `add-weekly-review-consolidation`** (Fatia 1: endpoint `GET` read-only, gerado no encerramento da semana). Consome a revisão determinística da F1; funciona mesmo antes da Fatia 2 — sem a narrativa LLM, o card mostra o sinal estruturado (`recommendationType`, `adherenceStatus`, `weekOverWeekDelta`) com um rótulo derivado do `recommendationType`; a narrativa `nextWeekFocus` aparece quando a F2 estiver ativa.

## Why

A revisão só entrega o valor-núcleo (o coach *lê* a semana consolidada e economiza tempo) quando ela aparece na tela. As Fatias 1 e 2 geram e enriquecem a revisão no backend; esta fatia a expõe ao treinador. É onde a métrica primária (minutos/revisão) se realiza.

## What Changes

- card **read-only** "Revisão semanal" no drilldown do atleta (`CoachAthleteProfilePage.tsx`)
- `useWeeklyAthleteReview(atletaId)` (espelha `useAthleteProfile`), adapter `buildWeeklyReviewFromDto`, VM type
- método/DTO de leitura portado à mão para a fachada `src/api/services` (não sobrescrever com o gerado)
- estados loading / empty / error explícitos

## Critérios de aceite

- **CA10 — Leitura pelo coach.** DADO um treinador autenticado abrindo o drilldown de um atleta com revisão da última semana fechada, QUANDO a página carrega, ENTÃO o card exibe `recommendationType`, `adherenceStatus`, `dadosSuficientes`, `weekOverWeekDelta` e — quando disponível (F2) — `nextWeekFocus`, em modo somente-leitura.
- **CA10.1 — Estados.** DADO a revisão carregando, ausente (endpoint 404 — nenhuma semana fechada) ou em erro, ENTÃO o card renderiza, respectivamente, loading, empty e error explícitos (teste de componente).
- **CA10.2 — Read-only.** DADO o card renderizado, ENTÃO ele NÃO oferece nenhuma ação que altere o plano do atleta.

## Métrica de sucesso

- **Primária (North Star):** mediana de minutos que o treinador gasta para fechar a semana de um atleta cai para ≤ 50% do baseline (a instrumentar no rollout).

## Open Questions & Assumptions

- **Assumption:** ponto de montagem é o drilldown do atleta (`CoachAthleteProfilePage.tsx`), não a linha do roster/inbox (densa demais). Anchor confirmado no front 2026-07-24.
- Depende do endpoint `GET` read-only da Fatia 1.

## Capabilities

### Modified Capabilities

- `weekly-athlete-review` (superfície de leitura no shell do coach)

## Impact

**Frontend (`menthoros-front`):** novo `SectionCard` no grid de `CoachAthleteProfilePage.tsx`; hook + adapter + VM; método de leitura na fachada `src/api`.

**Fora de escopo:** tela/rota dedicada com histórico e ações (Q2-C, pós-v1).
