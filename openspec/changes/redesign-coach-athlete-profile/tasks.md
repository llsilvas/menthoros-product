> Repo: `apps/menthoros-front`. Branch `feat/redesign-coach-athlete-profile`. Cada bloco termina
> com `npm run lint && npm run build && npm run test:run`; blocos marcados **E2E** terminam também
> com `npm run test:e2e`.

## Fase 0 — Baseline (antes de qualquer UI nova)

### 0. Instrumentação da tela atual
- [ ] 0.1 Emitir `coach_profile_first_action_ms` (abrir perfil → primeira ação: aprovar, rejeitar,
      editar sugestão, editar treino, dar ciência de prova, dar baixa) pelo mecanismo de telemetria
      já existente no front; sem PII além do id do tenant
- [ ] 0.2 Mergear e medir ≥ 1 semana; registrar a mediana no `proposal.md` (Métrica de sucesso)
      antes de mergear a Fase 3

## Fase 1 — Fundação (sem tocar a página)

### 1. Rótulos, datas e view models
- [ ] 1.1 Criar `features/coach/adapters/enumLabels.ts` (`labelNivel`, `labelObjetivo`,
      `labelTipoTreino`, `labelMotivoAtencao`, `labelSeveridade`, `labelConfianca`,
      `labelStatusSugestao`, `pesoMotivoAtencao`) com fallback capitalizado; extrair o mapa de tipo
      de treino de `TreinoPlanejadoCard` para cá (sem duplicar)
- [ ] 1.2 Criar `utils/dateLabels.ts` (`formatDiaSemana` → `Seg 09/11`, `formatIntervaloSemana` →
      `09–15/11`) com `date-fns/locale/pt-BR`
- [ ] 1.3 Criar `features/coach/types/DecisionCard.ts` e `types/WeekPlanRow.ts` (design D3/D4)
- [ ] 1.4 Testes: `enumLabels.test.ts` (todo enum conhecido + fallback), `dateLabels.test.ts`

### 2. Adapters puros
- [ ] 2.1 `adapters/decisionCardsAdapter.ts` — `buildDecisionCardsFromProfile(profile, detalhes, provasPendentes, contrato, isProprietario)`:
      sugestões `PENDING` → card próprio com `summary`/`confidence` do `detalhe` (Map id →
      `SugestaoCoachOutputDto`); sinais → card próprio (`FADIGA`/`SOBRECARGA` com evidência TSB/ATL
      do último ponto de `pmc` e link "Ver PMC"); fusão sinal+sugestão só quando `sugestaoId`
      vier preenchido; provas pendentes → card; cobrança `OVERDUE` → card só para proprietário;
      ordenação severidade > peso; limite 3 + `extras`; saída inclui `fontesComFalha` a partir de
      `avisos` (`sinaisRecentes`, `sugestoesRecentes`) e de `detalhe` com erro
- [ ] 2.2 `adapters/weekPlanRowsAdapter.ts` — `buildWeekPlanRowsFromProfile(planoVigente, realizadosRecentes, hoje)`:
      7 linhas Seg–Dom; vínculo por `treinoRealizadoId`; `diferente` = tipo realizado ≠ planejado;
      `dor` = `sensacoes ∋ DOR`; estados `FEITO | PERDIDO | PENDENTE | HOJE | DESCANSO`; ação por
      `editable`/`editRejection` reusando `buildLockLabelFromRejection`
- [ ] 2.3 Testes de adapter: ordenação e corte em 3; card de cobrança ausente para não
      proprietário; sugestão sem sinal vira card; sinal com `sugestaoId = null` vira card sem bloco
      IA; `avisos` de sinais/sugestões → `fontesComFalha`; realizado fora de `realizadosRecentes`
      cai para só estado e o total vira `≥`; "Tipo diferente do planejado" só com ambos os tipos
      conhecidos; "Dor relatada"; hoje sem realizado; dia passado perdido; TSS realizado/planejado
      com e sem lacuna — fixtures copiadas de uma resposta real do backend (sem inventar vínculo)

### 3. Componente compartilhado de IA
- [ ] 3.1 Criar `shared/components/AiSuggestionBlock.tsx` (eyebrow + corpo + link opcional) sobre o
      token `aiHighlight`; trocar os usos inline em `ExecucaoAnaliseBanner.tsx` e
      `WorkoutAnalysisCard.tsx` (landing fica fora)
