# Tasks — coach-ciente-prova-na-inbox

Repo: `apps/menthoros-front`. Validação de cada bloco: `npm run lint && npm run build && npm run test:run`.
Sequência: 1 → 2 → 3 → 4 (o painel da 2 depende do hook isolado; a 3 depende do "Ciente" da 2).

## 1. Hook isolado por atleta

- [ ] 1.1 Teste (vermelho) em `useCoachAthleteRaces.test.ts`: ao trocar `atletaId` de A para B,
      `provas`/`pendentes` zeram de imediato e a resposta atrasada de A é descartada (CA7).
      verify: teste falha em develop e passa após 1.2.
- [ ] 1.2 `useCoachAthleteRaces`: limpar estado na troca de `atletaId` e ignorar resposta cujo
      `atletaId` não é o atual (ref/flag de cancelamento no efeito).
      verify: 1.1 verde; testes do `CoachAthleteProfilePage` continuam verdes.
- [ ] 1.3 Validação: lint, build, test:run.

## 2. Aba "Provas & sugestões" com "Ciente"

- [ ] 2.1 Teste (vermelho) em `CoachInboxPage.test.tsx`: com prova pendente mockada em
      `ProvaService`, a aba mostra o chip do motivo e "Ciente" (CA1); clicar chama
      `marcarCiente(atletaId, provaId)` e recarrega o dashboard da inbox (CA2); PATCH falhando
      mostra erro com "Tentar novamente" e mantém o resto da inbox (CA8). Ajustar o teste existente
      "mostra provas e sugestões do ATLETA" (linha ~585), mantendo o título "Provas do atleta".
      verify: falha em develop.
- [ ] 2.2 `RacesSuggestionsTabPanel`: substituir a lista de `selected.raceCalendar` por
      `AthleteRacesPanel` + `useCoachAthleteRaces(selected.id)` + `buildCoachRaceList`; `onRetry` =
      `fetchRaces`; manter previsão de forma e "Ver calendário completo" (CA8). Callback novo para a
      página reagir ao "Ciente" bem-sucedido.
      verify: 2.1 verde.
- [ ] 2.3 `CoachInboxPage`: após "Ciente", `reloadDashboard()` e `refetchQueue?.()` do outlet context
      (campo opcional, como no perfil).
      verify: dashboard recarregado uma vez por "Ciente" bem-sucedido.
- [ ] 2.4 Validação: lint, build, test:run.

## 3. Seleção retida e aba inicial

- [ ] 3.1 Teste (vermelho):
      - atleta com `reason = 'PROVA_ATLETA'` selecionado (clique e seleção automática) abre em
        "Provas & sugestões" (CA3);
      - outro motivo ou sem atenção abre em "Diagnóstico"; `retorno.tab` prevalece para
        `retorno.atletaId` (CA4);
      - troca manual de aba + recarga da fila mantém a aba (CA5);
      - com filtro "Em atenção", "Ciente" que tira o atleta da fila mantém seleção e detalhe nele
        (CA6).
      verify: falha em develop.
- [ ] 3.2 Seleção retida: guardar `{ atletaId, nome }` do atleta quando ele dá "Ciente"; o efeito de
      `CoachInboxPage.tsx:268` não salta para a primeira linha enquanto `selectedId` for o retido;
      `selectedRosterItem` usa o retido como fallback antes de `rosterItems[0]`. Limpar o retido
      quando o treinador seleciona outro atleta.
      verify: caso CA6 de 3.1 verde.
- [ ] 3.3 Aba inicial: efeito dependente só de `selectedId` (não de `selectedAttention` nem da fila)
      define `activeTab` por `selectedAttention?.reason`; na primeira seleção, se `retorno?.tab` e
      `retorno.atletaId === selectedId`, usa `retorno.tab`.
      verify: casos CA3–CA5 de 3.1 verdes; testes de retorno da temporada continuam verdes.
- [ ] 3.4 Validação: lint, build, test:run.

## 4. Fechamento

- [ ] 4.1 E2E em `tests/e2e/coach/inbox.spec.ts`: atleta com `PROVA_ATLETA` abre na aba de provas,
      "Ciente" chama o PATCH mockado, a fila é recarregada e o atleta continua selecionado; PATCH 500
      mostra erro sem derrubar a tela.
      verify: `npm run test:e2e -- tests/e2e/coach/inbox.spec.ts` verde.
- [ ] 4.2 Verificação manual local: atleta cadastra prova, aviso aparece na inbox, inbox abre na aba
      de provas, "Ciente" resolve sem sair da tela e sem trocar o atleta selecionado.
