# Tasks — fix-sync-cursor-data-loss

Branch `feature/fix-sync-cursor-data-loss` no backend. Prioridade sobre `add-sync-health-signal` e
`add-attention-reason-sem-sincronizacao` (em espera da medição que esta change viabiliza).

TDD em todas as tasks de código: o teste do critério vem antes da implementação.

## 0. Antes de implementar
- [x] 0.1 Confirmar numa chamada real que `/athlete/activities` aceita `after` + `before` + `page` juntos
  (D3.2); registrar aqui
  - **Resultado (2026-09-30, conta do founder, 73 atividades em 60 dias, 16 requisições):**
    - `after` + `before` + `page` funcionam juntos: 15 atividades numa janela de 14 dias, com
      `per_page = 2` → 8 páginas, sem duplicata, o mesmo conjunto da chamada única.
    - **A ordem depende dos parâmetros:** só `after` → **ascendente**; com `before` → **descendente**.
      Confirma que nenhum desenho pode depender da ordem (D3.2).
    - **`after` e `before` são exclusivos:** a atividade no segundo exato de `after` ou de `before` não
      vem. A sobreposição entre fatias (D3.2) é obrigatória; 60 s bastam.
    - `start_date_local` vem com sufixo `Z` (hora local rotulada como UTC). Confirma o defeito do cursor em
      `StravaActivityServiceImpl:459`: `Instant.parse` aceita sem erro.
- [ ] 0.2 Linha de base: todos os atletas do piloto com integração, corridas dos últimos 60 dias na API ×
  importadas, faltantes por atleta; registrar aqui (founder)

## 1. Migration e escrita pontual
- [x] 1.1 Migration V98: `pull_cursor` + backfill + `tb_sync_pull_log` com índices +
  `tb_sync_atividade_descartada` (D5, D6, D7)
  - verify: IT de migration contra o schema real — coluna, backfill, `ultima_sincronizacao` nula →
    `pull_cursor` nulo, check constraint
  - feito: `SyncPullCursorMigrationTest` (5 casos, inclui reexecução sem sobrescrever cursor existente)
- [x] 1.2 `pullCursor` somente leitura na entidade; `atualizarPullCursor` e `atualizarStatusSync` com
  `@Transactional` + `id` + `tenant_id` (D0, D1)
  - verify: IT — chamados sem transação do chamador funcionam; `save` de uma instância antiga não altera
    `pull_cursor`; `UPDATE` com tenant errado retorna 0 (CA9); se o JPQL não gravar, aplicar o fallback
    nativo
  - feito: `IntegracaoExternaEscritaPontualTest` (5 casos). O JPQL grava a coluna `updatable = false` no
    Hibernate do projeto, então o fallback nativo não foi necessário. `pullCursor` sem setter.
- [x] 1.3 `PullResultado`, enums (`ResultadoPull`, `ErroCategoriaPull`), `PullAcumulador`, entidade
  `SyncPullLog` + repositório + `SyncPullLogWriter` em `REQUIRES_NEW` (D5)
  - verify: IT — o writer chamado dentro de uma transação que faz rollback persiste o registro
  - feito: `PullAcumuladorTest` (7 casos) + `SyncPullLogWriterTest`
- [x] 1.4 `SyncDescarteWriter` (`REQUIRES_NEW`, upsert `ON CONFLICT` via JDBC, sem entidade: o
  incremento de tentativas precisa ser atômico): permanente descarta na 1ª, inesperado na 3ª (D7)
  - verify: IT — 3 falhas inesperadas → `descartada_em` preenchido; rollback do chamador não desfaz a
    contagem
  - feito: `SyncDescarteWriterTest` (4 casos, inclui isolamento por tenant e plataforma)

## 2. intervals.icu (depende de 1)
- [x] 2.1 Persister devolve `SaveResult`; `importarAtividadeAgendada` → `ImportacaoResultado(treino,
  inserida)` sem o limite de retroatividade; `importarAtividade` mantém (D4)
  - verify: CA5 (unitário do serviço: D−100 aceito no agendado, recusado no manual); `inserida = false`
    para já importada **e** para o caminho de concorrência do persister (`inserted = false`)
  - feito: `IntervalsIcuActivityIngestionServiceImplTest` (+3, nested `ImportacaoAgendada`) e
    `IntervalsIcuActivityPersisterTest` (assert do `inserted = false`); mocks existentes migrados para
    `SaveResult`
