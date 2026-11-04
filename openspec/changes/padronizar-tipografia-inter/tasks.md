# Tasks — padronizar-tipografia-inter

Repo: `apps/menthoros-front`. Validação padrão: `npm run lint && npm run build && npm run test:run`.
Branch (criada no `/implement init`): `refactor/padronizar-tipografia-inter`.

## 0. Gate

- [x] 0.1 Resolver Q1 (Space Grotesk nos títulos do atleta vira Inter?) e Q2 (mono fica) com o
  founder. *verify:* respostas registradas em "Notas" e no `proposal.md`.

## 1. Tokens e tema global

- [ ] 1.1 Grep dos consumidores de `font.display` / `activeTheme.font.display` fora de `src/landing/`
  e confirmar que a landing não depende do token para a família (D2). *verify:* lista em "Notas".
- [ ] 1.2 Teste primeiro: `appTheme.typography.fontFamily` e h1–h6 começam por `"Inter"` (CA2).
  Ajustar os testes que travam o global em Syne: `athleteTheme.test.ts` ("o global não muda") e
  `coachTheme.test.ts:57` ("não altera a tipografia global"). *verify:* vermelho antes,
  verde depois.
- [ ] 1.3 `appTheme`: família padrão `font.text`; h1–h6 em Inter com pesos de D3.
- [ ] 1.4 `font.display` em `theme.premium.ts` passa a Inter (D2). *verify:* `npm run test:run`.

## 2. Temas aninhados

- [ ] 2.1 Teste primeiro: `coachTheme` h1–h4 em Inter, tamanhos inalterados (CA3); substituir o
  `it('mantém Syne nos títulos')`. Idem `athleteTheme` (`'títulos em font.display'`), conforme Q1.
- [ ] 2.2 `coachTheme`: remover `SYNE`; h1–h4 em Inter com pesos de D3.
- [ ] 2.3 `athleteTheme`: segue o token (nada a mudar se 1.4 bastar); conferir. *verify:* testes do
  tema e `AthleteLayout.test.tsx` verdes.

## 3. Overrides fixos

- [ ] 3.1 Remover `fontFamily: 'Syne, sans-serif'` de `CoachInboxPage`, `HomePage`, `AtletasList`,
  `DetalheTreinoDialog`, `AtletaDialog`. Revisar `CoachDialog` (lê `h4.fontFamily`, passa a Inter
  pelo tema) e atualizar o comentário dele. Grep por `typography.h[1-6].fontFamily` e constantes
  locais com Syne. *verify:* CA4 — `grep -rn "Syne" src` só em comentário, landing e waitlist.

## 4. Números e fontes carregadas

- [ ] 4.1 `tabular-nums` nas células numéricas do card e do diálogo de zonas (CA5), com teste de
  componente. Levantar as tabelas de métricas em Inter sem `tabular-nums` e aplicar.
- [ ] 4.2 `index.html`: remover Syne do link do Google Fonts; Inter `wght@300;400;500;600;700;800`
  (CA7, D5). *verify:* `npm run build`; telas sem fallback inesperado no smoke.

## 5. E2E e revisão visual

- [ ] 5.1 Novo `tests/e2e/coach/smoke-tema.spec.ts` no molde do atleta: rotas do coach e do shell
  legado, sem scroll horizontal, com dados preenchidos na revisão de plano e no card/diálogo de
  zonas. Afirmar `font-family` computada começando por Inter (fora da exceção mono) e
  `document.fonts.check('16px Inter')` (CA1). Estender o smoke do atleta para afirmar Inter, não só
  ausência de Syne. *verify:* `npm run test:e2e -- smoke-tema`.
- [ ] 5.2 CA6: E2E ou teste de componente afirmando o título do `CoachDialog` em Inter e `heading`
  nível 2.
- [ ] 5.3 Revisão visual (screenshots) de: inbox do coach, revisão de plano + diálogo de zonas, lista
  de atletas legada, home do atleta. Anexar em "Notas". *verify:* o founder aprova por escrito em
  "Notas"; critério: títulos distinguíveis do corpo e números legíveis sem zoom em 100%.
- [ ] 5.4 Gate final: `npm run lint && npm run build && npm run test:run && npm run test:e2e`. A suíte
  E2E inteira cobre os fluxos de coach-in-the-loop (aprovar/rejeitar plano, editar treino, fechar
  semana) que passam pelo `CoachDialog`; nenhum pode regredir.

## Notas

- 0.1 (2026-11-04, founder): Q1 — títulos do atleta em Inter. Q2 — JetBrains Mono fica nos dados de
  estrutura de treino e rótulos de gráfico.
