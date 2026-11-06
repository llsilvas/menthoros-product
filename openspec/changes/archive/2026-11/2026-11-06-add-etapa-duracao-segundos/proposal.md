**Tamanho:** M · **Trilha:** Full

# Proposal — add-etapa-duracao-segundos

## Why

A duração da etapa é um inteiro em minutos de ponta a ponta (`EtapaTreino.duracaoMin: Integer`,
`EtapaInputDto.duracaoMin`, `EtapaTreinoDto.duracaoMin`; o editor serializa com `parseInt`). Isso
impede o editor de derivar a duração de distância × pace: 400 m a 4:00/km dá 1,6 min, que viraria
2 — erro de 25% num tiro curto. O mesmo limite já distorce o que vai ao relógio: um tiro de 1 km a
4:10 prescrito por tempo chega ao intervals.icu como 4:00 ou 5:00.

Destacada de `coach-etapa-calculos-auxiliares` em 2026-11-05: os outros cálculos são só front e
não precisavam esperar a mudança de contrato.

## What Changes

- **Backend** — a etapa ganha `duracaoSeg` (segundos, inteiro, opcional) no contrato de entrada e
  saída e na tabela (`tb_etapa_treino.duracao_seg`, coluna nula, sem backfill). `duracaoMin`
  continua existindo e **passa a ser derivado** de `duracaoSeg` quando os dois chegam: a fonte da
  verdade é o segundo. Os 17 leitores de `getDuracaoMin()` seguem funcionando sem mudança; só o
  conversor do intervals.icu passa a usar os segundos exatos.
- **Frontend** — o editor de etapas aceita duração em `m:ss` (`4:10`; `4` vale `4:00`), envia
  `duracaoSeg`, e deriva a duração de distância × pace quando ela está vazia ou já derivada. Com os
  três campos ligados, vale a regra: o último editado manda e só o campo derivado muda.
- **LLM** — o planner continua prescrevendo `duracaoMin` em minutos inteiros; o schema de saída não
  muda. Etapa gerada pela IA nasce sem `duracaoSeg`.

## Non-Goals

- Não migra `duracao_min` para segundos nem remove o campo: 17 arquivos do backend o leem
  (TSS, normalizador, validador de FC, prompts, redistribuição) e o ganho não paga o risco.
- Não muda `TreinoPlanejado.duracaoMin` (ISO-8601) nem a duração do treino realizado.
- Não altera o schema de saída do LLM.
- Garmin: o envio ao relógio passa pelo intervals.icu; não há conversor próprio a ajustar.

## Capabilities

### New Capabilities

- `coach-workout-step-editing`: duração da etapa com precisão de segundos no contrato e no editor,
  e derivação entre distância, duração e pace.

### Modified Capabilities

(nenhuma — `coach-athlete-zones` não muda requisito; o seletor de zona segue igual.)

## Impact

- `apps/menthoros-backend`: migration Flyway `V11x__add_duracao_seg_etapa_treino.sql`;
  `EtapaTreino`, `EtapaInputDto`, `EtapaTreinoDto`, `TreinoMapper`,
  `TreinoPlanejadoServiceImpl.aplicarEtapasPatch` (deriva `duracaoMin`),
  `IntervalsIcuWorkoutConverter.duracaoEmSegundos` (prefere `duracaoSeg`), `EtapaTreinoLlmDto`
  (só para passar o campo adiante quando existir).
- `apps/menthoros-front`: `types/PlanoReview.ts` (`EtapaInputPayload`, `EtapaTreinoDto`),
  `etapas/etapaItem.ts` (campo, serialização, derivação), `EtapasEditor` (campo `m:ss`),
  `workout/profile/input.ts` (largura do bloco em segundos), totais dos dialogs.
- Dependência: `coach-etapa-calculos-auxiliares` mergeada (a derivação de distância e o marcador
  `distanciaAuto` são a base da regra dos três campos).

## Critérios de aceite

1. **Contrato** — Given PATCH de etapas com `duracaoSeg: 250`, Then a etapa é gravada com
   `duracao_seg = 250` e `duracao_min = 4`; o GET devolve `duracaoSeg: 250` e `duracaoMin: 4`.
2. **Compatibilidade** — Given PATCH só com `duracaoMin: 4` (cliente antigo ou IA), Then
   `duracao_seg` fica nulo e `duracaoMin = 4`, como hoje. Given os dois com valores incoerentes
   (`duracaoSeg: 250`, `duracaoMin: 7`), Then vale o segundo e `duracaoMin` grava 4.
3. **Relógio** — Given etapa com `duracaoSeg: 250` e sem distância, When o treino é convertido
   para o intervals.icu, Then o step sai com `duration: 250`. Given etapa só com `duracaoMin`,
   Then `duration = min × 60`, como hoje.
4. **Leitores intactos** — TSS, normalizador, `EtapaFcValidator`, prompts e redistribuição não
   mudam de comportamento com `duracaoSeg` presente (suite do backend verde sem alteração neles).
