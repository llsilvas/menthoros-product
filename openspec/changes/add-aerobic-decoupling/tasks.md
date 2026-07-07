# Tasks — add-aerobic-decoupling

> Cross-repo. Ordem: backend (1–2) → contrato (3) → frontend (4–5). Não mergear local; integrar via PR.
> Escopo Opção 1: só `etapasRealizadas` persistidas — sem novo endpoint, sem migration (AC5).
> Validação: backend `./mvnw clean test`; frontend `npm run lint && npm run build && npm run test:run`.

## 0. Pré-requisitos

- [x] 0.1 **Gate de aplicabilidade — DECIDIDO** (proposal/design): CV(FC) ≤ 0.10 **e** CV(vel) ≤ 0.15 entre segmentos + belt-and-suspenders por `TipoTreino` intervalado + ≥2 elegíveis + ≥20 min + ambas as metades válidas; princípio "na dúvida, null". Thresholds como constantes nomeadas. *Aplicar em 1.x.*
- [x] 0.2 **Partição das metades — DECIDIDO:** por tempo acumulado; segmento que cruza o meio dividido **proporcionalmente** por tempo; aquecimento/desaquecimento (`tipoEtapa`) descartados antes. *Aplicar em 1.x.*
- [ ] 0.3 **Confirmar a superfície de UI + o caminho do dado até ela** — bloqueia 4.x/3.x. *(Único pré-requisito que resta; decisão de produto/contrato.)* Apurado no grounding: candidato natural é `DetalheTreinoDialog.tsx` (já mostra realizado + timeline + chips de métrica), mas ele lê `TreinoService.obterTreino` (`GET /api/v1/treinos/{treinoId}`) num tipo com forma de `TreinoPlanejado` — **o front não tem `TreinoRealizadoOutputDto` curado**. Decidir: (a) a superfície escolhida consome de fato uma resposta que inclui `decouplingPercentual`? (b) se o detalhe vier por um endpoint/DTO que **não** é `TreinoRealizadoOutputDto`, o campo precisa ser propagado até esse payload (ou trocar a superfície). **verify:** superfície nomeada + confirmado por `rg` que o tipo/endpoint que ela consome expõe o campo.

## 1. Backend — DecouplingCalculatorService

- [x] 1.1 TDD: `DecouplingCalculatorServiceTest` — o **gate é o alvo prioritário** (cobrir cada predicado + fronteiras, BVA):
  - **Aplicável:** contínuo com decoupling positivo conhecido (valor exato esperado); "melhora" (negativo); segmento que cruza o meio → partição proporcional.
  - **Gate → `null`:** intervalado por `TipoTreino` (belt-and-suspenders); **CV FC fronteira** (0.10 passa / 0.11 reprova); **CV vel fronteira** (0.15 / 0.16); **duração fronteira** (20min passa / 19min reprova); `<2` elegíveis; **laps curtos (<60s) excluídos do CV** e, se sobrar `<2` segmentos ≥60s, → `null`; **aquecimento/desaquecimento não-rotulado (rampa)** eleva o CV → `null`; aquecimento/desaquecimento rotulados descartados antes; metade sem FC/velocidade; FC/vel/duração `= 0`.
  - **Belt-and-suspenders:** `TipoTreino=INTERVALADO` com CV baixo → ainda `null`; guarda defensivo **`tipoTreino=null`** com CV baixo/steady → aplicável (prova que o gate recai no CV) — caminho defensivo, não ocorre no fluxo real (tipo é `nullable=false` na entidade).
- [x] 1.2 Implementar `services/helper/DecouplingCalculatorService.calcular(List<EtapaRealizada> etapas, TipoTreino tipoTreino) : Double` — `TipoTreino` vem **direto de `treino.getTipoTreino()`** (herdado de `TreinoBase`, `nullable=false`; **sem LAZY, sem `treinoPlanejado`**); guarda `if tipoTreino == null` só por robustez. Corpo: elegibilidade + descarte aquecimento/desaquecimento (`tipoEtapa` ∈ {AQUECIMENTO, DESAQUECIMENTO}), gate (constantes nomeadas `CV_FC_MAX=0.10`, `CV_VEL_MAX=0.15`, `DURACAO_MIN_SEG=20min`, `MIN_SEG_DURACAO=60s`), partição proporcional por tempo, `EF = velocidade/FC` ponderado por duração, `(EF1−EF2)/EF1×100`, **null na dúvida**, 1 casa. `velocidadeMedia` é `BigDecimal` (km/h); `duracao`/`paceMedia` são `Duration`; `fcMedia` `Integer`. Reuso possível: `TssCalculatorService.obterDuracaoHoras(Duration)` p/ ponderação (não há helper de pace↔velocidade — converter inline se preciso).
- [x] 1.3 **verify:** `./mvnw -Dtest=DecouplingCalculatorServiceTest test` → 16 testes, 0 falhas.

## 2. Backend — expor no DTO + wiring + testes

- [ ] 2.1 Add `Double decouplingPercentual` a `dto/output/TreinoRealizadoOutputDto.java` (record; `@JsonInclude(NON_NULL)` **já está na classe**) — inserir **após `intensidadeReal` (L84)**, com `@Schema`.
- [ ] 2.2 Wiring **MapStruct** (`mapper/TreinoMapper.java:169`, ponto único p/ ~12 endpoints): registrar `DecouplingCalculatorService` em `@Mapper(uses = {...})` e add `@Mapping(target = "decouplingPercentual", expression = "java(decouplingCalculatorService.calcular(treinoRealizado.getEtapasRealizadas(), treinoRealizado.getTipoTreino()))")`. Alvo é **record imutável** → nada de `@AfterMapping`. `getEtapasRealizadas()` já é mapeado (mesma sessão, sem novo risco LAZY); `getTipoTreino()` é coluna. **Derivado, não persistido** (AC3). **verify:** `./mvnw -q -Dtest=TreinoMapperTest test` verde + geração MapStruct compila.
- [ ] 2.3 Ajustar `TreinoMapperTest`/fixtures p/ o campo novo: presente quando aplicável, **ausente** quando `null` (via `NON_NULL`). Cobrir os endpoints que retornam o DTO (`marcar-realizado`, `lancar-treino`, `PUT /realizados/{id}`, `enriquecer-strava`).
- [ ] 2.4 **verify:** `./mvnw clean test` → BUILD SUCCESS, 0 falhas.

## 3. Contrato — portar para o cliente curado do front

> ⚠️ **Depende do 0.3.** O front **não tem `TreinoRealizadoOutputDto` curado** — o campo pousa no tipo que a superfície escolhida realmente consome (apurado no 0.3). As sub-tarefas abaixo assumem esse tipo já definido.
- [ ] 3.1 `npm run generate:api` para diretório scratch (referência; não sobrescrever a fachada).
- [ ] 3.2 Add `decouplingPercentual?: number` ao **tipo consumido pela superfície do 0.3** (ex.: `types/TreinoPlanejado.ts` se o detalhe vier achatado nesse tipo, ou o model curado correspondente em `src/api`). Portar à mão; não sobrescrever a fachada.
- [ ] 3.3 Se aplicável, alinhar também `types/TreinoRealizado.ts` (interface de envio) para consistência — só se a superfície usar esse tipo.
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
