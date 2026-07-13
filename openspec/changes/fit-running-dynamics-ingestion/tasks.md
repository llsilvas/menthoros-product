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

- [ ] 0.1 Compilar uma chamada direta aos 8 getters do design D2 (`LapMesg.getAvgStanceTime()`,
      `getAvgStanceTimeBalance()`, `getAvgStepLength()`, `getAvgVerticalOscillation()`,
      `getAvgVerticalRatio()`, `getAvgTemperature()`, `getTotalTimerTime()`,
      `SessionMesg.getTotalCalories()`) contra `com.garmin:fit:21.205.0` (versão real do `pom.xml`)
      — smoke test isolado, antes de desenhar migration/entidades em cima da tabela D2.
      verify: compila e roda sem erro (mesmo que os valores ainda não sejam usados).

## 1. Migration e entidades

- [ ] 1.1 Migration `V53__Add_running_dynamics_etapa_treino.sql` conforme design D1 (inclui bloco
      `-- Rollback:` e `RAISE NOTICE`, convenção de V51/V52) — conferir a última versão livre em
      `db/migration/` no momento do merge e renumerar se preciso.
- [ ] 1.2 Campos novos em `EtapaRealizada` e `TreinoRealizado` (tipos do design D3).
- [ ] 1.3 Subir contexto com Testcontainers (`./mvnw test -Dtest=*RepositoryTest` ou suíte de
      integração) para validar migration em banco limpo (CA1). Validar: `./mvnw clean test`.

## 2. Parser

- [ ] 2.1 Ampliar `FitLapData`/`FitSessionData` com os campos do design D2/D3, incluindo
      `tempoMovimento: Duration` (nullable).
- [ ] 2.2 `FitParseServiceImpl`: ler os getters de `LapMesg`/`SessionMesg` com conversão de unidade
      (mm→m, mm→cm) — null-safe. `getTotalTimerTime()` usa o helper nullable próprio
      (`tempoMovimentoDeSegundos`, design D2) — **não** `duracaoDeSegundos()`.
- [ ] 2.3 Testes de parser cobrindo presença, ausência e valores-limite das conversões (CA3, CA4) —
      inclui teste específico de `tempoMovimentoDeSegundos(null) == null` (vs. `duracaoDeSegundos`).
      Validar: `./mvnw clean test`.

## 3. Persistência, sanidade e correção de pace/velocidade (CA7)

- [ ] 3.1 `FitTreinoPersister`: mapear lap→`EtapaRealizada` e sessão→`TreinoRealizado`, com faixas
      de sanidade do design D2 (fora da faixa → descarte silencioso, sem log — mesmo padrão de
      `sanitizarElevacao`/`sanitizarPotencia`/`sanitizarCadencia`).
- [ ] 3.2 Testes: dynamics completas persistidas; dispositivo sem sensor → tudo null sem falha;
      valor fora da faixa descartado (CA2, CA4). Validar: `./mvnw clean test`.
- [ ] 3.3 **Correção de pace/velocidade (design D6, CA7):** `duracaoParaVelocidade(lap)` prefere
      `tempoMovimento` sobre `duracao` quando presente e menor; `velocidadeMediaKmh`/`paceMedia`
      passam a usá-la. TDD: `tempoMovimento == null` → comportamento idêntico ao atual (golden);
      `tempoMovimento < duracao` → pace corrigido; `tempoMovimento >= duracao` → mantém `duracao`
      (defensivo).
- [ ] 3.4 **Teste de regressão contra o achado real:** reconstruir os dados das voltas 4/9/10/12 da
      fixture `corrida-15km-16laps.fit` (mesmas que documentaram o desvio de até 239 s/km em
      `fit-lap-derived-metrics`) com `tempoMovimento` presente e confirmar que o pace corrigido cai
      para a faixa das voltas sem pausa (~4,8-8 s/km) — registrar os números aqui.
      verify: `./mvnw clean test` verde; número registrado bate com o critério de CA7.

## 4. Contrato de API

- [ ] 4.1 `EtapaRealizadaOutputDto` + `TreinoRealizadoOutputDto`: campos aditivos com `@Schema`
      (CA5) — mapeamento direto (fluxo comum, design D3), sem restringir ao detalhe.
- [ ] 4.2 Atualizar mapper(s) com null-check padrão; testes de mapper confirmando presença nas
      listagens E no detalhe (diferente da série de EF/envelope de decoupling).
- [ ] 4.3 Conferir Swagger gerado (campos aparecem documentados). Validar: `./mvnw clean test`.

## 5. Validação com arquivo real

- [ ] 5.1 Importar .fit real com running dynamics e comparar campo a campo com o CSV do Garmin
      Connect (GCT, equilíbrio — **incluindo o lado E/D**, passada, oscilação, proporção,
      temperatura, tempo em movimento, calorias) — registrar divergências aqui e resolver a
      assumption do equilíbrio (pé esquerdo, CA3).
- [ ] 5.2 Suíte completa verde: `./mvnw clean test`.
