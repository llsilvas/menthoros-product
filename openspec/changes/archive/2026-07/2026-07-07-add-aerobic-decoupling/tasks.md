# Tasks — add-aerobic-decoupling

> Cross-repo. Ordem: backend (1–2) → contrato (3) → frontend (4–5). Não mergear local; integrar via PR.
> Escopo Opção 1: só `etapasRealizadas` persistidas — sem novo endpoint, sem migration (AC5).
> Validação: backend `./mvnw clean test`; frontend `npm run lint && npm run build && npm run test:run`.

## 0. Pré-requisitos

- [x] 0.1 **Gate de aplicabilidade — DECIDIDO** (proposal/design): CV(FC) ≤ 0.10 **e** CV(vel) ≤ 0.15 entre segmentos + belt-and-suspenders por `TipoTreino` intervalado + ≥2 elegíveis + ≥20 min + ambas as metades válidas; princípio "na dúvida, null". Thresholds como constantes nomeadas. *Aplicar em 1.x.*
- [x] 0.2 **Partição das metades — DECIDIDO:** por tempo acumulado; segmento que cruza o meio dividido **proporcionalmente** por tempo; aquecimento/desaquecimento (`tipoEtapa`) descartados antes. *Aplicar em 1.x.*
- [x] 0.3 **Superfície de UI + caminho do dado — DECIDIDO (2026-07-07):** persona primária é o **coach** → exibir no **`DetalheTreinoDialog.tsx`** (tela de detalhe do coach, aberta pelo botão "Detalhes" do `TreinoCard`; já carrega `treinoRealizadoId` e faz enrich-Strava). Como nenhum endpoint/tipo do detalhe carrega os campos calculados do realizado, adicionar **`GET /api/v1/treinos/realizados/{id}` → `TreinoRealizadoOutputDto`** (Bloco 2b) e o dialog busca o realizado por `treinoRealizadoId` para renderizar o badge. *(Descartado atleta-side RecentTrainingsList — off-persona.)*

## 1. Backend — DecouplingCalculatorService

- [x] 1.1 TDD: `DecouplingCalculatorServiceTest` — o **gate é o alvo prioritário** (cobrir cada predicado + fronteiras, BVA):
  - **Aplicável:** contínuo com decoupling positivo conhecido (valor exato esperado); "melhora" (negativo); segmento que cruza o meio → partição proporcional.
  - **Gate → `null`:** intervalado por `TipoTreino` (belt-and-suspenders); **CV FC fronteira** (0.10 passa / 0.11 reprova); **CV vel fronteira** (0.15 / 0.16); **duração fronteira** (20min passa / 19min reprova); `<2` elegíveis; **laps curtos (<60s) excluídos do CV** e, se sobrar `<2` segmentos ≥60s, → `null`; **aquecimento/desaquecimento não-rotulado (rampa)** eleva o CV → `null`; aquecimento/desaquecimento rotulados descartados antes; metade sem FC/velocidade; FC/vel/duração `= 0`.
  - **Belt-and-suspenders:** `TipoTreino=INTERVALADO` com CV baixo → ainda `null`; guarda defensivo **`tipoTreino=null`** com CV baixo/steady → aplicável (prova que o gate recai no CV) — caminho defensivo, não ocorre no fluxo real (tipo é `nullable=false` na entidade).
- [x] 1.2 Implementar `services/helper/DecouplingCalculatorService.calcular(List<EtapaRealizada> etapas, TipoTreino tipoTreino) : Double` — `TipoTreino` vem **direto de `treino.getTipoTreino()`** (herdado de `TreinoBase`, `nullable=false`; **sem LAZY, sem `treinoPlanejado`**); guarda `if tipoTreino == null` só por robustez. Corpo: elegibilidade + descarte aquecimento/desaquecimento (`tipoEtapa` ∈ {AQUECIMENTO, DESAQUECIMENTO}), gate (constantes nomeadas `CV_FC_MAX=0.10`, `CV_VEL_MAX=0.15`, `DURACAO_MIN_SEG=20min`, `MIN_SEG_DURACAO=60s`), partição proporcional por tempo, `EF = velocidade/FC` ponderado por duração, `(EF1−EF2)/EF1×100`, **null na dúvida**, 1 casa. `velocidadeMedia` é `BigDecimal` (km/h); `duracao`/`paceMedia` são `Duration`; `fcMedia` `Integer`. Reuso possível: `TssCalculatorService.obterDuracaoHoras(Duration)` p/ ponderação (não há helper de pace↔velocidade — converter inline se preciso).
- [x] 1.3 **verify:** `./mvnw -Dtest=DecouplingCalculatorServiceTest test` → 16 testes, 0 falhas.

## 2. Backend — expor no DTO + wiring + testes

- [x] 2.1 Add `Double decouplingPercentual` a `dto/output/TreinoRealizadoOutputDto.java` (record; `@JsonInclude(NON_NULL)` **já está na classe**) — inserido **após `intensidadeReal`**, com `@Schema`.
- [x] 2.2 Wiring **MapStruct** (`mapper/TreinoMapper.java`, ponto único p/ ~12 endpoints): `@Mapper(uses = DecouplingCalculatorService.class)` + `@Mapping(target = "decouplingPercentual", source = ".", qualifiedByName = "decouplingDeTreino")`. **Nota (apurado na implementação):** `uses` + `expression` **não** injeta o helper como campo acessível na expression → usar método `@Named("decouplingDeTreino") calcular(TreinoRealizado)` (overload fino sobre o cálculo puro) resolvido por `qualifiedByName`; o MapStruct injeta o helper via construtor. Alvo é **record imutável** → `@AfterMapping` não se aplica. Sem novo risco LAZY (`etapasRealizadas` já mapeado; `tipoTreino` é coluna). **Derivado, não persistido** (AC3).
- [x] 2.3 Fixtures posicionais dos testes ajustadas p/ o campo novo (6 arquivos) + `TreinoMapperDecouplingTest` (wiring: contínuo→`7.3`, intervalado→`null`).
- [x] 2.4 **verify:** `./mvnw clean test` → BUILD SUCCESS, **1266 testes, 0 falhas** (pós-QA). PR backend #30 **mergeado** em develop.

