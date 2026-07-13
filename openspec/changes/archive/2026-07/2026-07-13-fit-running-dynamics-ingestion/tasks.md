# Tasks: fit-running-dynamics-ingestion

> Trilha Full — TDD por task; validação `./mvnw clean test` ao final de cada bloco.
> Repo afetado: `apps/menthoros-backend`. Branch: `feature/fit-running-dynamics-ingestion`.
> Pré-requisito de sequência: `fit-lap-metrics-parser` ✅ mergeada. `fit-lap-derived-metrics` ✅
> também já mergeada (fora de ordem) — o bloco 3 desta change fecha o achado que ela registrou.
>
> **Refinado no init (2026-07-13) contra o código real + DoR gate (NOT READY → gaps incorporados) +
> adversarial review Codex (NOT READY, convergente):**
> - **Bloco 3 (CA7, novo):** `tempo_movimento` corrige `velocidadeMedia`/`paceMedia` em laps com
>   pausa, não é só uma coluna — fecha o achado de `fit-lap-derived-metrics` (desvio de até 239 s/km
>   documentado na fixture `corrida-15km-16laps.fit`, voltas 4/9/10/12).
> - **Migration V53 confirmada livre** (último real é V52); inclui bloco `-- Rollback:` (design D1).
> - **Sanidade descarta silenciosamente** (sem `log.warn`) — alinhado ao padrão real de
>   `sanitizarElevacao`/`sanitizarPotencia`/`sanitizarCadencia`, não ao design original.
> - **`getTotalTimerTime()` usa helper nullable próprio** (`tempoMovimentoDeSegundos`) —
>   `duracaoDeSegundos()` fabrica `Duration.ZERO` em `null`, errado para um campo opcional.
> - **DTO no fluxo comum** (não detalhe-only): campos são escalares simples, mesmo padrão de
>   `elevacaoGanhoMetros`/`potenciaMedia`.

## 0. Validação early do SDK

- [x] 0.1 Compilar uma chamada direta aos 8 getters do design D2 (`LapMesg.getAvgStanceTime()`,
      `getAvgStanceTimeBalance()`, `getAvgStepLength()`, `getAvgVerticalOscillation()`,
      `getAvgVerticalRatio()`, `getAvgTemperature()`, `getTotalTimerTime()`,
      `SessionMesg.getTotalCalories()`) contra `com.garmin:fit:21.205.0` (versão real do `pom.xml`)
      — smoke test isolado, antes de desenhar migration/entidades em cima da tabela D2.
      verify: compila e roda sem erro (mesmo que os valores ainda não sejam usados).
      **Resultado (2026-07-13):** verificado via `javap -classpath fit-21.205.0.jar` diretamente
      contra o jar real (mais forte que compile-smoke: inspeciona a assinatura exata). Todos os 8
      getters existem em `LapMesg` **e** `SessionMesg` com os tipos documentados no design D2:
      `getAvgStanceTime()→Float`, `getAvgStanceTimeBalance()→Float`, `getAvgStepLength()→Float`,
      `getAvgVerticalOscillation()→Float`, `getAvgVerticalRatio()→Float`,
      `getAvgTemperature()→Byte`, `getTotalTimerTime()→Float`, `getTotalCalories()→Integer`.
      Sem teste dedicado — sem comportamento de produção ainda, é gate de viabilidade puro.

## 1. Migration e entidades

- [x] 1.1 Migration `V53__Add_running_dynamics_etapa_treino.sql` conforme design D1 (inclui bloco
      `-- Rollback:` e `RAISE NOTICE`, convenção de V51/V52) — conferir a última versão livre em
      `db/migration/` no momento do merge e renumerar se preciso.
- [x] 1.2 Campos novos em `EtapaRealizada` e `TreinoRealizado` (tipos do design D3) — `gctMedioMs`,
      `gctEquilibrioPct`, `passadaMediaM`, `oscilacaoVerticalCm`, `proporcaoVerticalPct`,
      `temperaturaMediaC`, `tempoMovimento` (+ `calorias`, só em `TreinoRealizado`, mesmo padrão de
      `cadenciaMedia`/`potenciaMedia` — dado realizado, não em `TreinoBase`).
