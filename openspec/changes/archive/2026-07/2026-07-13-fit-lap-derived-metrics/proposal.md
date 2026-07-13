# Proposal: fit-lap-derived-metrics

**Tamanho:** M · **Trilha:** Full (contrato de API muda — campos novos de análise; incerteza de design no GAP)

## Status

Proposed (2026-07-12). Terceira da sequência iniciada em `fit-lap-metrics-parser`.
**Depende de:** `fit-lap-metrics-parser` (elevação e potência por lap são insumo do GAP e do Pw:HR).
**Relação com `add-workout-metrics-analyzer` (ativa):** ver seção própria abaixo.

## Why

Depois do fix `fix/fit-lap-velocidade-decoupling` e da change 1, cada etapa persistida tem
velocidade, FC, elevação e potência por volta — mas o único número derivado que o coach recebe é o
`decouplingPercentual` (Pa:HR, um escalar por treino). O CSV do Garmin Connect mostra o que o coach
olha na prática: a **progressão volta a volta**. Três derivações de alto valor e custo baixo:

- **Curva de EF por volta** (`velocidade/FC` e, quando houver potência, `potência/FC`): torna visível
  ONDE o treino degradou, não só QUE degradou. É o "decoupling volta a volta" pedido pelo coach.
- **Pw:HR:** decoupling sobre potência é mais estável que Pa:HR em terreno variável — potência não
  "mente" na subida como o pace.
- **GAP interno por volta:** pace ajustado por gradiente usando a elevação da change 1. Destrava o
  decoupling em percurso ondulado, que hoje o gate `CV_VEL_MAX = 0.15` reprova, e elimina a
  dependência do GAP proprietário do Garmin/Strava (que não vem no .fit).
- **W/kg por volta:** derivado de `potenciaMedia` + `Atleta.pesoKg` — normaliza potência entre atletas.

Tudo é cálculo puro sobre dados já persistidos: **zero migration, zero LLM, zero dado novo**.

## What Changes

### Backend (`apps/menthoros-backend`)

- **`LapEfficiencySeriesCalculator`** (novo, `services/helper`, padrão do `DecouplingCalculatorService`):
  série por volta com `ordem`, `velocidadeKmh`, `fcMedia`, `efPace` (vel/FC), `efPotencia`
  (W/FC, se houver potência), `wPorKg` (se houver peso), `paceGapSegKm` (se houver elevação).
  Derivado na leitura, não persistido.
- **`DecouplingCalculatorService`:** variante Pw:HR — quando ≥80% das etapas elegíveis têm
  `potenciaMedia`, calcular também o decoupling por potência; expor os dois no DTO
  (`decouplingPercentual` mantém semântica atual de Pa:HR; novo campo `decouplingPotenciaPercentual`).
- **GAP interno:** fator de ajuste por gradiente médio da volta (gradiente = (subida − descida) /
  distância) — fórmula e limites no `design.md` (D2), com gate de sanidade.
- **Contrato:** `TreinoRealizadoOutputDto` ganha `decouplingPotenciaPercentual` e a série de
  eficiência entra no endpoint de detalhe do treino (aditivo, `NON_NULL`).

### Fora de escopo

- Narrativa/alerta de IA sobre as séries (é o papel de `add-workout-metrics-analyzer`).
- Decoupling sobre amostras por segundo (idem — ver seção de relação).
- Frontend (gráfico da curva de EF é change do repo front).
- Persistir qualquer valor derivado.

## Relação com `add-workout-metrics-analyzer`

A change ativa `add-workout-metrics-analyzer` prevê `WorkoutMetricsCalculator` sobre **amostras por
segundo** (streams densos), dependente de `first-party-ingestion-architecture`. Esta change entrega
o degrau anterior: as mesmas famílias de métrica em **granularidade de volta**, com dado que já
existe hoje em `tb_etapa_realizada`, sem esperar a arquitetura de ingestão.