- [ ] 3.2 Teste: renderiza confiança `alta`/`média`, link só quando passado

## Fase 2 — Cabeçalho e abas

### 4. `AthleteProfileHeader` + `AthleteProfileTabs`
- [ ] 4.1 Header em 2 linhas com `h1` (único da página), nível · objetivo via `enumLabels`, chip do
      canal (`CoachWatchLine` compactado + `Popover` com detalhe), chip `Relógio em validação`
      condicional, botão `Ajustar plano` + menu `⋯` (onboarding, kudos, atualizar); sem `Mensagem`
- [ ] 4.2 Abas `Visão geral · Financeiro · Histórico` com `?tab=`; Financeiro só `isProprietario`,
      rótulo com `StatusBadge` `N vencida` quando `billingStatus = OVERDUE`; `role=tablist`, 44px
- [ ] 4.3 Mover `CobrancaAtletaSection` para Financeiro e `PMCChart`, `MelhoresEsforcosPanel`,
      `WeeklyReviewCard`, `AthleteRacesPanel` para Histórico (sem redesenho)
- [ ] 4.4 Remover o `SectionCard` local da página; usar `shared/components/Card` + `CardHeader`
- [ ] 4.5 Testes: `AthleteProfileHeader.test.tsx`, `AthleteProfileTabs.test.tsx` (aba Financeiro
      ausente para não proprietário; `?tab=historico` abre Histórico); atualizar
      `CoachAthleteProfilePage.test.tsx`

## Fase 3 — Faixa de decisão

### 5. `DecisionStrip` + `DecisionCard`
- [ ] 5.1 `DecisionCard` conforme D3 (cabeçalho, evidência, chips, `AiSuggestionBlock`, ações em
      uma linha com `Rejeitar` à direita); borda `danger` em `CRITICA`; título display só no card de
      prova
- [ ] 5.2 `DecisionStrip`: título `Precisa de decisão · N` (+ `+M` com link para Histórico), grid
      3 colunas `align-items: stretch`; não renderiza sem itens **e sem falha**; com
      `fontesComFalha` mostra "Não foi possível carregar as decisões · Tentar de novo" ao lado dos
      cards que carregaram; `detalhe` das sugestões pendentes carregado em paralelo via
      `useSugestaoDecisao` (reusar o fetch de `RecentSuggestionsPanel`)
- [ ] 5.3 Ações: `Aceitar`/`Rejeitar`/`Ajustar` → `useSugestaoDecisao` (aprovar, rejeitar, editar —
      mesmo diálogo de `RecentSuggestionsPanel`); `Revisar prova` → `marcarCiente`; `Dar baixa` →
      `markInvoicePaid`; após sucesso o card some e o contador atualiza sem reload
- [ ] 5.4 Remover `RecentSignalsPanel` e `RecentSuggestionsPanel` da página (arquivos ficam; anotar
      follow-up de remoção)
- [ ] 5.5 Testes: `DecisionCard.test.tsx`, `DecisionStrip.test.tsx` (ações chamam os hooks certos;
      estados loading/erro das ações; card some após aprovar)
- [ ] 5.6 **E2E** `tests/e2e/coach/faixa-decisao.spec.ts`: perfil com sinal + sugestão pendente +
      prova pendente + cobrança vencida → 3 cards na primeira dobra em 1366×768; Aceitar chama
      `POST .../sugestoes/{id}/aprovar` e remove o card; Revisar prova chama `PATCH .../ciente`;
      sugestão aprovada no Inbox não aparece na faixa e vice-versa — fluxo coach-in-the-loop, E2E
      obrigatório

## Fase 4 — Plano da semana

### 6. `WeekPlanList` + `WeekPlanRow`
- [ ] 6.0 Validar a regra "tipo realizado ≠ tipo planejado" numa amostra de atletas do piloto
      contra o vínculo da reconciliação; registrar a taxa de divergência no `proposal.md` (A1);
      > 10% → o chip espera o veredito do backend
