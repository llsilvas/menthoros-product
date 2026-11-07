# Tasks — coach-reordenar-etapas-dnd

Só front. Validação: `npm run lint && npm run build && npm run test:run`; E2E onde indicado.
Branch `feat/coach-reordenar-etapas-dnd` em `apps/menthoros-front`, em worktree.

## 1. Editor

- [x] 1.1 Instalar `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` com
      `npm install --save-exact` (sem `^`). verify: `npm run build`; `package.json` sem caret.
- [x] 1.2 `EtapasEditor`: `DndContext` + `SortableContext` (`verticalListSortingStrategy`) no nível
      raiz, ids = `item.id` dos itens raiz; cada item vira `useSortable` com alça `DragIndicator`
      em botão próprio (`aria-label="Arrastar etapa N"`, `touch-action: none` só nele);
      `onDragEnd` → `arrayMove` sobre `prev` via o `onChange` existente; sensor
      `PointerSensor` (`activationConstraint.distance`); `disabled` desliga o sensor. Soltar sem mudança
      (`over` nulo, `active.id === over.id`, `disabled`) não chama `onChange` (CA7). Setas
      intactas. Alça à esquerda do header (antes do quadradinho de cor), `cursor: grab`, área de
      toque 44px abaixo de `sm`. Sem KeyboardSensor, anúncios ou reduced-motion (adiados, ver
      proposal "Adiado"). Testes de componente: CA1 (disparar `onDragEnd` e conferir o array), CA2 (bloco
      move inteiro), CA3 (setas e drag produzem o mesmo array), CA5, CA7 (zero chamadas a `onChange`).
      verify: `npx vitest run src/features/coach/components/etapas`.
      `reordenar` vive em `etapaItem.ts` (helper puro; exportar do componente quebrava
      `react-refresh/only-export-components`). Testes em `EtapasEditor.dnd.test.tsx` com o
      `DndContext` substituido para expor `onDragEnd` — o gesto real fica no E2E (1.4).
- [x] 1.3 Estilo do item em arrasto em `etapasStyles.ts` (opacidade/sombra com tokens do tema;
      `transform`/`transition` do `useSortable`). verify: lint.
- [x] 1.4 E2E em `plano-zonas-editor.spec.ts`: treino com avulsa, **bloco** e avulsa; arrastar a
      terceira para o topo pela alça com `page.mouse.down/move(…, { steps })/up` (a
      `activationConstraint` exige movimento real; fallback: teclado na alça) e afirmar a ordem no
      corpo do PATCH e no DOM; o fake do PATCH devolve as etapas expandidas com `blocoId` como o
      contrato real, e reabrir o editor mostra o bloco inteiro na nova posição (CA1, CA2, CA6).
      verify: `npx playwright test plano-zonas-editor`.
      Gesto por `mouse.down/move/up` funcionou; o clique em Salvar logo após o drop morria no
      `stopPropagation` que o dnd-kit mantém no `document` por 50ms (`AbstractPointerSensor.detach`)
      — espera de 100ms no teste, usuário real não alcança esse intervalo.
- [x] 1.5 Suite completa; `/qa`; PR → `develop`.
      Parcial (2026-11-07): lint, build, 2853 unitários e E2E completo verdes. `/qa` (frontend,
      clean-code, Codex) sem Critical; ajustes em commit próprio: setas via `reordenar`, guarda de
      destino desconhecido, Escape no arrasto não fecha o dialog (Modal do MUI consome a tecla
      antes do dnd-kit), header com `flexWrap` em 360px, tokens no item em arrasto. PR: llsilvas/menthoros-front#203.

## 2. Fechamento

- [ ] 2.1 Spec delta promovida; tasks marcadas; `/done`.
