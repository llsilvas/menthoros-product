> Repo: `apps/menthoros-front`. Branch `feat/redesign-coach-athlete-profile`. Cada bloco termina
> com `npm run lint && npm run build && npm run test:run`; blocos marcados **E2E** terminam também
> com `npm run test:e2e`.

## Fase 0 — Baseline (antes de qualquer UI nova)

### 0. Decisões e instrumentação
- [ ] 0.0 Fechar DP1 (evidência do sinal), DP2 (canal de telemetria) e DP3 (ação do sinal sem
      sugestão) no `proposal.md`; ajustar as tasks marcadas "(DP1)", "(DP2)" e "(DP3)"
- [ ] 0.1 (DP2) **Não há mecanismo de telemetria no front** (`CoachAssessoriaSettingsPage.tsx:106`
      só faz `console.info`). Se DP2 = (a): criar o canal decidido e emitir
      `coach_profile_first_action_ms` (abrir perfil → primeira ação: aprovar, rejeitar, editar
      sugestão, editar treino, dar ciência de prova, dar baixa); sem PII além do id do tenant. Se
      DP2 = (b): pular esta task e a 0.2
- [ ] 0.2 (DP2) Mergear e medir ≥ 1 semana; registrar a mediana no `proposal.md` (Métrica de
      sucesso) antes de mergear a Fase 3
- [ ] 0.3 Remedir o artboard em 1366×625, 1280×600 e 1093×500 (sidebar expandida, 240px): altura
      da faixa de decisão e largura da linha do plano; registrar no `design.md` (D3, D8)
- [ ] 0.4 (DP1 = a) **Backend** (`apps/menthoros-backend`): `SinalRecenteDto` ganha `evidencias`
      mapeadas de `CoachAttentionItemOutputDto.evidence` em `CoachAthleteProfileServiceImpl`
      (hoje descartadas, `:154-159`); teste do mapeamento; tipo do front em
      `src/types/AtletaPerfilCoach.ts`

## Fase 1 — Fundação (sem tocar a página)

### 1. Rótulos, datas e view models
- [ ] 1.1 Criar `features/coach/adapters/enumLabels.ts` (`labelNivel`, `labelObjetivo`,
      `labelTipoTreino`, `labelMotivoAtencao`, `labelSeveridade`, `labelConfianca` com
      `HIGH`/`MEDIUM`/`LOW` → alta/média/baixa, `labelStatusSugestao`, `labelTipoSugestao`) com
      fallback capitalizado. **Sem `pesoMotivoAtencao`** (D2: ordem por rank, sem cópia de pesos).
      Reexportar os mapas existentes, sem duplicar: `tipoTreinoLabel`
      (`features/coach/components/tiposTreino.ts`), `REASON_LABEL` (`coachInboxHelpers.ts`), e um
      único mapa de tipo de sugestão extraído de `SuggestionTypeBadge.tsx` / `TIPO_LABELS`
      (`RecentSuggestionsPanel.tsx:28`)
- [ ] 1.2 Criar `utils/dateLabels.ts` (`formatDiaSemana` → `Seg 09/11`, `formatIntervaloSemana` →
      `09–15/11`) com `date-fns/locale/pt-BR`
- [ ] 1.3 Criar `features/coach/types/DecisionCard.ts` e `types/WeekPlanRow.ts` (design D3/D4)
- [ ] 1.4 Testes: `enumLabels.test.ts` (todo enum conhecido + fallback), `dateLabels.test.ts`
- [ ] 1.5 Corrigir `SugestaoRecenteDto.tipo` em `src/types/AtletaPerfilCoach.ts` para o enum real
      do backend (`PLAN_ADJUST | RECOVERY | NEW_PLAN`, como `SugestaoTipo`); conferir os usos
- [ ] 1.6 Extrair `features/coach/hooks/useSugestoesDetalhe.ts` do fetch de
      `RecentSuggestionsPanel.tsx:229-258`, trocando `Promise.all` por `Promise.allSettled` (Map
      id → detalhe | erro); teste: uma falha não derruba os outros detalhes

