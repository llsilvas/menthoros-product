# Tasks — padronizar-tipografia-inter

Repo: `apps/menthoros-front`. Validação padrão: `npm run lint && npm run build && npm run test:run`.
Branch (criada no `/implement init`): `refactor/padronizar-tipografia-inter`.

## 0. Gate

- [x] 0.1 Resolver Q1 (Space Grotesk nos títulos do atleta vira Inter?) e Q2 (mono fica) com o
  founder. *verify:* respostas registradas em "Notas" e no `proposal.md`.

## 1. Tokens e tema global

- [x] 1.1 Grep dos consumidores de `font.display` / `activeTheme.font.display` fora de `src/landing/`
  e confirmar que a landing não depende do token para a família (D2). *verify:* lista em "Notas".
- [x] 1.2 Teste primeiro: `appTheme.typography.fontFamily` e h1–h6 começam por `"Inter"` (CA2).
  Ajustar os testes que travam o global em Syne: `athleteTheme.test.ts` ("o global não muda") e
  `coachTheme.test.ts:57` ("não altera a tipografia global"). *verify:* vermelho antes,
  verde depois.
- [x] 1.3 `appTheme`: família padrão `font.text`; h1–h6 em Inter com pesos de D3.
- [x] 1.4 `font.display` em `theme.premium.ts` passa a `'"Inter", system-ui, sans-serif'`: **Syne e
  Space Grotesk saem da pilha** (D2, CA4). Atualizar o comentário de `AthleteBottomNav.tsx:73`
  ("o body global é Syne"). *verify:* `npm run test:run`; `grep -n Syne src/theme` vazio.

## 2. Temas aninhados

- [x] 2.1 Teste primeiro: `coachTheme` h1–h4 em Inter, tamanhos inalterados, peso ≥ 700 (CA3); substituir o
  `it('mantém Syne nos títulos')`. Idem `athleteTheme` (`'títulos em font.display'`), conforme Q1.
- [x] 2.2 `coachTheme`: remover `SYNE`; h1–h4 em Inter com pesos de D3. *verify:* `npm run test:run -- coachTheme` verde.
- [x] 2.3 `athleteTheme`: segue o token (nada a mudar se 1.4 bastar); conferir. *verify:* testes do
  tema e `AthleteLayout.test.tsx` verdes.

## 3. Overrides fixos

- [x] 3.1 (depende de 1.x e 2.x) Remover `fontFamily: 'Syne, sans-serif'` de `CoachInboxPage`, `HomePage`, `AtletasList`,
  `DetalheTreinoDialog`, `AtletaDialog`. Revisar `CoachDialog` (lê `h4.fontFamily`, passa a Inter
  pelo tema) e atualizar o comentário dele. Grep por `typography.h[1-6].fontFamily` e constantes
  locais com Syne. *verify:* CA4 — `grep -rn "Syne" src` só em comentário, landing e waitlist.

## 4. Números e fontes carregadas

- [x] 4.1 `tabular-nums` nas células numéricas de `AthleteZonesTable` e da prévia do
  `AthleteZonesDialog` (CA5), com teste de componente. Só essas duas; outras tabelas ficam fora.
- [x] 4.2 (depende de 3.1) `index.html`: remover Syne do link do Google Fonts; Inter `wght@300;400;500;600;700;800`
  (CA7, D5). *verify:* `npm run build`; telas sem fallback inesperado no smoke.

## 5. E2E e revisão visual

- [x] 5.1 Novo `tests/e2e/coach/smoke-tema.spec.ts` no molde do atleta: rotas do coach e do shell
  legado, sem scroll horizontal. Dados via `page.route` no molde de
  `tests/e2e/coach/zonas-cadastro.spec.ts` (`mockarApis`: `users/me`, revisão com um plano, `zonas`
  preenchidas); abrir o diálogo de zonas antes da varredura. Afirmar que a primeira família
  computada de todo elemento visível com texto próprio está em {Inter, JetBrains Mono} e
  `document.fonts.check` para 400 e 800 (CA1). Estender o smoke do atleta com a mesma asserção
  (hoje só rejeita Syne). *verify:* `npm run test:e2e -- smoke-tema`.
- [x] 5.2 CA6: E2E ou teste de componente afirmando o título do `CoachDialog` em Inter e `heading`
  nível 2. *verify:* `npm run test:run -- CoachDialog` (ou o spec E2E da 5.1) verde.
- [x] 5.3 Revisão visual (screenshots) de: inbox do coach, revisão de plano + diálogo de zonas, lista
  de atletas legada, home do atleta. Anexar em "Notas". *verify:* o founder aprova por escrito em
  "Notas"; critério: títulos distinguíveis do corpo e números legíveis sem zoom em 100%.
- [x] 5.4 Gate final: `npm run lint && npm run build && npm run test:run && npm run test:e2e`. A suíte
  E2E inteira cobre os fluxos de coach-in-the-loop (aprovar/rejeitar plano, editar treino, fechar
  semana) que passam pelo `CoachDialog`; nenhum pode regredir.

## Notas

- 0.1 (2026-11-04, founder): Q1 — títulos do atleta em Inter. Q2 — JetBrains Mono fica nos dados de
  estrutura de treino e rótulos de gráfico.
- 1.1: consumidores de `font.display` fora da landing são `athleteTheme` (h1–h6) e o token
  `workoutProfileType.headerTitle` (`theme.premium.ts`), ambos só pela família. A landing e a
  waitlist usam `landingTheme`, standalone (não estende `appTheme`).
- 1.2/1.4: a troca do token já muda os títulos do atleta, então o `it` de `athleteTheme.test.ts`
  sobre Space Grotesk foi ajustado aqui (antecipa parte da 2.1).
- 2.3: `athleteTheme` não precisou de mudança de código; segue o token `font.display` (1.4). Só o
  comentário mudou.
- 3.1: componentes que leem `typography.h4/h6.fontFamily` do tema (`ConfirmDialog`, `CoachDialog`,
  blocos de progresso do atleta) já resolvem para Inter, sem mudança. Guarda de regressão do CA4 em
  `src/theme/semSyne.test.ts`.
- 4.1: a prévia já tinha `tabular-nums` em De/Até; faltava a coluna Referência. As faixas manuais
  (inputs e Referência) também receberam. 4.2: guarda do CA7 em `src/theme/semSyne.test.ts`.
- 5.1: o smoke novo achou um defeito fora da lista do proposal: `<button>` nativo não herda
  `font-family` e os filtros da revisão de plano saíam em **Arial**. Corrigido na raiz em
  `src/index.css` (`button, input, select, textarea { font-family: inherit }`), commit `7e7753e`.
- 5.1: **follow-up fora do escopo** — a toolbar do `DashboardLayout` (shell legado) estoura 8px de
  largura em 1280px (`scrollWidth` 1288). Medido também em `origin/develop`, antes desta change: não é
  regressão. O smoke do legado verifica só a fonte, com comentário apontando para cá.
- 5.4 (2026-11-04): lint ok, build ok, 2568 testes unitários e 135 E2E verdes.
- 5.3: screenshots (inbox do coach, revisão + diálogo de zonas, lista de atletas legada, home do
  atleta) enviadas ao founder; **aprovadas pelo founder em 2026-11-04**.
