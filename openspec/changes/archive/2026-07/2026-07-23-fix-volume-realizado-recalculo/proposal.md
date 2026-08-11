**Tamanho:** S · **Trilha:** Fast

## Why

Na tela `/athlete/plan` do frontend, a barra "Carga da semana" nunca reflete os treinos reais do atleta — mesmo com reload completo da página. Investigação de causa raiz (systematic debugging) confirmou que o frontend está correto (`AthletePlanPage.tsx`/`WeeklyPlanList.tsx` são 100% presentational, exibem fielmente o que o backend retorna); o bug é no backend.

`PlanoSemanal.volumeRealizadoKm` é uma coluna persistida (`volume_realizado_km`), não calculada em tempo de leitura. Ela só é recalculada em dois pontos de escrita, ambos condicionais:
- `TreinoServiceImpl.addTreino()` (via `POST /treinos/{treinoPlanejadoId}/marcar-realizado`), quando resolve um `treinoPlanejadoId` explícito.
- `TreinoServiceImpl.registrarTreinoManualAtleta()`, só quando o autorregistro do atleta casa por data+tipo com um `TreinoPlanejado` PENDENTE/PERDIDO.

Todos os outros fluxos que criam `TreinoRealizado` nunca tocam esse campo: upload de `.fit` (`FitTreinoPersister`), sync do Strava (`StravaActivityServiceImpl.syncActivitiesInternal`), lançamento de treino pelo coach (`TreinoServiceImpl.lancarTreino()`), e o scheduler de reconciliação (`DailyActivitySyncSchedulerImpl`/`ReconciliationDecisionExecutor`, mesmo quando vincula com sucesso `VINCULADO_AUTOMATICO`). Como a maioria dos treinos reais do atleta chega por um desses caminhos, o valor fica congelado (geralmente `null` ou o volume do momento em que o plano foi criado).

## What Changes

- `PlanoServiceImpl.buscarPlanoPorAtleta()` (endpoint `GET /api/v1/planos/{atletaId}`, consumido pela tela `/athlete/plan`) passa a calcular o volume realizado **dinamicamente na leitura**, somando `distanciaKm` dos `TreinoRealizado` do atleta na janela `semanaInicio`–`semanaFim` do plano — reaproveitando `TreinoRealizadoRepository.findByAtletaIdAndDataTreinoBetween(atletaId, semanaInicio, semanaFim)`, já usado com o mesmo padrão em `PlanoServiceImpl` (linha 652), `CoachDashboardServiceImpl`, `TsbServiceImpl`, `AtletaProgressServiceImpl` e `MetricasAdesaoService`.
- Essa abordagem soma por `atletaId` + janela de datas, **não** pela FK `TreinoRealizado.planoSemanal` — decisão deliberada: a FK só é setada nos dois fluxos que já funcionam hoje (marcar-realizado / autorregistro com match), então uma query `sumDistanciaByPlanoSemanalId` continuaria cega aos treinos de sync/coach/fit. Usar a janela de datas do plano corrige o bug sem exigir mudança nos N pontos de escrita.
- `PlanoServiceImpl.buscarPlanoPorAtleta()` sobrescreve o campo no DTO já mapeado via `.toBuilder().volumeRealizadoKm(valor).build()` — `PlanoSemanalOutputDto` já é `@Builder(toBuilder = true)` e esse padrão (mapear e depois enriquecer via `toBuilder()`) já é usado em `PlanoReviewServiceImpl.enriquecerComConfidenceTier()`. Não é necessário alterar `PlanoSemanalMapper`.
- A coluna `volume_realizado_km` e a lógica de escrita hoje existente (`TreinoServiceImpl.atualizarPlanoSemanalSeAplicavel`, chamada em `addTreino`/`registrarTreinoManualAtleta`) **não são removidas** neste change — ver Open Questions.

## Capabilities

Nenhuma capability nova ou modificada em `openspec/specs/` — este é um bug fix que restaura o comportamento pretendido de um endpoint existente, sem introduzir novo comportamento de produto.

## Impact

**Entidades e banco:** nenhuma migração. A coluna `volume_realizado_km` permanece no schema (ver Open Questions sobre seu futuro).

