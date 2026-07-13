# Design: fit-lap-derived-metrics

## D1 — Arquitetura dos calculators

Mesmo padrão do `DecouplingCalculatorService`: componente puro em `services/helper`, sem estado,
sem persistência, derivado na leitura. JavaDoc com Idempotent/Side Effects/Tenant-aware.

```
LapEfficiencySeriesCalculator.serie(List<EtapaRealizada>, BigDecimal pesoKg) -> LapEfficiencySeries

record LapEfficiencySeries(
    OrigemCalculo origem,     // POR_VOLTA nesta change; POR_AMOSTRA quando o metrics-analyzer supersedar
    List<LapEfficiencyPoint> pontos
)

record LapEfficiencyPoint(
    int ordem,
    Double velocidadeKmh,     // reusa a resolução vel/pace do DecouplingCalculatorService (extrair helper comum)
    Integer fcMedia,
    Double efPace,            // velocidadeKmh / fcMedia
    Double efPotencia,        // potenciaMedia / fcMedia (null sem potência)
    Double wPorKg,            // potenciaMedia / pesoKg (null sem peso ou sem potência)
    Duration paceGap          // pace ajustado por gradiente (null sem elevação ou fora de sanidade)
)
```

Elegibilidade por ponto (não por treino): volta entra na série se tiver duração > 0, FC > 0 e
velocidade resolvível — série parcial é aceitável (o gráfico mostra buracos); diferente do
decoupling escalar, que mantém seus gates globais.

## D2 — GAP interno (fórmula v1)

Gradiente médio da volta: `g = (subidaMetros − descidaMetros) / (distanciaKm × 1000)` (adimensional).

Fator de custo (aproximação linear de Minetti na faixa habitual de corrida, |g| ≤ 0,10):

```
custoRelativo(g) = 1 + 9.0 * g       // subida encarece ~9% por 1% de gradiente
                                     // descida: usar 1 + 4.5 * g (benefício menor que o custo simétrico)
paceGap = paceBruto / custoRelativo(g)
```

- **Sanidade:** |g| > 0,10 (10%) ou subida+descida > 30% da distância → `paceGap = null` (dado de
  barômetro suspeito ou trail fora do modelo).
- **Calibração:** task dedicada compara `paceGap` com a coluna "GAP médio min/km" do CSV de
  referência (16 voltas, terreno levemente ondulado) — meta dupla: erro médio ≤ 3 s/km **e desvio
  máximo por volta ≤ 5 s/km** na faixa |g| ≤ 3% (o outlier isolado é o que mina a confiança do
  coach, não a média). Os coeficientes (9.0/4.5) são constantes nomeadas ajustáveis sem mudar
  contrato (mesmo espírito dos thresholds do decoupling).
- **Não-objetivo v1:** trail/montanha (|g| > 10%); modelar custo não-linear completo de Minetti.

## D3 — Pw:HR no DecouplingCalculatorService

- Refatorar o miolo do cálculo para receber um extrator de "intensidade" (`velocidade` ou
  `potência`) — os gates (CV, duração, tipo, metades ponderadas) são idênticos.
- Threshold de cobertura: potência presente em ≥80% da duração elegível (não por contagem de
  etapas — voltas longas pesam mais); abaixo → `decouplingPotenciaPercentual = null`.
- CV de potência: reusar `CV_VEL_MAX` como ponto de partida (constante própria `CV_POT_MAX = 0.15`,
  calibrável).
- **Gate de CV com GAP (extensão):** quando todas as voltas elegíveis tiverem `paceGap`, o CV de
  velocidade pode ser computado sobre a velocidade GAP-ajustada — é isso que destrava percurso
  ondulado. Flag interna, coberta por teste dedicado, sem mudar o resultado de treinos planos (CA4).

## D4 — Exposição na API

- `decouplingPotenciaPercentual` em `TreinoRealizadoOutputDto` (ao lado do `decouplingPercentual`
  atual — semânticas documentadas no `@Schema`).
- Série de EF **somente** no endpoint de detalhe do treino (`GET /api/v1/treinos/{id}` ou
  equivalente atual) — listagens/paginados não carregam a série. Mapper via MapStruct com
  `qualifiedByName`, como o decoupling atual.

## D5 — Composição futura com add-workout-metrics-analyzer

Calculators recebem coleções/valores primitivos (nunca JPA em skills — se algum cálculo migrar
para skill, aplicar o padrão de records de input). Quando o metrics-analyzer chegar com amostras
densas, a resolução por segundo substitui a por volta atrás da mesma interface de resultado; o
lap-based permanece como fallback documentado.

## Pre-mortem (resumo)

- *"GAP diverge do Garmin e mina a confiança do coach"* → calibração empírica na task 3.1 com o CSV
  de referência antes de expor; se erro > meta, expor série sem GAP e adiar o campo.
- *"Refactor do decoupling quebra o Pa:HR existente"* → CA4 fixa golden tests com os valores atuais
  antes do refactor (characterization tests).
- *"Série incha o payload"* → só no detalhe (D4).
- *"Potência parcial distorce o Pw:HR"* → threshold de cobertura ponderado por duração (D3).
