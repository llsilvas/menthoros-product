# Tasks — coach-reordenar-etapas-dnd

Só front. Validação: `npm run lint && npm run build && npm run test:run`; E2E onde indicado.
Branch `feat/coach-reordenar-etapas-dnd` em `apps/menthoros-front`, em worktree.

## 1. Editor

- [ ] 1.1 Instalar `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (versões fixas).
      verify: `npm run build`.
- [ ] 1.2 `EtapasEditor`: `DndContext` + `SortableContext` (estratégia vertical) no nível raiz;
      cada item vira `useSortable` com alça `DragIndicator` (`aria-label="Arrastar etapa N"`);
      `onDragEnd` → `arrayMove` via o `onChange` existente; sensores pointer + keyboard;
      `disabled` desliga. Setas intactas. Testes de componente: CA1 (simular `onDragEnd`), CA2,
      CA3, CA5. verify: `npx vitest run src/features/coach/components/etapas`.
- [ ] 1.3 Estilo do item em arrasto em `etapasStyles.ts` (opacidade/sombra com tokens do tema).
      verify: lint.
- [ ] 1.4 E2E em `plano-zonas-editor.spec.ts`: arrastar a terceira etapa para o topo e afirmar a
      ordem no corpo do PATCH (CA1, CA6). verify: `npx playwright test plano-zonas-editor`.
- [ ] 1.5 Suite completa; `/qa`; PR → `develop`.

## 2. Fechamento

- [ ] 2.1 Spec delta promovida; tasks marcadas; `/done`.
