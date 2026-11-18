# fix-total-treino-soma-etapas — a distância do treino contínuo é sempre a soma das etapas

**Tamanho:** S · **Trilha:** Fast
**Status:** proposta (2026-11-16)
**Criado:** 2026-11-16
**Bloqueia:** a rodada 2 da revisão cega (task 3.5 de `migrate-openai-retired-models`).

> Fast: duas regras na normalização de produção (`NormalizacaoDeTreino` / `TreinoNormalizador`), só no
> backend, sem schema nem contrato.

## Por que

Na rodada 2 da revisão cega (`docs/ia/revisao-cega-planos-2026-11-16-rodada2.md`) o coach notou que, em
treinos contínuos, a distância do treino não bate com a soma das etapas — e que já via isso em planos
anteriores. Medição: 45 de 104 treinos CONTINUO/LONGO/REGENERATIVO divergem. `reconciliarContinuo`
mantém o total da LLM de propósito em dois casos:

1. **PRINCIPAL sem `ritmoAlvo` próprio (19, todos `gpt-4o`):** o modelo põe o ritmo só no treino; a
   distância da PRINCIPAL não é derivada e o total não vira a soma (ex.: 1,63 + 5,0 + 0,82 = 7,45 km
   contra total 7,0 km).
2. **Aquecimento/desaquecimento sintetizado pelo reparo (26; 20 Luna, 6 `gpt-4o`):** decisão de produto
   de 22/09 — não inflar a prescrição — mantém o total e deixa as etapas somarem mais
   (ex.: 2,18 + 7,01 + 0,88 = 10,07 km contra total 7,0 km).

## Decisão do coach-fundador (2026-11-16)

- Caso 1: a PRINCIPAL sem ritmo usa o `ritmoAlvo` do treino (mesma regra de `add-etapa-pace-validator`:
  o ritmo declarado manda).
- Caso 2: **manter o total prescrito e encaixar as etapas nele** — a PRINCIPAL vira
  `total − demais etapas`, com a duração recalculada pelo ritmo. Preserva a decisão de 22/09 (não inflar
  o volume) e acaba com a divergência.

## O que muda

1. `TreinoNormalizador`: o pace da PRINCIPAL cai para o `ritmoAlvo` do treino quando a etapa não tem um.
2. `NormalizacaoDeTreino.reconciliarContinuo`: com etapa sintetizada, encaixa a PRINCIPAL no total;
   sem como encaixar (sobra ≤ 0 ou mais de uma PRINCIPAL), mantém o comportamento atual e registra.
3. Rodada 2 da revisão cega regerada.

## Critérios de aceite

- **CA1** — GIVEN CONTINUO com PRINCIPAL 30 min sem ritmo e treino com `ritmoAlvo` 6:00–6:30/km, WHEN
  normalizado, THEN a PRINCIPAL tem distância 30 ÷ 6,25 = 4,8 km e o total = soma das etapas.
- **CA2** — GIVEN REGENERATIVO total 7,0 km com aquecimento e desaquecimento sintetizados (2,18 e 0,88),
  THEN PRINCIPAL = 3,94 km, duração = 3,94 × pace médio, total 7,0 km = soma.
- **CA3** — GIVEN sobra ≤ 0 (etapas sintetizadas maiores que o total), THEN comportamento atual,
  divergência registrada.
- **CA4** — GIVEN os 30 planos regerados, THEN 0 treinos contínuos com total ≠ soma das etapas (±0,05 km),
  exceto CA3.
- **CA5** — `NormalizacaoDeTreinoCaracterizacaoTest`: esperados alterados um a um, com o motivo no commit.

## Open Questions & Assumptions

- **Assumido:** um treino contínuo tem uma PRINCIPAL; com mais de uma, não encaixa (CA3).
- **Assumido:** a duração total do treino é recalculada pela cauda (`recalcular-duracao`) a partir das etapas.
