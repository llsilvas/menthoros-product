# Tasks — inbox-proximo-em-atencao

Só front. Validação de cada bloco: `npm run lint && npm run build && npm run test:run`; E2E onde
indicado. Branch `feat/inbox-proximo-em-atencao` em `apps/menthoros-front`, em worktree, depois
de `inbox-lista-triagem` em `develop` (as três changes do inbox tocam `CoachInboxPage.tsx`;
ordem: barra única → lista → fluxo).

## 1. Próximo em atenção

- [ ] 1.1 `coachInboxAdapters.ts`: `proximoEmAtencao(ordenados, atualId)` devolve o próximo da
      fila ordenada ou `null` no último. Teste (CA1). verify: `npx vitest run src/features/coach/adapters/coachInboxAdapters`.
- [ ] 1.2 `DiagnosisTabPanel`: props `proximoEmAtencao` e `onProximo`; link ao fim do painel
      ("Próximo em atenção → {nome}" ou "Fim da fila de atenção"). Teste de componente.
      verify: `npx vitest run src/features/coach/components/panels/DiagnosisTabPanel`.
- [ ] 1.3 `CoachInboxPage`: liga o adapter ao painel; tecla `N` (ignora inputs, textarea, select,
      contenteditable e dialog aberto). Teste de componente (CA1, CA2).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [ ] 1.4 Validação: lint, build, test:run.

## 2. Setas e prova condicional

- [ ] 2.1 `CoachInboxPage`: `onKeyDown` no contêiner da lista move foco e seleção com `↑`/`↓`;
      legenda dos atalhos na barra a partir de `lg`. Teste de componente (CA3).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [ ] 2.2 `AthleteNextRace` só com prova; sem prova, link "cadastrar prova" na linha de contexto
      do cabeçalho. Reescrever os testes de `inbox-proxima-prova` (CA4).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [ ] 2.3 Validação: lint, build, test:run.

## 3. E2E

- [ ] 3.1 `tests/e2e/coach/inbox.spec.ts`: fila A, B, C → link e tecla `N` percorrem até "Fim da
      fila"; `↓` na lista troca a seleção; sem prova, sem `inbox-proxima-prova` e com o link
      (CA1–CA4). verify: `npx playwright test inbox`.
- [ ] 3.2 Suite completa; `/qa`; PR → `develop`.

## 4. Fechamento

- [ ] 4.1 Tasks marcadas; `/done`.
