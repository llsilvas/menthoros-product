# Tasks — polish-inbox-visual-semantics

Repo: `apps/menthoros-front`, branch `feature/polish-inbox-visual-semantics`. Validação padrão:
`npm run lint && npm run build` (+ `npm run test:run` quando a task toca lógica/componente).

Levantamento de código (2026-09-18, `/implement init`):
- **Rotas:** router único em `src/App.tsx` (`createHashRouter`, linha 67); bloco do coach em
  `:118-132`. **Nenhuma rota tem `errorElement` hoje** — não existe padrão prévio, é a primeira
  introdução do conceito no repo.
- **Badges de status:** não há um componente único — **7 locais distintos** com mapa de
  cor→severidade próprio, todos via `sx` hardcoded (não `color` prop do MUI): `StatusBadge.tsx`
  (compartilhado, consumido em `AthleteRow.tsx:352`, `CoachAthleteProfilePage.tsx:193`,
  `CoachAthletesPage.tsx:401,529`, `PlanoDetalhePanel.tsx`), `QueueRow.tsx:22-26` +
  `coachInboxHelpers.ts:7-25` (fila), `RecentSignalsPanel.tsx:11-15`, `AIInsightCard.tsx:13-15`,
  `CoachAttentionQueuePage.tsx:14-16` (rota inativa, ver `App.tsx:20`), `toneMarker.tsx:14-18`
  (não é badge, é ícone+texto). `palette.error`/`palette.warning` já mapeiam os mesmos tokens
  `semantic.danger`/`semantic.warning` em `appTheme.ts:29-30` — não precisa criar token novo.
  **Escopo desta change (1.2) é só o par badge+card da FILA do inbox** (`AthleteRow.tsx` via
  `StatusBadge` + `QueueRow.tsx`), que é o par descrito no "Why" da proposta (badge âmbar vs. card
  vermelho no mesmo item da fila). Os outros 5 locais ficam fora — nenhum deles foi citado na
  ambiguidade original, e uniformizar os 7 de uma vez foge do XS/Fast; registrar como follow-up
  informal se aparecer de novo.
- **KPI strip:** mesmo adapter (`buildSelectedAthleteFromDashboard`,
  `coachInboxAdapters.ts:158-221`) já produz `quickStats.hasWindowData` (linha 209), usado hoje só
  por `DiagnosisTabPanel.tsx:145-181` (`EmptyMetricState` quando `false`). O strip do cabeçalho
  (`CoachInboxPage.tsx:756-773` e `:776-803`) e os tiles de Aderência/Carga(7d) NÃO consultam a
  flag — usam fallback numérico (`?? 0`). Forma/ACWR já degradam pra "—", mas por `null` técnico
  do cálculo, não por `hasWindowData` — não distinguem zero legítimo. **Não precisa mudar API nem
  criar flag nova** — a premissa do proposal se confirma: é consumir `hasWindowData` que já chega
  no mesmo objeto `selected`.

- [x] 1.1 **Feito.** Novo mixin `SECONDARY_OUTLINE_SX` (`shared/components/actionButtonSx.ts`) —
      `color: surface[400]`, `borderColor: surface[600]` — aplicado aos 3 botões do rodapé
      (`CoachInboxPage.tsx`). Toggle do PMC (`PMCChart.tsx` `ToggleButton`) trocado de
      `primary[500]`/navy pra `surface[700]`/`surface[50]` no estado selecionado.
      *verify:* lint+build limpos; `npm run test:run -- CoachInboxPage` → 21/21 (sem teste
      dedicado de `PMCChart`, sem asserção de cor pra quebrar).
- [x] 1.2 **Feito, com correção de escopo.** A ambiguidade badge×card do Why #2 está inteira
      dentro de `QueueRow.tsx`, não entre `AthleteRow.tsx` e `QueueRow.tsx` como o levantamento
      inicial assumiu: o Chip (badge, topo-direita) usa `athlete.status` (roster/backend) e a
      moldura do card + linha de motivo usam `attention.severity` (fila) — duas fontes
      independentes que podem divergir pro mesmo atleta (`status='warning'` com
      `severity='CRITICA'` mostrava chip âmbar numa moldura vermelha). Corrigido fazendo o Chip
      seguir o sinal (`attention`) quando ele existe, mesma precedência que a moldura já usava
      ("o sinal domina a moldura do card" — comentário pré-existente). `AthleteRow.tsx` não foi
      tocado — o mapeamento dele (`StatusBadge`) já estava correto e é usado noutra tela
      (roster), não na fila.
      *verify:* RED confirmado antes do fix (2 testes novos); `npm run test:run -- QueueRow` →
      11/11; suíte completa 193 arquivos/1587 testes; lint+build limpos.
