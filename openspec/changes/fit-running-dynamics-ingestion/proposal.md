# Proposal: fit-running-dynamics-ingestion

**Tamanho:** M · **Trilha:** Full (migration de schema + decisão de produto sobre quais métricas persistir)

## Status

Proposed (2026-07-12). Segunda da sequência iniciada em `fit-lap-metrics-parser` (depende dela
apenas por sequência de merge no parser — mesmos arquivos; sem dependência funcional).

## Why

O arquivo .fit carrega as métricas de **running dynamics** que o Garmin Connect exibe e que hoje o
Menthoros descarta no parse: tempo de contato com o solo (GCT), equilíbrio de GCT E/D, comprimento
de passada, oscilação e proporção vertical — além de temperatura, tempo em movimento e calorias.
Não há coluna para nenhuma delas em `tb_etapa_realizada`/`tb_treino_realizado`.

Valor para o coach (persona primária):

- **Fadiga intra-treino objetiva:** GCT subindo e passada encurtando volta a volta com pace estável
  é deterioração de forma que FC sozinha não mostra (visível no CSV de referência: GCT 250→260 ms e
  passada 1,00→0,93 m nas voltas finais). Ação do coach: GCT da parte final consistentemente acima
  do baseline do atleta → reduzir volume/intensidade do próximo treino de qualidade.
- **Bandeira de assimetria:** equilíbrio de GCT saindo de ~50/50 de forma sustentada ao longo de
  semanas é sinal precoce de compensação/lesão — hoje invisível para o coach. Ação do coach:
  desvio sustentado (ex.: 47/53 por 2-3 semanas) → agendar avaliação biomecânica antes que vire
  lesão de sobrecarga.
- **Contexto que evita decisão errada:** temperatura explica drift de FC em dia quente (evita
  falso-positivo de decoupling); tempo em movimento vs. tempo total distingue pausa de trote lento.

Sem essas colunas, a change 3 (`fit-lap-derived-metrics`) e o futuro `add-workout-metrics-analyzer`
não têm como incorporar forma/contexto às análises.

## What Changes

### Backend (`apps/menthoros-backend`)

- **Migration V53** (ou a próxima livre no merge) em `tb_etapa_realizada`:
  - `gct_medio_ms` INTEGER — tempo médio de contato com o solo;
  - `gct_equilibrio_pct` NUMERIC(4,1) — % do pé esquerdo (49.0–51.0 típico; direita = 100 − valor);
  - `passada_media_m` NUMERIC(4,2) — comprimento médio da passada;
  - `oscilacao_vertical_cm` NUMERIC(4,1);
  - `proporcao_vertical_pct` NUMERIC(4,1);
  - `temperatura_media_c` NUMERIC(4,1);
  - `tempo_movimento` INTERVAL — tempo em movimento do lap.
- Em `tb_treino_realizado`: mesmos agregados de sessão + `calorias` INTEGER.
- `FitLapData`/`FitSessionData` + `FitParseServiceImpl`: ler da `LapMesg`/`SessionMesg`:
  `getAvgStanceTime()` (ms), `getAvgStanceTimeBalance()` (%), `getAvgStepLength()` (**mm** → m),
  `getAvgVerticalOscillation()` (**mm** → cm), `getAvgVerticalRatio()` (%),
  `getAvgTemperature()` (°C), `getTotalTimerTime()` (s), `getTotalCalories()` (kcal, sessão).
- `FitTreinoPersister`: mapear para as novas colunas; ausente → `null` (não fabricar).
- `EtapaRealizadaOutputDto` + DTO de treino: expor os novos campos (aditivo, `@JsonInclude(NON_NULL)`).

### Fora de escopo

- Qualquer análise/alerta sobre os dados (skill de forma, tendência de assimetria) — os dados são
  persistidos e expostos; a inteligência fica para change própria pós-validação de uso.
- Ingestão dos mesmos campos via Strava (a API de splits do Strava não os fornece).
- Backfill de imports antigos.
- Frontend (consumo dos campos novos no drilldown é change do repo front quando priorizada).

## Critérios de aceite

- **CA1 — Migration:** V53 aplica em banco limpo e em banco com dados; colunas novas todas nullable,
  zero impacto em linhas existentes.
