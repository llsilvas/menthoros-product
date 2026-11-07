**Tamanho:** S · **Trilha:** Fast (só front; sem contrato; cabeçalho do atleta, Diagnóstico e teclado)

# Proposal — inbox-proximo-em-atencao

## Why

Prioridade 3 da crítica de design do `/coach/inbox` (2026-11-07). A tela é de triagem, mas não
tem fluxo de triagem: depois de agir num atleta em atenção, nada leva ao próximo — o coach volta
à lista, procura o próximo vermelho, clica. Com 20 atletas isso é a maior parte do tempo da
rotina. Dois complementos menores no cabeçalho do atleta:

- "Próxima prova — Sem prova cadastrada" ocupa o lugar ao lado do CTA para dizer que não há
  dado, e empurra as ações para uma segunda linha em 1366px.
- Sem atalho de teclado, a lista só se percorre com o mouse.

Correção à crítica original: a evidência da fila (`attention.evidence`, `explanation`) **já** é
renderizada no Diagnóstico pelo `AIInsightCard` quando existe (E2E "o detalhe do atleta em atenção
mostra o insight em seções"). O item "evidência no diagnóstico" sai; o que entra é o fluxo.

## What Changes

Só `apps/menthoros-front`, `CoachInboxPage` e `DiagnosisTabPanel`.

- **Próximo em atenção**: ao fim do Diagnóstico de um atleta com sinal, um link "Próximo em
  atenção → {nome}" seleciona o próximo da fila (ordem da fila: severidade, depois
  `priorityScore`), circular; no último, "Fim da fila" sem link. Tecla `N` com foco na página faz
  o mesmo.
- **Atalhos na lista**: `↑`/`↓` movem a seleção entre as linhas visíveis (roving tabindex na
  lista; `Enter`/`Espaço` já clicam). A barra do topo mostra a legenda dos atalhos a partir de
  `lg` (`↑↓ atleta · N próximo em atenção`), em `surface-400`.
- **Prova só quando existe**: o bloco `AthleteNextRace` aparece só com prova; sem prova, a linha
  de contexto do atleta ganha um link "cadastrar prova" que leva ao calendário do atleta.

## Non-Goals

- "Visto"/"adiar" um sinal: precisa de backend (estado por treinador). Proposta separada.
- Mudar a ordem da fila ou o cálculo de `priorityScore`.
- Lista e filtros: `inbox-lista-triagem`.

## Impact

- `src/features/coach/pages/CoachInboxPage.tsx`: seleção por teclado, `N`, legenda; prova
  condicional. `src/features/coach/components/panels/DiagnosisTabPanel.tsx`: link "Próximo em
  atenção" (prop `proximoEmAtencao: { nome } | null` + `onProximo`).
- `src/features/coach/adapters/coachInboxAdapters.ts`: `proximoEmAtencao(queue, atualId)`.
- Testes de componente e `tests/e2e/coach/inbox.spec.ts`.

## Critérios de aceite

1. **Próximo** — Given 3 na fila (A, B, C) e A selecionado, When o coach clica "Próximo em
   atenção → B", Then B fica selecionado e o Diagnóstico mostra o sinal de B; em C, o fim da fila
   é dito e não há link.
2. **Tecla N** — Given A selecionado e o foco fora de um campo de texto, When `N`, Then B fica
   selecionado; dentro de um input, `N` digita.
3. **Setas** — Given foco numa linha da lista, When `↓`, Then a linha seguinte recebe o foco e a
   seleção; `↑` volta.
4. **Prova condicional** — Given atleta sem prova, Then não existe `inbox-proxima-prova` e a
   linha de contexto tem o link "cadastrar prova"; com prova, o bloco aparece como hoje.
5. **Regressão** — lint, build, `test:run`, E2E verdes; os testes atuais de `inbox-proxima-prova`
   são reescritos para os dois casos.

## Métrica de sucesso

- Passar por todos os atletas em atenção sem tocar na lista: N cliques (ou N teclas) para N
  atletas.

## Riscos e mitigações

- **Atalho global `N` × campos de texto**: o handler ignora eventos cujo alvo é `input`,
  `textarea`, `select` ou `contenteditable`, e qualquer `Dialog` aberto.
- **Roving tabindex × `ButtonBase`**: cada linha já é um botão; a lista vira `role="listbox"`?
  Não: mantém botões e só move o foco programaticamente com `↑`/`↓` (`onKeyDown` no contêiner),
  sem mudar a semântica que os testes usam (`getByRole('button', { name })`).
- **Rollback:** reverter o PR.

## Open Questions & Assumptions

- **Premissa:** o link "cadastrar prova" leva a `/coach/calendar` com o atleta pré-selecionado se
  a rota aceitar `?atleta=`; senão, só ao calendário.
- **Decidido:** sem "visto/adiar" nesta change.

## Status

- draft (2026-11-07), a partir da crítica de design.