### 2. Adapters puros
- [ ] 2.1 `adapters/decisionCardsAdapter.ts` — `buildDecisionCardsFromProfile(profile, detalhes, provasPendentes, contrato, isProprietario)`:
      sugestões `PENDING` → card `SUGESTAO` com `summary`/`confidence` do `detalhe` (Map id →
      `SugestaoCoachOutputDto` | erro; erro → `detalheFalhou`); sinal (no máximo 1) → card `SINAL`
      (`FADIGA`/`SOBRECARGA` com evidência TSB/ATL do último ponto de `pmc` e link "Ver PMC";
      demais evidências conforme DP1); fusão sinal+sugestão só quando `sugestaoId` vier
      preenchido; sinal `PROVA_ATLETA` descartado quando há card de prova e `MENSALIDADE_VENCIDA`
      descartado quando há card de cobrança; um card por prova pendente; cobrança `OVERDUE` → card
      só para proprietário, com o id da mensalidade do contrato; ordenação pelo rank de D2
      (sinal CRITICA > prova curta/alvo trocada > sugestão > sinal ALTA > demais provas >
      cobrança); limite 3 + `extras`; saída inclui `fontesComFalha` a partir de `avisos`
      (`sinaisRecentes`, `sugestoesRecentes`, `cobranca`) e de `detalhe` com erro
- [ ] 2.2 `adapters/weekPlanRowsAdapter.ts` — `buildWeekPlanRowsFromProfile(planoVigente, realizadosRecentes, hoje)`:
      7 linhas Seg–Dom; vínculo por `treinoRealizadoId`; `diferente` = tipo realizado ≠ planejado;
      `dor` = `sensacoes ∋ DOR`; estados `FEITO | PERDIDO | CANCELADO | PENDENTE | HOJE | DESCANSO`;
      `sync` também em `FEITO`; `verRealizado` sempre que há `treinoRealizadoId`; ação por
      `editable`/`editRejection` reusando `buildLockLabelFromRejection`
- [ ] 2.3 Testes de adapter: ordenação pelo rank e corte em 3; card de cobrança ausente para não
      proprietário; sugestão sem sinal vira card; sinal com `sugestaoId = null` vira card sem bloco
      IA; prova pendente + sinal `PROVA_ATLETA` → um card só; motivo desconhecido não lança;
      confiança `LOW` → "baixa"; `detalhe` com erro em 1 de 2 sugestões; `avisos` de
      sinais/sugestões/cobrança → `fontesComFalha`; `CANCELADO`; "Ver realizado" presente em dia
      feito; realizado fora de `realizadosRecentes`
      cai para só estado e o total vira `≥`; "Tipo diferente do planejado" só com ambos os tipos
      conhecidos; "Dor relatada"; hoje sem realizado; dia passado perdido; TSS realizado/planejado
      com e sem lacuna — fixtures copiadas de uma resposta real do backend (sem inventar vínculo)

### 3. Componente compartilhado de IA
- [ ] 3.1 Criar `shared/components/AiSuggestionBlock.tsx` (eyebrow + corpo + link opcional) sobre o
      token `aiHighlight`; trocar os usos inline em `ExecucaoAnaliseBanner.tsx` e
      `WorkoutAnalysisCard.tsx` (landing fica fora)
- [ ] 3.2 Teste: renderiza confiança `alta`/`média`/`baixa`, link só quando passado

## Fase 2 — Cabeçalho e abas

### 4. `AthleteProfileHeader` + `AthleteProfileTabs`
- [ ] 4.1 Header em 2 linhas com `h1` (único da página), nível · objetivo via `enumLabels`, chip do
      canal (marca/modelo de `relogio` + estado de `conexaoCanal`; `Popover` com o conteúdo atual
      de `CoachWatchLine`: texto, `Alert` de compatibilidade, diálogo "O que pedir ao atleta"; sem
      reenvio e sem chip `Relógio em validação`, que não têm dado), botão `Ajustar plano` + menu
      `⋯` (onboarding, kudos, atualizar e, se `add-fit-historico-lote-front` já tiver mergeado, a
      importação de histórico); sem `Mensagem`
- [ ] 4.1b Trocar o `Alert` que imprime as chaves cruas de `avisos`
      (`CoachAthleteProfilePage.tsx:248-252`) por "Dado indisponível" em cada bloco; chave sem
      bloco dono vira rótulo PT-BR