- [x] 1.3 **Feito, escopo restrito ao strip (grade de `MetricTile`).** Os 4 tiles (Aderência,
      Carga (7d), Forma, ACWR) agora consultam `selected.quickStats.hasWindowData` — sem dado
      renderiza `'—'`/`'Sem dado na janela'`/tom `neutral` (sem ícone); com dado, mantém a lógica
      de tom original (zero legítimo continua numérico). Achado adicional durante a implementação:
      Forma já caía em `'—'` no fixture de teste padrão porque `roster.statusForma` também estava
      ausente — mas `roster.statusForma` É um fallback usado mesmo sem PMC (`coachInboxAdapters.ts
      :214`), então o gate por `hasWindowData` era necessário mesmo assim, só não observável nesse
      fixture específico. **Não tocado:** o bloco maior acima do strip ("Aderência geral"/"Carga
      semanal", `CoachInboxPage.tsx:756-773`) tem o mesmo problema mas não é chamado de "strip" na
      proposta nem no critério de aceite 3 — fica de fora, mesmo raciocínio de escopo da 1.2.
      *verify:* RED confirmado (bug reproduzido: chip "0%" com ícone `WarningAmberIcon` "Atenção"
      antes do fix); `npm run test:run -- CoachInboxPage` → 2/2 novos; suíte completa 193/1589;
      lint+build limpos.
- [x] 1.4 **Feito.** Novo `src/pages/error/ErrorPage.tsx` (tema, PT-BR, botão "Voltar ao inbox").
      Dois mecanismos, porque o array de rotas de `App.tsx` não tem um único nó raiz: (1)
      catch-all `{ path: '*', element: <ErrorPage kind="not-found" /> }` ao final do array — cobre
      qualquer hash sem rota correspondente; (2) `errorElement={<ErrorPage />}` no nó
      `<ProtectedRoute />` — cobre erro de render em qualquer rota autenticada (Dashboard/Coach/
      Athlete). `kind` é explícito porque o catch-all usa `element` (rota combina normalmente,
      `useRouteError()` não carrega nada) — sem o prop, cairia na mensagem genérica de "erro de
      render" também pro 404.
      *verify:* 2 testes novos (`ErrorPage.test.tsx`, via `createMemoryRouter`: catch-all e
      `errorElement` separadamente) verdes; navegação manual real em
      `http://localhost:5174/#/coach/rota-que-nao-existe` confirmou a página no tema (via Chrome
      automation); suíte completa 194 arquivos/1591 testes; lint+build limpos.
## 1.6 QA (2026-09-18) — `frontend-reviewer` + `clean-code-reviewer` em paralelo

Nenhum achado Crítico. Corrigidos:
- `ErrorPage.tsx`: erro de render capturado pelo `errorElement` não era logado em lugar nenhum —
  pior que o fallback default do React Router (que ao menos aparece no console). Adicionado
  `console.error` guardado por `!rotaInexistente` (não loga 404, que é navegação normal, não falha).
- `ErrorPage.tsx`: `h4` sem `color` explícito (padrão do resto de `src/pages/*` é sempre token
  explícito) → `surface[0]`; import de `elevation`/`surface` unificado pra fonte canônica que o
  resto do app usa (`theme/tokens`, exceto `elevation` que só existe em `shared/design-tokens`).
- `CoachInboxPage.tsx`: comentários explicando dois branches que pareciam duplicação por acidente
  mas são intencionais — o `'—'` de Forma alcançável por dois caminhos (sem dado vs. faixa fora do
  mapa), e a checagem extra do tile ACWR (`quickStats.acwr` pode faltar mesmo com
  `hasWindowData=true`, já que só usa o último ponto do PMC).

**Aceito como dívida, não corrigido** (XS/Fast, custo de extração > benefício agora):
- Duplicação do padrão `semDadoNaJanela ? ... : ...` nos 4 `MetricTile` do strip — extrair um
  helper só se um 5º tile nascer com a mesma necessidade.
- `QueueRow.tsx` reconstrói inline o shape de paleta que `statusPalette` já encapsula (não dá pra
  reusar direto — `statusPalette` recebe `CoachAtletaStatus`, não uma cor solta); promover pra um
  `paletteFromColor` compartilhado só se um 3º lugar precisar do mesmo cálculo.

*verify:* `npm run test:run` → 194 arquivos/1591 testes; lint+build limpos.

- [x] 1.5 **Feito.** `tasks.md` atualizado (entregue vs. adiado, notas de escopo de 1.2/1.3, QA em
      1.6). PR aberto a seguir.
