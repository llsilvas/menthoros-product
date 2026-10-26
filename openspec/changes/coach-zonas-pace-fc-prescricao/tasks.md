# Tasks — coach-zonas-pace-fc-prescricao (L · Full · backend + front)

> Branch coordenada nos dois repos; **backend primeiro** (o front consome o endpoint).
> Anchors verificados em 2026-10-26. Absorve `coach-meta-intensidade-editor` — ao arquivar esta,
> arquivar aquela como superseded.

## 0. Discovery e decisões

- [x] **0.1 Fechar Q1** — ✅ 2026-10-26: o eixo é **sempre do treinador**; a regra de D5 é só
  pré-preenchimento trocável num clique, nunca reaplicada depois que ele toca. Registrado em D5
- [ ] **0.2 Medir no banco de dev** quantas etapas têm `ritmoAlvo` e `fcAlvoEtapa` nos formatos
  canônicos (`PACE_FAIXA`, `FC_BPM`), quantas casam uma zona do atleta (tolerância 1 bpm / 2 s) e
  quantas ficariam `PERSONALIZADO` — dimensiona o CA12. Contar antes de olhar linha a linha
- [x] **0.3 Decidir Q3** — ✅ 2026-10-26: RPE típico como referência em cinza com tooltip (opção 2)

## 1. Backend — zonas de pace contíguas (D2, D3)

- [ ] **1.1** `ZonaTreinoService.PACE_FATORES`: Z3 → `{1.00, 1.05}`, Z5 → `{0.90, 0.95}`.
  Javadoc: faixas contíguas, `0.00–0.00` é sentinela "sem limiar" — [CA5]
  - Validação: `./mvnw test -Dtest=ZonaTreinoServiceTest,PaceZoneCalculatorTest,PaceZoneSemanticaTest`
- [ ] **1.2** Teste parametrizado em `ZonaTreinoServiceTest`: para `paceLimiar ∈ {4.00, 5.00, 6.50}`,
  `paceMin(Zn) == paceMax(Zn+1)` para n = 1..5; valores absolutos de Z3/Z4/Z5 com limiar 5.00 — [CA5]
  - Validação: `./mvnw test -Dtest=ZonaTreinoServiceTest`
- [ ] **1.3** Ajustar os testes que fixavam os fatores antigos (`PaceZoneSemanticaTest`,
  `TreinoNormalizadorZonaHelpersTest`, `EvalRunnerTest` se aplicável) — afirmar os novos valores,
  não relaxar a asserção
  - Validação: `./mvnw clean test`
- [ ] **1.4 Eval gate**: `./mvnw -Peval test -Dtest=EvalRunnerTest -Dmodo=candidato`
  (`OPENAI_API_KEY`); colar a tabela no PR do backend — [CA6]

## 2. Backend — `alvoPrimario` na etapa (D6)

- [ ] **2.1** Migration `V<n+1>__add_alvo_primario_etapa_treino.sql`: `alvo_primario VARCHAR(5) NULL
  CHECK (alvo_primario IN ('PACE','FC','NENHUM'))` em `tb_etapa_treino`. Conferir o último `V` antes
  - Validação: `./mvnw clean compile` + subir com `docker compose up -d` e checar Flyway
- [ ] **2.2** `EtapaTreino.alvoPrimario` (enum `AlvoPrimario { PACE, FC, NENHUM }` em `enums/`),
  `EtapaInputDto.alvoPrimario` (opcional, `@Schema`), `EtapaTreinoDto.alvoPrimario`; mappers com
  null-check — [CA10]
  - Validação: `./mvnw test -Dtest=*Mapper*Test`
- [ ] **2.3** `IntervalsIcuWorkoutConverter.stepDeEtapa`: obedecer `alvoPrimario` quando não nulo;
  nulo → derivação atual. Dois testes novos em `IntervalsIcuWorkoutConverterTest` (PACE com FC
  preenchida → emite pace; nulo com os dois → emite FC, como hoje) — [CA10]
  - Validação: `./mvnw test -Dtest=IntervalsIcuWorkoutConverterTest`
- [ ] **2.4** `AtletaTreinoHojeServiceImpl`: mesma regra para `alvoPrimario` do `/me/treinos/hoje`;
  teste em `AtletaTreinoHojeServiceImplTest`
  - Validação: `./mvnw test -Dtest=AtletaTreinoHojeServiceImplTest`
