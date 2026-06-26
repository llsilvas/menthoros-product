**Tamanho:** S · **Trilha:** Fast

## Why

O `CoachInboxPage` é a tela central do treinador — onde ele revisa atletas, avalia fadiga e decide ações. Três bugs silenciosos fazem com que as métricas exibidas sejam fictícias ou invertidas:

1. `acuteLoad` (carga aguda do atleta) é preenchido com `ctl` (fitness crônica), que é o oposto conceitual. Um treinador lendo "Carga aguda: 52" está vendo a fitness de longo prazo, não a fadiga atual.
2. `monotony` está hardcoded em `1.0` para todos os atletas sempre. O dashboard exibe "Monotonia 1.00" como se fosse dado real.
3. `loadDelta` está hardcoded em `0`. O tile "Carga (7d)" mostra "+0% vs. ant." para todos os atletas, tornando o indicador de risco de lesão (variação semanal > 10%) invisível.

Adicionalmente, o tile "Fadiga" usa dois limiares de TSB inline (`< -10` e `< 0`) enquanto o projeto já tem `formFromTSB()` e `AthleteForm.ts` com cinco níveis calibrados — código existente que não é aproveitado.

Por fim, o backend envia `limiareisInferidos` (FC limiar e pace limiar inferidos com índice de confiança) que o frontend descarta completamente, desperdiçando um dado de alto valor para ajuste de zonas.

Todos esses dados já estão disponíveis no payload atual — sem necessidade de mudança de API ou banco.

## What Changes

**Somente `apps/menthoros-front`.**

### Bugs corrigidos
- `acuteLoad` → usa `latestPmc?.atl` (era `ctl`)
- `monotony` → calculado como `mean(TSS 7d) / stddev(TSS 7d)` a partir do array PMC já recebido (fallback `1.0` quando há menos de 3 pontos)
- `loadDelta` → calculado comparando CTL (ou volume) da semana atual vs. semana anterior a partir do array PMC (fallback `0` quando histórico insuficiente)

### Wiring de código existente
- Tile "Fadiga" passa a usar `formFromTSB(latestPmc.tsb)` de `AthleteForm.ts` em vez dos limiares inline (`< -10` / `< 0`)
- Valor numérico do TSB aparece como delta do tile (ex: "TSB: −8")

### Nova seção no tab "Status"
- Card `LimiareisInferidosCard` no `StatusTabPanel` exibindo FC limiar inferida, pace limiar inferido e índice de confiança quando `limiareisInferidos` estiver presente no perfil

### Convenção de nomenclatura documentada
- Adicionada regra no `apps/menthoros-front/CLAUDE.md`: nomes técnicos (tipos TS, componentes, hooks, funções) em inglês; strings de valor de domínio de negócio em PT-BR; enum string values devem seguir a língua da camada (PT-BR para domínio: `'ATRASADO'`, `'ALVO'`; inglês para estados técnicos: `'PENDING'`, `'APPROVED'`). Sem renomeação de arquivos nesta change — apenas a regra documentada.

## Capabilities

### Modified Capabilities
- `coach-inbox`: as métricas de fadiga, carga aguda, delta de carga e monotonia passam a refletir dados reais do PMC em vez de valores hardcoded ou invertidos.

## Impact

**Banco:** nenhuma alteração.

**API:** nenhuma alteração de contrato. Os campos `atl`, `tsb`, `tss` do `PmcPontoDto` e `limiareisInferidos` do `AtletaPerfilCoachOutputDto` já existem no payload.

**Repositórios afetados:** somente `apps/menthoros-front` (adapter, componentes, CLAUDE.md).

**Risco de regressão:** baixo — as correções estão isoladas em `coachInboxAdapters.ts` e no `StatusTabPanel`. O comportamento de aprovação/rejeição de planos e paginação não é tocado.

**Efeito observável para o treinador:** ao abrir um atleta com histórico PMC, as métricas de fadiga, delta de carga e monotonia passarão a mostrar valores reais em vez de fictícios.

## Critérios de aceite

- **CA-01:** Dado atleta com `latestPmc.atl = 72` e `latestPmc.ctl = 48`, o tile "Fadiga" mostra carga aguda de 72 (não 48).
- **CA-02:** Dado atleta com TSB = −8, o tile exibe label derivado de `formFromTSB(−8)` (`form_stable` → "Estável") e delta "TSB: −8".
- **CA-03:** Dado atleta com 7 pontos PMC de TSS `[80, 70, 90, 60, 100, 75, 85]`, o valor de monotonia calculado é `mean/stddev` desses valores (≈ 5.8), não `1.0`.
- **CA-04:** Dado atleta com PMC mostrando CTL semana atual = 55 e CTL semana anterior = 50, o `loadDelta` exibido é `+10%` (não `+0%`).
- **CA-05:** Dado atleta com `limiareisInferidos.fcLimiarEstimado = 172` e `confiancaInferenciaFc = 0.85`, o tab "Status" exibe o card de limiares com esses valores.
- **CA-06:** Dado atleta sem `limiareisInferidos` (null), o card de limiares não aparece (sem erro).
- **CA-07:** `npm run lint && npm run build` passa sem erros após as mudanças.

## Open Questions & Assumptions

| # | Premissa / Questão | Status |
|---|---|---|
| A1 | O array `pmc` do perfil sempre chega ordenado por data crescente (último = mais recente) | Assumido — confirmado no adapter: `pmcPoints[pmcPoints.length - 1]` já é usado assim |
| A2 | Cálculo de `monotony` usa os últimos 7 pontos do array PMC pelo campo `tss` | Assumido — cobre a janela de uma semana de treino |
| A3 | Quando o array PMC tem menos de 3 pontos, `monotony` cai para `1.0` e `loadDelta` para `0` | Assumido — fallback seguro e explícito |
| A4 | `limiareisInferidos` pode ser `null` mesmo quando o perfil é carregado | Confirmado no backend: `resolverLimiareisInferidos` retorna `null` quando não há dados de limiares suficientes |
| Q1 | O pace limiar inferido chega como `Double` (min/km em decimal) ou como `String` formatada? | A ser verificado no `AtletaPerfilCoachOutputDto` antes de implementar o card |

## Métrica de sucesso

Após o deploy, ao abrir qualquer atleta com ≥ 7 dias de histórico PMC no `CoachInboxPage`, os tiles "Fadiga", "Carga (7d)" e delta de carga devem exibir valores diferentes de `Alta/0.00/+0%` para pelo menos 80% dos atletas ativos — indicando que os dados reais do PMC estão sendo consumidos.