- [x] 2.2 Scheduler (D1, D2, D4):
  - horizonte inicial e `oldest` a partir de `pull_cursor`;
  - `calcularCursor` recebendo `pull_cursor`, com o resultado em `atualizarPullCursor`;
  - `ultimaSincronizacao = now` e status via `atualizarStatusSync`;
  - contagem por `inserida`; `RuntimeException` no laço para o lote como `INESPERADO`; `ignoradas`;
  - descartadas excluídas **antes** do teto.
  - verify: CA1 (IT: push salva a entidade, cursor fica); CA4 no intervals.icu (horizonte estável depois de
    falha); CA5 ponta a ponta; import manual concorrente não infla a contagem; atividade sem `start_date` →
    `PARCIAL`/`DADOS_INVALIDOS` com `ignoradas = 1`; CA11
  - feito: `IntervalsIcuActivitySyncSchedulerTest` reescrito para o comportamento novo (29 casos). O CA1 é
    coberto em duas camadas: o mecanismo (save de instância antiga não reescreve o cursor) em
    `IntegracaoExternaEscritaPontualTest`, e a leitura (`pull_cursor`, não `ultimaSincronizacao`) aqui.
    404/422 registram descarte permanente (D7) e contam em `ignoradas`. `DomainConflictException` virou a
    categoria nova `CONFLITO` (Strava ativo, conexão desativada), em vez de `CREDENCIAL`. Em `FALHA`,
    `ultimaSincronizacao` fica onde estava.
- [x] 2.3 `syncAtleta` nunca lança: acumulador cobre carga, laço e finalização; scheduler grava o registro
  (D5)
  - verify: CA8 intervals.icu (2 inserções + exceção inesperada na 3ª → `PARCIAL`/`INESPERADO` com 2; 2
    inserções + falha ao gravar o cursor → `PARCIAL` com 2)
  - feito: os dois casos no `IntervalsIcuActivitySyncSchedulerTest`, mais o CA12 (3ª tentativa descarta e
    segue) e a falha do writer do registro sem derrubar o ciclo

## 3. Strava (depende de 1)
- [x] 3.1 `fetchActivitiesWithHeaders` devolve as originais; classificação HTTP 429/401/403/5xx (D3.2, D3.6)
  - verify: CA3, CA6; 429 sem header → `RATE_LIMIT`
  - feito: `StravaActivityPullTest`, com WebClient real contra WireMock (já é dependência do projeto; o
    MockWebServer não é). 429 traduzido por `onStatus` também na busca de laps.
  - **desvio:** `start_date` **não** foi adicionado ao `StravaActivityDto`. Com as fatias, o cursor vem do
    fim da fatia e nenhum instante de atividade é calculado no código: o filtro por `start_date` UTC é
    feito pela própria API (`after`/`before`). O CA6 fica satisfeito por construção e é testado assim:
    uma corrida com `start_date_local` 3h no futuro não leva o cursor além de agora.
- [x] 3.2 Varredura por fatias com sobreposição de 60 s; transação por atividade com atleta recarregado;
  `pullAgendado` avança o cursor por fatia; horizonte inicial; status via `atualizarStatusSync`
  (D3.1, D3.2, D3.5)
  - verify: CA4, CA10; atividade exatamente no segundo da fronteira importada uma vez; rate limit no meio da
    fatia preserva as inserções já feitas e o ciclo seguinte avança; exceção numa atividade não desfaz as
    anteriores; CA12
  - feito: `StravaActivityPullTest` (nested `PullAgendado`). Transação por atividade via
    `TransactionOperations` (o bean `TransactionTemplate`); o teste usa `withoutTransaction()`. O overlap de
    7 dias é `StravaProperties.syncOverlapDays`, com default no código e sem mudança no `application.yml`.
- [x] 3.3 Sync manual (D0, D3.1, D3.7):
  - lê `pull_cursor` e nunca grava; sem `@Transactional`; resposta por resultado;
  - `catch` genérico grava `lastSyncError` e relança **sem desativar**;
  - não usa o D7;
  - `syncActivities(UUID)` removido e testes migrados.
  - verify: CA2 (manual com e sem rate limit; webhook); token renovado durante o sync manual não é
    sobrescrito (token expirado no início); 5xx no manual → integração continua ativa e o scheduler segue
    puxando; 2 falhas agendadas + 1 manual → atividade **não** descartada
  - feito: `StravaActivityPullTest` (nested `SyncManual`, 5 casos). O "token renovado não sobrescrito" é
    testado pelo mecanismo: o manual nunca faz `save` da integração, só `atualizarStatusSync` (e o IT do
    bloco 1 prova que o `UPDATE` pontual preserva o token). O "2 agendadas + 1 manual" é testado como "o
    manual não toca o `SyncDescarteWriter`".