- [ ] **2.5** Persistência via `PATCH /coach/planos/{planoId}/treinos/{id}` e `POST .../treinos`:
  `expandirBloco` propaga `alvoPrimario` às sub-etapas. Teste de serviço cobrindo bloco e etapa avulsa
  - Validação: `./mvnw test -Dtest=PlanoServiceImplTest`

## 3. Backend — endpoint de zonas (D1)

- [ ] **3.1** `CoachAthleteZonesService` (interface) + `CoachAthleteZonesServiceImpl`: monta
  `AthleteTrainingZonesOutputDto` a partir de `ZonaTreinoService` + `PaceZoneCalculator`
  (`calcularZonasAjustadasPorTsbProntidao` com o TSB de prontidão de hoje). Checar `paceLimiar`
  antes de calcular pace (D3). Javadoc `Idempotent/Side Effects/Tenant-aware` — [CA1] [CA2] [CA3]
  - Validação: `./mvnw test -Dtest=CoachAthleteZonesServiceImplTest`
- [ ] **3.2** `CoachAthleteZonesServiceImplTest` (`@Nested`, AssertJ): limiares completos (valores
  absolutos de Z2 e Z6, `fc` de Z6 nulo com motivo); TSB −12 → +7 s/km e `ajusteFadiga`; TSB ≥ 0
  → 0; `paceLimiar` null **e** 0 → `pace` nulo, `motivoPace = SEM_PACE_LIMIAR`, nunca 5,83;
  `fcLimiar` null → `fcLimiarEstimada = true`; cross-tenant → `DomainNotFoundException`
  — [CA1] [CA2] [CA3] [CA4]
  - Validação: `./mvnw test -Dtest=CoachAthleteZonesServiceImplTest`
- [ ] **3.3** DTOs em `dto/output/`: `AthleteTrainingZonesOutputDto` (record, `@JsonInclude(NON_NULL)`,
  `@Schema` em cada campo; pace em `segKm` inteiros; nested `Ancoras`, `AjusteFadiga`,
  `Disponibilidade`, `ZonaDto`)
  - Validação: `./mvnw clean compile`
- [ ] **3.4** `CoachAthleteZonesController` — `GET /api/v1/coach/atletas/{atletaId}/zonas`,
  `@Tag(name = "coach-athlete-zones")`, `@Operation`, `@ApiResponses` (200/404/403),
  `@RequireTenant(resourceParamIndex = 0)`, `@PreAuthorize` igual ao `/perfil`; injeta só a interface
  - Validação: `./mvnw test -Dtest=CoachAthleteZonesControllerTest` (`@WebMvcTest` + `@MockBean`)
- [ ] **3.5** `CoachAthleteZonesControllerIT`: JWT via `jwt()` post-processor (subject UUID, `ROLE_TECNICO`,
  claim `tenant_id`), atleta de outro tenant → 404 — [CA4]
  - Validação: `./mvnw clean verify`
- [ ] **3.6** `./mvnw clean verify` verde no backend; anotar no PR qual comando rodou

## 4. Front — tipos, serviço, hook, tokens

- [ ] **4.1** Gerar o cliente para scratch (`npm run generate:api`), portar à mão:
  `src/api/services/CoachAthleteZonesService.ts` (fachada), `src/types/AthleteTrainingZones.ts`,
  `alvoPrimario` em `EtapaTreinoDto` e `EtapaInputPayload` (`src/types/PlanoReview.ts`). Não
  commitar a saída crua
  - Validação: `npm run build`
- [ ] **4.2** `src/hooks/useAthleteTrainingZones.ts` — `{ zones, loading, error, fetchZones }`,
  `useCallback`, erro nunca engolido. Teste com o serviço mockado (sucesso, erro, 404 → `null`)
  - Validação: `npx vitest run useAthleteTrainingZones`
- [ ] **4.3** `ZoneKey` → `'Z1'|…|'Z6'`; `zone`/`zoneLabel` em `theme.premium.ts` e `zones` em
  `activeTheme.ts` ganham Z6 (cor e rótulo "Sprint"; lightness distinta de Z5 — D9 V10). Abrir PR
  no design system Menthoros adicionando `zone-6` com o mesmo hex. Conferir `tsc` nos consumidores
  (`selectWorkoutProfile`, `ZonesBlock`, `scale.ts`)
  - Validação: `npm run build`
