# Proposal: intervals-icu-activity-sync-scheduler

**Tamanho:** M · **Trilha:** Full (scheduler cross-tenant + novo modo de ingestão em lote sobre um
pipeline hoje só individual; risco de multi-tenancy; backend-only, **sem migration** — reusa
`IntegracaoExterna.ultimaSincronizacao`/`autoSyncPausado` já existentes)

## Status

- Proposta inicial (2026-07-20) — aguardando DoR (`spec-reviewer`) e pre-mortem cross-model (Codex)
  antes de `/implement init`.
- Product review (2026-07-20, `product-reviewer`): **GO**, com 6 achados de refinamento (nenhum
  bloqueador) — incorporados nesta revisão: métrica orientada ao treinador, estimativa de custo de
  HTTP, arquitetura futura com o webhook, prioridade no roadmap, TOCTOU residual explicitado, e
  correção da nota de cadência ("scheduler diário" vs. `PT2H`).
- Pre-mortem cross-model rodada 1 (Codex, 2026-07-20): **5 achados críticos** — cursor avançava
  mesmo com falha parcial (perda permanente de atividade da janela de retry), paginação da listagem
  não verificada contra a API real, save de entidade stale podia ressuscitar uma desconexão feita
  pelo coach durante o ciclo, ausência de lock distribuído subestimada para um job automático
  cross-tenant, e o guard cross-fonte Strava não cobria a corrida entre os dois schedulers
  automáticos — **todos corrigidos no design.md** (D2, D3, D5, D7, D8) nesta revisão; ver design.md
  "Pre-mortem" para o detalhamento completo. 5 achados moderados e 1 menor também corrigidos.

## Prioridade no roadmap