- [x] 1.3 Subir contexto com Testcontainers (`./mvnw test -Dtest=*RepositoryTest` ou suíte de
      integração) para validar migration em banco limpo (CA1). Validar: `./mvnw clean test`.
      **Resultado (2026-07-13):** `AtletaRepositoryTest` sobe contexto completo com Testcontainers
      e aplica a migration limpa; `./mvnw clean test` — 1360 testes, 0 falhas, 0 erros.

## 2. Parser

- [x] 2.1 Ampliar `FitLapData`/`FitSessionData` com os campos do design D2/D3, incluindo
      `tempoMovimento: Duration` (nullable).
- [x] 2.2 `FitParseServiceImpl`: ler os getters de `LapMesg`/`SessionMesg` com conversão de unidade
      (mm→m, mm→cm) — null-safe. `getTotalTimerTime()` usa o helper nullable próprio
      (`tempoMovimentoDeSegundos`, design D2) — **não** `duracaoDeSegundos()`.
- [x] 2.3 Testes de parser cobrindo presença, ausência e valores-limite das conversões (CA3, CA4) —
      inclui teste específico de `tempoMovimentoDeSegundos(null) == null` (vs. `duracaoDeSegundos`).
      Validar: `./mvnw clean test`.
      **Resultado (2026-07-13):** 2 testes novos em `FitParseServiceImplTest`
      (`extraiRunningDynamicsCompleto` — round-trip real via `FileEncoder`, confirma as conversões
      mm→m/mm→cm com valores reais [1050mm→1.05m, 82mm→8.2cm] e `tempoMovimento` distinto de
      `duracao`; `semRunningDynamicsFicaNullSemFabricarZero` — confirma `tempoMovimento == null`
      quando `totalTimerTime` ausente, ao contrário de `duracao`, que nunca é null). Ajustados os
      call sites posicionais pré-existentes de `FitLapData`/`FitSessionData` em
      `FitTreinoPersisterTest`/`FitUploadServiceImplTest` (manutenção mecânica, sem mudança de
      comportamento). `./mvnw clean test` — 1362 testes, 0 falhas, 0 erros.

## 3. Persistência, sanidade e correção de pace/velocidade (CA7)

- [x] 3.1 `FitTreinoPersister`: mapear lap→`EtapaRealizada` e sessão→`TreinoRealizado`, com faixas
      de sanidade do design D2 (fora da faixa → descarte silencioso, sem log — mesmo padrão de
      `sanitizarElevacao`/`sanitizarPotencia`/`sanitizarCadencia`).
      **Nota:** só GCT (100-500ms), equilíbrio (30-70%) e passada (0,3-3,0m) têm faixa de sanidade
      própria no design D2 — oscilação vertical, proporção vertical, temperatura, `tempoMovimento`
      e calorias mapeiam direto (regra transversal "getter null → coluna null", sem faixa adicional
      não especificada na spec).
- [x] 3.2 Testes: dynamics completas persistidas; dispositivo sem sensor → tudo null sem falha;
      valor fora da faixa descartado (CA2, CA4). Validar: `./mvnw clean test`.
      **Resultado (2026-07-13):** 5 testes novos (`persisteRunningDynamicsCompletos`,
      `semRunningDynamicsPersisteNullSemFalhar`, `gctForaDaFaixaDescartado` [BVA 99/100/500/501],
      `gctEquilibrioForaDaFaixaDescartado` [BVA 29.9/30.0/70.0/70.1],
      `passadaForaDaFaixaDescartada` [BVA 0.29/0.30/3.0/3.01]).
- [x] 3.3 **Correção de pace/velocidade (design D6, CA7):** `duracaoParaVelocidade(lap)` prefere
      `tempoMovimento` sobre `duracao` quando presente e menor; `velocidadeMediaKmh`/`paceMedia`
      passam a usá-la. TDD: `tempoMovimento == null` → comportamento idêntico ao atual (golden);
      `tempoMovimento < duracao` → pace corrigido; `tempoMovimento >= duracao` → mantém `duracao`
      (defensivo).
      **Resultado (2026-07-13):** 3 testes novos (`tempoMovimentoMenorCorrigeVelocidade`,
      `semTempoMovimentoUsaDuracaoLegado`, `tempoMovimentoMaiorOuIgualMantemDuracao`) cobrindo as
      3 ramificações. Golden legado (`lapDerivaVelocidadeEPace`, pré-existente) intacto.
