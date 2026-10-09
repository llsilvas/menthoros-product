# Tasks — add-founders-slots-display

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build`
(+ `npm run test:run` quando a task toca lógica/render).

## Dado ao vivo

- [x] 1.1 `src/services/FoundersSlotsService.ts`: wrapper sobre `GET /api/v1/founders/slots`, mesmo
      padrão de `WaitlistService.ts` (classe estática, `fetch` com `OpenAPI.BASE`, erro tipado).
      Tipo `FoundersSlots` em `src/types/FoundersSlots.ts`. Validação: lint+build.
- [x] 1.2 `src/hooks/useFoundersSlots.ts`: busca uma vez no mount (`useEffect` + guard de
      cancelamento, mesmo padrão de `useLogoAssessoria.ts`), expõe `{ data, loading, error }`. Sem
      polling. 3 testes (sucesso, falha, unmount-antes-da-resposta). Validação:
      `npm run test:run`.
- [x] 1.3 `src/landing/foundersSlotsCopy.ts`: função pura `foundersSlotsLabel({ data, loading,
      error }, { openLabel, closedLabel, baseLabel })` — carregando/falha → sem número; aberto →
      substitui `{remaining}`/`{total}`; esgotado → texto de lista de espera. 4 testes isolados,
      sem React. Validação: `npm run test:run`.

## Consumo

- [x] 2.1 `FounderOfferCard` (`sections.tsx`): badge passa a usar `useFoundersSlots()` +
      `foundersSlotsLabel`, mantendo o resto do card (trialLine, afterTrialPrice, continuityNote,
      CTA) intocado. `founderOffer.badge` (agora sem consumidor) removido de `content.ts`.
      Validação: lint+build.
- [x] 2.2 Cabeçalho do formulário em `WaitlistPage.tsx`: troca o span estático com
      `founderOffer.vagas` pelo texto dinâmico completo (perdeu o destaque de cor só no número,
      já que o formato do texto varia por estado — aceitável, mesmo tratamento do badge da home).
      Validação: lint+build.
- [x] 2.3 Testes de componente cobrindo os critérios de aceite 1-4, com `FoundersSlotsService`
      mockado (`vi.mock`) nos três estados — vagas abertas ("Restam 7 de 10 vagas"), esgotadas
      ("Lista de espera — próxima turma") e carregando/falha (sem número, nunca o "10" estático).
      Validação: `npm run test:run`.
- [x] 2.4 Suíte completa: `npm run lint` (limpo) + `npm run build` (limpo) +
      `npm run test:run` — **2013/2013 testes** (234 arquivos), incluindo os ajustes em
      `Pricing.test.tsx` e `WaitlistPage.test.tsx` (asserção do badge estático trocada para o
      estado de carregamento/falha, já que sem mock do `FoundersSlotsService` dispararia fetch real
      a `localhost:8099`). E2E (`waitlist-deeplink.spec.ts`, `acesso.spec.ts`) verdes, sem
      regressão no fluxo de envio.

## QA gate (Fast track: frontend-reviewer + testes)

- [x] 3.1 Revisão via `menthoros-workflow:frontend-reviewer`: sem achados bloqueantes. Conformidade
      confirmada: layering hook/service (componentes nunca chamam `FoundersSlotsService`
      diretamente), três estados tratados corretamente, sem hex cru introduzido, nenhum consumidor
      órfão de `founderOffer.badge`. 2 achados corrigidos nesta rodada: (a) o teste de
      cancelamento do hook não provava o que afirmava (`toBeDefined()` trivial) — trocado por
      `console.error` spy, com nota honesta de que React 18+ não emite mais o warning de
      "setState pós-unmount" em componentes de função, então a prova real que resta é de
      regressão, não de correção do guard em si; (b) comentário desatualizado em `content.ts`
      sobre `VAGAS_PROGRAMA_FUNDADOR` ainda dizia que nenhum endpoint existia — atualizado para
      refletir que badge/cabeçalho já saíram da constante.
