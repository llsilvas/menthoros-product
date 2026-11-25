**Tamanho:** M · **Trilha:** Full

# Proposal — season-plan-start-volume

A temporada passa a partir do que o atleta **sustenta** (volume habitual e maior longão recente), do
jeito que um treinador leria o histórico. O treinador vê de onde saiu o ponto de partida e pode
corrigi-lo já na proposta v1, antes de aprovar.

## Why

Caso real (dev, 2026-11-24, atleta Leandro, maratona em 2027-03-21, 17 semanas): a temporada proposta
partiu de **12,5 km/semana**, com longão de **3,6 km** subindo até **4,6 km**. O maior treino dele nas
semanas anteriores foi de 6–7 km (11–13 km no início de outubro). Nenhum treinador aprova isso.

Causa, em três partes:

1. **Volume de partida frágil** (`SeasonPlanServiceImpl.resolverVolume`, D11 do
   `add-season-plan-generate-tracer`): média simples das **4 semanas completas** antes da corrente. As
   do Leandro foram 3,7 + 23,4 + 16,2 + 6,8 km; em outubro ele fazia 25–30 km/semana. Uma semana
   atípica puxa a média e derruba a temporada inteira: o volume de cada semana é
   `partida × TSS da semana / TSS de partida` (`SeasonPlanner.java:204`), proporcional à partida.
2. **Longão sem relação com o que o atleta já corre** (`SeasonPlanner.longao`): 28% do volume da semana.
3. **Treinador sem saída na v1.** `recalculate` só aceita rascunho de ajuste
   (`SeasonPlanAdjustmentServiceImpl.java:167`, `baseSeasonPlanId != null`), que só existe depois de uma
   temporada ACTIVE. E mesmo no ajuste a semana corrente fica travada (`SeasonWeekLock`, `IN_PROGRESS`),
   o que numa v1 recém-gerada é sempre a semana 1.

## Como um treinador lê o histórico (referência desta change)

- **Volume habitual**, não média: as semanas típicas, ignorando as atípicas para cima ou para baixo.
- **Por que caiu?** Queda curta volta perto do habitual; parada longa recomeça a 60–75%. O sistema não
  sabe o motivo: propõe o habitual, mostra as semanas usadas e o treinador corrige.
- **Longão a partir do maior longão recente**, não de uma fração da semana.

## What Changes

**Backend**

- **Volume de partida (D11 revisado):** **mediana** dos km das **8 semanas completas** antes da corrente
  (treinos com `contaNaCarga`; semana sem treino = 0). Mediana 0 → `volumeSemanalMax` do onboarding;
  sem ele, 422 como hoje.
- **Longão de partida `L0`:** maior `distanciaKm` de treino com `contaNaCarga` e tipo diferente de
  `PROVA` nas **6 semanas completas** antes da corrente. Longão de cada semana:
  `min(max(28% × volume, L0 × volume / partida), 50% × volume, teto da distância)`; descarga × 0,75;
  RACE_WEEK sem longão. Sem `L0`, fica a regra dos 28%.
- **Evidência persistida** no `PlanoTreino` (migration aditiva V122, colunas nulas): `L0`, o volume que o
  motor propôs, a origem do volume de partida (`MEDIAN`, `ONBOARDING`, `COACH`) e as 8 somas semanais
  usadas. A tela mostra o que gerou a proposta, não um recálculo na leitura.
- **Recálculo na v1:** `POST .../{seasonPlanId}/recalculate` passa a aceitar a temporada PROPOSED v1
  (sem `baseSeasonPlanId`). Na v1, só semanas `COMPLETED` ficam travadas (a corrente é recalculável:
  a temporada ainda não guia nada). O corpo ganha `startLongRunKm` opcional (default: `L0` persistido).
  Semanas editadas pelo treinador (`COACH`) continuam preservadas, inclusive o longão. Recalcular grava
  a origem `COACH`. `diff` e `discard` continuam exclusivos do rascunho de ajuste.
- **Rascunho de ajuste (v2+)** copia `L0` e a evidência da ACTIVE (`SeasonPlanVersioning`).
- **Resposta:** `SeasonPlanResponseDto` ganha `initialLongRunKm`, `proposedVolumeKm`,
  `initialVolumeSource` e `volumeHistory` (`initialVolumeKm` já existe). Campos aditivos.

**Frontend**

- Aba Temporada, proposta v1: volume de partida, longão de partida, origem e as 8 semanas usadas; botão
  "Ajustar volume e fases" abre o `SeasonParametersForm` (já é componente, usado pela
  `CoachSeasonAdjustPage`) com o campo novo de longão de partida.
- Texto do alerta `LONG_RUN_SHARE` explica que o longão segue o maior treino recente do atleta, para o
  treinador não ler como erro.

## Efeito no caso do Leandro (conta de referência)