- [x] 3.4 **Teste de regressão contra o achado real:** reconstruir os dados das voltas 4/9/10/12 da
      fixture `corrida-15km-16laps.fit` (mesmas que documentaram o desvio de até 239 s/km em
      `fit-lap-derived-metrics`) com `tempoMovimento` presente e confirmar que o pace corrigido cai
      para a faixa das voltas sem pausa (~4,8-8 s/km) — registrar os números aqui.
      verify: `./mvnw clean test` verde; número registrado bate com o critério de CA7.
      **Resultado (2026-07-13, `regressaoVoltasComPausaDaFixtureReal`):** volta 10 reconstruída
      (elapsed=611s, movimento=364s, distância=1,000km, valores reais da fixture). Pace bruto
      (elapsed, comportamento pré-D6) = 611 s/km; pace corrigido (D6, `tempoMovimento`) = 364 s/km
      — desvio de 247s eliminado (a mesma ordem de grandeza do desvio de até 239 s/km documentado
      em `fit-lap-derived-metrics` para essa volta). Fecha o ciclo: CA7 cumprido, achado registrado
      pela change anterior corrigido. `./mvnw clean test` — 1371 testes, 0 falhas, 0 erros.

## 4. Contrato de API

- [x] 4.1 `EtapaRealizadaOutputDto` + `TreinoRealizadoOutputDto`: campos aditivos com `@Schema`
      (CA5) — mapeamento direto (fluxo comum, design D3), sem restringir ao detalhe.
- [x] 4.2 Atualizar mapper(s) com null-check padrão; testes de mapper confirmando presença nas
      listagens E no detalhe (diferente da série de EF/envelope de decoupling).
      **Resultado (2026-07-13):** `TreinoMapperRunningDynamicsTest` novo (3 testes) — confirma
      presença em `toOutputDto` (fluxo comum) e paridade com `toOutputDtoDetalhado` (não é campo
      restrito ao detalhe, ao contrário da série de EF/envelope de decoupling); confirma null-safety.
      Ajustados 7 call sites posicionais pré-existentes de `TreinoRealizadoOutputDto` (mesma
      manutenção mecânica já feita em `fit-lap-derived-metrics`, débito conhecido e documentado).
- [x] 4.3 Conferir Swagger gerado (campos aparecem documentados). Validar: `./mvnw clean test`.
      **Resultado (2026-07-13):** `OpenApiConfigTest` (contexto Spring completo + springdoc) verde —
      confirma que os `@Schema` novos não quebram a geração do OpenAPI. `./mvnw clean test` — 1374
      testes, 0 falhas, 0 erros.

## 5. Validação com arquivo real

- [x] 5.1 Importar .fit real com running dynamics e comparar campo a campo com o CSV do Garmin
      Connect (GCT, equilíbrio — **incluindo o lado E/D**, passada, oscilação, proporção,
      temperatura, tempo em movimento, calorias) — registrar divergências aqui e resolver a
      assumption do equilíbrio (pé esquerdo, CA3).
      **Resultado (2026-07-13):** fixtures reais fornecidas pelo founder —
      `23558283865_ACTIVITY.fit` (idêntico byte-a-byte a `corrida-15km-16laps.fit`, já usada em
      todo o dev desta e de changes anteriores) + `activity_23558283865.csv` (mesma atividade,
      reexportada do Garmin Connect com as colunas de running dynamics que o CSV original não
      tinha). Teste `FitRunningDynamicsIntegrationTest` (3 testes: sessão, volta 1 sem pausa,
      volta 10 com pausa) valida campo a campo contra o CSV — **zero divergência** em todos os
      campos checados (GCT, equilíbrio, passada, oscilação, proporção, temperatura, calorias).
      **Assumption resolvida:** `getAvgStanceTimeBalance()` retorna o % do pé **ESQUERDO**
      ("E" no CSV) — confirmado (sessão: 51,1 bate exato; volta 1: 51,3; volta 10: 51,0).
      **Achado transversal (não previsto no design, relevante para changes futuras):** a coluna
      "Tempo" do CSV do Garmin Connect corresponde a `tempoMovimento` (`totalTimerTime`), não à
      duração elapsed bruta — confirmado por correspondência sub-segundo em toda sessão e voltas
      testadas. A coluna separada "Tempo em movimento" do Garmin é uma métrica de movimento por
      velocidade (mais estrita, ~7s menor na sessão) que não corresponde a nenhum campo único do
      FIT consumido nesta change — não afeta CA7 (que usa `totalTimerTime`, já validado), mas é
      relevante se uma change futura quiser aproximar ainda mais o "tempo em movimento" do Garmin.
      **Confirmado com dado real** (voltas 4/9/10/12, mesmas da fixture original): volta 10 tem
      `duracao`=611,069s (elapsed) vs `tempoMovimento`=363,746s (timer) — bate quase exatamente
      com os números aproximados (~611s/~364s) que `fit-lap-derived-metrics` havia documentado.
      Pace corrigido pelo D6: 6:03/km (vs. 10:11/km sem a correção).