- [ ] 4.2 Abas `Visão geral · Financeiro · Histórico` com `?tab=`; Financeiro só `isProprietario`,
      rótulo com `StatusBadge` `N vencida` quando `billingStatus = OVERDUE`; `role=tablist`, 44px
- [ ] 4.3 Mover `CobrancaAtletaSection` para Financeiro e `PMCChart`, `MelhoresEsforcosPanel`,
      `WeeklyReviewCard`, `AthleteRacesPanel` para Histórico (sem redesenho). Subir
      `useAthleteContract` para a página (uma instância) e passá-lo a `CobrancaAtletaSection`
- [ ] 4.4 Remover o `SectionCard` local da página; usar `shared/components/Card` + `CardHeader`
- [ ] 4.5 Testes: `AthleteProfileHeader.test.tsx`, `AthleteProfileTabs.test.tsx` (aba Financeiro
      ausente para não proprietário; `?tab=historico` abre Histórico); atualizar
      `CoachAthleteProfilePage.test.tsx`

## Fase 3 — Faixa de decisão

### 5. `DecisionStrip` + `DecisionCard`
- [ ] 5.1 `DecisionCard` conforme D3 (cabeçalho, evidência, chips, `AiSuggestionBlock`, ações em
      uma linha com `Rejeitar` à direita); borda `danger` em `CRITICA`; título display só no card de
      prova
- [ ] 5.2 `DecisionStrip`: título `Precisa de decisão · N` (+ `+M` que expande a faixa no lugar),
      grid 3 colunas `align-items: stretch`; não renderiza sem itens **e sem falha**; com
      `fontesComFalha` mostra "Não foi possível carregar as decisões · Tentar de novo" ao lado dos
      cards que carregaram; `detalhe` das sugestões pendentes via `useSugestoesDetalhe` (task 1.6)
- [ ] 5.3 Ações: `Aceitar`/`Ajustar` → `useSugestaoDecisao` (aprovar, editar — mesmo diálogo de
      `RecentSuggestionsPanel`); `Rejeitar` abre o `RejeitarSugestaoModal` atual (motivo opcional,
      extraído de `RecentSuggestionsPanel.tsx:165-215`) e envia o `rejectionReason`;
      `Revisar prova` → `marcarCiente`; `Dar baixa` → `markInvoicePaid(invoiceId)` da instância de
      `useAthleteContract` da página + recarregar contrato e perfil; card de sinal sem sugestão
      conforme DP3. Após sucesso: o card some, o contador atualiza sem reload e
      `layoutContext.refetchQueue()` é chamado (a fila do Inbox é cacheada no `CoachLayout`)
- [ ] 5.3b (depende da ordem com `add-pain-attention-signal`) Sugestão com `acaoProposta`:
      `Ajustar` abre `TreinoEditDialog` no treino-alvo e `Aceitar` mostra o diff antes de
      confirmar; chip `CRITICA` = "Atenção alta". Se aquela change mergear depois, ela faz esta
      task
- [ ] 5.4 Remover `RecentSignalsPanel` e `RecentSuggestionsPanel` da página (arquivos ficam; anotar
      follow-up de remoção)
- [ ] 5.5 Testes: `DecisionCard.test.tsx`, `DecisionStrip.test.tsx` (ações chamam os hooks certos;
      Rejeitar abre o modal e envia o motivo; `refetchQueue` chamado após cada ação; estados
      loading/erro das ações; card some após aprovar; Dar baixa recarrega o perfil)
- [ ] 5.6 **E2E** `tests/e2e/coach/faixa-decisao.spec.ts`: perfil com sugestão pendente + prova
      pendente (que também gera sinal `PROVA_ATLETA`) + cobrança vencida → 3 cards na primeira
      dobra em 1366×625; Aceitar chama `POST .../sugestoes/{id}/aprovar` e remove o card;
      Rejeitar com motivo envia o `rejectionReason`; Revisar prova chama `PATCH .../ciente`;
      sugestão aprovada no Inbox não aparece na faixa e vice-versa, sem reload entre as telas —
      fluxo coach-in-the-loop, E2E obrigatório

## Fase 4 — Plano da semana

### 6. `WeekPlanList` + `WeekPlanRow`
- [ ] 6.0 Validar a regra "tipo realizado ≠ tipo planejado" numa amostra de atletas do piloto
      contra o vínculo da reconciliação; registrar a taxa de divergência no `proposal.md` (A1);
      > 10% → o chip espera o veredito do backend