Cláusula de supersessão: quando `add-workout-metrics-analyzer` for implementada com amostras densas,
o cálculo lap-based vira fallback para treinos sem samples (imports .fit/Strava atuais) — os
calculators desta change devem ser desenhados para essa composição (interface comum é decisão do
`design.md` de lá, não desta).

Estratégia de transição (ajuste da product review): a troca lap-based → sample-based não deve ser
silenciosa para o coach — o resultado derivado deve carregar a granularidade de origem (ex.: campo
`origemCalculo: POR_VOLTA | POR_AMOSTRA` no DTO), para que a UI possa sinalizar quando a precisão
mudou. O campo já nasce nesta change com valor fixo `POR_VOLTA`, evitando quebra de contrato depois.
A data/sprint de chegada do metrics-analyzer é decisão de roadmap fora desta change (depende de
`first-party-ingestion-architecture`).

## Critérios de aceite

- **CA1 — Série de EF:** treino com N voltas elegíveis → série com N pontos ordenados, `efPace`
  calculado; voltas sem FC ou sem velocidade ficam fora da série (sem fabricar).
- **CA2 — Pw:HR:** treino com potência em ≥80% das etapas elegíveis → `decouplingPotenciaPercentual`
  calculado com os mesmos gates do Pa:HR; abaixo do threshold → null.
- **CA3 — GAP:** volta com subida líquida tem `paceGapSegKm` menor (mais rápido) que o pace bruto;
  volta plana tem GAP ≈ pace bruto (tolerância definida no design); gradiente fora da faixa de
  sanidade → GAP null.
- **CA4 — Compatibilidade:** `decouplingPercentual` (Pa:HR) não muda de valor para treinos existentes;
  campos novos são aditivos e omitidos quando null.
- **CA5 — Sem regressão:** `./mvnw clean test` verde.

## Métrica de sucesso

Duas camadas (ajustado após product review de 2026-07-12):

- **Leading (desbloqueio técnico):** série de EF disponível no detalhe para 100% dos treinos com
  voltas elegíveis; % de treinos contínuos com decoupling não-null sobe após o gate GAP-ajustado
  (medir antes/depois).
- **Lagging (impacto no coach):** quando o front expor a curva, o coach usa a série para diagnosticar
  degradação sem exportar CSV do Garmin — instrumentar visualização da série no detalhe do treino e
  medir adoção em 4 semanas (alvo inicial: usada em ≥ 40% das análises de treinos longos/contínuos).

## Open Questions & Assumptions

- **Assumido:** granularidade de volta é suficiente para a decisão do coach (a versão por segundo
  vem depois via `add-workout-metrics-analyzer`).
- **Aberto:** fórmula do GAP — fator linear por gradiente (Minetti simplificado) vs. tabela de
  custo energético; decidir no design com validação empírica contra o GAP do Garmin no CSV de
  referência (coluna "GAP médio").
- **Aberto:** a série de EF entra no `TreinoRealizadoOutputDto` (payload maior em listagens?) ou só
  no endpoint de detalhe — proposta: só no detalhe.

## Riscos e mitigações

- **GAP impreciso mina a confiança do coach** (Alto para o GAP, baixo para o resto): o coach compara
  mentalmente com o GAP do Garmin; um outlier visível contamina a confiança em todas as métricas.
  Mitigação (endurecida na product review): calibração com meta dupla — erro médio ≤ 3 s/km E desvio
  máximo por volta ≤ 5 s/km na faixa |g| ≤ 3%; se qualquer critério falhar, expor a série sem GAP e
  adiar o campo. A UI que consumir o GAP deve rotulá-lo como "GAP calculado (Menthoros)" com tooltip
  da origem — requisito a registrar na change do front.
- **Duplicação futura com o metrics-analyzer** (Médio): mitigada pela cláusula de supersessão e por
  manter os calculators puros e componíveis (sem estado, sem persistência).
- **Payload do DTO** (Baixo): série só no endpoint de detalhe; listagens não mudam.
