# use-best-effort-for-threshold-inference — usar o melhor esforço atual como insumo de limiar/projeção de prova

**Tamanho:** provável M · **Trilha:** Full · **Status:** 🟡 **EM REVISÃO** — design.md v2 +
proposal.md com critérios de aceite/non-goals/rollback (2026-09-19, pre-mortem DeepSeek), aguardando
novo DoR
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

## Non-Goals

- Não altera as outras 5 distâncias de `MelhorEsforcoService` (400m/800m/1.5k/1mi/3k) — só 5k/10k
  entram na inferência de limiar (fisiologicamente aptas, D2 do design).
- Não expõe a janela de 42 dias como configuração pro usuário — fixa por decisão de produto.
- Não muda `infer-threshold-from-race-result` (fonte "prova") nem sua precedência sobre as outras
  duas fontes — só insere um degrau novo entre prova e quintil.
- Não adiciona retry/circuit-breaker pra chamada ao intervals.icu — decisão já registrada em
  ADR-0008 (aplica igualmente aqui).
- Não recalcula limiares retroativamente pra atletas já com fonte `MEDIA_TREINOS`/`PROVA_REGISTRADA`
  persistida — a migração de fonte acontece organicamente no próximo ciclo de
  `isPaceLimiarDesatualizado` (90 dias sem teste oficial), não numa varredura em lote.

## Critérios de aceite

1. Given um atleta sem prova válida recente e com um melhor esforço de 10k na janela de 42 dias,
   When o pace limiar é recalculado (sync de treino), Then `fonteLimiarPace=MELHOR_ESFORCO` e
   `paceLimiarEstimado` é calculado pela fórmula de Riegel a partir do tempo/distância do 10k.
2. Given um atleta com melhor esforço de 5k e de 10k na mesma janela, When a fonte é resolvida,
   Then o 10k é usado (não o 5k) — E `paceLimiarEstimado` reflete o tempo/distância do 10k, não do
   5k (asserção explícita sobre o valor calculado, não só sobre `fonte=MELHOR_ESFORCO`; achado da
   2ª rodada de pre-mortem: um bug que seleciona a marca certa mas calcula com a outra precisa
   falhar aqui).
3. Given um atleta com prova válida E melhor esforço válido, When a fonte é resolvida, Then a prova
   vence (precedência inalterada, regressão coberta).
4. Given uma falha na chamada ao intervals.icu (timeout, erro HTTP, exceção qualquer), When a
   resolução de pace roda, Then cai pro quintil passivo sem propagar a exceção nem quebrar a
   atualização de TSB do dia. Given adicionalmente que o quintil também não tem dado suficiente
   (nenhuma das 3 fontes disponível), Then a resolução retorna `Optional.empty()` — nenhuma fonte é
   aplicada, `paceLimiarEstimado`/`fonteLimiarPace` permanecem no valor anterior (mesmo
   comportamento já testado hoje pra "nenhuma fonte", sem mudança).
5. Given os 2 schedulers que chamam `TsbService` fora de request HTTP
   (`StravaActivitySyncScheduler`, `IntervalsIcuActivitySyncScheduler`), When processam um atleta,
   Then `TenantContext` já está setado antes de `resolverPaceSeNecessario` rodar (regressão —
   verificado no levantamento de 2026-09-19 que o padrão set/clear por atleta já cobre isso; teste
   dedicado trava o comportamento).
6. `./mvnw clean verify` verde.

## Métrica de sucesso

Sem métrica de produto (mudança de infraestrutura de inferência, não visível na UI) — proxy: nos
primeiros 30 dias após deploy, comparar a **taxa de outlier** (D7, `|Δ| > 20s/km`) entre as
migrações `MEDIA_TREINOS → MELHOR_ESFORCO` e as migrações históricas `MEDIA_TREINOS →
PROVA_REGISTRADA` no mesmo período (baseline já existente, mesmo mecanismo de log — achado da 2ª
rodada de pre-mortem: sem essa comparação, "% sem outlier" não tem patamar de referência pra dizer
se é bom ou ruim). **Threshold de ação:** se a taxa de outlier de `MELHOR_ESFORCO` for
consistentemente (>10 casos) mais que o dobro da taxa de `PROVA_REGISTRADA` no mesmo período,
revisar a seleção 10k/5k (D2) — sinal de que o mecanismo de tie-break está aceitando marcas
espúrias com frequência acima do esperado pra uma fonte "quase tão confiável quanto prova".
Acompanhamento via log, não painel (mesma abordagem já usada em `infer-threshold-from-race-result`
D5).

## Rollback

Revert do PR único — sem migration (enum novo cabe na coluna `VARCHAR(20)` existente,
`fonteLimiarPace` nunca terá `MELHOR_ESFORCO` gravado antes do deploy). Reverter o código volta ao
comportamento de 2 fontes (prova/quintil); atletas que já tiverem `MELHOR_ESFORCO` persistido
continuam lendo esse valor normalmente (é só um enum a mais, sem semântica que quebre leitura).

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
