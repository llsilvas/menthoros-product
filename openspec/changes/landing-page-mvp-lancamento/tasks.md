# Tasks — landing-page-mvp-lancamento

Repo: `apps/menthoros-front`. Validação padrão a cada bloco: `npm run lint && npm run build &&
npm run test:run`. E2E (`npm run test:e2e`) obrigatória no fechamento — o formulário de acesso é o
único CTA de conversão da página e a mudança em D6/D7 mexe direto em como o consentimento é validado.

Depende de `fix-limites-plano-basic-e-scale` (backend) — a tarefa D.1 publica "Basic ≤20 atletas" e a
existência do plano Scale; sem essa change mergeada, o número publicado não bate com o que o backend
aplica a quem se cadastra de verdade.

Branch: `feature/landing-page-mvp-lancamento`, criada a partir de `develop` antes do primeiro commit
(ver `CLAUDE.md` raiz, "Diretrizes de Git").

## 0. Preparação de asset

- [x] 0.1 Reencode `showcase.mp4` com `-movflags +faststart`, ~720p, ~1MB (ver `design.md` D3).
      Gerar poster (frame real do vídeo, não desenhado) e salvar em `src/assets/landing/`. Validar
      visualmente antes de substituir o asset atual. **Feito em 75c3045** — 3,0MB → 1,7MB, `moov`
      confirmado antes do `mdat`, poster real extraído em t=2.6s (1200×675).

## A. Hero (D1, D2)

- [x] A.1 `VideoShowcase.tsx`: vídeo vira fundo absoluto do hero (não mais bloco de 560px acima). Ganha
      `poster`, `preload="metadata"` (era `"auto"`), overlays de degradê horizontal + vertical (D2).
      Autoplay condicional a `prefers-reduced-motion` já existe — preservar. **Feito em 9f5828e** —
      reduzido para vídeo decorativo (`aria-hidden`, sem controles/aria-label; a proposta de valor
      está no texto). Opacidade dos overlays ajustada a pedido do founder para o vídeo ficar mais
      aparente (padrões finais: horizontal desktop 0.8→0.18, vertical topo/base 0.18).
- [x] A.2 `sections.tsx#Hero`: bloco texto+CTA+card vira `minHeight: calc(100vh - <nav>)` +
      `alignItems: center` no lugar do `mt` negativo atual que sobrepõe o vídeo (`LandingPage.tsx:30`).
      Object-position do vídeo ajustado para não colidir com o texto (D2). **Feito em 9f5828e** —
      `NAV_HEIGHT_PX` (constante, `primitives.tsx`) usado no `calc()`; nav ganhou tamanho fixo (py e
      logo não variam mais com `stuck`) para o `calc()` nunca ficar errado no load inicial (achado do
      pré-mortem sobre mismatch de primeiro paint, `design.md` D1). Vídeo posicionado como irmão de
      Nav/Hero (não pai) para preservar o sticky de página inteira da Nav.
- [x] A.3 `hero.scarcity` em `content.ts`: "Turma fundadora · vagas limitadas para as primeiras
      assessorias" → "10 vagas do programa fundador · 60 dias grátis, sem cartão". **Feito em 9f5828e.**
- [x] A.4 `hero.eyebrow` em `content.ts`: "Performance intelligence" → "Inteligência de performance"
      (única string em inglês da página). **Feito em 9f5828e.**
- [x] A.5 Validação manual: 1366×768 e 1440×900, título + CTA + card visíveis sem rolar (AC1). **Feito**
      — confirmado via Playwright (h1/CTA/card dentro da viewport nos dois tamanhos, screenshots
      revisados). Protocolo completo de LCP (mediana de 3 execuções, `develop` vs. branch) **fica para
      o fechamento (seção I)** — mais eficiente rodar uma vez só, com todas as seções já implementadas,
      em vez de repetir a cada checkpoint.
- [x] A.6 Validação de viewport curto/extremo: 1366×600 (conteúdo cabe sem cortar), mobile landscape
      844×390 (sem clipping — CTA fica abaixo da dobra nesse tamanho extremo, mas acessível por
      scroll, sem `overflow:hidden` escondendo nada) — confirmado via Playwright. Mismatch de
      primeiro paint resolvido pela nav de tamanho fixo (A.2), não precisou de `ResizeObserver`.