- **CA2 — Ingestão completa:** .fit de relógio com running dynamics → etapa persiste GCT, equilíbrio,
  passada (m), oscilação (cm), proporção (%), temperatura e tempo em movimento; sessão persiste
  agregados + calorias.
- **CA3 — Conversão de unidades:** valores persistidos batem com o Garmin Connect do mesmo treino
  (passada em metros com 2 casas; oscilação em cm com 1 casa — a FIT entrega ambos em mm).
- **CA4 — Dispositivo sem dynamics:** .fit de relógio sem o sensor → campos `null`, import não falha.
- **CA5 — API:** DTOs expõem os campos novos apenas quando não-nulos (`NON_NULL`); contrato existente
  não muda para clientes que ignoram campos novos.
- **CA6 — Sem regressão:** `./mvnw clean test` verde.

## Métrica de sucesso

Duas camadas (ajustado após product review de 2026-07-12):

- **Leading (entrega de dado):** % de treinos .fit de dispositivos compatíveis com running dynamics
  persistidas ≥ 90% — verifica que a ingestão funciona.
- **Lagging (impacto no coach):** consumo real dos campos no drilldown — coach consulta os campos
  novos em ≥ 1 análise/semana dentro de 4 semanas após o front expor os dados. Exige instrumentação
  de uso no frontend (evento de visualização do drilldown de etapa) — anotar como requisito da
  change de front que consumir estes campos.
- **Critério de revisão:** se 4 semanas após a exposição no front o consumo for < 20%, pausar a
  expansão de métricas de forma (não criar novas colunas/análises) e investigar antes de seguir.

## Open Questions & Assumptions

- **Consumidores definidos (resolvido na product review):** `fit-lap-derived-metrics` consome
  temperatura/tempo em movimento como contexto dos cálculos; o drilldown do front (change futura no
  repo front) expõe os campos ao coach; `add-workout-metrics-analyzer` incorpora forma na narrativa
  quando for priorizada. A priorização dessas consumidoras nos próximos 2 sprints é decisão de
  roadmap em aberto — sem ela, vale o critério de revisão da métrica de sucesso.
- **Assumido:** o front consumirá os campos em change própria; esta change só garante dado e contrato.
  O coach precisa de referência de faixa "normal" (GCT, equilíbrio) na UI para o dado ser acionável —
  requisito a registrar na change do front, não aqui.
- **Assumido:** `getAvgStanceTimeBalance()` retorna o % do pé esquerdo (convenção Garmin) — validar
  com .fit real na task de validação.
- **Aberto:** persistir também `getMaxPower()`/`getMaxRunningCadence()` (pendência da change 1)?
  Decidir na review do design — custo marginal, valor prescritivo baixo.
- **Aberto:** `tempo_movimento` também em `tb_treino_realizado` ou só por etapa? (o agregado pode ser
  derivado; proposta: persistir nos dois para simetria com o CSV do Garmin).

## Riscos e mitigações

- **Variação entre dispositivos** (Médio): nem todo relógio grava dynamics (exige HRM-Pro/RD-Pod ou
  relógio recente). Mitigação: tudo nullable + CA4; a análise futura terá eligibility gate.
- **Unidades erradas** (Médio): FIT usa mm onde o Garmin Connect exibe cm/m. Mitigação: CA3 valida
  contra o CSV real; testes unitários fixam as conversões.
- **Crescimento da tabela** (Baixo): 7 colunas numéricas nullable em `tb_etapa_realizada` — impacto
  de storage desprezível no volume atual.
- **Sobreposição com `first-party-ingestion-architecture`** (Baixo): esta change enriquece o caminho
  .fit existente; se a arquitetura first-party redesenhar a ingestão, as colunas e conversões são
  reaproveitadas (o modelo de dados é o mesmo).
- **Dados sem consumo** (Médio — apontado na product review): persistir campos que nenhuma tela ou
  análise usa gera dado órfão e falsa sensação de progresso. Mitigação: consumidores nomeados na
  seção de Open Questions, instrumentação de uso e critério de revisão de 4 semanas na métrica de
  sucesso.
