# Tasks — coach-proxy-onboarding-entry

> Fast track (XS). Repo único: `menthoros-front`. Sem mudança de backend/contrato.
> Validação: `npm run lint && npm run build && npm run test:run`.

## 1. Hook e página reaproveitados com atletaId injetável

- [x] 1.1 `useOnboarding(atletaIdParam?: string)` — quando `atletaIdParam` é fornecido, pula
      `resolverAtletaIdAtual()` e usa o valor recebido direto. **verify:** `useOnboarding.test.ts`
      cobrindo os dois modos (auto-resolvido vs injetado). 2 testes novos.
- [x] 1.2 `AthleteOnboardingPage` lê `useParams<{ atletaId?: string }>()`; quando presente, repassa
      para `useOnboarding(atletaId)` e, ao concluir, navega para `/coach/athletes/:atletaId` em vez
      de `ROUTES.ATHLETE_HOME`. **verify:** `AthleteOnboardingPage.test.tsx` cobrindo o branch de
      navegação pós-conclusão nos dois contextos (atleta vs coach). 3 testes novos.

## 2. Rota e entrada na UI do coach

- [x] 2.1 Nova rota em `src/App.tsx`: `coach/athletes/:atletaId/onboarding` -> `AthleteOnboardingPage`
      (dentro do shell `coach`, mesmo layout). **verify:** `npm run build` (roteador tipado). OK.
- [x] 2.2 Botão/link em `CoachAthleteProfilePage` levando para a rota nova ("Preencher onboarding",
      ao lado de "Reconhecer progresso"). **verify:** teste de componente confirmando o link. 1 teste novo.

## 3. Validação final

- [x] 3.1 **verify:** `npm run lint && npm run build && npm run test:run` — zero regressão no
      fluxo `/athlete/onboarding` existente (CA4). `npm run lint` limpo; `npm run build` OK;
      `npm run test:run` 737/737 (96 arquivos), incluindo os 6 testes novos desta change.