- 8 semanas: 29,2 · 30,0 · 25,3 · 18,2 · 3,7 · 23,4 · 16,2 · 6,8 → mediana **20,8 km** (era 12,5).
- `L0` = **7,4 km** (maior treino nas 6 semanas). Semana 1: volume = 20,8 × 1,02 (o motor já cresce na
  semana 1: `SeasonPlanner.java:187`) → longão ≈ **7,5 km** (era 3,6), ~35% do volume: o alerta de 30%
  dispara.
- Pico (D10 inalterado, +30%): ~27 km/semana e longão ~9,6 km. **Ainda longe de uma maratona**: o
  limitante passa a ser o D10 (Q3).

## Fora de escopo

- Mudar o crescimento até o pico (`PEAK_GROWTH`, D10) — Q3, próxima change.
- Aviso de viabilidade por distância — Q2.
- Mudança de data da prova-alvo com temporada ACTIVE (confirmado em 2026-11-24 que nada avisa): critério
  de aceite do ticket 10 (`add-season-plan-replanning`).
- Temporadas já geradas não são recalculadas; colunas novas ficam nulas nelas (a tela omite o que falta).

## Critérios de aceite

1. **Dado** as 8 semanas do Leandro, **quando** gera, **então** a partida é 20,8 km, origem `MEDIAN`, e
   as 8 somas ficam persistidas.
2. **Dado** 7 semanas de 20 km e uma de 60 km, **quando** gera, **então** a partida é 20 km.
3. **Dado** treino só em 2 das 8 semanas, **quando** gera, **então** a mediana é 0, a partida é o
   `volumeSemanalMax` do onboarding com origem `ONBOARDING`; sem ele, 422.
4. **Dado** um treino da semana corrente, **quando** gera, **então** ele não entra na janela; e treino de
   7 semanas atrás entra no volume mas não no `L0`.
5. **Dado** `L0` = 7,4 km, partida 20,8 km, **quando** gera, **então** o longão de cada semana é
   `L0 × volume / partida` (≈ 7,5 km na semana 1), com descarga × 0,75 e teto da distância.
6. **Dado** `L0` abaixo de 28% do volume, **então** vale 28%. **Dado** `L0` acima de 50% do volume,
   **então** vale 50%. **Dado** só treinos `PROVA` na janela, **então** `L0` é nulo e vale 28%.
7. **Dado** PROPOSED v1 gerada hoje, **quando** o treinador recalcula com `startVolumeKm = 30` e
   `startLongRunKm = 10`, **então** todas as semanas não `COMPLETED` e não `COACH` são refeitas
   (inclusive a semana 1), a origem vira `COACH`, `proposedVolumeKm` não muda, e a temporada continua
   PROPOSED v1.
8. **Dado** uma semana `COACH` na v1, **quando** recalcula, **então** volume, TSS e longão dela não mudam.
9. **Dado** uma temporada ACTIVE, **quando** chama `recalculate` sobre ela, **então** 409; `diff` e
   `discard` sobre a v1 continuam 409.
10. **Dado** um rascunho criado de uma ACTIVE com `L0`, **então** o rascunho tem o mesmo `L0` e evidência;
    ACTIVE legada sem `L0`, o rascunho recalcula com 28%.
11. **Dado** a aba Temporada com proposta v1, **então** aparecem partida, origem, longão de partida e as
    8 semanas; "Ajustar volume e fases" recalcula e o mapa reflete os novos valores.

## Métrica de sucesso

Ligada à rotina do treinador (tempo até aprovar uma temporada crível):

- **Baseline (esta change):** % de temporadas v1 aprovadas com origem `MEDIAN`/`ONBOARDING` e sem semana
  `COACH` (query sobre `tb_plano_treino.initial_volume_source` + `tb_season_week.value_source`), e
  distância entre `proposedVolumeKm` e `initialVolumeKm` quando o treinador recalcula.
- **Meta (vale depois da change do D10/Q3):** ≥ 60% das v1 de provas ≥ meia-maratona aprovadas sem
  recálculo nem edição.

## Rollback

- Reverter o código: volta a média de 4 semanas e os 28%. As colunas da V122 ficam órfãs e nulas, sem
  efeito; remover só numa V nova.
- Sem feature flag: a mudança vale para toda temporada nova gerada depois do deploy, atrás da flag
  `season-plan.enabled` que já existe (desligada em produção hoje).

## Open Questions & Assumptions

- **Q1 — Regra do volume de partida.** Decidido (founder, 2026-11-24): mediana de 8 semanas.
- **Q2 — Aviso de viabilidade.** Change própria.
- **Q3 — Crescimento até o pico (D10).** Próxima change; é o limitante real do caso de referência.
- **Decididos no DoR (2026-11-24):** semana corrente destravada na v1; `L0` editável no recálculo, com teto
  de 50% do volume da semana; métrica como baseline até o Q3.
- **A1.** O TSS de partida continua vindo do CTL. O CTL **não** reduz os km (o volume é proporcional à
  razão de TSS); a proteção contra partida alta depois de parada longa é a visibilidade das 8 semanas e o
  recálculo.
- **A2.** "Treino que conta na carga" = `TreinoRealizado.contaNaCarga`.
