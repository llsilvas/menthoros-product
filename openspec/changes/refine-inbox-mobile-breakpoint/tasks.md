# Tasks — refine-inbox-mobile-breakpoint

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build`
(+ `npm run test` quando a task toca lógica; E2E onde indicado).

> Tasks herdadas da Fase 3 de `refine-inbox-visual-hierarchy`, destacada em 2026-08-16. A numeração
> `3.x` foi preservada de propósito: os PRs e as notas daquela change se referem a ela.

## Breakpoint mobile

- [ ] 3.1 Sidebar colapsável: `Drawer` temporário abaixo de `md` com hambúrguer no header; badge do
      inbox replicado no ícone; largura fixa de 240px eliminada em <900px. Validação: lint+build.
- [ ] 3.1a Alinhar breakpoints: o grid do inbox colapsa em `lg` (1200px) mas o drawer em `md` (900px);
      decidir se o empilhamento do grid desce para `md` (ou o drawer sobe para `lg`) para não deixar
      a faixa 900–1200px subprojetada. Validação: inspeção em ~1000px.
- [ ] 3.2 Inbox em fluxo empilhado <md: tela de lista (resumo compacto + fila) e tela de detalhe
      com navegação de volta; tabs scrolláveis; ações secundárias em menu; CTA primário visível
      sem scroll no topo do detalhe. Validação: lint+build + testes de página.
- [ ] 3.3 Teste Playwright viewport 390×844: sem scroll horizontal
      (`scrollWidth === innerWidth` no documento e nos painéis), drawer funcional, seleção de
      atleta abre detalhe com CTA visível. Validação: E2E verde.
- [ ] 3.4 Smoke visual das demais telas do coach (Atletas, Insights, Revisão de planos) em 390px —
      herdam o drawer; corrigir estouros óbvios introduzidos pela mudança de layout base (sem
      redesenho). Validação: inspeção manual + E2E existentes.

- [~] 3.5 Teste mecânico de hierarquia. **A parte desktop já foi entregue** na change de origem
      (`tests/e2e/coach/inbox.spec.ts`): CTA único ≥40px/≥14px, nenhum texto abaixo de 11px varrendo
      todos os nós visíveis, card de alerta com motivo e recência, e sem scroll horizontal em
      1440×900. Resta aqui **estender para 390×844 e ~1000px**. Enunciado original: em
      1440×900 e 390×844, medir via `getComputedStyle` que (a) existe **um** botão primário sólido no
      painel quando há plano pendente, com altura ≥40px e fonte ≥14px; (b) nenhum texto funcional do
      inbox tem `font-size` < 11px; (c) o card de alerta exibe motivo e recência;
      (d) `document.documentElement.scrollWidth === innerWidth`. **Viewports: 1440×900, 1024×768 e
      390×844** — a faixa 900–1200px é a que a própria spec identifica como subprojetada, e medir só
      nos extremos a deixaria passar verde. Para (b), marcar o root do inbox com `data-testid` e
      percorrer os nós de texto visíveis — verificar só alguns nós deixa fonte <11px escondida em
      `Chip`/`Tab`. Sem isso, regressão de hierarquia passa com `npm run test` verde.
      Validação: E2E verde.

