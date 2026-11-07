# Tasks — inbox-proximo-em-atencao

Só front. Validação de cada bloco: `npm run lint && npm run build && npm run test:run`; E2E onde
indicado. Branch `feat/inbox-proximo-em-atencao` em `apps/menthoros-front`, em worktree, depois
de `inbox-lista-triagem` em `develop` (as três changes do inbox tocam `CoachInboxPage.tsx`;
ordem: barra única → lista → fluxo).

## 1. Próximo em atenção

- [x] 1.1 `coachInboxAdapters.ts`: `nextInAttention(rows: InboxQueueRow[], atualId)` percorre só
      as linhas com `attention`, na ordem em que vêm; devolve o próximo, o primeiro se o atual não
      tem sinal, `null` no último. Teste (CA1, inclusive com linha escondida). verify: `npx vitest run src/features/coach/adapters/coachInboxAdapters`.
- [x] 1.2 `DiagnosisTabPanel`: props `nextInAttention` e `onNext`; botão-link ao fim do painel
      ("Próximo em atenção → {nome}") ou texto "Fim da fila de atenção". Teste de componente.
      verify: `npx vitest run src/features/coach/components/panels/DiagnosisTabPanel`.
- [x] 1.3 `CoachInboxPage`: liga o adapter ao painel; tecla `N` com as guardas do proposal
      (modificadores, `repeat`, `isComposing`, `defaultPrevented`, campos de texto, dialog
      aberto). Teste de componente (CA1, CA2, inclusive Ctrl+N e dialog aberto).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [x] 1.4 Validação: lint, build, test:run.

## 2. Setas e prova condicional

- [x] 2.1 `CoachInboxPage`: `onKeyDown` no contêiner da lista move foco e seleção com `↑`/`↓`
      entre as linhas renderizadas, sem roving tabindex; nas bordas nada acontece; legenda dos
      atalhos na barra a partir de `lg`. Teste de componente (CA3, com bordas).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [x] 2.2 `AthleteNextRace` só com prova e perfil carregado com sucesso; nada no lugar.
      Reescrever os testes de `inbox-proxima-prova` para sem prova, carregando e erro (CA4).
      verify: `npx vitest run src/features/coach/pages/CoachInboxPage`.
- [x] 2.3 Validação: lint, build, test:run.

## 3. E2E

- [x] 3.1 `tests/e2e/coach/inbox.spec.ts`: fila A, B, C → link e tecla `N` percorrem até "Fim da
      fila de atenção"; busca escondendo B pula para C; `N` com o dialog de rejeição aberto não
      muda a seleção; `↓` na lista troca a seleção; sem prova, sem `inbox-proxima-prova`
      (CA1–CA4). verify: `npx playwright test inbox`.
      Detalhes de teste: com o Dialog do MUI aberto o resto da página fica `aria-hidden` (a linha
      é lida pelo `data-inbox-linha`); o Dialog sai com transição, então a guarda do `N` o vê até
      desmontar; o mock do perfil precisa ecoar o `atletaId` da URL, senão a página o trata como
      perfil de outro atleta.
- [x] 3.2 Suite completa; `/qa`; PR → `develop` — https://github.com/llsilvas/menthoros-front/pull/206.
      Parcial (2026-11-07): lint, build, unitários e E2E completo verdes. `/qa` (frontend,
      clean-code, Codex) sem Critical; ajustes em commit próprio: detalhe volta ao topo ao
      avançar (Codex), guarda do `N` por `aria-modal`/`menu`/`listbox`, `composedPath()`, setas
      pelo `closest` do alvo, renomes. Follow-up registrado: legenda de atalhos some abaixo de
      `lg` enquanto o `N` continua ativo. Falta o PR.

## 4. Fechamento

- [x] 4.1 Tasks marcadas; `/done` (PR 206 mergeado em `develop` em 2026-11-07).