Classificação: **durante o pilot, crítico para retenção quando a base de atletas intervals.icu
crescer** (achado #4 do product review).

- **Não é bloqueador do primeiro cliente:** import manual (`intervals-icu-activity-ingestion`) já
  cobre as primeiras semanas de pilot com poucos atletas.
- **Torna-se crítico assim que uma assessoria tiver vários atletas conectados ao intervals.icu:**
  sem o scheduler, o import manual por atividade não escala — o coach vira gargalo operacional, o
  que compromete a retenção justamente da assessoria que o founder pretende migrar para o caminho
  intervals.icu.
- **Recomendação:** implementar antes que qualquer assessoria em produção passe de ~5 atletas ativos
  no intervals.icu, não necessariamente antes do primeiro cliente fechar.

Fecha o non-goal explícito deixado por `intervals-icu-activity-ingestion` (arquivada em
`archive/2026-07/2026-07-16-intervals-icu-activity-ingestion/`): *"Sync automático, scheduler ou
webhook de atividades (esta change é ação manual coach-in-the-loop)."*

Esta é a **primeira** de duas changes decompostas para fechar esse non-goal. A segunda,
`intervals-icu-webhook-ingestion` (caminho OAuth + webhook em tempo real, não criada ainda), fica
para depois que este scheduler estiver validado em produção — ver "Open Questions & Assumptions".

## Why

Hoje a ingestão de treinos realizados via intervals.icu depende de o coach colar manualmente o id de
cada atividade (`intervals-icu-activity-ingestion`). Isso funciona para o caso pontual, mas não
escala: para os atletas já conectados, nenhum treino entra sozinho — todo dia sem import manual é um
buraco na reconciliação e no PMC/TSS.

O Menthoros já resolve exatamente esse problema para o Strava com `StravaActivitySyncScheduler`
(scheduler cross-tenant, cursor incremental via `ultimaSincronizacao`, guard de
`autoSyncPausado`). Esta change espelha o mesmo padrão para o intervals.icu, reaproveitando o
pipeline de ingestão individual já existente (`IntervalsIcuActivityIngestionService`).

Valor para o coach: atletas conectados ao intervals.icu passam a ter os treinos executados
aparecendo automaticamente no Menthoros, sem qualquer ação manual — mesmo tratamento que o Strava já
recebe hoje.

Contexto de produto (não implementado nesta change, apenas registrado): o plano do founder é que a
integração intervals.icu se torne o caminho primário de sincronização automática, em substituição
gradual ao Strava (intervals.icu agrega Garmin e outras fontes diretamente, com menos limitações de
API que o Strava). A descomissão do Strava é **non-goal explícito** desta change.

## What Changes (backend `apps/menthoros-backend`)

1. **Client:** novo método `listarAtividades(String apiKey, String externalAthleteId, LocalDate
   oldest, LocalDate newest)` em `IntervalsIcuClient`/`IntervalsIcuClientImpl`
   (`GET /api/v1/athlete/{id}/activities?oldest=&newest=`), no mesmo padrão de `listarEventos`
   (`IntervalsIcuClientImpl.java:102-105`) — Basic Auth com a API key do atleta, sem OAuth.
2. **Scheduler:** nova classe `IntervalsIcuActivitySyncScheduler` (`services/`, sem sufixo `Impl`,
   espelhando `StravaActivitySyncScheduler`):
   - `@Scheduled(fixedDelayString = "PT2H", initialDelayString = "PT1M")` (mesma cadência do Strava;
     ver Open Questions para eventual ajuste).
   - Itera `integracaoExternaRepository.findAllActiveByPlataforma(FonteDados.INTERVALS_ICU)`.
   - Por atleta: seta `TenantContext.setTenantId`, late-check de `autoSyncPausado` (query fresca,
     mesmo padrão TOCTOU do Strava), calcula a janela `oldest` a partir de
     `integracao.getUltimaSincronizacao()` (incremental) com fallback de N dias
     (`intervals-icu.sync-days-back`, default 90 — espelha `strava.sync-days-back`) quando é o
     primeiro ciclo do atleta.
   - Chama `listarAtividades`, e para cada `IcuActivityDto` retornado invoca
     `intervalsIcuActivityIngestionService.importarAtividade(atletaId, activityId, tenantId)` —
     reaproveita o pipeline individual já existente (idempotência, validação de modalidade, mapeamento,
     TSS/TSB, evento de reconciliação) sem duplicar lógica.
   - **Classificação de erro por tipo, não por origem** (corrigido pós pre-mortem — ver design.md
     D5): falhas retryable (`IntervalsIcuRateLimitException`, `DomainConflictException` — rate limit
     ou conflito cross-fonte Strava) abortam o restante do lote do atleta e **bloqueiam o avanço do
     cursor**; falhas permanentes de uma atividade específica (`DomainNotFoundException`,
     `DomainRuleViolationException`) são isoladas sem afetar o cursor. Erro por **atleta** (ex.: a
     própria listagem falha) não aborta o restante do ciclo dos demais atletas.
   - Ao final do ciclo do atleta, **recarrega a integração fresca do banco antes de salvar** (evita
     ressuscitar uma desconexão feita pelo coach durante o processamento — design.md D8) e só avança
     `ultimaSincronizacao` quando não houve falha retryable no lote; `syncActivityCount` é calculado
     por contagem antes/depois no `TreinoRealizadoRepository` (não conta reprocessamento idempotente
     como importação nova).
3. **Reaproveitamento, sem mudança de contrato:** nenhuma mudança em `IntervalsIcuActivityIngestionService`,
   `TreinoRealizado`, dedup ou reconciliação — o scheduler é só um novo *caller* automático do mesmo
   pipeline que hoje só é acionado pelo endpoint manual.
4. **Proteção cross-fonte herdada, não nova:** o guard `autoSyncPausado` já existente pausa
   automaticamente o Strava quando o intervals.icu conecta (`IntervalsIcuConnectionServiceImpl.conectar`)
   — este scheduler não precisa de lógica nova de dedup cross-fonte, herda a mesma proteção que já
   existe para o import manual (ver design.md D-Risco para o residual que já era aceito antes desta
   change e não piora).

### Fora de escopo

- **Webhook / OAuth em tempo real do intervals.icu** — change futura separada
  (`intervals-icu-webhook-ingestion`, não criada ainda).
- **Descomissão ou remoção da integração Strava** — change futura separada, depois que este scheduler
  estiver validado em produção.
- **Backfill histórico ilimitado** — a janela de lookback do primeiro ciclo é limitada por
  `intervals-icu.sync-days-back` (default 90 dias, igual ao Strava); atividades mais antigas seguem
  exigindo import manual.
- **Lock distribuído entre instâncias** — mesmo risco residual já aceito para o `StravaActivitySyncScheduler`
  (sem lock hoje); não introduzido nem agravado por esta change.
- **UI/frontend** — nenhuma tela nova; o scheduler é 100% backend, sem endpoint novo exposto ao coach.
- **Endpoint de listagem de atividades para o coach escolher manualmente** — já registrado como fora
  de escopo em `intervals-icu-activity-ingestion`; continua fora de escopo aqui.
- **Otimização de chamadas HTTP (evitar re-fetch por atividade):** o scheduler reusa
  `importarAtividade` tal como está, que sempre rechama `buscarAtividade` para cada id — 1 chamada de
  listagem + N chamadas individuais por ciclo/atleta. Ver design.md e "Riscos e mitigações".

## Critérios de aceite

- **CA1 — Sync automático feliz:** Given atleta com conexão intervals.icu ativa (`ativo=true`,
  `autoSyncPausado=false`) e atividades novas no provedor desde `ultimaSincronizacao`, When o
  scheduler executa seu ciclo, Then cada atividade nova é ingerida como `TreinoRealizado`
  (`fonteDados=INTERVALS_ICU`), reconciliada inline com o planejado (mesma lógica de
  `intervals-icu-activity-ingestion`), sem ação do coach.
- **CA2 — Idempotência preservada:** Given uma atividade já importada em um ciclo anterior (manual ou
  automático), When o scheduler processa o mesmo `externalId` novamente (janela sobreposta), Then
  nenhum `TreinoRealizado` duplicado é criado — mesmo dedup por `(tenantId, fonteDados, externalId)`
  já existente.
- **CA3 — Guard de pausa/inatividade respeitado:** Given atleta com `ativo=false` na sua integração
  intervals.icu, OU com `autoSyncPausado=true` (mecanismo futuro de pausa manual, se vier a existir —
  hoje nenhum hook seta essa flag para INTERVALS_ICU, ver design.md D7), When o ciclo do scheduler
  roda, Then esse atleta é pulado (log estruturado), sem chamada ao provedor. O late-check revalida
  ambos os campos com query fresca, não só `autoSyncPausado`.
- **CA4 — Isolamento de falha por atividade:** Given uma atividade no lote de um atleta que falha na
  ingestão (ex.: modalidade não suportada, erro de mapeamento), When o scheduler processa o lote,
  Then as demais atividades do MESMO atleta continuam sendo processadas normalmente (a falha não
  aborta o lote inteiro).
- **CA5 — Isolamento de falha por atleta:** Given um atleta cuja chamada ao provedor falha (rate
  limit, credencial revogada, timeout), When o ciclo do scheduler roda, Then os demais atletas
  continuam sendo processados normalmente — mesmo padrão `try/catch` do `StravaActivitySyncScheduler`.
- **CA6 — Cursor incremental:** Given um atleta já sincronizado antes, When o próximo ciclo roda,
  Then a janela de busca (`oldest`) parte de `ultimaSincronizacao` do ciclo anterior (não refaz o
  lookback completo) — evita reprocessar o histórico inteiro a cada ciclo.
- **CA7 — Primeiro ciclo (atleta novo):** Given um atleta conectado ao intervals.icu sem
  `ultimaSincronizacao` prévia, When o primeiro ciclo do scheduler roda para esse atleta, Then a
  janela de busca usa o fallback de `intervals-icu.sync-days-back` dias (default 90) a partir de hoje.
- **CA8 — Multi-tenancy:** Given atletas de tenants diferentes com integração intervals.icu ativa,
  When o scheduler processa o ciclo completo, Then cada atleta é processado com o `TenantContext`
  correto (setado e limpo por iteração), sem vazamento de dados entre tenants.
- **CA9 — Credencial revogada não interrompe o ciclo:** Given atleta com API key intervals.icu
  revogada/expirada (401/403 do provedor), When o scheduler tenta listar as atividades desse atleta,
  Then o erro é registrado em `lastSyncError`, o cursor (`ultimaSincronizacao`) **não avança**, o
  atleta é pulado, e o ciclo continua para os demais atletas.
- **CA10 — Falha transitória não avança o cursor (achado crítico #1 do pre-mortem):** Given um lote
  de atividades de um atleta onde uma atividade falha por rate limit ou por conflito cross-fonte
  Strava (`DomainConflictException`), When o scheduler processa o lote, Then o restante do lote desse
  atleta é abortado, `ultimaSincronizacao` NÃO é atualizada, e o próximo ciclo reprocessa a mesma
  janela (mais o overlap de segurança) — nenhuma atividade fica permanentemente fora da janela de
  retry só por causa de uma falha transitória em outra atividade do mesmo lote.
- **CA11 — Desconexão durante o ciclo não é revertida (achado crítico #3 do pre-mortem):** Given um
  atleta cuja integração intervals.icu é desconectada pelo coach enquanto o scheduler está
  processando o lote desse atleta, When o scheduler tenta salvar o resultado do ciclo (cursor,
  contador, erro), Then a integração NÃO é reativada nem sobrescrita com dados antigos — o scheduler
  recarrega o estado fresco antes de salvar e não persiste nada se a integração não estiver mais
  ativa.
- **CA12 — Rate limit aborta o lote, não insiste nas próximas atividades (achado moderado #2):**
  Given uma atividade no meio do lote de um atleta que falha por rate limit do provedor, When o
  scheduler processa o lote, Then as atividades restantes do MESMO lote não são tentadas neste
  ciclo (evita insistir contra um provedor já sinalizando limite).

## Métrica de sucesso

- **Cobertura automática:** % de atletas com intervals.icu ativo que têm pelo menos 1
  `TreinoRealizado` com `fonteDados=INTERVALS_ICU` inserido automaticamente (sem import manual) nos
  últimos 7 dias — meta: aproximar-se da cobertura já observada no Strava automático.
- **Confiabilidade:** 0 duplicatas criadas pelo scheduler nos testes e no smoke real (mesmo padrão de
  medição do `intervals-icu-activity-ingestion`).
- **Observabilidade:** log estruturado por ciclo com contagem de atletas processados/pulados/com erro
  (tenantId/atletaId), reaproveitando o padrão de log já usado pelo `StravaActivitySyncScheduler`.
- **Impacto no treinador (achado #1 do product review):** tempo de import manual eliminado por
  atividade sincronizada automaticamente — meta: nenhuma atividade de atleta com scheduler ativo
  exige mais o passo manual de colar o activity id (proxy: contagem de imports manuais via
  `intervals-icu-activity-ingestion` cai a ~0 para atletas cobertos pelo scheduler, nas semanas
  seguintes ao deploy).

## Open Questions & Assumptions

- **Assumido: cadência técnica `PT2H`/`PT1M`, igual ao Strava** (achado #6 do product review —
  correção da nota anterior). "Scheduler" no nome da change reflete automação contínua, não
  necessariamente diária; a cadência exata é um valor técnico, ajustável em design.md D2 se o
  founder preferir espaçar mais (ex.: 1x/dia) para reduzir chamadas ao provedor.
- **Aberto: rate limit do intervals.icu não é documentado publicamente.** Mitigação proposta:
  processamento sequencial por atleta (mesmo padrão do Strava, sem paralelismo), sem throttling
  adicional nesta primeira versão; revisar se o provedor começar a devolver 429 com frequência em
  produção. Ver estimativa de volume abaixo (achado #2 do product review).
- **Estimativa de custo de chamadas HTTP (achado #2 do product review):** cenário de referência (100
  atletas ativos, ~3 atividades/semana cada): primeira sincronização (lookback de 90 dias) ≈ 1
  chamada de listagem + até 100 × 3 × ~13 semanas × 1 busca individual no pior caso (todo o
  histórico de uma vez) — mitigado na prática pelo cursor incremental, que reduz isso para ciclos
  subsequentes a ≈ 1 listagem + (atividades novas desde o último ciclo) buscas por atleta a cada
  `PT2H`. Em regime de cruzeiro (sem backlog), o volume esperado por ciclo é baixo (poucas atividades
  novas por atleta a cada 2h). **Gatilho de otimização:** se a taxa de 429 subir de forma perceptível
  em produção, revisitar a decisão de reaproveitar `importarAtividade` (ver próximo item) antes de
  adicionar throttling artificial.
- **Assumido: reaproveitar `importarAtividade` tal como está**, mesmo custando 1 chamada de listagem +
  N chamadas individuais por atleta por ciclo. Alternativa (mapear direto do resultado de
  `listarAtividades` sem rechamar `buscarAtividade`) economizaria chamadas HTTP mas duplicaria
  validação/mapeamento em dois lugares — descartada nesta change por simplicidade; revisitar se rate
  limit se provar um problema real (ver gatilho de otimização acima).
- **Arquitetura futura com o webhook (achado #3 do product review):** quando
  `intervals-icu-webhook-ingestion` existir, o webhook OAuth será o caminho **primário** (tempo
  real) e este scheduler passa a atuar como camada de **fallback/reconciliação** — mesmo papel que
  `StravaActivitySyncScheduler` já desempenha hoje em relação a `StravaWebhookServiceImpl`. Os dois
  caminhos rodam em paralelo (nenhum substitui o outro); o design deste scheduler não muda quando o
  webhook chegar — ele continua sendo apenas mais um *caller* do mesmo
  `IntervalsIcuActivityIngestionService`.
- **Relação com a substituição estratégica do Strava:** fora de escopo nesta change; nenhuma decisão
  de desligar o Strava é tomada aqui. Se e quando isso acontecer, será uma change própria.
- **Crítico, gate obrigatório antes de implementar (achado #2 do pre-mortem Codex): paginação de
  `GET /api/v1/athlete/{id}/activities` não confirmada.** A documentação pública não esclarece se a
  listagem pagina para janelas com muitas atividades (ex.: os 90 dias do primeiro ciclo). Bloco 0.2
  do tasks.md exige confirmar contra a API real antes de finalizar `listarAtividades` — se houver
  paginação, D1 precisa de loop consumindo todas as páginas (mesmo padrão já usado por
  `StravaActivityServiceImpl.java:280-312`); processar só a primeira página e ainda assim avançar o
  cursor seria um bug silencioso de perda de dado.

## Riscos e mitigações

- **Cross-fonte Strava + intervals.icu simultâneos** (Médio, herdado — não agravado por esta change):
  o guard `autoSyncPausado` já pausa o Strava quando o intervals.icu conecta (existente desde
  `intervals-icu-activity-ingestion`). O residual já aceito naquela change (override manual via
  `retomar-sync`) continua sendo o mesmo residual aqui — este scheduler não introduz um caminho novo
  de colisão, apenas mais um consumidor do mesmo guard.
- **TOCTOU residual entre `retomar-sync` manual e os dois schedulers automáticos** (Médio, **aceito e
  não corrigido nesta change** — achado #5 do product review): quando o coach chama `retomar-sync`
  deliberadamente com intervals.icu ainda ativo, existe uma janela sem lock em que ambas as
  integrações podem estar `autoSyncPausado=false` simultaneamente. Residual herdado de
  `intervals-icu-activity-ingestion` (design.md D5.2 daquela change), pré-existente ao import manual
  automático; **não corrigido aqui** — exigiria lock distribuído, fora de escopo (ver "Fora de
  escopo"). Mitigação: mesmo late-check TOCTOU já usado pelo `StravaActivitySyncScheduler` (D2), que
  reduz a janela de exposição sem eliminá-la.
- **Chamadas HTTP redundantes (1 lista + N buscas individuais)** (Baixo): custo aceito por
  simplicidade — ver Open Questions. Monitorar se o provedor sinalizar rate limit em produção.
- **Multi-tenancy** (Alto, mitigado): mesmo padrão do `StravaActivitySyncScheduler` —
  `TenantContext` setado por iteração, `IntegracaoExterna` já filtrado por
  `findAllActiveByPlataforma`, nenhuma query cross-tenant nova introduzida.
- **Falha silenciosa de atleta específico** (Médio, mitigado): `lastSyncError` grava a última falha
  visível para o coach/suporte; log estruturado por ciclo permite auditoria.
- **Sem lock distribuído entre instâncias** (Alto — **elevado de Médio pós pre-mortem**, achado
  crítico #4: risco subestimado por ser agora um job automático cross-tenant para TODOS os atletas,
  não uma ação pontual do coach): se o backend rodar com mais de uma instância, o mesmo atleta pode
  ser processado duas vezes no mesmo ciclo — 2x a chamada de listagem, até 2x N chamadas individuais
  ao provedor, e uma janela de corrida no save final entre as duas instâncias (mitigada, não
  eliminada, pelo reload-antes-do-save de design.md D8). Idempotência do dedup (CA2) garante que não
  há duplicata de `TreinoRealizado` mesmo assim. **Decisão desta change:** não introduzir lock
  distribuído (ShedLock ou equivalente) para não expandir o Tamanho — mesmo escopo aceito para o
  Strava. Risco residual aceito é custo dobrado de chamadas HTTP em ambiente multi-instância, não
  perda/duplicação de dado. Revisitar com lock por atleta como fast-follow se o backend passar a
  rodar com mais de uma instância em produção.
- **Save de entidade stale ressuscitando desconexão do coach** (Alto, **corrigido nesta revisão** —
  achado crítico #3): a versão original do design salvava a mesma instância de `IntegracaoExterna`
  capturada no início do ciclo; se o coach desconectasse a integração no meio do processamento
  (chamada ao provedor pode levar segundos), o save final reverteria essa desconexão. Corrigido:
  scheduler recarrega a integração fresca imediatamente antes do save final e não persiste nada se
  ela não estiver mais ativa (design.md D8).

## Rollback

Aditiva: reverter o PR remove a classe do scheduler e o método novo do client. Sem migration, sem
coluna nova, sem dado a limpar — nenhum `TreinoRealizado` criado pelo scheduler difere de um criado
pelo import manual (mesmo `fonteDados=INTERVALS_ICU`, mesma tabela, mesmo dedup); reverter não deixa
resíduo.
