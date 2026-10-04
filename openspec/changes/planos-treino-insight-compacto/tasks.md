# Tasks — planos-treino-insight-compacto

Repo: `apps/menthoros-front`, worktree `.worktrees/front-planos-treino-insight-compacto`, branch
`refactor/planos-treino-insight-compacto`. Validação padrão: `npm run lint && npm run build`
(+ `npm run test:run` nas tasks que tocam componente).

## 1. KPIs e grid

- [x] 1.1 `PlanoSemanaPanel.tsx`: remover o KPI "Volume alvo" (3 cartões) e a variável `volumeAlvo`.
- [x] 1.2 `PlanoSemanaPanel.tsx`: grid de treinos com `alignItems: 'flex-start'`.
      *verify:* `npm run lint && npm run build`

## 2. Insight compacto + dialog completo

- [x] 2.1 `InsightTreinoDialog.tsx` (novo): veredito (causa + nota), resumo, Recomendação em destaque,
      "O que o atleta leu" recolhido. Seções ausentes não renderizam.
- [x] 2.2 `TreinoCard.tsx`: insight compacto (tag, "Execução x/10", resumo em 2 linhas, "Ver insight
      completo"); remove a expansão inline e o estado `expandedInsight`.
      *verify:* `npm run lint && npm run build`

## 3. Testes e fechamento

> Validação num sandbox Linux isolado (o `node_modules` do Mac não roda o `vitest` na sessão), com cópia do
> worktree: `tsc` e `eslint` limpos; `vite build` ok; **`vitest` completo: 230 arquivos, 1946 testes passando**
> (inclui `TreinoCard`, `InsightTreinoDialog` e `planosDialog`). Falta só rodar na máquina do founder.

- [x] 3.1 `TreinoCard.test.tsx`: atualizar o que dependia de "Ver mais/Ver menos"; cobrir "Ver insight
      completo" abrindo o dialog.
- [x] 3.2 Teste do `InsightTreinoDialog` (seções presentes/ausentes, toggle de "O que o atleta leu") e do
      `PlanoSemanaPanel` (3 KPIs, sem "Volume alvo").
- [~] 3.3 `npm run lint && npm run build && npm run test:run` (feito no sandbox; repetir na máquina do founder) e conferência visual com
      o artboard "Insights do treino" (Page 2 do canvas).
