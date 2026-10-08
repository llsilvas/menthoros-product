# Tasks — add-founders-slots-display

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build`
(+ `npm run test:run` quando a task toca lógica/render).

## Dado ao vivo

- [ ] 1.1 `src/services/FoundersSlotsService.ts`: wrapper sobre `GET /api/v1/founders/slots`, mesmo
      padrão de `WaitlistService.ts` (classe estática, `fetch` com `OpenAPI.BASE`, erro tipado).
      Tipo de retorno `{ total: number; taken: number; remaining: number; open: boolean }`.
      Validação: lint+build.
- [ ] 1.2 `src/hooks/useFoundersSlots.ts`: busca uma vez no mount (`useEffect` + guard de
      cancelamento, mesmo padrão de `useLogoAssessoria.ts`), expõe `{ data, loading, error }`. Sem
      polling. Validação: `npm run test:run` com teste do hook (sucesso, falha, cancelamento no
      unmount).
- [ ] 1.3 `src/landing/foundersSlotsCopy.ts`: função pura `foundersSlotsLabel({ data, loading,
      error }, { openLabel, closedLabel, baseLabel })` — retorna o texto certo por estado
      (carregando/falha → sem número; aberto → "Restam N de T vagas"; esgotado → texto de lista de
      espera). Testável isoladamente, sem React. Validação: `npm run test:run`.

## Consumo

- [ ] 2.1 `FounderOfferCard` (`sections.tsx`): badge passa a usar `useFoundersSlots()` +
      `foundersSlotsLabel`, mantendo o resto do card (trialLine, afterTrialPrice, continuityNote,
      CTA) intocado. Validação: lint+build.
- [ ] 2.2 Cabeçalho do formulário em `WaitlistPage.tsx`: troca `founderOffer.vagas` estático pelo
      mesmo hook/função. Validação: lint+build.
- [ ] 2.3 Testes de componente cobrindo os critérios de aceite 1-4 (`fetch` mockado): vagas abertas
      mostra "Restam N de T"; esgotado mostra o texto de lista de espera; falha e estado de loading
      mostram o texto sem número, nunca o "10" estático. Validação: `npm run test:run`.
- [ ] 2.4 `npm run lint && npm run build && npm run test:run` na suíte completa — confirmar que
      `WaitlistPage.test.tsx` e os testes existentes da landing continuam verdes (ajustar
      asserções que dependiam do texto estático "10 vagas"/"Turma fundadora — 10 vagas", se houver).
