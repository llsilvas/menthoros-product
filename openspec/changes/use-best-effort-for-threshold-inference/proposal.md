# use-best-effort-for-threshold-inference — usar o melhor esforço atual como insumo de limiar/projeção de prova

**Tamanho:** provável M · **Trilha:** Full · **Status:** 🟢 **DESTRAVADA** —
`refactor-threshold-call-outside-transaction` mergeada em `develop`
([backend#135](https://github.com/llsilvas/menthoros-backend/pull/135), 2026-09-18); pré-requisito
técnico resolvido, pronta pra DoR/`/implement init`
**Criado:** 2026-09-18

> Destacada de `add-athlete-best-efforts` (D5) por decisão do founder em 2026-09-18: mudar o insumo
> de uma inferência que afeta zonas/prescrição é risco próprio, e merece sequenciamento e DoR
> próprios em vez de ir junto com "mostrar uma tabela de melhores esforços".
>
> **Pré-requisito de produção:** `add-athlete-best-efforts` está em `develop` (PRs
> [#133](https://github.com/llsilvas/menthoros-backend/pull/133)/[#120](https://github.com/llsilvas/menthoros-front/pull/120)),
> ainda não em `main`. Decisão do founder em 2026-09-18 (2ª rodada): destravar o design mesmo
> assim, com o dado de `develop`/homelab — a conferência em produção fica como item de fechamento,
> não gate de entrada.
>
> **Pré-requisito técnico (novo, 2026-09-18, 3ª rodada):** a investigação de código achou que
> `MelhorEsforcoService.buscar()` (chamada HTTP externa ao intervals.icu, cache 30min) entraria
> dentro da `@Transactional` de `AthleteThresholdUpdater`/`TsbServiceImpl` — que roda a **cada sync
> de treino**, frequência bem maior que o caso já aceito como dívida em `add-athlete-best-efforts`
> (que só chama na abertura do perfil). Restruturar essa fronteira transacional é, sozinha, do
> tamanho de uma change própria — destacada como `refactor-threshold-call-outside-transaction`,
> mesmo raciocínio que já gerou `refactor-llm-call-outside-transaction` separada da geração de
> plano. Esta change assume que aquela já está em `develop` antes de começar o `/implement init`.

## Why

`ThresholdInferenceService` já infere `paceLimiar` de duas fontes: passiva (mediana do quintil mais
rápido de treinos recentes, `inferirPaceLimiar`) e de prova registrada
(`inferirPaceLimiarDeProva`, via fórmula de Riegel isolada, change `infer-threshold-from-race-result`,
arquivada 2026-07-17). Nenhuma das duas olha pro **melhor esforço recente** do atleta (janela
rolante de 42 dias, distâncias curtas inclusive, `MelhorEsforcoService`) — que `add-athlete-best-efforts`
passa a expor no perfil do coach.

Hipótese: usar o melhor esforço atual (mesma fórmula de Riegel isolada, ancorando no tempo do
melhor esforço em vez do tempo de prova) como uma **terceira fonte**, com a mesma precedência já
estabelecida em `infer-threshold-from-race-result` D3 (fonte mais controlada/confiável vence):
**prova registrada (até 90 dias) > melhor esforço recente (janela fixa de 42 dias, distâncias
5k/10k — mesma faixa 5000-21097m já válida pra prova) > inferência passiva por quintil**. Uma prova
sob condição de competição é mais confiável que um melhor esforço de treino; um melhor esforço
recente (42d) é mais atual e mais controlado que a mediana passiva de treinos incidentais.

## Open Questions (a resolver no design.md)

- ~~Precedência entre as três fontes~~ — resolvida acima (prova > melhor esforço > quintil),
  confirmar no design.md se essa ordem se sustenta contra um pre-mortem.
- ~~Distâncias elegíveis~~ — resolvida: reusa a faixa 5000-21097m já validada pra prova
  (`ThresholdInferenceService.DISTANCIA_MINIMA/MAXIMA_VALIDA_M`); das 7 distâncias-alvo de
  `MelhorEsforcoService` (400m…10k), só 5k e 10k entram — 400m/800m/1.5k/1mi/3k ficam fora
  (anaeróbico/curto demais pra representar limiar de corrida contínua).
- ~~Janela~~ — resolvida: fixa em 42 dias pra inferência (não configurável), independente da
  janela de exibição (42d/1y/all) no perfil — "atual" é o significado que a change original já dava
  ao termo.
- Como isso interage com `fc-limiar-zones`/TSS/TSB e o prompt de geração de plano — mesma
  superfície pequena já mapeada por `infer-threshold-from-race-result` (só
  `CoachAthleteProfileServiceImpl`, `ThresholdConstraintFormatter`, `AthleteThresholdUpdater`),
  confirmado no levantamento de código de 2026-09-18 — sem novo consumidor downstream.

## Impact (provisório)

- **Repositórios:** só `apps/menthoros-backend` — mexe em `ThresholdInferenceService`
  (`inferirPaceLimiarDeMelhorEsforco`, análogo a `inferirPaceLimiarDeProva`),
  `AthleteThresholdUpdater` (consome o resultado pré-buscado pela nova fronteira de
  `refactor-threshold-call-outside-transaction`), `FonteLimiarInferencia` (3º valor de enum,
  `MELHOR_ESFORCO`, cabe no `VARCHAR(20)` existente — **sem migration**).
- **Risco:** cadeia de zonas/TSS/TSB/prompt de plano, mesma superfície já coberta por
  `infer-threshold-from-race-result` — sem consumidor novo.
- **Item de fechamento (não gate):** conferir os valores reais em atletas de produção depois que
  `add-athlete-best-efforts` for promovida a `main`.