**APIs:** `GET /api/v1/planos/{atletaId}` — contrato inalterado (`PlanoSemanalOutputDto.volumeRealizadoKm` continua `double`), mas o valor retornado passa a refletir a realidade em vez do dado congelado.

**Escopo explicitamente fora deste change:** `planoSemanalMapper.toOutputDto(...)` é chamado em mais dois lugares (`PlanoTreinoController.gerarPlano`, plano recém-gerado sem treinos realizados ainda — não afetado na prática) e `PlanoReviewServiceImpl` usa `toOutputDtoSafe` (fluxo de revisão do coach) — que **provavelmente tem o mesmo bug** para a tela de revisão do coach. Não incluído neste change para manter o escopo mínimo e porque o usuário reportou especificamente a tela do atleta; registrado aqui como candidato a um change de follow-up.

**Frontend:** nenhuma mudança necessária — confirmado que `AthletePlanPage.tsx`/`WeeklyPlanList.tsx` já consomem o campo corretamente.

## Critérios de aceite

- Given um atleta com plano aprovado e um treino registrado via upload de `.fit` dentro da semana do plano, When o atleta (ou o coach) chama `GET /api/v1/planos/{atletaId}`, Then `volumeRealizadoKm` inclui a distância desse treino.
- Given um atleta com treino sincronizado via Strava dentro da semana do plano, When `GET /api/v1/planos/{atletaId}` é chamado, Then `volumeRealizadoKm` inclui a distância desse treino.
- Given um treino lançado pelo coach (`lancarTreino`) dentro da semana do plano, When `GET /api/v1/planos/{atletaId}` é chamado, Then `volumeRealizadoKm` inclui a distância desse treino.
- Given um treino vinculado via reconciliação automática (`VINCULADO_AUTOMATICO`) dentro da semana do plano, When `GET /api/v1/planos/{atletaId}` é chamado, Then `volumeRealizadoKm` inclui a distância desse treino.
- Given um plano sem nenhum treino realizado na semana, When `GET /api/v1/planos/{atletaId}` é chamado, Then `volumeRealizadoKm` retorna `0` (não `null`, preservando o contrato atual de `double`).
- Given um treino realizado fora da janela `semanaInicio`–`semanaFim` do plano (ex.: outra semana), When `GET /api/v1/planos/{atletaId}` é chamado, Then esse treino NÃO é somado ao `volumeRealizadoKm` retornado.

## Métrica de sucesso

Redução para 0 dos tickets/relatos de "carga da semana não atualiza" na tela `/athlete/plan` — hoje o dado nunca reflete a realidade para atletas cujos treinos chegam por sync/coach/fit (a maioria). Validação imediata: comparar `volumeRealizadoKm` retornado antes/depois do fix para uma amostra de atletas com treinos via Strava/`.fit`/coach — deve deixar de ser `0`/`null` quando há treinos reais na semana.

## Open Questions & Assumptions

- **Assumido:** `TreinoRealizadoRepository.findByAtletaIdAndDataTreinoBetween` já é tenant-scoped indiretamente (via `atletaId` pertencer ao tenant corrente, validado a montante em `buscarPlanoPorAtleta`) — não adiciona filtro próprio de `tenantId`. Consistente com o uso já existente do mesmo método em `PlanoServiceImpl:652` e demais serviços.
- **Em aberto:** o que fazer com a coluna `volume_realizado_km` e os dois pontos de escrita existentes (`atualizarPlanoSemanalSeAplicavel`) — ficam como estão (redundantes, mas inofensivos) neste change. Removê-los é um change de limpeza separado (schema + service), fora do escopo desta correção de bug.
- **Em aberto (fora de escopo, registrado para follow-up):** `PlanoReviewServiceImpl` (fluxo de revisão do coach, `toOutputDtoSafe`) provavelmente tem o mesmo bug — não investigado a fundo nem corrigido aqui.
- **Assumido:** treinos com `distanciaKm` nulo somam como `0` na agregação (comportamento de `BigDecimal`/soma em Java a implementar explicitamente na Task 1).
