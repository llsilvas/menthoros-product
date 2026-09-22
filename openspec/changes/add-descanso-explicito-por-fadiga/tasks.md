# Tasks — add-descanso-explicito-por-fadiga

## 1. Sinal de fadiga estruturado (TDD)

- [ ] 1.1 `FatigueSignal` (tipo, valor, limiar, scope WEEK/ACUTE) calculado por completo,
      independente da recomendação do intervalado — os cinco que liberam descanso + CTL_BAIXO
      verify: cada sinal isolado e combinado; degradação do intervalado inalterada
- [ ] 1.2 `PromptGerado` carrega os sinais até o `IaServiceImpl`; dias efetivos materializados
      também em PROXIMA_SEMANA
      verify: `./mvnw clean test`

## 2. Regra de cobertura (TDD)

- [ ] 2.1 `WeeklyCoverageValidator` puro (Decisão 2, itens 1-8, com escopo temporal dos sinais e
      `firstEffectiveDay` pelo menor `DayOfWeek`)
      verify: tabela de cenários verde — CA1-CA7, CA4 (BVA), CA4b (escopo), CA12d (intensos
      adjacentes), CA15 (6-7 dias)
- [ ] 2.1b `SEQUENCIA_ACIMA_DO_MAXIMO` calculado sobre os dias efetivos
      verify: CA12e
- [ ] 2.2 `WeeklyCoverageContext` montado em `IaServiceImpl` (só com a flag ligada e sem skeleton) e
      passado a `PlanoLlmValidator` v1/v2; kill-switch `app.plano.weekly-coverage.enabled` (CA16)
      verify: violações chegam ao `PlanoResilienceService`; mensagem de reparo testada
- [ ] 2.3 `./mvnw clean test`

## 3. Contrato da LLM (TDD)

- [ ] 3.1 `restDays` em `PlanoSemanalLlmDto`/`V2` e no `LlmJsonSchemaBuilder` v1/v2; `minItems` 1,
      `maxItems` 7; `SessionResolver` propaga `restDays`
      verify: asserções estruturais em `LlmJsonSchemaBuilderTest` (v1 e v2); CA11
- [ ] 3.2 Prompt: bloco de cobertura com os sinais ativos (valor, limiar, dia em que liberam) +
      limite; alinhar `DisponibilidadePromptFormatter:110/116` ao campo `restDays` (CA7b)
      verify: golden do prompt; eval modo candidato colado no PR
- [ ] 3.3 `./mvnw clean test`

## 4. Persistência e saída (TDD)

- [ ] 4.1 Migration (próximo número livre; hoje V97) `rest_days JSONB` + mapeamento na entidade
      verify: `@DataJpaTest` com Postgres (Testcontainers) — ida e volta, nulo → vazio
- [ ] 4.2 `PlanGenerationPersister` grava `restDays`; `PlanoSemanalOutputDto.restDays`
      verify: CA8 — `@WebMvcTest` do GET do plano, plano antigo devolve lista vazia
- [ ] 4.3 Sem redistribuição com cobertura validada; `LongRunAnchor.swap`; prova em dia de descanso
      remove o descanso; checagem fail-closed antes de persistir
      verify: CA12, CA12b, CA12c
- [ ] 4.4 Treino criado pelo treinador num dia de descanso remove o descanso
      verify: CA14
- [ ] 4.5 Regra de cobertura desligada com skeleton do planner
      verify: CA13
- [ ] 4.6 Não-regressão: encerramento da semana, aderência, intervals.icu
      verify: plano com descanso não gera PERDIDO nem entra no denominador
- [ ] 4.7 `./mvnw clean verify`

## 5. Entrega

- [ ] 5.1 Geração real para o Leandro (TSB abaixo do limiar): todo dia coberto, descanso com motivo
- [ ] 5.2 Geração real para atleta sem sinal: nenhum descanso, todo dia com treino
- [ ] 5.3 **Gate de promoção:** não abrir/mergear `develop → main` com esta change antes de
      `show-descanso-no-plano` estar mergeada em `develop`
      verify: checklist do PR de promoção