- [ ] 6.1 `WeekPlanRow` conforme D4 (grid `84px 1.5fr 1fr 40px`, colunas Dia/Planejado/Realizado/
      Ação, chip informativo `Tipo diferente do planejado` só com ambos os tipos conhecidos e chip
      de alerta `Dor relatada`, linha de hoje destacada, cadeado com `aria-label` de
      `buildLockLabelFromRejection`, lápis abre `TreinoEditDialog`)
- [ ] 6.2 `WeekPlanList`: cabeçalho de colunas, chip de status do plano, `TSS X / Y planejado` com
      `≥` + tooltip quando há vínculo sem detalhe ou sem TSS (nunca zero com treino concluído),
      rodapé; mantém banners `AGUARDANDO_REVISAO` e `ReenvioRelogio` de `CurrentWeekPlan`
- [ ] 6.3 `CurrentWeekPlan` passa a renderizar `WeekPlanList` nesta página; `TreinoPlanejadoCard`
      continua no Inbox sem mudança
- [ ] 6.4 Testes: migrar os casos de `CurrentWeekPlan.test.tsx`, `.aprovado`, `.reenvio`, `.zonas`
      para a lista; novos: dia perdido, diferente do prescrito, dor relatada, hoje
- [ ] 6.5 **E2E** ajustar `editar-treino-aprovado.spec.ts` e `reenvio-relogio.spec.ts` para a
      linha (lápis/cadeado na coluna Ação) — edição de treino aprovado é fluxo crítico

## Fase 5 — Coluna direita

### 7. Cards compactos
- [ ] 7.1 `CobrancaResumo` (proprietário; vencida ou ≤ 7 dias): valor, vencimento, `Dar baixa`,
      link `Abrir contrato` → `?tab=financeiro`
- [ ] 7.2 `DailyLoadChart` (Recharts): barras realizado sólido / planejado tracejado, rótulo de
      valor, eixo por semana, seletor `2 sem · 4 sem · 12 sem` (default 4), `role="img"` +
      `aria-label`, `Dado indisponível` com `avisos ∋ "pmc"`, link `PMC completo` → Histórico
- [ ] 7.3 `AdherenceMini`: até 4 semanas, escala de cor de `coach-athlete-diagnosis`, nota de
      cobertura + link `Ver 8 semanas` → Histórico, `Dado indisponível` com `avisos ∋ "aderenciaSemanal"`
- [ ] 7.4 `SemDadosAinda`: linhas por recurso vazio; some quando ambos têm dado
- [ ] 7.5 Testes dos quatro componentes (inclui `avisos` e proprietário)

## Fase 6 — Densidade, acessibilidade, breakpoints

### 8. Polimento
- [ ] 8.1 Auditar tamanhos: nenhum texto visível < 11px; 11px só eyebrow em `text.secondary`/`primary`;
      corpo ≥ 13px; alvos ≥ 40px; abas 44px (teste de DOM que varre `getComputedStyle`)
- [ ] 8.2 `:focus-visible`, hover com transição 200ms, `prefers-reduced-motion`, `cursor: pointer`
- [ ] 8.3 Breakpoints D8: ≤ 1400 (`76px 296px 1fr 40px`, gap 12), ≤ 900 (coluna única), ≤ 600
      (Realizado sob Planejado); regras de `.row` depois da base
- [ ] 8.4 Varrer a tela por enum cru (`INTERMEDIARIO`, `CONTINUO`, `ADERENCIA`, `ALTA`, `PENDING`)
      em teste de página
- [ ] 8.5 **E2E** `faixa-decisao.spec.ts` roda também em viewport 1366×768 e 1440×900: faixa
      inteira na primeira dobra; linha do plano com dois chips tem a mesma altura de uma sem chips

## Fase 7 — Entrega
- [ ] 9.1 `npm run lint && npm run build && npm run test:run && npm run test:e2e` verdes
- [ ] 9.2 Capturas 1440 e 1366×768 anexadas ao PR, lado a lado com o artboard
- [ ] 9.3 Atualizar `specs/coach-athlete-profile/spec.md` se algum comportamento divergir do design
- [ ] 9.4 Registrar follow-ups: remoção de `RecentSignalsPanel`/`RecentSuggestionsPanel`; veredito
      de reconciliação no DTO (A1); backend preencher `sugestaoId` em `sinaisRecentes` para fundir
      sinal e sugestão num card (A9); card de dor (`add-pain-attention-signal`)