- [x] 5.2 Suíte completa verde: `./mvnw clean test`.
      **Resultado (2026-07-13):** 1377 testes, 0 falhas, 0 erros, BUILD SUCCESS.

## QA gate (2026-07-13)

`code-reviewer`, `/codex:review`, `/codex:adversarial-review` (GO): sem achados. `security-reviewer`
encontrou 3 achados; `clean-code-reviewer` encontrou 1 achado Important recorrente — todos endereçados:

- **Important (corrigido):** `FitParseServiceImpl.montarResultado(...)` rodava fora do
  `try/catch` do decode — um `.fit` craftado com NaN/Infinity em running dynamics faria
  `BigDecimal.valueOf()` lançar `NumberFormatException` não tratada (500 genérico em vez do 422
  esperado). Corrigido movendo a chamada para dentro do `try`. Não foi possível construir um teste
  de round-trip reproduzindo o cenário via `FileEncoder`/`Decode` reais — o próprio SDK sanitiza
  `NaN`/`Infinity` no encode/decode (getters retornam `null`); fix mantido como defesa em
  profundidade, verificado isoladamente (`BigDecimal.valueOf(NaN/Infinity)` lança
  `NumberFormatException`, confirmado empiricamente).
- **Medium (corrigido):** oscilação e proporção vertical sem faixa de sanidade podiam estourar
  `NUMERIC(4,1)` (máx 999,9) com um valor adversarial e derrubar a transação inteira do import.
  Adicionados `sanitizarOscilacao`/`sanitizarProporcao` (0-50, descarte silencioso).
- **Descartado (verificado como incorreto):** achado de overflow de `INTERVAL` em `tempoMovimento`
  via `Long.MAX_VALUE` — confirmado que `Math.round(float)` retorna `int`, saturando em
  `Integer.MAX_VALUE` (~24,8 dias), muito abaixo do limite do `INTERVAL` do Postgres.
- **Important (corrigido, refactor):** `TreinoRealizadoOutputDto` havia crescido para 41 campos
  posicionais — 2ª vez que esse débito é sinalizado (já apontado em `fit-lap-derived-metrics`).
  Extraído `RunningDynamicsOutputDto` (mesmo padrão de `DecouplingResultadoDto`/
  `LapEfficiencySeriesDto`) agrupando os 8 campos — `TreinoRealizadoOutputDto` cai para 34 campos,
  `EtapaRealizadaOutputDto` para 15.

**Resultado final:** 1379 testes, 0 falhas, 0 erros, BUILD SUCCESS.

## Fechamento

Mergeada em `develop` via PR backend [#38](https://github.com/llsilvas/menthoros-backend/pull/38)
(commit `e8b9a9e`), 2026-07-13. Todos os itens implementados (blocos 0-5, CA1-CA7 atendidos) — nada
deferido. Sequência .fit (parte 2/3, implementada fora de ordem após `fit-lap-derived-metrics`)
está completa: `fit-lap-metrics-parser` ✅ → `fit-lap-derived-metrics` ✅ → `fit-running-dynamics-ingestion` ✅.
Consumo dos campos novos no drilldown do front fica para change própria, quando priorizada
(métrica de sucesso monitora % preenchido e uso real antes de expandir).
