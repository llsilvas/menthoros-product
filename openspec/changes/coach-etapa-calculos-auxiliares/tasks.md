# Tasks — coach-etapa-calculos-auxiliares

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build &&
npm run test:run`; E2E onde indicado. Branch já existente: `feat/coach-etapa-distancia-auto`
(worktree `.worktrees/coach-etapa-distancia-auto`) — adotar em vez de criar outra.

## 1. Distância derivada de pace × duração

- [x] 1.1 `recalcularDistancia(antes, depois)` em `etapas/etapaItem.ts`: calcula com duração e
      ponto médio do pace, 2 casas; só mexe em distância vazia, zerada, marcada `distanciaAuto` ou
      igual à conta anterior; pace incompleto mantém valor e marcador. Marcador `distanciaAuto` em
      `StepRow`/`SubStep`, fora do payload. Testes em `etapaItem.test.ts` (CA1–CA5).
      verify: `npx vitest run src/features/coach/components/etapas/etapaItem.test.ts`.
- [x] 1.2 `BlocoCard` chama o recálculo ao mudar duração ou intensidade (pace/zona); digitar a
      distância zera o marcador. verify: lint + build.
- [~] 1.3 E2E em `tests/e2e/coach/plano-zonas-editor.spec.ts`: escolher Z5 numa etapa de 30 min
      preenche `6.49`; valor digitado vence. **Refazer a asserção do PATCH** em dois casos: etapa
      com derivado → PATCH sem `distanciaKm`; etapa com `7` digitado → PATCH com `distanciaKm: 7`.
      Reabrir o treino mostra a derivada de novo. verify: `npx playwright test plano-zonas-editor`.
- [ ] 1.4 Derivado fora do payload e regras fechadas no DoR: `serializarItens` omite `distanciaKm`
      quando `distanciaAuto`; hidratação recalcula a distância vazia como derivada; valor gravado
      nunca é derivado — remover a regra "igual à conta anterior" de `recalcularDistancia`, com
      teste que prova (gravado `2` com 10 min a 5:00 não acompanha); duração vazia/zero ou pace
      vazio limpam a derivada (pace incompleto mantém); derivação usa `parseInt` da duração. Indicação visual do campo calculado no
      `BlocoCard` (texto de apoio "calculado de pace × duração"). Testes CA1, CA4 e CA5 revistos.
      verify: vitest do arquivo + lint + build.
- [ ] 1.5 Commit do bloco na branch (`feat(coach): distancia da etapa derivada de pace e duracao`).

## 2. Zona sugerida no Personalizado

- [ ] 2.1 `ZoneSelector`: com `value.zona === 'PERSONALIZADO'` e `zones`, mostrar a zona de
      `zonaPorValor(fcAlvoEtapa, ritmoAlvo, alvoPrimario, zones)` como texto de apoio, nomeando o
      eixo de onde a zona veio ("Pace cai em Z5 para este atleta" / "FC cai em Z3"); nada quando
      `null`. O eixo exibido é o que `zonaPorValor` usou: com os dois eixos na mesma zona, o
      `alvoPrimario` ou pace. Testes em `ZoneSelector.test.tsx`: pace, FC, eixos divergentes com e
      sem `alvoPrimario`, fora de zona, sem zonas (CA6). verify: vitest do arquivo + lint + build.

## 3. Resumo da série

- [ ] 3.1 Extrair de `totaisDeItens` a conta por item (`totaisDoItem(item)`), reutilizada pelo
      total; teste em `etapaItem.test.ts`. verify: vitest do arquivo.
- [ ] 3.2 Cabeçalho da série em `EtapasEditor` mostra `N× · min · km` com `data-testid`
      `resumo-serie-${idx}`; atualiza com repetições e etapas. Teste de componente (CA7).
      verify: lint + build + vitest.

## 4. Distribuição por zona no total

- [ ] 4.1 Formatador puro `formatarDistribuicao(distribuicao, totalSeg)` em
      `adapters/zonaPredominante.ts`: denominador é o tempo total das etapas (`blocks` somados,
      inclusive sem zona), resto como "sem zona"; percentuais inteiros somando 100 pelo maior
      resto; ordem por zona; vizinhas contíguas agrupadas (`Z1–Z2`); `null` sem nenhuma zona.
      Testes dos três exemplos do CA8. verify: vitest do arquivo.
- [ ] 4.2 `TreinoEditDialog` e `TreinoAddDialog` mostram o texto ao lado do total
      (`data-testid="distribuicao-zonas"`). Decidir o corte para mais de três zonas olhando a tela
      e registrar aqui. verify: lint + build + testes dos dialogs.

## 5. Fechamento

- [ ] 5.1 Suíte completa: `npm run lint && npm run build && npm run test:run && npm run test:e2e`.
- [ ] 5.2 Atualizar `openspec/specs/coach-athlete-zones/spec.md` (delta: sugestão de zona no
      Personalizado) e marcar as tasks. `/qa` → `/pr coach-etapa-calculos-auxiliares` → `/done`.