- [ ] A.6 Validação de viewport curto/extremo (achado do pré-mortem, `design.md` D1): 1366×600, zoom
      de browser 150–200%, mobile landscape 844×390 — hero não corta título/CTA nem trava altura que
      esconde conteúdo (sem `overflow: hidden` no container do hero) (AC8b). Conferir também o
      primeiro paint (nav "não-stuck") contra o `--nav-height` usado no `calc()`.

## B. Seções abaixo da dobra (D4)

- [x] B.1 `primitives.tsx#SectionMark`: numeral + rótulo na mesma linha (`align-items: baseline`),
      remove a linha `§ NN — rótulo` duplicada acima dele. **Feito em e0b7320** — também trocou
      `text.disabled` por `text.secondary` no rótulo (antecipa parte de H).
- [x] B.2 `primitives.tsx#SectionHeading`: título com `\n` ganha espaço antes do `<br>` condicional
      (hoje o `<br>` some abaixo de 900px sem deixar nada no lugar → "lendoplanilha" etc). Testar as
      7 seções em 390px depois da mudança (AC2). **Feito em e0b7320** — os 8 `<h2>` da página
      conferidos em 390px, nenhuma palavra colada.
- [x] B.3 `sections.tsx#HowItWorks`: passos viram pílulas mono `PASSO 01/02/03` no lugar dos numerais
      grandes em lime (`content.ts#how.steps` não muda, só o componente). **Feito em e0b7320.**
- [x] B.4 `sections.tsx#Delta`: cabeçalho do card reordenado — `content.ts#delta.context` de
      `"CARGA INTERNA · HUGO SILVA · SEMANA 14"` para `"HUGO SILVA · SEM. 14 · CARGA INTERNA"` (evita
      "14" órfão no mobile). **Feito em e0b7320** — confirmado sem quebra em 1366px e 390px.

## C. Seção Confiança (D8)

- [ ] C.1 `sections.tsx#Trust`: remove `founder-placeholder.jpg` e a imagem com legenda. Vira card com
      citação do fundador (`content.ts#trust.founderBio` reaproveitado como citação) + avatar de
      iniciais (mesmo padrão de avatar do `AttentionQueue`, `ProductUI.tsx:47`).
- [ ] C.2 Sem bloco de 3 fatos (prova social) — não entra nesta change (Non-Goal, `proposal.md`).

## D. Planos e preços (D5)

- [ ] D.1 `content.ts`: novo objeto `pricing` com os 5 planos (nome, atletas, técnicos, preço) e a
      intro ("Estes são os planos a partir do lançamento geral..."). Valores exatos:
      Gratuito `≤10 / 1 / R$0`, Basic `≤20 / 1 / R$99` (destacado), Pro `≤50 / 2 / R$199`, Enterprise
      `≤100 / 5 / R$349`, Scale `100+ / Ilimitado / R$599`.
- [ ] D.2 `sections.tsx`: novo `PlanCard` + `Pricing` (grid `repeat(5,1fr)` desktop / 1 coluna mobile),
      inserida entre `Trust` e `Faq` em `LandingPage.tsx`. Card `Basic` com borda lime + badge "SEU
      PLANO APÓS O TRIAL" (`position: absolute; top: -11px` — checar overflow do container pai).
      **Achado do pré-mortem (alto):** o card `Basic` e/ou o parágrafo de intro da seção precisam
      declarar por extenso "60 dias grátis, sem cartão — no dia 61 vira Basic se você cadastrar o
      cartão", não só o badge — quem lê só essa seção (sem abrir o FAQ) não pode ver R$99–R$599 sem
      esse contexto (AC3b). Numeral de seção da `Pricing` é `07`; `Faq` renumera para `08`.
- [ ] D.3 Validar renderização em 1366px (5 colunas) e 390px (empilhado) — sem overflow horizontal,
      badge não cortado (AC3).

## E. Compatibilidade Garmin (proposal.md item E)

- [ ] E.1 `content.ts#how.steps[0]`: "Os dados de treino dos seus atletas entram automaticamente,
      independente do relógio ou app que eles já usam." → texto que nomeia o Garmin como integração
      ativa e outras marcas como roadmap por demanda (AC5).
