**Tamanho:** S · **Trilha:** Fast (só front; sem contrato novo)

# Proposal — coach-reordenar-etapas-dnd

## Why

Reordenar etapas no `EtapasEditor` é por setas (`moverItem`, um clique por posição). Um treino de
dez etapas em que o aquecimento foi criado por último custa nove cliques e nove re-renders para
chegar ao topo. Arrastar e soltar é o gesto que o treinador espera de uma lista editável.

Validado no backend (2026-11-06): a ordem das etapas é **derivada da posição no array** do PATCH
(`aplicarEtapasPatch`, `ordem = 1..n`); `EtapaInputDto` não tem `ordem`. Então reordenar é
mudança só de front — o array já sai na ordem da tela.

## What Changes

- `EtapasEditor`: cada item do nível raiz (etapa avulsa ou bloco) ganha alça de arrastar; soltar
  reordena a lista chamando o mesmo `onChange` que `moverItem` usa hoje. Setas continuam, como
  fallback de teclado e de telas sem ponteiro.
- Dependência nova: `@dnd-kit/core` + `@dnd-kit/sortable` (+ `@dnd-kit/utilities`). Sem lib de
  DnD no projeto; HTML5 nativo não cobre touch nem teclado. Aprovação implícita pelo escopo desta
  change.

## Non-Goals

- Arrastar sub-etapa de um bloco para fora dele, ou etapa para dentro de um bloco (só entre
  irmãos do nível raiz).
- Reordenar sub-etapas dentro do bloco (hoje nem setas têm; fica para quando houver pedido).
- Reordenar treinos entre dias (é a change `coach-alterar-data-treino`).

## Capabilities

### Modified Capabilities

- `coach-workout-step-editing`: o editor passa a reordenar por arrastar e soltar, além das setas.

## Impact

- `apps/menthoros-front`: `package.json` (dnd-kit), `etapas/EtapasEditor.tsx` (contexto sortable,
  alça, `onDragEnd` → `arrayMove`), `etapas/etapasStyles.ts` (estado "arrastando"),
  `EtapasEditor.test.tsx`; E2E `plano-zonas-editor.spec.ts` ou `plan-review-edicao.spec.ts`.
- Sem backend, sem contrato.

## Critérios de aceite

1. **Arrastar reordena** — Given três etapas A, B, C, When o treinador arrasta C para antes de A,
   Then a lista mostra C, A, B e o PATCH leva as etapas nessa ordem.
2. **Bloco é um item** — Given um bloco entre etapas avulsas, When arrastado, Then move inteiro
   com suas sub-etapas; sub-etapas não saem do bloco.
3. **Setas continuam** — Given o editor, Then as setas funcionam como hoje e as duas vias produzem
   o mesmo array.
4. **Teclado** — Given foco na alça, When Espaço + setas + Espaço, Then a etapa muda de posição
   (sensor de teclado do dnd-kit).
5. **Desabilitado** — Given `disabled` (salvando), Then não arrasta.
6. **Regressão** — lint, build, `test:run` e E2E com um caso de arrastar afirmando a ordem no
   corpo do PATCH.

## Métrica de sucesso

- Proxy mecânico: CA1–5 cobertos; CA6 verde.
- Rotina do treinador: reposicionar uma etapa custa um gesto em vez de N cliques.

## Status

- draft (2026-11-06).

## Open Questions & Assumptions

- **Premissa:** dnd-kit é aceitável como dependência (três pacotes, sem peer deps além de React).
  Alternativa descartada: HTML5 `draggable` — sem touch e sem a11y.
- **Premissa:** a alça é um ícone dedicado (`DragIndicator`), não o card inteiro — o card tem
  inputs, e arrastar pelo card roubaria a seleção de texto.
- **Aberto:** animação de reordenação (`CSS.Transform` do dnd-kit) ou troca seca? Proposta:
  animação padrão do sortable, sem ajuste.
