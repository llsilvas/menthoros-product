# Tasks: fix-coach-inbox-suggestion-panel

TDD (teste primeiro). Em `apps/menthoros-front`:

- **Gate:** `npm run lint && npm run build && npm run test:run`
- **E2E:** `npm run test:e2e` — obrigatório aqui: a decisão sobre sugestão é fluxo coach-in-the-loop.

Branch: `feature/fix-coach-inbox-suggestion-panel`, base `e1028e6` em `develop` (2026-09-28).

Sequência: 1 → 2 → 3 → 4 → 5. A seção 2 depende da 1 (o inbox passa a confiar no `atletaId` do
perfil exposto pelo hook); 3 e 4 são independentes entre si.

---

## 1. `useAthleteProfile` descarta resposta que não é do atleta atual (CA1)

- [x] 1.1 Teste primeiro, em `src/hooks/useAthleteProfile.test.ts`:
      (a) A e depois B via `rerender`, A resolvendo por último → `profile` é B;
      (b) erro tardio de A não zera o perfil nem seta `error` de B;
      (c) `finally` de A não desliga `isLoading` enquanto B está pendente;
      (d) `fetchProfile` capturado em A, chamado depois da troca para B, não sobrescreve B;
      (e) trocar de A para B (ou para `undefined`) deixa de expor o perfil de A imediatamente.
      verify: casos novos vermelhos antes da guarda, verdes depois.
- [x] 1.2 Implementar: ref com o `atletaId` corrente; cada `fetchProfile` confere, após o `await`, que
      o id que buscou ainda é o corrente antes de tocar em qualquer estado (`profile`, `isLoading`,
      `error`, `errorKind`); o retorno expõe `profile` só quando `profile.atletaId === atletaId`.
      verify: `useAthleteProfile.test.ts`, `CoachInboxPage.test.tsx` e
      `CoachAthleteProfilePage.test.tsx` verdes.

## 2. Inbox não mistura atletas (CA2)

- [x] 2.1 Teste primeiro em `CoachInboxPage.test.tsx`: roster com X selecionado e hook devolvendo
      perfil de Y → cabeçalho/KPIs/diagnóstico não mostram dados de Y; a faixa "Carregando o
      detalhe do atleta…" aparece; o nome exibido é o de X (do roster).
      verify: vermelho antes, verde depois.
- [x] 2.2 Implementar em `CoachInboxPage.tsx`: perfil só é usado quando
      `selectedProfile?.atletaId === selectedRosterItem?.atletaId` — em `selected`, `selectedPmc` e
      nos painéis; `selected` continua montado a partir do roster (não anular — erro e retry vivem
      nesse ramo). Faixa de carregamento também quando o perfil é de outro atleta.
      verify: `CoachInboxPage.test.tsx` verde.

## 3. Lista do inbox atualiza após a decisão (CA3)

- [x] 3.1 Teste primeiro em `CoachInboxPage.test.tsx` (aba "Provas e sugestões"): aprovar pelo dialog
      chama o `fetchProfile` do hook e, com o perfil recarregado, a lista mostra o novo status;
      idem no 422 com reconsulta terminal.
      verify: vermelho antes, verde depois.
- [x] 3.2 Adicionar `onDecisao?: () => void` em `RacesSuggestionsTabPanel` e repassar
      `fetchSelectedProfile` de `CoachInboxPage` até `RecentSuggestionsPanel`.
      verify: `CoachInboxPage.test.tsx` e `RecentSuggestionsPanel.test.tsx` verdes.

## 4. Dialog em linguagem do coach (CA4)

- [x] 4.1 Teste primeiro em `RecentSuggestionsPanel.test.tsx`: chips do dialog com "Ajuste de plano"
      e "Média" (não `PLAN_ADJUST`/`MEDIUM`); texto de `sourceRules` ausente.
      verify: vermelho antes, verde depois.
- [x] 4.2 Reusar `TIPO_LABELS`/`CONFIDENCE_LABELS` (`RecentSuggestionsPanel.tsx:27,69`) nos chips do
      dialog; remover a linha "Regras:". Vale também para o dialog no perfil do atleta (mesmo
      componente).
      verify: `RecentSuggestionsPanel.test.tsx` e `CoachAthleteProfilePage.test.tsx` verdes.

## 5. Fechamento

- [x] 5.1 E2E em `tests/e2e/coach/inbox.spec.ts`: aprovar uma sugestão pelo inbox e ver a lista
      mostrar o novo status sem reload.
      verify: `npm run test:e2e` verde e o spec passa pelo fluxo de aprovação.
- [x] 5.2 Gate completo verde (`lint && build && test:run && test:e2e`).
- [ ] 5.3 Revalidação manual no local + homelab: aprovar pelo inbox e ver a lista atualizar; trocar
      rápido de atleta e ver o painel consistente.
- [ ] 5.4 `/qa` e PR para `develop`, sem merge local.