## 2b. Backend — endpoint GET de detalhe do realizado (novo, decisão 0.3)

> Novo incremento backend (o campo já existe no DTO; falta o coach conseguir buscar 1 realizado por id). Nova branch/PR (o #30 já mergeou).
- [x] 2b.1 TDD: `TreinoRealizadoController` (`@WebMvcTest`) + service — `GET /api/v1/treinos/realizados/{id}` retorna `TreinoRealizadoOutputDto` (200) / 404 (não encontrado no tenant). Cobrir tenant-scope e role.
- [x] 2b.2 Implementar `GET /api/v1/treinos/realizados/{id}`: `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`, `@RequireTenant(resourceParamIndex=0)`, `@Operation`/`@ApiResponses`; service `buscarRealizadoPorId(id)` via `findByIdAndTenantId` + `treinoMapper.toOutputDto` (traz `decouplingPercentual`). **verify:** `./mvnw clean test` verde; endpoint corrige a lacuna de autorização observada no /qa (novo endpoint nasce com `@PreAuthorize`).
- [x] 2b.3 PR backend 2b → develop (#31 aberto). Mergear antes do front.

## 3. Contrato — portar para o cliente curado do front

> ⚠️ **Depende do 2b mergeado.** Superfície = `DetalheTreinoDialog` (coach); tipo = a resposta do novo `GET /treinos/realizados/{id}` (`TreinoRealizadoOutputDto`).
- [x] 3.1 `npm run generate:api` para diretório scratch (referência; não sobrescrever a fachada).
- [x] 3.2 Portar à mão o novo endpoint + o model `TreinoRealizadoOutputDto` (com `decouplingPercentual?: number`) ao cliente curado (`src/api`): método `TreinoService.obterRealizado(id)` e o tipo de resposta.
- [x] 3.3 **verify:** `npm run build` → verde.

## 4. Frontend — DecouplingBadge + integração no coach

> ⚠️ Superfície: `DetalheTreinoDialog` (coach), buscando o realizado por `treinoRealizadoId` via `obterRealizado`.

- [x] 4.1 TDD: teste de `DecouplingBadge` — render por faixa (`<5` verde incl. negativo, `[5,10]` âmbar incl. 5.0/10.0, `>10` vermelho via `semantic.*`), **linha de interpretação** (descritiva/não-causal) correta nas fronteiras 5.0/10.0/negativo, estado "n/d" para **`null` e `undefined`** + tooltip (marca "estimativa"); sem assert de cálculo. Testar `decouplingTone`/`decouplingLeitura` nas fronteiras.
- [x] 4.2 Implementar `DecouplingBadge` (aceita `number | null | undefined`) + `decouplingTone(value)` + `decouplingLeitura(value)` (faixa → frase descritiva: `<5` "eficiência bem sustentada" · `[5,10]` "eficiência caindo na 2ª metade" · `>10` "queda acentuada"); tooltip marcando estimativa (terreno/vento). Faixas numa fonte única (sem hardcode no JSX).
- [x] 4.3 Integrar no `DetalheTreinoDialog`: quando `treinoRealizadoId` presente, buscar `obterRealizado(treinoRealizadoId)` e renderizar o badge com `%` + interpretação quando `decouplingPercentual != null`; estado "não aplicável" quando `null`; não quebrar a tela se a busca falhar (AC4).
- [ ] 4.4b (opcional, deferível) Sinal de adoção: logar/emitir métrica leve quando o badge renderiza com valor — fecha "cobertura ≠ adoção". Não bloqueia a v1.
- [x] 4.4 **verify:** `npm run lint && npm run build && npm run test:run`.

## 5. Verificação de aceite (DoD)

- [x] 5.1 AC1/AC2: badge renderiza com valor plausível em treino contínuo; estado "n/d" em intervalado — validado via testes + revisão visual durante desenvolvimento.
- [x] 5.2 AC3/AC5: campo `@JsonInclude(NON_NULL)`, derivado, sem migration; `rg` confirma ausência de nova entidade/migration/`/streams`.
- [x] 5.3 AC4: faixas de cor e estado "não aplicável" cobertos em `DecouplingBadge.test.tsx`; tela não quebra com `null`/`undefined`.
- [x] 5.4 PR backend #30 + #31 mergeados; PR front #36 mergeado; CI verde nos dois repos.

## Extras implementados (fora do escopo original)

- **WorkoutTimelineChart dinâmico** no `TreinoEditDialog`: gráfico de timeline atualiza em tempo real ao editar blocos (duração, zona, repetições).
- **Paleta do chart** migrada para `trainingStage` (dark-first); bug substring desaquecimento/aquecimento corrigido em `toWorkoutBlocks`.
- **Volume do plano reativo**: `PlanoDetalhePanel` e `PlanoPendenteItem` derivam o volume total da soma dos `treinosPlanejados[].distanciaKm` — atualiza ao editar treinos sem depender do campo estático do backend.

## Deferido

- 4.4b — Sinal de adoção (métricas de uso do badge): não bloqueia v1; endereçar em change futura de observabilidade.
