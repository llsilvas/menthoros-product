# Tasks — coach-zonas-manuais (L · Full · backend + front)

> Desbloqueada: `coach-cadastro-ancoras-zonas` mergeada em `develop` (front #182, backend #209).
> Branch: `feat/coach-zonas-manuais` nos dois repos (worktrees em `.worktrees/coach-zonas-manuais-*`);
> backend primeiro. Decisões e contrato em `design.md`.

## 0. Decisões e design

- [x] **0.1** Q1–Q3 aprovadas (2026-11-04): Q1 apaga com confirmação, Q2 vale igual, Q3 lacuna ok e sobreposição não
- [x] **0.2** Escrever `design.md` — D1 a D8
- [x] **0.3** Mapear consumidores de `ZonaTreinoService` — tabela em `design.md` (7 consomem faixa; 4 com teste de contrato)
- [x] **0.4** Critérios de aceite e delta de spec em `specs/coach-athlete-zones/spec.md`

## 1. Backend (`.worktrees/coach-zonas-manuais-backend`)

- [x] **1.1** Migration `V108` + `Atleta` (`modoZonasFc/Pace`, `zonasManuaisFc/Pace` JSONB) + record `FaixaZonaManual` — D1
  - verify: teste de integração de repositório grava e relê as faixas; CHECK rejeita `MANUAL` sem faixas
- [x] **1.2** `AthleteZoneManualValidator` — D4 [CA3]
  - verify: um teste por regra (zona faltando/repetida, `min ≥ max`, limites, sobreposição, ordem) + lacuna e borda aceitas
- [x] **1.3** Precedência: `ZonaTreinoService.calcularZonasFC/Pace(Atleta|AthleteZones)`, `AthleteZones.de(Atleta)`,
  `ZoneResolver`/`SessionResolver`/`IaServiceImpl`, `IntervalsIcuFcAlvoResolver` (ZONE manual sem limiar),
  `PlanoLlmValidator.contexto` (condição aceita FC manual), `identificarZona*`, todos os fallbacks do `PlanoTreinoPromptBuilder`, barreira de máxima no `ZONE` manual, classificação com lacuna/borda — D2 [CA1, CA2, CA4]
  - verify: testes de contrato — prompt lista Z2 manual; `ZoneResolver.bpm(Z2)` manual; push ZONE manual sem `fcLimiar`; `zonasFC` do contexto da v1 com FC manual sem limiar nem máxima; eixos independentes; ida e volta s/km→min/km→s/km de 120 a 900; prompt completo com pace manual sem limiar (sem "USAR APENAS FC"); Z5 manual acima da máxima descartada no push; `identificarZonaFC` em lacuna, borda, abaixo de Z1 e acima do topo
  - depende de: 1.1
- [x] **1.4** `PUT .../zonas/manuais` (`UPDATE` atômico por eixo) + `modos`, faixa efetiva e `pacePeloLimiar`/`fcPeloLimiar` no GET + `disponibilidade.pace`/ajuste com pace manual — D3 [CA2, CA5]
  - verify: `@WebMvcTest` (200, 400 com `fields`, 404 de outro tenant), `@ApiResponse` 200/400/401/403/404 no controller, + teste do serviço (LIMIAR apaga as faixas, grupo ausente mantém, dois PUTs de eixos diferentes preservam os dois, `pacePeloLimiar` ausente sem limiar)
  - depende de: 1.1, 1.2, 1.3
- [x] **1.5** Eval gate da prescrição com atleta em `MANUAL` — [CA6]
  - baseline (antes da 1.3, 2026-11-04): `intermediario-1.json` 3 comparados, 2 divergências. Depois da 1.4: idem.
  - O set real tem uma fixture só, em **schema v1** (zona não passa pelo `SessionResolver`) e selada por
    `manifest.sha256`; o `EvalAgreementGrader` compara só `tipoTreino` e `tssPlanejado`. Uma fixture
    sintética em MANUAL não mediria nada e furaria a premissa de dado real. O caso manual ficou em
    `SessionResolverTest.zonasManuaisChegamNaEtapa` (etapa v2 com Z2 manual → `140-150 bpm`, `5:20-5:50/km`).
  - verify: `./mvnw clean verify` + `./mvnw -Peval test -Dtest=EvalRunnerTest` (auditoria): fixture manual com 0 divergências de zona, demais iguais ao baseline; `-Dmodo=candidato` só com `OPENAI_API_KEY`, como registro
  - depende de: 1.3

## 2. Front (`.worktrees/coach-zonas-manuais-front`)

> Começar depois de `fix/coach-cadastro-ancoras-zonas-previa` entrar em `develop` (mexe em
> `AthleteZonesDialog.tsx`/`zoneAnchors.ts`), ou rebasear sobre ela.

- [ ] **2.0** Cliente curado: `salvarZonasManuais` em `CoachAthleteZonesService`, `modos`/`*PeloLimiar` em `AthleteTrainingZones`; `aplicarZona` aceita FC com `modos.fc === 'MANUAL'`
  - verify: `npm run build` + Vitest de `aplicarZona` com FC manual e `fcLimiarEstimada = true`
  - depende de: 1.4
- [ ] **2.1** `validateManualZones` (adapter puro) + seletor de modo por aba, tabela De/Até pré-preenchida,
  "Recalcular a partir do limiar" (de `*PeloLimiar`, desabilitado sem limiar) com confirmação, validação inline, confirmação ao voltar de manual, salvar em sequência âncoras → manuais com falha parcial — D7 [CA3]
  - verify: Vitest do validador; Testing Library do diálogo (alternar, editar, erro com `aria-invalid`, recalcular, recalcular indisponível, salvar, falha só da 2ª chamada)
- [ ] **2.1b** Aviso ao salvar limiar de eixo em `MANUAL`, com "Recalcular a partir do limiar" — D7
  - verify: teste de componente do cenário "Limiar novo com eixo manual"
- [ ] **2.2** Chip de modo no card — [CA5]
  - verify: teste de componente "FC: pelo limiar · Ritmo: manual"
- [ ] **2.3** E2E: modo manual de ritmo refletido no card e no seletor de zona — [CA7]
  - verify: `npm run lint && npm run build && npm run test:run && npm run test:e2e`

## 3. Métrica

- [ ] **3.1** Consulta da métrica de sucesso, registrada aqui e rodada em produção aos 60 dias do deploy:
  `% de atletas ativos com modo_zonas_fc = 'MANUAL' OR modo_zonas_pace = 'MANUAL'` por tenant, e
  quantos desses tiveram treino enviado ao relógio (intervals.icu/Garmin) depois de entrar em manual.
  Sem instrumentação nova: o "depois de entrar em manual" usa o `updated_at` do atleta como
  aproximação (limite conhecido — subestima se o atleta foi editado depois).
  - verify: a consulta roda no ambiente de testes e devolve números coerentes com os atletas de teste