- [ ] **4.4** Util puro `src/features/coach/adapters/intensityFormat.ts`: `formatPaceRange(segMin, segMax)`
  → `"5:22–5:52"`, `toCanonicalPace(seg, seg)` → `"5:22-5:52/km"`, `toCanonicalFc(min, max)` →
  `"143-150 bpm"`, `parseCanonical*` (mesmos regexes do backend), `matchZone(fc?, pace?, zones)` com
  tolerância 1 bpm / 2 s. Testes unitários com BVA nas tolerâncias — [CA8] [CA10]
  - Validação: `npx vitest run intensityFormat`
- [ ] **4.5** `defaultAlvoPrimario(tipoEtapa, zona)` (tabela de D5 — só pré-preenchimento) em
  `src/features/coach/adapters/alvoPrimario.ts`; `@ParameterizedTest`-equivalente com `it.each`
  cobrindo todos os `tipoEtapa` × zonas — [CA9]
  - Validação: `npx vitest run alvoPrimario`

## 5. Front — tabela e cards

- [ ] **5.1** `AthleteZonesTable` (`features/coach/components/`): `Accordion` recolhido, 6 linhas
  (zona com cor, nome, pace, FC ou "— (usar pace)", RPE típico em cinza com tooltip "escala genérica, não medida do atleta", "uso típico" —
  rodagem leve / base e longão / ritmo moderado / contínuo de limiar / tiros 3–5 min / tiros curtos),
  linha de âncoras
  com datas, chip "+N s/km por fadiga" quando `segundosPorKm > 0`, chip "limiar há N dias" com aviso
  > 90. Estados: `loading` (skeleton), `error`, sem pace (coluna "indisponível" + link) — [CA7]
  - Validação: `npx vitest run AthleteZonesTable` (presença dos valores de Z2/Z6, chips, estados)
- [ ] **5.2** `PlanoDetalhePanel`: buscar zonas do `plano.atletaId` (conferir se o DTO traz o id;
  se não, adicionar no backend em 3.x) e renderizar `AthleteZonesTable` entre métricas e treinos — [CA7]
  - Validação: `npx vitest run PlanoDetalhePanel`
- [ ] **5.3** Adapter `buildIntensityLineFromEtapa(etapa, zones)` → `{ zona, pace, fc, primario }`;
  `TreinoTag` (PlanoDetalhePanel) e `TreinoCard` (CurrentWeekPlan) usam para a linha de meta:
  **ordem fixa pace → FC**, primário em `text-primary` + 600, secundário `text-secondary`, sem lime
  (D9 V3/V4); sem `paceLimiar` → só FC + "pace indisponível"; personalizado sem chip (V7) — [CA8] [CA18]
  - Validação: `npx vitest run PlanoDetalhePanel CurrentWeekPlan buildIntensityLine`

## 6. Front — editor (D4, D5, D7, D8)

- [ ] **6.1** `etapaItem.ts`: `StepRow`/`SubStep` ganham `alvoPrimario?: 'PACE'|'FC'|'NENHUM'`;
  `serializarItens` emite `ritmoAlvo`, `fcAlvoEtapa`, `alvoPrimario`; `itensFromEtapas` hidrata.
  Testes de ida e volta (incluindo legado "trote leve" preservado) — [CA10] [CA12]
  - Validação: `npx vitest run etapaItem`
- [ ] **6.2** `ZoneSelector` (`features/coach/components/etapas/ZoneSelector.tsx`): segmented
  Z1–Z6 + Personalizado (≥ 40 px; "Personalizado" selecionado em `surface-raised`, não lime);
  toggle com rótulo visível "Relógio:" (44 px; lime só no segmento selecionado); pills de valor em
  ordem pace → FC sem lime (D9 V3–V6, V8); escolher Zn preenche pace/FC da `zones` e aplica `defaultAlvoPrimario`;
  editar valor → `PERSONALIZADO`; limpar ambos → sem objetivo; toggle `Pace | FC` **sempre visível e
  habilitado** (exceto quando só um eixo existe: Z6 ou limiar ausente), pré-preenchido por
  `defaultAlvoPrimario` só enquanto o treinador não tocou nele; sem `zones` (loading/erro) → só
  campos de valor, sem segmented. Props tipadas — [CA9] [CA14]
  - Validação: `npx vitest run ZoneSelector` (afirmar **valores** preenchidos para Z2 e Z5 de um
    `zones` fixo; troca para Personalizado; sem pace; eixo trocado pelo treinador **não** volta ao
    default ao mudar a zona)
