# Tasks — coach-ciente-prova-na-inbox

Repo: `apps/menthoros-front`. Validação de cada bloco: `npm run lint && npm run build && npm run test:run`.

## 1. Aba "Provas & sugestões" com "Ciente"

- [ ] 1.1 Teste (vermelho) em `CoachInboxPage.test.tsx`: com prova pendente mockada em
      `ProvaService`, a aba mostra o chip do motivo e o botão "Ciente" (CA1); clicar chama
      `marcarCiente(atletaId, provaId)` e recarrega a fila (CA2). Ajustar o teste existente "mostra
      provas e sugestões do ATLETA" ao novo conteúdo, mantendo a asserção do título.
- [ ] 1.2 `RacesSuggestionsTabPanel`: substituir a lista de `selected.raceCalendar` por
      `AthleteRacesPanel` alimentado por `useCoachAthleteRaces(selected.id)` +
      `buildCoachRaceList`; manter previsão de forma e "Ver calendário completo" (CA5); erro com
      "Tentar novamente" (CA6).
- [ ] 1.3 Após "Ciente", recarregar a fila de atenção da inbox (mesmo padrão de
      `CoachAthleteProfilePage.tsx:116`).
- [ ] 1.4 Validação: lint, build, test:run.

## 2. Aba inicial por motivo de atenção

- [ ] 2.1 Teste (vermelho): atleta com `attention.reason = 'PROVA_ATLETA'` abre em "Provas &
      sugestões" (CA3); outro motivo ou sem atenção abre em "Diagnóstico"; `retorno.tab` prevalece
      (CA4).
- [ ] 2.2 `CoachInboxPage`: ao mudar o atleta selecionado, definir a aba ativa a partir de
      `selectedAttention?.reason` (A3, A4), sem sobrescrever troca manual enquanto o atleta não muda.
- [ ] 2.3 Validação: lint, build, test:run.

## 3. Fechamento

- [ ] 3.1 `npm run test:e2e -- tests/e2e/coach/inbox.spec.ts` verde.
- [ ] 3.2 Verificação manual em develop/local: atleta cadastra prova, aviso aparece na inbox, inbox
      abre na aba de provas, "Ciente" remove o aviso sem sair da tela.
