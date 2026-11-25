**Tamanho:** M · **Trilha:** Full

# Proposal — season-plan-start-volume

A temporada passa a partir do que o atleta **sustenta** (volume habitual e maior longão recente), do
jeito que um treinador leria o histórico, e o treinador pode corrigir o ponto de partida já na proposta
v1, antes de aprovar.

## Why

Caso real (dev, 2026-11-24, atleta Leandro, maratona em 2027-03-21, 17 semanas): a temporada proposta
partiu de **12,5 km/semana**, com longão de **3,6 km** subindo até **4,6 km**. O maior treino dele nas
semanas anteriores foi de 6–7 km (11–13 km no início de outubro). Nenhum treinador aprova isso.

Causa, em três partes:

1. **Volume de partida frágil** (`SeasonPlanServiceImpl.resolverVolume`, D11 do
   `add-season-plan-generate-tracer`): média simples das **4 semanas completas** antes da corrente. As
   do Leandro foram 3,7 + 23,4 + 16,2 + 6,8 km; em outubro ele fazia 25–30 km/semana. Uma semana
   atípica (folga, doença, viagem) puxa a média e derruba a temporada inteira, porque o resto da curva é
   proporcional à partida.
2. **Longão sem relação com o que o atleta já corre** (`SeasonPlanner.longao`): 28% do volume da semana,
   sem olhar o histórico. Com volume baixo, sai um longão menor que um treino comum do atleta.
3. **Treinador sem saída na v1.** O recálculo com outro volume (`recalculate`, `startVolumeKm`) só
   aceita rascunho de ajuste (`baseSeasonPlanId != null`), que só existe depois de uma temporada ACTIVE.
   Na v1 PROPOSED, a única forma de corrigir é editar semana a semana (17 edições) ou aprovar um plano
   errado para depois ajustar.

## Como um treinador lê o histórico (referência desta change)

- **Volume habitual**, não média: as semanas típicas, ignorando as atípicas para cima ou para baixo.
- **Por que caiu?** Queda curta (viagem, gripe) volta perto do habitual; parada longa (lesão) recomeça
  a 60–75%. O sistema não sabe o motivo: propõe o habitual, mostra o histórico usado e o treinador
  corrige.
- **Longão a partir do maior longão recente**, não de uma fração da semana.

## What Changes

- **Backend — volume de partida (D11 revisado):** **mediana** dos km das **8 semanas completas** antes
  da corrente (só treino que conta na carga, semanas sem treino entram como 0). Sem treino nas 8
  semanas, `volumeSemanalMax` do onboarding; sem ele, 422 como hoje.
- **Backend — longão de partida:** `L0` = maior distância de um treino que conta na carga nas **6
  semanas completas** antes da corrente. O longão de cada semana passa a ser
  `max(28% do volume da semana, L0 × volume da semana / volume de partida)`, com o teto por distância
  (`tetoLongao`, 32 km na maratona) e a redução de descarga (× 0,75) de hoje. Sem treino na janela,
  fica só a regra dos 28%.
- **Backend — recálculo na v1:** `recalculate` passa a aceitar a temporada PROPOSED v1 (sem
  `baseSeasonPlanId`), com as mesmas guardas de hoje (soma das fases, semanas travadas, data da prova).
- **Backend — resposta:** `SeasonPlanResponseDto` expõe volume de partida, `L0` e as 8 semanas usadas
  (km por semana), para o treinador ver de onde saiu a proposta.
- **Frontend:** na aba Temporada, a proposta v1 mostra volume de partida, longão de partida e as 8
  semanas usadas, e oferece "Ajustar volume e fases", reaproveitando o formulário de recálculo da tela
  de ajuste.

## Efeito no caso do Leandro (conta de referência)

