# Tasks — add-aerobic-decoupling

> Cross-repo. Ordem: backend (1–2) → contrato (3) → frontend (4–5). Não mergear local; integrar via PR.
> Escopo Opção 1: só `etapasRealizadas` persistidas — sem novo endpoint, sem migration (AC5).
> Validação: backend `./mvnw clean test`; frontend `npm run lint && npm run build && npm run test:run`.

## 0. Pré-requisitos

- [x] 0.1 **Gate de aplicabilidade — DECIDIDO** (proposal/design): CV(FC) ≤ 0.10 **e** CV(vel) ≤ 0.15 entre segmentos + belt-and-suspenders por `TipoTreino` intervalado + ≥2 elegíveis + ≥20 min + ambas as metades válidas; princípio "na dúvida, null". Thresholds como constantes nomeadas. *Aplicar em 1.x.*
- [x] 0.2 **Partição das metades — DECIDIDO:** por tempo acumulado; segmento que cruza o meio dividido **proporcionalmente** por tempo; aquecimento/desaquecimento (`tipoEtapa`) descartados antes. *Aplicar em 1.x.*
- [ ] 0.3 Confirmar a **superfície de UI** do detalhe do treino realizado onde o indicador entra (`TreinoRealizadoDialog` vs. card vs. painel no perfil) — bloqueia 4.x. *(Único pré-requisito que resta.)*

## 1. Backend — DecouplingCalculatorService

- [ ] 1.1 TDD: `DecouplingCalculatorServiceTest` — o **gate é o alvo prioritário** (cobrir cada predicado + fronteiras, BVA):
  - **Aplicável:** contínuo com decoupling positivo conhecido (valor exato esperado); "melhora" (negativo); segmento que cruza o meio → partição proporcional.
  - **Gate → `null`:** intervalado por `TipoTreino` (belt-and-suspenders); **CV FC fronteira** (0.10 passa / 0.11 reprova); **CV vel fronteira** (0.15 / 0.16); **duração fronteira** (20min passa / 19min reprova); `<2` elegíveis; **laps curtos (<60s) excluídos do CV** e, se sobrar `<2` segmentos ≥60s, → `null`; **aquecimento/desaquecimento não-rotulado (rampa)** eleva o CV → `null`; aquecimento/desaquecimento rotulados descartados antes; metade sem FC/velocidade; FC/vel/duração `= 0`.
  - **Belt-and-suspenders:** `TipoTreino=INTERVALADO` com CV baixo → ainda `null`; **`tipoTreino=null`** (treino sem plano) com CV baixo e steady → **aplicável** (número), provando que o gate recai no CV quando o tipo é desconhecido.
- [ ] 1.2 Implementar `services/helper/DecouplingCalculatorService.calcular(List<EtapaRealizada> etapas, TipoTreino tipoTreino) : Double` (o `TipoTreino` é obrigatório para o belt-and-suspenders; passado pelo mapper que já tem o `TreinoRealizado`) — elegibilidade + descarte aquecimento/desaquecimento, gate (constantes nomeadas `CV_FC_MAX=0.10`, `CV_VEL_MAX=0.15`, `DURACAO_MIN_SEG=20min`), partição proporcional por tempo, `EF = velocidade/FC` ponderado por duração, `(EF1−EF2)/EF1×100`, **null na dúvida**, 1 casa. Reusar conversão pace↔velocidade/ponderação de `TssCalculatorService`/util se existir.
- [ ] 1.3 **verify:** coberto pelo `./mvnw clean test` (2.x).

## 2. Backend — expor no DTO + wiring + testes

- [ ] 2.1 Add `Double decouplingPercentual` a `dto/output/TreinoRealizadoOutputDto.java` (com `@Schema`; `NON_NULL` já é default do record) — append no fim.
- [ ] 2.2 Preencher em `mapper/TreinoMapper.toOutputDto` (ou no service que monta o DTO): `TipoTreino tipo = treino.getTreinoPlanejado() != null ? treino.getTreinoPlanejado().getTipoTreino() : null;` (**`treinoPlanejado` é `@ManyToOne LAZY` nullable** — `TreinoRealizado` não tem `tipoTreino` próprio; acessar dentro da transação p/ evitar `LazyInitializationException`, senão passar `null` = CV-only). Chamar `DecouplingCalculatorService.calcular(treino.getEtapasRealizadas(), tipo)`. **Derivado, não persistido** (AC3).
- [ ] 2.3 Ajustar `TreinoMapperTest`/fixtures dos endpoints que retornam o DTO (`marcar-realizado`, `lancar-treino`, `PUT /realizados/{id}`, `enriquecer-strava`) para o campo novo.
- [ ] 2.4 **verify:** `./mvnw clean test` → BUILD SUCCESS, 0 falhas.

## 3. Contrato — portar para o cliente curado do front

- [ ] 3.1 `npm run generate:api` para diretório scratch (referência; não sobrescrever a fachada).
- [ ] 3.2 Portar à mão `decouplingPercentual?: number` no model `TreinoRealizadoOutputDto` do cliente curado (`src/api`).
- [ ] 3.3 Add `decouplingPercentual?: number` à interface `TreinoRealizado` em `types/TreinoRealizado.ts`.
- [ ] 3.4 **verify:** `npm run build`.

## 4. Frontend — DecouplingBadge + integração

> ⚠️ Superfície confirmada no 0.3.

- [ ] 4.1 TDD: teste de `DecouplingBadge` — render por faixa (`<5` verde incl. negativo, `[5,10]` âmbar incl. 5.0/10.0, `>10` vermelho via `semantic.*`), **linha de interpretação** (descritiva/não-causal) correta nas fronteiras 5.0/10.0/negativo, estado "n/d" para **`null` e `undefined`** + tooltip (marca "estimativa"); sem assert de cálculo. Testar `decouplingTone`/`decouplingLeitura` nas fronteiras.
- [ ] 4.2 Implementar `DecouplingBadge` (aceita `number | null | undefined`) + `decouplingTone(value)` + `decouplingLeitura(value)` (faixa → frase descritiva: `<5` "eficiência bem sustentada" · `[5,10]` "eficiência caindo na 2ª metade" · `>10` "queda acentuada"); tooltip marcando estimativa (terreno/vento). Faixas numa fonte única (sem hardcode no JSX).
- [ ] 4.3 Integrar no detalhe do treino realizado (0.3): badge com `%` + interpretação quando `decouplingPercentual != null`; estado "não aplicável" quando `null` (AC4).
- [ ] 4.4b (opcional, deferível) Sinal de adoção: logar/emitir métrica leve quando o badge renderiza com valor — fecha "cobertura ≠ adoção". Não bloqueia a v1.
- [ ] 4.4 **verify:** `npm run lint && npm run build && npm run test:run`.

## 5. Verificação de aceite (DoD)

- [ ] 5.1 AC1/AC2: amostra de treino contínuo (número plausível) e intervalado (`null`) conferida ponta-a-ponta.
- [ ] 5.2 AC3/AC5: payload sem `decouplingPercentual` desserializa ok; `rg` confirma que nenhuma nova migration/entidade/`/streams` foi adicionada.
- [ ] 5.3 AC4: faixas de cor e estado "não aplicável" conferidos visualmente.
- [ ] 5.4 PR backend e PR front abertos (backend primeiro); CI verde nos dois. Não mergear local.
