**Tamanho:** S · **Trilha:** Full

> Full porque toca **dois repos** (`menthoros-backend` + `menthoros-front`) e **muda contrato de API** — qualquer um já força Full, mesmo com escopo S. Fatiada (product-review): cobre só a forma **atual**; fronteiras/projeção de taper saem para change separada.

## Why

A classificação de forma do atleta a partir do TSB (Training Stress Balance) é **regra de domínio do backend** — vive em `FaixaTsb` (9 faixas) ancorada em `MetricasThresholds`. Hoje o **frontend reimplementa** essa regra com limiares hardcoded e **divergentes**: `formFromTSB` em `apps/menthoros-front/src/features/coach/types/AthleteForm.ts` usa 5 faixas (`tsb >= 15`, `>= 5`, `>= -10`, `>= -20`), que não batem com as 9 do backend (que conhece `-35`, `-30`, `> 25`, etc.).

É duplicação de lógica de domínio cross-repo: ajuste de fronteira no backend **não reflete** no que o treinador vê, gerando classificação inconsistente entre o motor (que gera sugestões no inbox do coach) e a UI. Para o treinador — persona primária — isso mina a confiança no diagnóstico de forma, justamente a informação que ele usa para decidir intensidade e ajuste de plano.

Correção: o backend **expõe o status de forma já resolvido** (`statusForma`) nos DTOs que o front consome; o front **consome** em vez de recomputar a forma **atual**.

## What Changes

- **Backend — expor `statusForma` (nome da `FaixaTsb`) nos DTOs consumidos pelo front**, derivado via `FaixaTsb.classificar(tsb)` (null-safe), **sem novos limiares** (reusa `FaixaTsb`/`MetricasThresholds`):
  - `PmcPontoDto` (cascata para `AtletaPerfilCoachOutputDto`)
  - `CoachAtletaResumoDto` (roster do coach dashboard)
  - `AtletaHomeDto.MetricasChave`
- **Contrato** — portar à mão o campo novo para o cliente curado (`src/api`) + tipo `FaixaTsbStatus` (union dos 9 nomes) em `src/types`.
- **Frontend — consumir `statusForma` na forma ATUAL**:
  - `AthleteForm.ts`: adicionar mapa de apresentação `FaixaTsbStatus → {label, tone, cor}` (sem números).
  - `CoachInboxPage.tsx:123` consome `quickStats.statusForma` (deixa de chamar `formFromTSB`).
  - `coachInboxAdapters.ts` propaga `statusForma` do roster/último PMC.
  - `AthleteRow.tsx:110` (`tsb < -30`) deriva da faixa do backend.
- **`formFromTSB` permanece TEMPORARIAMENTE** apenas em `calcularPrevisaoForma` (projeção de TSB do taper), documentado como dívida, até a change de follow-up assumir.

## Capabilities

### New Capabilities

- `status-forma`: o status de forma **atual** do atleta é resolvido pelo backend (fonte única) e exposto via contrato; a UI consome o valor resolvido e não reimplementa limiares para a forma atual.

### Modified Capabilities

<!-- Nenhuma capability canônica (fc-limiar-zones, prova-crud) tem requisitos alterados. -->

## Critérios de aceite

- **AC1 — backend resolve forma** · Given `tsb` não-nulo, When um DTO (`PmcPontoDto`/`CoachAtletaResumoDto`/`AtletaHomeDto.MetricasChave`) é montado, Then `statusForma == FaixaTsb.classificar(tsb).name()`; When `tsb` é nulo, Then `statusForma` é `null`.
- **AC2 — front não recomputa a forma atual** · Given a UI de forma atual (CoachInbox, AthleteRow), When renderiza, Then usa `statusForma` do contrato; And `formFromTSB` não é mais chamado para a forma atual (só permanece em `calcularPrevisaoForma`).
- **AC3 — compatibilidade** · Given clientes existentes, When o campo é adicionado, Then é opcional e não quebra desserialização (aditivo).
- **AC4 — transição de classificação é intencional (produto)** · Given a troca da forma atual de 5→9 faixas, When entregue, Then o PR inclui tabela **antes/depois** dos valores de TSB cujo rótulo muda, cada um confirmado como intencional/benéfico.

## Métrica de sucesso

**Consistência de diagnóstico backend↔UI = 100%** para a forma atual numa amostra de valores de TSB nas fronteiras (a faixa exibida ao treinador é idêntica à `FaixaTsb` do motor). Proxy de rotina: elimina o retrabalho do treinador ao reconciliar forma divergente entre o inbox de sugestões e a UI.

## Open Questions & Assumptions

- **(Aberto — produto, bloqueia a UI)** Granularidade: o treinador precisa das **9 faixas** distintas, ou um subconjunto mais legível (ex.: 5 buckets com 2 variações de extremo)? Decidir o mapa `FaixaTsbStatus → {label, tone, cor}` antes de implementar. O backend resolve as 9; a UI pode **agrupar na apresentação** sem reintroduzir limiares.
- **(Premissa)** A regen do cliente OpenAPI **não** sobrescreve a fachada curada; o campo é portado à mão.
- **(Premissa)** Mudança de comportamento **intencional**: valores onde o front divergia (ex.: TSB 20 era `form_excellent`; vira `DESCANSADO`) passam a refletir o backend — destacar no PR (AC4).
- **(Fora de escopo — follow-up)** Exposição das **fronteiras** da `FaixaTsb` + classificação do TSB **projetado** (taper): change separada, condicionada a `add-taper-guidance`. Até lá, `formFromTSB` sobrevive só na projeção.
- **(Fora de escopo)** Wiring de dados reais de **readiness** (hoje mock em `AthleteHomePage`) — coberto por `add-daily-readiness-checkin`.

## Riscos e mitigações

- **Drift do cliente curado na regen** → portar à mão e revisar diff; não commitar saída crua.
- **Explosão de estados na UI (5→9)** → resolver a granularidade (open question) antes; tabela de apresentação única `FaixaTsb → estilo`; QA visual.
- **Ordem cross-repo** → backend mergeia primeiro (contrato), depois o front consome.
- **Mudança de classificação percebida** → comunicar no PR como intencional, com tabela antes/depois (AC4).
- **`formFromTSB` residual na projeção** → comentar como dívida com link para o follow-up; o lint/AC2 garante que não volta para a forma atual.

## Revisões (Full track)

- **Product-review (lente do coach): Refine → aplicado.** Dor real; coach-in-the-loop preservado (status é dado determinístico, não saída de IA). Refinamentos dobrados: change **fatiada** (fronteiras/taper fora), granularidade das 9 faixas como questão aberta bloqueante, tabela antes/depois como AC de produto (AC4). Roadmap: decisão de **intercalar agora** (pré-Sprint 10) por ser dívida de confiança no diagnóstico do coach.
- **Pre-mortem cross-model (codex): não executado** — `/codex:adversarial-review` indisponível no ambiente. Pre-mortem inline: o principal modo de falha (acoplar exposição simples à feature de taper sem spec) foi **eliminado pelo fatiamento**.
