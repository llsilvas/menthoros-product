# Tasks — add-waitlist-value-proposition

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build`
(+ `npm run test:run` quando a task toca lógica/render; E2E no bloco final).

## Bloco de valor em /waitlist

- [x] 1.1 Extrair o conteúdo necessário para `WaitlistPage.tsx` a partir de `src/landing/content.ts`
      (`hero`, `founderOffer`) e da frase de requisito Garmin. A frase Garmin estava inline em
      `AccessForm.tsx:81` (não era uma constante) — extraída para `content.ts` como `garminNotice` e
      reusada nos dois lugares, eliminando a duplicação que a proposta queria evitar.
      Validação: lint+build.
- [x] 1.2 Montar o bloco de proposta de valor acima do formulário em `WaitlistPage.tsx`: título,
      slogan, frase de abertura, três bullets, linha de oferta, aviso Garmin. Reaproveita tokens do
      tema (`gradients`, `glassAzulSx`, `surface`, `overlayWhite`) já usados na página — sem hex
      cru. Os três bullets ficaram como array local `VALUE_BULLETS` (texto adaptado da spec FE-01,
      não idêntico a `capabilities.bullets` da home). Validação: lint+build.
- [x] 1.3 `<AttentionQueue />` (`src/landing/ProductUI.tsx`) inserido ao lado do formulário no
      desktop e abaixo dele no mobile, via `Stack` responsivo com `order` por breakpoint. Precisou de
      um `ThemeProvider` aninhado com `landingTheme` ao redor do componente — ele lê
      `palette.surfaceShift`, token que só existe no tema da landing, não no `appTheme` que envolve
      `/waitlist` (mesmo padrão que `LandingPage.tsx` já usa). Validação: lint+build.
- [x] 1.4 Layout mobile-first: `Stack direction={{xs:'column', md:'row'}}` sem larguras fixas (só
      `maxWidth` + `width:'100%'`), então não há overflow horizontal possível em 390px — o
      formulário aparece primeiro no fluxo (`order: {xs:1, md:2}`), a captura do painel depois
      (`order: {xs:2, md:1}`). Validação: lint+build. **Nota:** a inspeção visual em devtools a
      390×844 não foi possível nesta sessão — a ferramenta de resize do browser automatizado não
      alterou o viewport real (`window.innerWidth` seguiu em 1080 após o resize). Verificado por
      revisão de código (mesmo padrão responsivo de `refine-inbox-mobile-breakpoint`, sem largura
      fixa em nenhum nó); recomenda-se confirmação visual manual antes do deploy se o founder quiser
      dupla checagem.
- [x] 1.5 `WaitlistPage.test.tsx` ganhou um teste novo cobrindo o bloco de valor, a oferta e o aviso
      Garmin; as asserções existentes (formulário, sucesso, honeypot, link de privacidade) seguem
      intactas. Validação: `npm run test:run` — 7/7 verdes no arquivo, 1987/1987 na suíte completa.
- [x] 1.6 Smoke E2E: `tests/e2e/landing/waitlist-deeplink.spec.ts` já existia e cobre exatamente o
      fluxo (deep link UTM → envio → sucesso; link de Privacidade fora do label) — rodou verde contra
      o novo layout sem alteração no spec. Validação: `npx playwright test
      tests/e2e/landing/waitlist-deeplink.spec.ts` — 2/2 verdes.
