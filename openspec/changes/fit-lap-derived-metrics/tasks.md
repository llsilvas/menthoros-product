# Tasks: fit-lap-derived-metrics

> Trilha Full — TDD por task; validação `./mvnw clean test` ao final de cada bloco.
> Repo afetado: `apps/menthoros-backend`. Branch: `feature/fit-lap-derived-metrics`
> (criada de `develop` em `cff8b0e`, já com `fit-lap-metrics-parser` mergeada — PR #36).
>
> **Refinado no init (2026-07-13) contra o código real + DoR gate (READY) + adversarial review
> Codex (needs-attention → achados incorporados no design):**
> - Campos reais de elevação: `EtapaRealizada.elevacaoGanhoMetros`/`elevacaoPerdaMetros` (design D2).
> - Endpoint de detalhe real: `GET /api/v1/treinos/realizados/{id}` (`TreinoRealizadoController:172`);
>   seguir o padrão `TreinoMapper:171` (`qualifiedByName`) para os campos novos.
> - `Atleta.pesoKg` é `BigDecimal(5,2)` — insumo do W/kg.
> - **HARD GATE do GAP (Codex high #1):** GAP não é exposto nem altera elegibilidade do decoupling
>   escalar enquanto a matriz de calibração (D2) não passar. Nasce implementado mas desligado.
> - **Pipelines de elegibilidade separados** Pa:HR × Pw:HR (Codex medium #3) — cobertura de
>   potência por METADE, `CV_POT_MAX` independente.
> - **Proveniência em todo escalar derivado** (Codex medium #4) — envelope `DecouplingResultadoDto`
>   com `origem` + `motivoNull` (D4); campo legado `decouplingPercentual` preservado (CA4).
> - **Metadados de reconciliação série × escalar** (Codex medium #5) — `totalVoltas` +
>   `voltasOmitidas` com motivo na série (D1).

## 0. Fixtures de referência

- [x] 0.1 Versionar a fixture principal: copiar o `.fit` real para
      `src/test/resources/fit/corrida-15km-16laps.fit` e criar
      `src/test/resources/fit/corrida-15km-16laps-garmin.csv` com o export do Garmin Connect
      (volta, distância, ritmo médio, GAP médio, FC, subida, descida, potência, cadência).
      verify: teste de smoke parseia a fixture e encontra 16 laps com elevação/potência/cadência.
- [ ] 0.2 Montar a MATRIZ de calibração do GAP (design D2): coletar e versionar .fit adicionais —
      plano, ondulado, net-up/net-down, sem elevação (esteira), autopause/irregular; idealmente
      ≥ 2 dispositivos — cada um com os valores de GAP do Garmin Connect. **Depende de coleta
      manual do founder (exports do Garmin Connect); não bloqueia os blocos 1-2 e 4.** Registrar
      aqui quais fixtures existem e quais faltam.
      verify: cada fixture versionada tem seu par .fit + valores de referência carregável no teste
      de calibração (3.1).
      **Estado (2026-07-13):** só a fixture principal existe (`corrida-15km-16laps`, ondulado leve).
      Faltam: plano, net-up/net-down, sem elevação (esteira), autopause, 2ª fonte — coleta pendente
      do founder. Consequência: hard gate mantém o GAP desligado nesta change (ver 3.4).

## 1. Characterization e refactor do decoupling

- [x] 1.1 Golden tests do Pa:HR atual: fixar valores exatos de `decouplingPercentual` (incluindo
      os cenários de null por gate: CV alto, duração curta, tipo não-contínuo) para 3-4 cenários
      ANTES de tocar no código (proteção do CA4) — usar também a fixture 0.1.
      verify: testes passam contra o código atual, sem nenhuma mudança de produção.
- [x] 1.2 Refatorar o miolo do `DecouplingCalculatorService`: extrair a mecânica compartilhada
      (partição temporal em metades + ponderação por duração) parametrizada por intensidade —
      elegibilidade fica FORA do extrator (design D3, pipelines independentes).
      verify: golden tests de 1.1 verdes sem alteração; `./mvnw clean test` verde.

## 2. Pw:HR (pipeline de elegibilidade próprio)

- [x] 2.1 Implementar o pipeline Pw:HR: cobertura de potência ≥ 80% da duração elegível POR METADE
      (BVA no limite em cada metade; cobertura global alta mas concentrada numa metade → null);
      volta sem potência sai do Pw:HR sem afetar o Pa:HR; `CV_POT_MAX = 0.15` própria; retorno
      inclui o motivo de null (`COBERTURA_POTENCIA_INSUFICIENTE`, `CV_ALTO`, ...).
      verify: testes novos verdes; golden Pa:HR intacto; teste prova Pa:HR calculado com Pw:HR null
      e vice-versa.
- [x] 2.2 Envelope `DecouplingResultadoDto` (design D4: percentual, motivoNull, potenciaPercentual,
      motivoNullPotencia, origem=POR_VOLTA) no `TreinoRealizadoOutputDto` via `TreinoMapper`
      (`qualifiedByName`); campo legado `decouplingPercentual` preservado com o mesmo valor (CA4);
      `@Schema` em todos os campos e enums.
      verify: `./mvnw clean test` verde; teste de mapper confirma legado == envelope.percentual.

## 3. GAP interno (nasce DESLIGADO — hard gate D2)

- [x] 3.1 Implementar `custoRelativo(g)` com constantes nomeadas (9.0 subida / 4.5 descida) +
      gates de sanidade (|g| > 0,10 ou subida+descida > 30% da distância → null) usando
      `elevacaoGanhoMetros`/`elevacaoPerdaMetros`, atrás de flag interna `GAP_HABILITADO = false`.
      Teste de calibração automatizado roda contra TODAS as fixtures da matriz 0.2 disponíveis e
      registra erro médio + desvio máximo POR FIXTURE — registrar os números aqui.
      verify: teste de calibração roda em CI por fixture; com a flag desligada nenhum `paceGap`
      é exposto.
      **Resultado (2026-07-13, fixture corrida-15km-16laps, 15 voltas):** erro médio 29,2 s/km,
      desvio máximo 239 s/km — REPROVADA no critério duplo. Causa dominante: voltas 4/9/10/12 têm
      PAUSA dentro do lap (`totalElapsedTime` 611s vs ~364s de movimento na volta 10) — o pace
      bruto derivado de elapsed diverge do pace do Garmin (que usa timer time). Nas voltas sem
      pausa o erro médio é ~4,8 s/km (máx 8) — a fórmula chega perto, mas o coeficiente 9.0
      parece agressivo vs o GAP do Garmin em gradiente líquido baixo. Consequências: (a) flag
      permanece DESLIGADA (hard gate cumprido); (b) achado transversal: `tempo_movimento` da
      change fit-running-dynamics-ingestion também corrigirá o pace/velocidade derivados em laps
      com pausa; (c) recalibrar quando a matriz tiver fixtures sem pausa e com timer time.
- [x] 3.2 Testes unitários da fórmula: subida → GAP mais rápido que pace bruto; plano → GAP ≈ pace
      (tolerância 1 s/km); |g| > 10% → null; sem elevação → null (CA3).
      verify: `./mvnw clean test` verde.
- [x] 3.3 Gate de CV GAP-ajustado no Pa:HR, CONDICIONADO à mesma flag do 3.1 (design D3): desligado
      reproduz o comportamento atual byte a byte (golden intacto); ligado (só em teste), treino
      plano não muda e treino ondulado hoje reprovado passa a calcular.
      verify: `./mvnw clean test` verde; golden Pa:HR intacto com flag desligada.
- [ ] 3.4 **Decisão de ativação (humana):** quando a matriz 0.2 estiver completa e verde no
      critério duplo (erro médio ≤ 3 s/km E máximo ≤ 5 s/km por fixture elegível), ligar a flag em
      change/commit próprio com os números registrados. NÃO ligar nesta change se a matriz estiver
      incompleta — a change é entregável sem GAP.
      verify: n/a (gate de decisão; fica documentado o estado da matriz no fechamento).

## 4. Série de EF por volta

- [x] 4.1 `LapEfficiencySeriesCalculator` + `LapEfficiencySeries` (origem, totalVoltas,
      voltasOmitidas com motivo) + `LapEfficiencyPoint` (design D1) — reusar a resolução de
      velocidade compartilhada com o decoupling. TDD: elegibilidade por ponto com motivos de
      omissão, W/kg com/sem `pesoKg`, EF de potência com/sem potência (CA1).
      verify: testes novos verdes; voltas omitidas aparecem em `voltasOmitidas` com o motivo certo.
- [x] 4.2 Expor a série no `GET /api/v1/treinos/realizados/{id}` via `TreinoRealizadoOutputDto` +
      `TreinoMapper` (`qualifiedByName`; série só no fluxo de detalhe, design D4) + `@Schema` (CA4).
      verify: `./mvnw clean test` verde; teste de mapper confirma série no detalhe e ausência nas
      listagens.

## 5. Fechamento

- [ ] 5.1 Validação integrada com a fixture 0.1 (16 voltas): série completa com metadados, envelope
      de decoupling com Pw:HR calculado e motivos de null corretos, GAP desligado (nenhum paceGap
      no payload) — registrar os números aqui.
      verify: teste de integração leve (parse fixture → persister → calculators → mapper) verde.
- [ ] 5.2 Suíte completa verde.
      verify: `./mvnw clean test` — 0 falhas.
