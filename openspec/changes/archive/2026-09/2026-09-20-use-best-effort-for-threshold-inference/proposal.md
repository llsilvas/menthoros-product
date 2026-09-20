# use-best-effort-for-threshold-inference — usar o melhor esforço atual como insumo de limiar/projeção de prova

**Tamanho:** M · **Trilha:** Full · **Status:** ✅ **CONCLUÍDA** — mergeada em `develop`
([PR #136](https://github.com/llsilvas/menthoros-backend/pull/136), 2026-09-20). DoR READY após 4
rodadas de pre-mortem adversarial (DeepSeek, Codex indisponível por limite de uso na sessão) +
`spec-reviewer`. QA (code-reviewer/security-reviewer/clean-code-reviewer em paralelo) sem achados
Critical; achados Important corrigidos antes do PR (duplicação de fórmula/esqueleto, defesa em
profundidade de `TenantContext`).
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
  persistida — a migração de fonte acontece organicamente, não numa varredura em lote. **Correção
  (3ª rodada de pre-mortem, DeepSeek + verificado em código):** a suposição original de "próximo
  ciclo de 90 dias" não se sustenta pra maioria dos atletas — `Atleta.dataUltimoTestePace` não tem
  nenhum escritor em `src/main` hoje (só leitores), e `isPaceLimiarDesatualizado` retorna `true`
  imediatamente quando `dataUltimoTestePace` é `null`. Na prática, pra qualquer atleta sem essa data
  populada (o caso comum, já que não existe fluxo que a grave), a migração
  `MEDIA_TREINOS → MELHOR_ESFORCO` acontece no **próximo sync** em que houver um melhor esforço
  elegível, não em 90 dias. O gate de 90 dias só se aplica ao subconjunto de atletas que já tiverem
  `dataUltimoTestePace` recente de algum fluxo legado/futuro. Non-goal permanece válido (não há
  varredura em lote), mas a cadência esperada muda — ver "Métrica de sucesso" (amostra maior e mais
  cedo do que se imaginava).

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
   resolução de pace roda, Then cai pro quintil passivo sem propagar a exceção — **observável**: a
   linha de TSB do dia é persistida normalmente por `TsbDiaPersister.atualizarDiaTransacional`
   (asserção sobre o efeito, não só sobre a ausência de exceção — achado da 3ª rodada de pre-mortem:
   `buscarMelhorEsforcoSeguro` devolver `List.of()` não prova, por si só, que a persistência do TSB
   ocorreu). Given adicionalmente que o quintil também não tem dado suficiente (nenhuma das 3 fontes
   disponível), Then a resolução retorna `Optional.empty()` — nenhuma fonte é aplicada,
   `paceLimiarEstimado`/`fonteLimiarPace` permanecem no valor anterior (mesmo comportamento já
   testado hoje pra "nenhuma fonte", sem mudança).
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
se é bom ou ruim). **Threshold de ação:** se a taxa de outlier de `MELHOR_ESFORCO` for consistentemente mais que o
dobro da taxa de `PROVA_REGISTRADA` no mesmo período, com **ambas as coortes** tendo pelo menos 10
casos (piso de amostra dos dois lados da comparação, não só do lado novo — achado da 3ª rodada de
pre-mortem: comparar 11 casos novos contra uma baseline de 500 é válido, mas comparar 11 contra 3 não
diz nada), revisar a seleção 10k/5k (D2) — sinal de que o mecanismo de tie-break está aceitando
marcas espúrias com frequência acima do esperado pra uma fonte "quase tão confiável quanto prova".
Acompanhamento via log, não painel (mesma abordagem já usada em `infer-threshold-from-race-result`
D5).

## Rollback

Revert do PR único — sem migration de schema (enum novo cabe na coluna `VARCHAR(20)` existente,
`fonteLimiarPace` nunca terá `MELHOR_ESFORCO` gravado antes do deploy).

**Correção (3ª rodada de pre-mortem, DeepSeek + verificado em código):** o parágrafo anterior estava
errado sobre leitura pós-revert. `PlanoMetaDados.fonteLimiarPace` é `@Enumerated(EnumType.STRING)` —
se o revert remover a constante `MELHOR_ESFORCO` do enum Java mas linhas no banco ainda tiverem essa
string gravada, `Enum.valueOf` lança `IllegalArgumentException` ao hidratar a entidade, quebrando a
leitura desses atletas (500, não silencioso). Isso só é risco se houve deploy real com
`MELHOR_ESFORCO` em produção antes do revert — se o revert acontecer antes do primeiro deploy (ou
com 0 linhas migradas), não há linhas a proteger. **Mitigação:** se o revert acontecer após linhas
reais existirem, rodar um `UPDATE` de saneamento (`fonte_limiar_pace = 'MEDIA_TREINOS' WHERE
fonte_limiar_pace = 'MELHOR_ESFORCO'`) **antes** de remover a constante do enum Java — mesmo padrão
de "revert com saneamento de dado" já usado nesta base pra enums `STRING`. Registrar esse passo no
runbook do PR de revert, não como migration Flyway (não é alteração de schema).

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