- [x] 3.4 Já importada é pulada; inserção = find vazio **e** `inserted`; merge preserva RPE (D3.3, D3.4)
  - verify: CA7 (pull e webhook `update`; `feedbackAtleta`/`sensacoes` intactos)
  - feito: pull em `StravaActivityPullTest` (sem laps, sem registrar); webhook `update` em
    `StravaActivityServiceImplSyncTest` (+2: RPE/feedback/sensações preservados; treino novo recebe o RPE
    do Strava)
- [x] 3.5 `pullAgendado` nunca lança (acumulador); scheduler do Strava o chama e grava o registro (D5)
  - verify: CA8 Strava (exceção ao carregar a integração → `FALHA`/0; rate limit depois de 3 inserções →
    `PARCIAL` com 3; falha ao gravar status depois de 3 → `PARCIAL` com 3)
  - feito: `StravaActivitySyncSchedulerTest` (+2) e `StravaActivityPullTest` (falha na finalização; o
    rate limit com progresso é o CA10, com 2 inserções)

## 4. Expurgo
- [x] 4.1 `SyncPullLogPurgeScheduler` em lotes de 1000, para `tb_sync_pull_log` e
  `tb_sync_atividade_descartada` (D5, D7)
  - verify: IT — 2500 registros antigos + 10 recentes → sobram os 10 (nas duas tabelas)
  - feito: `SyncRetencaoPurger` (JDBC, sem transação em volta do laço: cada lote commita sozinho) +
    `SyncPullLogPurgeScheduler` (4h30 Brasília, `Clock` injetado, falha só logada). Testes:
    `SyncRetencaoPurgerTest` (IT) e `SyncPullLogPurgeSchedulerTest`.

## 5. Validação
- [x] 5.1 `./mvnw clean verify`
  - feito (2026-09-30, depois do bloco 4): 4321 testes (surefire) + 204 (failsafe), 0 falhas. Uma rodada
    anterior falhou em `IntervalsIcuClientImplTest.getListaEventos` com `Connection prematurely closed
    BEFORE response` contra o WireMock local. É teste de cliente HTTP que esta change não toca; passou
    isolado duas vezes e na rodada seguinte. **Follow-up:** intermitência preexistente de conexão
    reaproveitada no teste, fora do escopo.
- [x] 5.2 Smoke local: conexão Strava e intervals.icu reais, dois ciclos; conferir `pull_cursor` e
  `tb_sync_pull_log`
  - feito (2026-09-30): cópia do banco do homelab (`pg_dump`, V97, 534 treinos) restaurada num banco
    local `menthoros_homelab`. Backend da branch na 8199, perfil `local` (e-mail em arquivo), com APIs
    reais. Cada ciclo foi encerrado em ~70 s, antes do retry de push (5 min), então nada foi escrito no
    intervals.icu.
    - V98 aplicada na cópia: backfill `pull_cursor = ultima_sincronizacao` nas 3 integrações.
    - Ciclo 1: intervals.icu `COMPLETO`/0 e Strava `COMPLETO`/0 (a janela de 8 dias, numa fatia, só tinha
      já importadas; 2 requisições). Cursores foram para o fim da janela. O Strava pausado ficou
      intocado, sem erro e sem descarte.
    - Ciclo 2: de novo `COMPLETO`/0, sem duplicata (treinos 44/100 iguais), cursores avançados, 4
      registros de pull com o tenant certo, 2 requisições ao Strava, nenhum e-mail no outbox.
    - **Limite do smoke:** não havia atividade nova na janela, então o caminho de inserção não rodou
      contra a API real. Ele fica coberto pelos testes com WireMock (bloco 3) e pelos de scheduler
      (bloco 2).
- [ ] 5.3 Script de rollback versionado no backend (`docs/rollback/fix-sync-cursor-data-loss.sql`) e passo
  descrito no corpo do PR (design, "Rollback")
  - verify: IT ou execução local — depois de um pull `PARCIAL`, o script deixa `ultima_sincronizacao =
    pull_cursor`

## 6. Pós-deploy (não bloqueia o arquivamento)
- [ ] 6.1 4 semanas depois: repetir a amostra da 0.2 (meta 0 faltantes em janelas `COMPLETO`) e contar
  lacunas/`INATIVIDADE` de atletas com treino na API — registrar em `add-sync-health-signal`
- [ ] 6.2 Iniciar a medição prospectiva de `add-sync-health-signal` com `tb_sync_pull_log`
