# Tasks: fit-lap-derived-metrics

> Trilha Full — TDD por task; validação `./mvnw clean test` ao final de cada bloco.
> Repo afetado: `apps/menthoros-backend`. Branch: `feature/fit-lap-derived-metrics`.
> Pré-requisito: `fit-lap-metrics-parser` mergeada (elevação/potência por lap).

## 1. Characterization e refactor do decoupling

- [ ] 1.1 Golden tests do Pa:HR atual: fixar valores exatos de `decouplingPercentual` para 3-4
      cenários representativos ANTES de tocar no código (proteção do CA4).
- [ ] 1.2 Refatorar `DecouplingCalculatorService` para extrator de intensidade (design D3), golden
      tests verdes. Validar: `./mvnw clean test`.

## 2. Pw:HR

- [ ] 2.1 Variante por potência com threshold de cobertura ponderado por duração (≥80%) e
      `CV_POT_MAX`; testes: cobertura acima/abaixo do threshold, BVA no limite.
- [ ] 2.2 `decouplingPotenciaPercentual` no `TreinoRealizadoOutputDto` + mapper + `@Schema` (CA2,
      CA4). Validar: `./mvnw clean test`.

## 3. GAP interno

- [ ] 3.1 Implementar `custoRelativo(g)` com constantes nomeadas + gates de sanidade (design D2);
      calibrar contra a coluna "GAP médio" do CSV de referência — registrar aqui o erro médio E o
      desvio máximo por volta. Critério duplo: erro médio ≤ 3 s/km e máximo ≤ 5 s/km na faixa
      |g| ≤ 3%; se qualquer um falhar, adiar exposição do GAP (não bloqueia a change).
- [ ] 3.2 Testes: subida → GAP mais rápido que pace bruto; plano → GAP ≈ pace; |g| > 10% → null (CA3).
- [ ] 3.3 Gate de CV GAP-ajustado no decoupling (design D3), com teste provando que treino plano
      não muda de resultado. Validar: `./mvnw clean test`.

## 4. Série de EF por volta

- [ ] 4.1 `LapEfficiencySeriesCalculator` + `LapEfficiencyPoint` (design D1) — extrair helper comum
      de resolução de velocidade compartilhado com o decoupling; testes de elegibilidade por ponto,
      W/kg com/sem peso, EF de potência com/sem potência (CA1).
- [ ] 4.2 Expor a série no endpoint de detalhe do treino (design D4) com `origemCalculo=POR_VOLTA`
      no DTO + `@Schema`; teste de mapper e/ou controller sliced. Validar: `./mvnw clean test`.

## 5. Fechamento

- [ ] 5.1 Validar com o treino real do CSV de referência (16 voltas): série completa, Pw:HR
      calculado, GAP dentro da meta — registrar números aqui.
- [ ] 5.2 Suíte completa verde: `./mvnw clean test`.
