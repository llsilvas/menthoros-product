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

## Sessão de refinamento (design aprovado) — escopo ampliado além do S original

PR #152 ficou aberto para uma rodada de iteração visual direto com o founder (canvas /waitlist
desktop+mobile), que acabou puxando parte de FE-02/FE-03/FE-04/FE-05/FE-06 para dentro desta change
em vez de ficarem para as changes seguintes. Registrado aqui porque o PR já foi mergeado
(`755fdab`) — não dá para voltar e reclassificar o Tamanho/Trilha, só documentar o que saiu:

- [x] 2.1 **FE-02 (completo):** formulário único `AccessRequestForm.tsx` substitui `AccessForm.tsx`
      (home) e o form inline de `WaitlistPage.tsx` — mesmos campos, mesma validação por campo, mesmo
      texto de botão nos dois lugares. `AccessForm.tsx`/`AccessForm.test.tsx` removidos.
- [x] 2.2 **FE-01 (refino):** bloco de proposta de valor extraído para `src/landing/ValueProposition.tsx`
      (componente próprio, endereça a sugestão do `frontend-reviewer` de não deixar crescer dentro de
      `WaitlistPage.tsx`).
- [x] 2.3 **FE-03 (completo):** `src/landing/utmPersistence.ts` captura UTM da URL (path e fragmento
      de hash) e persiste em `sessionStorage` na primeira carga da sessão — sobrevive à navegação
      entre `/` e `/waitlist` sem UTM na URL de destino.
- [x] 2.4 **FE-05 (parcial):** mensagem de sucesso varia por perfil — atleta recebe CTA de indicar o
      treinador em vez de uma promessa de contato. Variante "outra marca de relógio" **não**
      implementada (depende do campo de FE-02 abaixo, deferido).
- [x] 2.5 **FE-06 (parcial):** "assessorias de endurance" → "assessorias de corrida" na copy de
      marketing; dado mock do `AttentionQueue` ganhou rótulo "Exemplo ilustrativo".
- [x] 2.6 **FE-04 (parcial):** as ocorrências soltas de "10 vagas" passam a ler de uma única
      constante em `content.ts`. Contador dinâmico de verdade continua dependendo do endpoint
      `BE-04`, que não existe.
- [~] 2.7 **Deferido, fora desta change:** campo "dono de assessoria" no perfil e campo "relógio
      predominante dos atletas" em `AccessRequestForm.tsx` (FE-02) — mudariam o contrato do DTO do
      backend, e `CLAUDE.md` do backend ("Campo de DTO em português") exige coordenar a mudança de
      contrato junto com o repo que já está mexendo na entidade, nunca isolado no front. A variante
      de sucesso "outra marca" de FE-05 depende desse campo e também fica para depois.
- [~] 2.8 **Deferido, fora desta change:** FE-07 (SEO/Open Graph/eventos de analytics) — não há
      ferramenta de analytics instalada hoje; escolher uma é decisão de produto, não técnica.