- [ ] **6.3** Avisos inline (`role="alert"`, não bloqueiam): texto legado não parseável (CA12);
  pace e FC em zonas diferentes (CA13); FC fora da faixa típica do `tipoEtapa` (tabela de
  `EtapaFcValidator`, portada como constante no front com comentário apontando a origem)
  - Validação: `npx vitest run ZoneSelector`
- [ ] **6.4** `TreinoEditDialog`: **só a etapa em foco expandida**, as demais como linha resumo
  (`StepSummaryRow`: chip da zona · pace · FC · "relógio X" · ícone de aviso), clique expande (D9 V5)
  — [CA19]; `BlocoCard` troca o `TextField "Zona alvo"` + `RPE` por `ZoneSelector`; `AthleteZonesTable` no topo do conteúdo; footer perde `zonaAlvo` editável e mostra
  a zona derivada (`selectWorkoutProfile(...).targetZone`); `montarPatch` envia `zonaAlvo` derivada
  quando mudou. `blocoStateDe`/`camposDe` passam `ritmoAlvo` e `alvoPrimario` — [CA9] [CA11]
  - Validação: `npx vitest run TreinoEditDialog`
- [ ] **6.5** `TreinoAddDialog`: `QuantRow` usa `ZoneSelector`; remove o `TextField "Zona alvo"`
  de fallback (`:685`) — zona do treino derivada igual ao edit — [CA15]
  - Validação: `npx vitest run TreinoAddDialog`
- [ ] **6.6** Teste de componente de contraste: rótulos de `ZoneSelector`, `AthleteZonesTable` e
  cards resolvem para `text-secondary` (`#94A3B8`), nunca `text-muted`; texto de alerta em
  `text-primary`; nenhum `primary-500` em `TreinoTag`/`TreinoCard` (D9 V1–V3) — [CA17] [CA18]
  - Validação: `npx vitest run ZoneSelector AthleteZonesTable PlanoDetalhePanel`
- [ ] **6.7** `npm run lint && npm run build && npm run test:run` verdes

## 7. E2E (fluxo coach-in-the-loop — obrigatório)

- [ ] **7.1** `tests/e2e/coach/plano-zonas-editor.spec.ts`: login coach → plano em revisão → abre
  "Zonas do atleta" e lê Z5 → edita etapa INTERVALADO → escolhe Z5 → afirma pace e FC preenchidos
  **iguais** aos da tabela → salva → intercepta o `PATCH` e afirma `ritmoAlvo`/`fcAlvoEtapa`
  canônicos e `alvoPrimario = "PACE"` → card mostra `Z5 · pace · fc` — [CA16]
  - Validação: `npm run test:e2e`
- [ ] **7.2** Cenário sem `paceLimiar` (atleta de seed sem pace): seletor preenche só FC, aviso
  visível, `PATCH` sem `ritmoAlvo` — [CA14]
  - Validação: `npm run test:e2e`

## 8. Fechamento

- [ ] **8.1** Atualizar `openspec/specs/fc-limiar-zones/spec.md` e criar
  `openspec/specs/coach-athlete-zones/spec.md` a partir dos deltas desta change
- [ ] **8.2** Arquivar `coach-meta-intensidade-editor` como superseded, com ponteiro para esta
- [ ] **8.3** Abrir change de follow-up: distribuição de intensidade semanal + CTL/ATL + variação vs.
  semana anterior no cabeçalho do plano (fora de escopo aqui); revalidar fatores de pace → já aberta como `revalidar-fatores-pace-zonas`;
  prompt v2 prescrever `alvoPrimario`
- [ ] **8.4** Validar ponta a ponta com conta real no intervals.icu: etapa Z5 com `alvoPrimario = PACE`
  chega ao relógio como alvo de ritmo, não de FC
