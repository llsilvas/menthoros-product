**Tamanho:** M · **Trilha:** Full

# Proposal — season-plan-start-volume

O volume de partida da temporada deixa de ser refém das últimas 4 semanas, e o treinador passa a poder
corrigir o volume de partida (e a distribuição de fases) já na proposta v1, antes de aprovar.

## Why

Caso real (dev, 2026-11-24, atleta Leandro, maratona em 2027-03-21, 17 semanas): a temporada proposta
partiu de **12,5 km/semana**, com longão de **3,6 km** subindo até **4,6 km** e `targetTss` de 123 a
157. Nenhum treinador aprova isso para uma maratona.

Causa, em duas partes:

1. **Volume de partida frágil** (`SeasonPlanServiceImpl.resolverVolume`, D11 do
   `add-season-plan-generate-tracer`): média simples das **4 semanas completas** antes da corrente.
   As do Leandro foram 3,7 + 23,4 + 16,2 + 6,8 km. Em outubro ele fazia 25–30 km/semana. Uma semana
   de folga, doença ou viagem na janela derruba a temporada inteira, porque o resto da curva é
   proporcional ao ponto de partida (pico = partida × 1,30, longão = 28% do volume da semana).
2. **Treinador sem saída na v1.** O recálculo com outro volume (`recalculate`, `startVolumeKm`) só
   aceita rascunho de ajuste (`baseSeasonPlanId != null`), que só existe depois de uma temporada
   ACTIVE. Na v1 PROPOSED, a única forma de corrigir é editar semana a semana (17 edições) ou aprovar
   um plano errado para depois ajustar.

## What Changes

- **Backend — volume de partida (D11 revisado):** o maior entre a média das 4 e a das 8 semanas
  completas antes da corrente. Continua só treino que conta na carga, e continua caindo no
  `volumeSemanalMax` do onboarding quando não há treino. Uma queda recente não derruba a partida; o
  valor nunca passa do que o atleta realmente correu nos últimos 2 meses.
- **Backend — recálculo na v1:** `recalculate` passa a aceitar a temporada PROPOSED v1 (sem
  `baseSeasonPlanId`), com as mesmas regras de hoje (soma das fases, semanas travadas, data da prova).
- **Frontend:** na aba Temporada, a proposta v1 mostra o volume de partida usado e oferece "Ajustar
  volume e fases", reaproveitando o formulário de recálculo da tela de ajuste.

## Fora de escopo

- Piso de volume ou de longão pela distância da prova. Atleta que corre 12 km/semana não está pronto
  para uma maratona; inventar volume é risco de lesão. Se valer, é um **aviso** ao treinador, numa
  change própria (ver Open Questions).
- Mudança de data da prova-alvo com temporada ACTIVE: confirmado em 2026-11-24 que a temporada fica
  com as semanas antigas e nada avisa; já é critério de aceite do ticket 10
  (`add-season-plan-replanning`).
- Temporadas já geradas: não são recalculadas.

## Critérios de aceite

1. **Dado** um atleta com 4 semanas recentes somando 50,1 km e 8 semanas somando 152,8 km, **quando**
   a temporada é gerada, **então** o volume de partida é 19,1 km (média de 8) e não 12,5.
2. **Dado** um atleta cujas últimas 4 semanas são maiores que a média de 8, **quando** gera, **então**
   a partida é a média de 4 (sem regressão para quem está subindo).
3. **Dado** um atleta sem treino nas 8 semanas, **quando** gera, **então** a partida é o
   `volumeSemanalMax` do onboarding; sem ele, 422 como hoje.
4. **Dado** uma temporada PROPOSED v1, **quando** o treinador recalcula com `startVolumeKm = 30`,
   **então** as semanas não travadas são refeitas a partir de 30 km e a temporada continua PROPOSED v1.
5. **Dado** uma temporada ACTIVE, **quando** o treinador chama o recálculo sobre ela (não sobre o
   rascunho), **então** continua 409, como hoje.
6. **Dado** a aba Temporada com proposta v1, **então** o volume de partida aparece e "Ajustar volume e
   fases" abre o recálculo; ao salvar, o mapa da temporada reflete os novos valores.

## Métrica de sucesso

- % de temporadas v1 aprovadas sem recálculo nem edição de semana (`season-plan` já registra a origem
  dos valores por semana em `value_source`): meta inicial ≥ 60% no piloto.
- Contagem de recálculos na v1 por temporada: se passar de 1 em média, o D11 revisado ainda erra.

## Open Questions & Assumptions

- **Q1 — Regra do volume de partida.** Proposta: `max(média 4, média 8)`. Alternativas: mediana das
  8 semanas; média de 8 descartando semanas abaixo de 50% da mediana. Decidir no `/implement init`.
- **Q2 — Aviso por distância.** Mostrar ao treinador "longão de pico X km está abaixo do usual para
  <distância>"? Fica fora desta change; decidir se vira change própria.
- **A1.** O TSS de partida continua vindo do CTL (D11 original): esta change mexe só no volume em km.
- **A2.** O recálculo da v1 reusa o endpoint e o DTO existentes; sem mudança de contrato além de
  aceitar mais um estado.
