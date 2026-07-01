# Tasks — add-aerobic-decoupling

> Cross-repo. Ordem: backend (1–2) → contrato (3) → frontend (4–5). Não mergear local; integrar via PR.
> Escopo Opção 1: só `etapasRealizadas` persistidas — sem novo endpoint, sem migration (AC5).
> Validação: backend `./mvnw clean test`; frontend `npm run lint && npm run build && npm run test:run`.

## 0. Pré-requisitos (decisões bloqueantes)

- [ ] 0.1 Fechar o **gate de aplicabilidade** (variância de zona/FC vs. lista de `TipoTreino`) — Open Question, bloqueia 1.x.
- [ ] 0.2 Fechar o **particionamento das metades** (tempo acumulado; tratamento do segmento que cruza o meio; descarte de aquecimento/desaquecimento) — bloqueia 1.x.
- [ ] 0.3 Confirmar a **superfície de UI** do detalhe do treino realizado onde o indicador entra (`TreinoRealizadoDialog` vs. card vs. painel no perfil) — bloqueia 4.x.

## 1. Backend — DecouplingCalculatorService

- [ ] 1.1 TDD: `DecouplingCalculatorServiceTest` — contínuo (decoupling positivo conhecido), "melhora" (negativo), intervalado → `null`, `<2` segmentos → `null`, metade sem FC/velocidade → `null`, partição por tempo no segmento que cruza o meio.
- [ ] 1.2 Implementar `services/helper/DecouplingCalculatorService.calcular(List<EtapaRealizada>) : Double` — filtro de elegibilidade, gate (0.1), partição por tempo (0.2), `EF = velocidade/FC` ponderado por duração, `(EF1−EF2)/EF1×100`, null-safe, 1 casa. Reusar conversão pace↔velocidade/ponderação se já existir em `TssCalculatorService`/util.
- [ ] 1.3 **verify:** coberto pelo `./mvnw clean test` (2.x).

## 2. Backend — expor no DTO + wiring + testes

- [ ] 2.1 Add `Double decouplingPercentual` a `dto/output/TreinoRealizadoOutputDto.java` (com `@Schema`; `NON_NULL` já é default do record) — append no fim.
- [ ] 2.2 Preencher em `mapper/TreinoMapper.toOutputDto` (ou no service que monta o DTO) chamando `DecouplingCalculatorService` sobre `etapasRealizadas` da entidade. **Derivado, não persistido** (AC3).
- [ ] 2.3 Ajustar `TreinoMapperTest`/fixtures dos endpoints que retornam o DTO (`marcar-realizado`, `lancar-treino`, `PUT /realizados/{id}`, `enriquecer-strava`) para o campo novo.
- [ ] 2.4 **verify:** `./mvnw clean test` → BUILD SUCCESS, 0 falhas.

## 3. Contrato — portar para o cliente curado do front

- [ ] 3.1 `npm run generate:api` para diretório scratch (referência; não sobrescrever a fachada).
- [ ] 3.2 Portar à mão `decouplingPercentual?: number` no model `TreinoRealizadoOutputDto` do cliente curado (`src/api`).
- [ ] 3.3 Add `decouplingPercentual?: number` à interface `TreinoRealizado` em `types/TreinoRealizado.ts`.
- [ ] 3.4 **verify:** `npm run build`.

## 4. Frontend — DecouplingBadge + integração

> ⚠️ Superfície confirmada no 0.3.

- [ ] 4.1 TDD: teste de `DecouplingBadge` — render por faixa (`<5` verde, `5–10` âmbar, `>10` vermelho via `semantic.*`), estado `null` ("n/d") e tooltip; sem assert de cálculo.
- [ ] 4.2 Implementar `DecouplingBadge` + `decouplingTone(value)` (faixa → token); tooltip explicativo ("queda de eficiência pace/FC da 1ª p/ 2ª metade; menor é melhor").
- [ ] 4.3 Integrar no detalhe do treino realizado (0.3): exibir badge quando `decouplingPercentual != null`; estado "não aplicável" quando `null` (AC4).
- [ ] 4.4 **verify:** `npm run lint && npm run build && npm run test:run`.

## 5. Verificação de aceite (DoD)

- [ ] 5.1 AC1/AC2: amostra de treino contínuo (número plausível) e intervalado (`null`) conferida ponta-a-ponta.
- [ ] 5.2 AC3/AC5: payload sem `decouplingPercentual` desserializa ok; `rg` confirma que nenhuma nova migration/entidade/`/streams` foi adicionada.
- [ ] 5.3 AC4: faixas de cor e estado "não aplicável" conferidos visualmente.
- [ ] 5.4 PR backend e PR front abertos (backend primeiro); CI verde nos dois. Não mergear local.