- 8 semanas: 29,2 · 30,0 · 25,3 · 18,2 · 3,7 · 23,4 · 16,2 · 6,8 → mediana **20,8 km** (era 12,5).
- Maior treino nas 6 semanas: **7,4 km** → longão da semana 1 = 7,4 km (era 3,6), 36% do volume:
  o alerta `LONG_RUN_SHARE` (teto 30%) dispara, e isso é informação correta para o treinador.
- Pico (volume × 1,30, D10 inalterado): ~27 km/semana e longão ~9,6 km. **Continua longe de uma
  preparação de maratona**: o limitante passa a ser o crescimento de 30% do D10, não a partida. Ver Q3.

## Fora de escopo

- Mudar o crescimento até o pico (`PEAK_GROWTH`, D10) — Q3.
- Piso de volume ou de longão pela distância da prova, e aviso de viabilidade — Q2.
- Mudança de data da prova-alvo com temporada ACTIVE: confirmado em 2026-11-24 que a temporada fica com
  as semanas antigas e nada avisa; já é critério de aceite do ticket 10 (`add-season-plan-replanning`).
- Temporadas já geradas: não são recalculadas.

## Critérios de aceite

1. **Dado** as 8 semanas do Leandro (acima), **quando** a temporada é gerada, **então** o volume de
   partida é 20,8 km.
2. **Dado** 8 semanas com uma semana atípica alta (ex.: 7 semanas de 20 km e uma de 60 km), **quando**
   gera, **então** a partida é 20 km (a mediana ignora o pico isolado).
3. **Dado** um atleta com treino só nas 2 últimas das 8 semanas, **quando** gera, **então** a partida é
   0 pela mediana e cai no `volumeSemanalMax` do onboarding; sem ele, 422.
4. **Dado** maior treino de 7,4 km nas 6 semanas e partida de 20,8 km, **quando** gera, **então** o
   longão da semana 1 é 7,4 km e o das semanas seguintes cresce na mesma proporção do volume, sem
   passar do teto da distância; em semana de descarga, × 0,75.
5. **Dado** maior treino recente abaixo de 28% do volume, **quando** gera, **então** vale os 28% (sem
   regressão).
6. **Dado** uma temporada PROPOSED v1, **quando** o treinador recalcula com `startVolumeKm = 30`,
   **então** as semanas não travadas são refeitas a partir de 30 km e a temporada continua PROPOSED v1.
7. **Dado** uma temporada ACTIVE, **quando** o treinador chama o recálculo sobre ela (não sobre o
   rascunho), **então** continua 409.
8. **Dado** a aba Temporada com proposta v1, **então** aparecem volume de partida, longão de partida e
   as 8 semanas usadas, e "Ajustar volume e fases" abre o recálculo; ao salvar, o mapa reflete os
   novos valores.

## Métrica de sucesso

- % de temporadas v1 aprovadas sem recálculo nem edição de semana (`value_source` por semana): meta
  inicial ≥ 60% no piloto.
- Recálculos na v1 por temporada: média acima de 1 indica que a partida ainda erra.

## Open Questions & Assumptions

- **Q1 — Regra do volume de partida.** Decidido em 2026-11-24 (founder, pela leitura de treinador):
  mediana das 8 semanas, mais as 8 semanas visíveis e o recálculo na v1.
- **Q2 — Aviso de viabilidade.** "Pico de longão X km abaixo do usual para <distância>" ao treinador.
  Change própria.
- **Q3 — Crescimento até o pico.** O D10 fixa +30% de volume do início ao pico, qualquer que seja a
  duração. Com 17 semanas, um treinador cresceria bem mais (respeitando a rampa semanal). Revisar o D10
  (por duração ou por distância) em change própria; é o que realmente limita o caso do Leandro.
- **A1.** O TSS de partida continua vindo do CTL (D11 original); esta change mexe só no volume em km e
  no longão.
- **A2.** "Treino que conta na carga" = `TreinoRealizado.contaNaCarga`, o mesmo filtro de hoje.
- **A3.** Recálculo com `startVolumeKm` informado pelo treinador mantém o `L0` calculado (a proporção
  vale sobre o volume informado).
