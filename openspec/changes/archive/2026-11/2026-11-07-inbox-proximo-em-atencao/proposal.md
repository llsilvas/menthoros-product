**Tamanho:** S · **Trilha:** Fast (só front; sem contrato; cabeçalho do atleta, Diagnóstico e teclado)

# Proposal — inbox-proximo-em-atencao

## Why

Prioridade 3 da crítica de design do `/coach/inbox` (2026-11-07). A tela é de triagem, mas não
tem fluxo de triagem: depois de agir num atleta em atenção, nada leva ao próximo — o coach volta
à lista, procura o próximo vermelho, clica. Com 20 atletas isso é a maior parte do tempo da
rotina. Dois complementos menores no cabeçalho do atleta:

- "Próxima prova — Sem prova cadastrada" ocupa o lugar ao lado do CTA para dizer que não há
  dado, e empurra as ações para uma segunda linha em 1366px. Não existe tela de cadastro de prova
  por link (`CoachCalendarPage` não lê `?atleta=`), então nada substitui o bloco: ele só some.
- Sem atalho de teclado, a lista só se percorre com o mouse.

Correção à crítica original: a evidência da fila (`attention.evidence`, `explanation`) **já** é
renderizada no Diagnóstico pelo `AIInsightCard` quando existe (E2E "o detalhe do atleta em atenção
mostra o insight em seções"). O item "evidência no diagnóstico" sai; o que entra é o fluxo.

## What Changes

Só `apps/menthoros-front`, `CoachInboxPage` e `DiagnosisTabPanel`.

- **Próximo em atenção**: ao fim do Diagnóstico de um atleta com sinal, um link "Próximo em
  atenção → {nome}" seleciona o próximo. A fila percorrida é a das **linhas visíveis com sinal**
  (`inboxQueue.rows` com `attention`, que `buildInboxQueue` já devolve na ordem da fila:
  severidade, depois `priorityScore`) — nunca alguém escondido por busca ou filtro, porque a
  página reverte a seleção para a primeira linha visível. Sem circular: no último, "Fim da fila
  de atenção" sem link. Com o selecionado fora da fila, "próximo" é o primeiro com sinal. Tecla
  `N` faz o mesmo quando: sem Ctrl/Meta/Alt, sem `repeat`, sem `isComposing`, sem
  `defaultPrevented`, alvo fora de `input`/`textarea`/`select`/`contenteditable` e nenhum
  `[role="dialog"]` aberto.
- **Atalhos na lista**: com foco numa linha, `↑`/`↓` movem foco e seleção para a linha vizinha
  renderizada (sem roving tabindex: as linhas continuam na sequência de Tab como hoje; nas
  bordas nada acontece; troca de página fica para a paginação). A barra do topo mostra a legenda
  dos atalhos a partir de `lg` (`↑↓ atleta · N próximo em atenção`), em `surface-400`.
- **Prova só quando existe**: o bloco `AthleteNextRace` aparece só com prova **e perfil
  carregado com sucesso**; durante o carregamento, em erro e sem prova, nada aparece no lugar.

## Non-Goals

- "Visto"/"adiar" um sinal: precisa de backend (estado por treinador). Proposta separada.
- Link "cadastrar prova": não há destino real; entra quando a prova tiver cadastro por rota.
- Mudar a ordem da fila ou o cálculo de `priorityScore`.
- Lista e filtros: `inbox-lista-triagem`.

## Impact

- `src/features/coach/pages/CoachInboxPage.tsx`: seleção por teclado, `N`, legenda; prova
  condicional. `src/features/coach/components/panels/DiagnosisTabPanel.tsx`: link "Próximo em
  atenção" (prop `nextInAttention: { atletaId; nome } | null` + `onNext`).
- `src/features/coach/adapters/coachInboxAdapters.ts`: `nextInAttention(rows, atualId)` sobre
  `InboxQueueRow[]`.
- Testes de componente e `tests/e2e/coach/inbox.spec.ts`.

## Critérios de aceite

1. **Próximo** — Given 3 na fila (A, B, C) visíveis e A selecionado, When o coach clica "Próximo
   em atenção → B", Then B fica selecionado e o Diagnóstico mostra o sinal de B; em C, "Fim da
   fila de atenção" sem link; Given busca que esconde B, Then de A o próximo é C.
2. **Tecla N** — Given A selecionado e o foco fora de um campo de texto, When `N`, Then B fica
   selecionado; dentro de um input, `N` digita; com `Ctrl`/`Meta` ou com um `Dialog` aberto, nada
   muda.
3. **Setas** — Given foco na segunda linha, When `↓`, Then a terceira recebe o foco e a seleção;
   `↑` volta; na primeira linha `↑` não faz nada; Tab continua percorrendo as linhas.
4. **Prova condicional** — Given perfil carregado sem prova, Then não existe
   `inbox-proxima-prova`; Given perfil carregando ou com erro, Then também não; Given prova, Then
   o bloco aparece como hoje.
5. **Regressão** — lint, build, `test:run`, E2E verdes; os testes atuais de `inbox-proxima-prova`
   ("sem prova cadastrada, o cabeçalho diz isso") são reescritos para os três casos.

## Métrica de sucesso

- Hoje: para cada atleta em atenção, voltar à lista, achar o próximo vermelho e clicar (3 ações,
  com busca visual). Proposta: 1 tecla ou 1 clique por atleta, sem olhar a lista.

## Riscos e mitigações

- **Atalho global `N`**: guardas listadas em "What Changes"; o único atalho global existente é
  `[` em `CoachSidebar.tsx`, sem colisão.
- **`↑`/`↓` × `ButtonBase`**: cada linha já é um botão focável; `onKeyDown` no contêiner move o
  foco para o irmão e seleciona, sem mudar a semântica que os testes usam
  (`getByRole('button', { name })`).
- **Seleção revertida**: `CoachInboxPage` força a seleção para a primeira linha visível quando o
  selecionado some; por isso "próximo" só percorre linhas visíveis.
- **Rollback:** reverter o PR.

## Open Questions & Assumptions

- **Decidido:** sem "visto/adiar" e sem link "cadastrar prova" nesta change (não há destino
  real; um link para o calendário genérico seria um caminho sem saída).

## Status

- draft (2026-11-07), a partir da crítica de design.