- [ ] E.2 `content.ts#faq.items`: resposta de "Preciso que meus atletas tenham um relógio
      específico?" reescrita — hoje sim, Garmin; convite para avisar se usa outra marca.
- [ ] E.3 `AccessForm.tsx`: nota curta sobre Garmin logo após os campos de nome/email/quantidade de
      atletas, antes do checkbox de consentimento.

## F. Mecânica do programa fundador (proposal.md item F)

- [ ] F.1 `content.ts#faq.items`: resposta de "Quanto custa?" reescrita com a mecânica real — 60 dias
      grátis sem cartão, dia 61 cadastra cartão e vira Basic R$99 (≤20 atletas, 1 técnico), sem
      cadastro perde acesso. Sem placeholder (AC4).
- [ ] F.2 `content.ts#finalCta`: subtítulo reforça o enquadramento de programa fundador ("uma das 10
      assessorias fundadoras... seu retorno molda as próximas versões").
- [ ] F.3 `AccessForm.tsx`: microcopy sob o botão de submit — "Sem compromisso · 60 dias grátis, sem
      cartão · 10 vagas no programa fundador" (substitui a linha atual "Sem compromisso · vagas
      limitadas").

## G. Formulário — validação e link (D6, D7)

- [ ] G.1 `accessFormValidation.ts`: `validate()` ganha o parâmetro `aceiteLgpd: boolean` e
      `AccessFormErrors` o campo `aceiteLgpd?: string` — **não** tratar como checagem local ad hoc no
      componente (achado alto do pré-mortem: é o que preservava, de graça, a garantia que o `disabled`
      atual dava contra qualquer caminho de submit). `AccessForm.tsx`: botão sempre habilitado (exceto
      `submitting`); `handleSubmit` chama `validate(...)` com os 4 argumentos e não envia enquanto
      `errors` tiver qualquer chave (AC6).
- [ ] G.2 `AccessForm.tsx:83-91`: link "Política de Privacidade" sai de dentro do
      `FormControlLabel`; vira `Link` irmão do checkbox, fora do `<label>` (mesmo padrão de
      `CoachConsentDialog.tsx` citado no `CLAUDE.md`) (AC7).
- [ ] G.3 `accessFormValidation.test.ts`: teste unitário da função pura para `aceiteLgpd` ausente/
      presente. `AccessForm.test.tsx`: reescrever "mantém o envio desabilitado até aceitar a LGPD"
      para o novo comportamento — cobrir **clique no botão e Enter em um campo de texto do form**,
      ambos sem `inscrever` chamado e com o erro visível quando o consentimento não foi marcado.
      Comportamento trocado deliberadamente por G.1, não uma correção de teste quebrado.

## H. Contraste (proposal.md item H)

- [ ] H.1 Trocar `text.disabled` (`#64748B`) por `text.secondary` (`#94A3B8`) nos rótulos mono da
      landing: eyebrow do hero, linha de escassez, `SectionMark`, chips de prova (hero + Trust),
      legenda do loop (`HowItWorks`), rodapé. Conferir contraste ≥4.5:1 contra `#0A1628` depois (AC8).

## I. Fechamento

- [ ] I.0 **Gate bloqueante (achado alto do pré-mortem):** não abrir o PR desta change, nem mergear,
      sem confirmar que `fix-limites-plano-basic-e-scale` está mergeada em `develop`, migrada
      (`V83` aplicada) e com AC1/AC2 verificadas no ambiente alvo. A task D.1 (copy "Basic ≤20
      atletas") passa em lint/build/test mesmo sem o backend — só este gate impede publicar uma
      promessa que o produto ainda rejeita.
- [ ] I.1 `npm run lint && npm run build && npm run test:run` — suíte completa, incluindo
      `LandingPage.test.tsx`, `AccessForm.test.tsx`, `Nav.test.tsx` atualizados (AC10).
- [ ] I.2 `npm run test:e2e` — fluxo de acesso (preencher formulário, consentir, submeter) é crítico
      por tocar LGPD (`CLAUDE.md` do front, "E2E is mandatory on critical flows"); spec nova ou
      existente que exercite o novo comportamento do botão/erro de consentimento.
- [ ] I.3 Smoke visual em 1366×768, 1440×900 e 390×844 (Playwright ou browser) — confirmar AC1, AC2,
      AC3 lado a lado com o canvas de referência.
