# Tasks: fix-coach-inbox-suggestion-panel

TDD (teste primeiro). Em `apps/menthoros-front`:

- **Gate:** `npm run lint && npm run build && npm run test:run`
- **E2E:** `npm run test:e2e` quando tocar fluxo coberto por Playwright.

Branch: `feature/fix-coach-inbox-suggestion-panel` (a partir de `develop`).

---

## 1. Resposta obsoleta no `useAthleteProfile` (CA1)

- [ ] 1.1 Teste primeiro: com duas buscas em sequência (A, depois B) e a de A resolvendo por último,
      o hook expõe o perfil de B. Cobrir também erro tardio de A não apagando o perfil de B.
      verify: teste do hook vermelho antes da guarda, verde depois.
- [ ] 1.2 Implementar a guarda por requisição no `fetchProfile`.
      verify: testes dos três consumidores (`CoachInboxPage`, `CoachAthleteProfilePage`,
      `useWeeklyAthleteReview`) seguem verdes.

## 2. Inbox não mistura atletas (CA2)

- [ ] 2.1 Teste primeiro: `CoachInboxPage` com roster em X e perfil de Y não exibe dados de Y
      (cabeçalho/KPIs); mostra carregamento.
      verify: teste da página vermelho antes, verde depois.
- [ ] 2.2 Implementar a checagem `profile.atletaId === selectedRosterItem.atletaId` na montagem do
      `selected`.

## 3. Lista do inbox atualiza após a decisão (CA3)

- [ ] 3.1 Teste primeiro: aprovar pelo painel do inbox chama o refetch do perfil selecionado (e o
      mesmo no caminho 422).
      verify: teste vermelho antes, verde depois.
- [ ] 3.2 Repassar `onDecisao={fetchSelectedProfile}` de `CoachInboxPage` por
      `RacesSuggestionsTabPanel` até `RecentSuggestionsPanel`.

## 4. Dialog em linguagem do coach (CA4)

- [ ] 4.1 Teste primeiro: chips do dialog com rótulos PT-BR; nome interno das regras ausente.
- [ ] 4.2 Reusar os mapas de rótulo da lista nos chips; remover a linha de regras do dialog.

## 5. Fechamento

- [ ] 5.1 Gate completo verde (`lint && build && test:run`, e `test:e2e` se aplicável).
- [ ] 5.2 Revalidação manual no local + homelab: aprovar pelo inbox e ver a lista atualizar; trocar
      rápido de atleta e ver o painel consistente.
- [ ] 5.3 `/qa` e PR para `develop`, sem merge local.
