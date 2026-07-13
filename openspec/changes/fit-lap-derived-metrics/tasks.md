# Tasks: fit-lap-derived-metrics

> Trilha Full — TDD por task; validação `./mvnw clean test` ao final de cada bloco.
> Repo afetado: `apps/menthoros-backend`. Branch: `feature/fit-lap-derived-metrics`
> (criada de `develop` em `cff8b0e`, já com `fit-lap-metrics-parser` mergeada — PR #36).
>
> **Refinado no init (2026-07-13) contra o código real + achados do DoR gate (READY):**
> - Campos reais de elevação: `EtapaRealizada.elevacaoGanhoMetros`/`elevacaoPerdaMetros` (design D2 corrigido).
> - Endpoint de detalhe real: `GET /api/v1/treinos/realizados/{id}` (`TreinoRealizadoController:172`);
>   `decouplingPercentual` já flui por `TreinoMapper:171` (`qualifiedByName = "decouplingDeTreino"`) —
>   seguir o mesmo padrão para os campos novos.
> - `Atleta.pesoKg` é `BigDecimal(5,2)` — insumo do W/kg.
> - Fixture de calibração versionada (achado Média do DoR): `.fit` real de 16 laps
>   (`~/Downloads/23558283865_ACTIVITY.fit`, 570 KB) + valores de GAP do Garmin Connect entram em
>   `src/test/resources/fit/` para tornar a calibração reproduzível em CI.
> - Pre-mortem cross-model Codex: comando indisponível na instalação — pre-mortem do design.md vale.

## 0. Fixture de referência

- [ ] 0.1 Versionar a fixture: copiar o `.fit` real para
      `src/test/resources/fit/corrida-15km-16laps.fit` e criar
      `src/test/resources/fit/corrida-15km-16laps-garmin.csv` com o export do Garmin Connect
      (colunas usadas na calibração: volta, distância, ritmo médio, GAP médio, FC, subida, descida,
      potência, cadência).
      verify: teste de smoke parseia a fixture e encontra 16 laps com elevação/potência/cadência.

## 1. Characterization e refactor do decoupling

- [ ] 1.1 Golden tests do Pa:HR atual: fixar valores exatos de `decouplingPercentual` para 3-4
      cenários representativos ANTES de tocar no código (proteção do CA4) — usar também a fixture 0.1.
      verify: testes passam contra o código atual, sem nenhuma mudança de produção.
- [ ] 1.2 Refatorar `DecouplingCalculatorService` para extrator de intensidade (design D3).
      verify: golden tests de 1.1 verdes sem alteração; `./mvnw clean test` verde.

## 2. Pw:HR

- [ ] 2.1 Variante por potência: cobertura ponderada por duração (≥80% da duração elegível) e
      `CV_POT_MAX = 0.15` (constante própria). TDD: cobertura acima/abaixo do threshold (BVA no
      limite de 80%), CV alto → null, gates herdados (duração, tipo) valem para potência.
      verify: testes novos verdes; golden Pa:HR intacto.
- [ ] 2.2 `decouplingPotenciaPercentual` no `TreinoRealizadoOutputDto` + `TreinoMapper`
      (`qualifiedByName`, mesmo padrão da linha 171) + `@Schema` documentando a semântica dos dois
      campos (CA2, CA4).
      verify: `./mvnw clean test` verde; Swagger compila.

## 3. GAP interno

- [ ] 3.1 Implementar `custoRelativo(g)` com constantes nomeadas (9.0 subida / 4.5 descida) +
      gates de sanidade (|g| > 0,10 ou subida+descida > 30% da distância → null) usando
      `elevacaoGanhoMetros`/`elevacaoPerdaMetros`; calibrar contra a coluna "GAP médio" da fixture
      0.1 num teste automatizado — registrar aqui o erro médio E o desvio máximo por volta.
      Critério duplo: erro médio ≤ 3 s/km e máximo ≤ 5 s/km na faixa |g| ≤ 3%; se qualquer um
      falhar, adiar exposição do GAP (não bloqueia a change).
      verify: teste de calibração roda em CI contra a fixture e imprime/assevera as duas métricas.
- [ ] 3.2 Testes unitários: subida → GAP mais rápido que pace bruto; plano → GAP ≈ pace (tolerância
      1 s/km); |g| > 10% → null; sem elevação → null (CA3).
      verify: `./mvnw clean test` verde.
- [ ] 3.3 Gate de CV GAP-ajustado no decoupling (design D3): quando todas as voltas elegíveis têm
      GAP, o CV de velocidade usa a velocidade GAP-ajustada. Teste prova que treino plano não muda
      de resultado (golden intacto) e que treino ondulado hoje reprovado passa a calcular.
      verify: `./mvnw clean test` verde; golden Pa:HR intacto.

## 4. Série de EF por volta

- [ ] 4.1 `LapEfficiencySeriesCalculator` + `LapEfficiencySeries`/`LapEfficiencyPoint` (design D1,
      com `origemCalculo = POR_VOLTA`) — extrair helper comum de resolução de velocidade
      compartilhado com o decoupling. TDD: elegibilidade por ponto (série parcial com buracos),
      W/kg com/sem `pesoKg`, EF de potência com/sem potência (CA1).
      verify: testes novos verdes.
- [ ] 4.2 Expor a série no `GET /api/v1/treinos/realizados/{id}` via `TreinoRealizadoOutputDto` +
      `TreinoMapper` (`qualifiedByName`; série null em listagens — só o fluxo de detalhe a popula,
      design D4) + `@Schema` (CA4).
      verify: `./mvnw clean test` verde; teste de mapper confirma série no detalhe e ausência nas
      listagens.

## 5. Fechamento

- [ ] 5.1 Validação integrada com a fixture 0.1 (16 voltas): série completa, Pw:HR calculado,
      decoupling com gate GAP-ajustado, GAP dentro da meta — registrar os números aqui.
      verify: teste de integração leve (parse fixture → persister → calculators) verde.
- [ ] 5.2 Suíte completa verde.
      verify: `./mvnw clean test` — 0 falhas.