5. **Editor em m:ss** — Given o editor, When o treinador digita `4:10`, Then o campo mostra `4:10`
   e o PATCH leva `duracaoSeg: 250`; `4` vale `4:00`; `4:7` é normalizado para `4:07` no blur;
   texto inválido não é enviado e o campo avisa.
6. **Duração derivada** — Given etapa com duração vazia, When o treinador informa `1` km e pace
   `4:10/km`, Then a duração mostra `4:10`. Given faixa `4:00-4:20/km`, Then usa o ponto médio.
7. **Último editado manda** — Given distância derivada, When a duração é digitada, Then a
   distância recalcula e a duração passa a manual. Given duração derivada da distância digitada,
   When a duração é digitada, Then a distância não muda. When o pace muda, Then só o campo
   marcado como derivado muda; sem campo derivado, nada muda. O campo derivado é indicado
   visualmente e não vai ao PATCH.
8. **Etapa carregada** — Given etapa do backend com `duracaoSeg: 250`, Then o editor mostra
   `4:10`; com só `duracaoMin: 4`, mostra `4:00`; o perfil do treino e os totais usam os segundos.
9. **Regressão** — `./mvnw clean verify` e `npm run lint && npm run build && npm run test:run`
   verdes; E2E `tests/e2e/coach/plano-zonas-editor.spec.ts` com caso que afirma `duracaoSeg` no
   corpo do PATCH; IT do conversor do intervals.icu cobrindo o CA3.

## Métrica de sucesso

- Proxy mecânico: critérios 1–8 cobertos por testes, 9 verde nos dois repos.
- Rotina do treinador: tiro prescrito por distância e pace sai com a duração certa no relógio sem
  conta de cabeça. Meta: após o deploy, etapas editadas pelo coach com `duracao_seg` não múltiplo
  de 60 existem (consulta em `tb_etapa_treino`), e nenhum ajuste manual de "arredondar para o
  minuto" é necessário.

## Status

- draft (2026-11-05): destacada de `coach-etapa-calculos-auxiliares`.
- Revisão de produto (2026-11-05, `product-reviewer`): **Refine**. Incorporados: indicação visual
  do campo derivado (D4/D5); `h:mm:ss` aceito e inválido bloqueia o salvar; compatibilidade
  front novo × backend antigo promovida a gate (task 1.2). Perguntas abertas abaixo.
- Pre-mortem Codex (2026-11-05): **NOT READY**, 10 achados, todos conferidos no código e
  absorvidos no `design.md` (D1 construtor compartilhado e `comRepeticoes`; D2 distância vence
  duração no conversor → derivado fora do payload, assinatura do editor; D3 schema por reflexão;
  D4 inválido bloqueia; D5 cenário contraditório corrigido; piso de 1 min removido).
- DoR (2026-11-05, `/implement init`): spec-reviewer READY WITH GAPS + DeepSeek NOT READY (Codex
  sem cota). Convergência: a spec e o D4 ainda tinham o piso `max(1, …)` que o D1 removera —
  alinhado em "round, sem piso; front omite `duracaoMin` quando dá 0". Gaps menores absorvidos:
  migration V112, chamadores do construtor de `EtapaInputDto`, teste concreto de compatibilidade
  (Spring ignora propriedade desconhecida por padrão), E2E do PATCH sem duração. Rebatidos no
  `design.md`: reabrir não muda a duração derivada quando as zonas mudam (usa o `ritmoAlvo`
  gravado); etapas existentes não têm `duracaoSeg`, então a inferência de série não muda.

## Open Questions & Assumptions

- **Premissa:** `duracaoMin = round(duracaoSeg / 60)`, sem piso. Etapa abaixo de 30 s fica com
  `duracaoMin = 0`, que os leitores legados tratam como ausente (ver D1).
- **Premissa:** o campo do editor vira texto `m:ss` para todas as etapas, não só para as curtas.
  Alternativa descartada: dois campos (min + seg) — mais cliques e mais erro. Validar com o
  treinador do piloto antes de generalizar (review de produto).
- **Decisão (ver D5):** medida derivada não vai ao backend. Consequência: o treino gravado tem só
  o que o treinador digitou; o editor recalcula o campo vazio ao reabrir.
- **Decidido (founder, 2026-11-05):** o piloto tem treinadores que prescrevem tiros curtos — a
  change segue agora.
- **Decidido (founder, 2026-11-05):** editar só o segundo de uma etapa gerada pela IA **conta**
  como edição para a acceptance rate, como qualquer outra mudança. Nenhum tratamento especial no
  diff IA × coach.
- **Aberto:** o `WorkoutAnalysisPromptDataBuilder` e a análise pós-treino comparam
  planejado × realizado em minutos; com `duracaoSeg` disponível, usar segundos ali é melhoria
  separada, fora desta change.