- [ ] 6.1 `WeekPlanRow` conforme D4 (grid `84px 1.5fr 1fr 88px`, colunas Dia/Planejado/Realizado/
      Ação, cor por `workoutTypeColor`, chip informativo `Tipo diferente do planejado` só com
      ambos os tipos conhecidos e chip de alerta `Dor relatada`, `SyncStatusChip` também em dia
      realizado, estado `Cancelado`, linha de hoje destacada, cadeado com `aria-label` de
      `buildLockLabelFromRejection`, lápis abre `TreinoEditDialog`, `VerRealizadoAcao` em dia com
      realizado)
- [ ] 6.2 `WeekPlanList`: cabeçalho de colunas, chip de status do plano, `TSS X / Y planejado` com
      `≥` + tooltip quando há vínculo sem detalhe ou sem TSS (nunca zero com treino concluído),
      rodapé; mantém banners `AGUARDANDO_REVISAO` e `ReenvioRelogio` de `CurrentWeekPlan`
- [ ] 6.3 `CurrentWeekPlan` passa a renderizar `WeekPlanList` nesta página; `TreinoPlanejadoCard`
      continua no Inbox sem mudança
- [ ] 6.4 Testes: migrar os casos de `CurrentWeekPlan.test.tsx`, `.aprovado`, `.reenvio`, `.zonas`
      para a lista; novos: dia perdido, cancelado, diferente do prescrito, dor relatada, hoje, Ver
      realizado, erro de sync em dia realizado
- [ ] 6.5 **E2E** ajustar `coach/editar-treino-aprovado.spec.ts`, `coach/reenvio-relogio.spec.ts`,
      `coach/suggestion-edit-delta.spec.ts`, `coach/execucao-treino.spec.ts` e
      `athlete/training-loop.spec.ts` (os dois últimos também visitam `/coach/athletes/`) para a
      linha (lápis/cadeado/Ver realizado na coluna Ação) — edição de treino aprovado é fluxo
      crítico

## Fase 5 — Coluna direita

### 7. Cards compactos
- [ ] 7.1 `CobrancaResumo` (proprietário; `billingStatus` `OVERDUE` ou `DUE_SOON`, sem recalcular
      dias): valor, próxima e id da mensalidade da instância de `useAthleteContract` da página,
      vencimento, `Dar baixa` (recarrega contrato e perfil), link `Abrir contrato` →
      `?tab=financeiro`; `avisos ∋ "cobranca"` ou erro do contrato → `Dado indisponível`
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
- [ ] 8.3 Breakpoints D8: ≤ 1400 (`76px minmax(0,1fr) minmax(221px,auto) 88px`, gap 12, meta do
      Planejado truncada com `title`), ≤ 900 (coluna única), ≤ 600 (Realizado sob Planejado);
      regras de `.row` depois da base; conferir com sidebar expandida (240) e recolhida (64)
- [ ] 8.4 Varrer a tela por enum cru (`INTERMEDIARIO`, `CONTINUO`, `ADERENCIA`, `ALTA`, `PENDING`)
      em teste de página
- [ ] 8.5 **E2E** `faixa-decisao.spec.ts` roda em 1440×900, 1366×625, 1280×600 e 1093×500 (os
      mesmos viewports de notebook de `coach-inbox-notebook-height`): faixa inteira na primeira
      dobra; linha do plano com dois chips tem a mesma altura de uma sem chips

## Fase 7 — Entrega
- [ ] 9.1 `npm run lint && npm run build && npm run test:run && npm run test:e2e` verdes
- [ ] 9.2 Capturas 1440 e 1366×625 anexadas ao PR, lado a lado com o artboard remedido
- [ ] 9.3 Atualizar `specs/coach-athlete-profile/spec.md` se algum comportamento divergir do design
- [ ] 9.4 Registrar follow-ups: remoção de `RecentSignalsPanel`/`RecentSuggestionsPanel`; veredito
      de reconciliação no DTO (A1); backend preencher `sugestaoId` em `sinaisRecentes` para fundir
      sinal e sugestão num card (A9); card de dor (`add-pain-attention-signal`); janela de
      `realizadosRecentes` com fuso do tenant em vez de `LocalDate.now()` do servidor (A12)
