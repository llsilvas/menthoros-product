# Tasks — coach-reordenar-etapas-dnd

Só front. Validação: `npm run lint && npm run build && npm run test:run`; E2E onde indicado.
Branch `feat/coach-reordenar-etapas-dnd` em `apps/menthoros-front`, em worktree.

## 1. Editor

- [ ] 1.1 Instalar `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` com
      `npm install --save-exact` (sem `^`). verify: `npm run build`; `package.json` sem caret.
- [ ] 1.2 `EtapasEditor`: `DndContext` + `SortableContext` (`verticalListSortingStrategy`) no nível
      raiz, ids = `item.id` dos itens raiz; cada item vira `useSortable` com alça `DragIndicator`
      em botão próprio (`aria-label="Arrastar etapa N"`, `touch-action: none` só nele);
      `onDragEnd` → `arrayMove` sobre `prev` via o `onChange` existente; sensores
      `PointerSensor` (`activationConstraint.distance`) + `KeyboardSensor` com
      `sortableKeyboardCoordinates`; `disabled` desliga os sensores. Soltar sem mudança
      (`over` nulo, `active.id === over.id`, `disabled`) não chama `onChange` (CA7). Setas
      intactas. Testes de componente: CA1 (disparar `onDragEnd` e conferir o array), CA2 (bloco
      move inteiro), CA3 (setas e drag produzem o mesmo array), CA4 (foco na alça, Espaço, seta
      para baixo, Espaço → item desce uma posição), CA5, CA7 (zero chamadas a `onChange`).
      verify: `npx vitest run src/features/coach/components/etapas`.
- [ ] 1.3 Estilo do item em arrasto em `etapasStyles.ts` (opacidade/sombra com tokens do tema;
      `transform`/`transition` do `useSortable`). verify: lint.
- [ ] 1.4 E2E em `plano-zonas-editor.spec.ts`: treino com avulsa, **bloco** e avulsa; arrastar a
      terceira para o topo pela alça com `page.mouse.down/move(…, { steps })/up` (a
      `activationConstraint` exige movimento real; fallback: teclado na alça) e afirmar a ordem no
      corpo do PATCH e no DOM; o fake do PATCH devolve as etapas expandidas com `blocoId` como o
      contrato real, e reabrir o editor mostra o bloco inteiro na nova posição (CA1, CA2, CA6).
      verify: `npx playwright test plano-zonas-editor`.
- [ ] 1.5 Suite completa; `/qa`; PR → `develop`.

## 2. Fechamento

- [ ] 2.1 Spec delta promovida; tasks marcadas; `/done`.
