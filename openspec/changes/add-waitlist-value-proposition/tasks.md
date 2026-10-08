# Tasks — add-waitlist-value-proposition

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build`
(+ `npm run test:run` quando a task toca lógica/render; E2E no bloco final).

## Bloco de valor em /waitlist

- [ ] 1.1 Extrair o conteúdo necessário para `WaitlistPage.tsx` a partir de `src/landing/content.ts`
      (`hero`, `founderOffer`, `capabilities.bullets`) e da frase de requisito Garmin de
      `AccessForm.tsx:81` — sem duplicar strings fixas novas; reaproveitar ou exportar o que faltar.
      Validação: lint+build.
- [ ] 1.2 Montar o bloco de proposta de valor acima do formulário em `WaitlistPage.tsx`: título,
      slogan, frase de abertura, três bullets, linha de oferta, aviso Garmin. Reaproveitar tokens do
      tema (`gradients`, `glassAzulSx`, `surface`, `overlayWhite`) já usados na página — sem hex
      cru. Validação: lint+build.
- [ ] 1.3 Inserir `<AttentionQueue />` (`src/landing/ProductUI.tsx`) ao lado do formulário no desktop
      (`Grid`/`Stack` responsivo) e abaixo dele no mobile. Validação: lint+build.
- [ ] 1.4 Ajustar o layout para mobile-first: bloco de valor + formulário (ou início dele) visíveis
      sem exigir mais de uma rolagem em 390px de largura; captura do painel pode ficar abaixo da
      dobra no mobile. Validação: inspeção manual em devtools (390×844) + lint+build.
- [ ] 1.5 Atualizar `WaitlistPage.test.tsx` para cobrir o novo conteúdo (presença do bloco de valor,
      do aviso Garmin, da linha de oferta) sem quebrar as asserções existentes do formulário/estado
      de sucesso. Validação: `npm run test:run`.
- [ ] 1.6 Smoke E2E: confirmar que o fluxo de envio do formulário em `/waitlist`
      (`tests/e2e/.../waitlist*.spec.ts` se existir, senão o E2E relevante mais próximo) continua
      passando com o novo layout. Validação: `npm run test:e2e` (ou registrar em "Open Questions" se
      não houver spec E2E cobrindo `/waitlist` hoje e não for viável escrever uma nesta change).
