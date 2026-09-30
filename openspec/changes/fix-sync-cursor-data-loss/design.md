# Design — fix-sync-cursor-data-loss

## D0. Regra de escrita em `tb_integracao_externa`

Toda instância de `IntegracaoExterna` carregada **antes** de uma chamada externa ou de outra transação é
considerada antiga. Por exemplo, `getValidToken` pode renovar e commitar tokens numa transação própria
(`StravaOAuthServiceImpl:99-110`). Nos caminhos que esta change toca, **não se faz `save` de instância
antiga**. Cada gravação usa um `UPDATE` pontual com `id` + `tenant_id` que toca só as colunas daquele
escritor. Os métodos novos no repositório são `@Transactional` (REQUIRED): participam da transação do
chamador se houver, e abrem uma curta se não houver. O `@Modifying` sozinho não cria transação, e o
repositório não tem `@Transactional`.

```java
@Transactional
@Modifying(flushAutomatically = true)
@Query("UPDATE IntegracaoExterna i SET i.pullCursor = :cursor WHERE i.id = :id AND i.tenantId = :tenantId")
int atualizarPullCursor(UUID id, UUID tenantId, Instant cursor);

@Transactional
@Modifying(flushAutomatically = true)
@Query("""
    UPDATE IntegracaoExterna i SET i.ultimaSincronizacao = :ultima, i.syncActivityCount = :count,
           i.lastSyncError = :erro WHERE i.id = :id AND i.tenantId = :tenantId""")
int atualizarStatusSync(UUID id, UUID tenantId, Instant ultima, Integer count, @Nullable String erro);
```

Sem `clearAutomatically`: essas chamadas acontecem fora das transações de atividade (D3.5), então não há
contexto a limpar. Com isso, nenhuma entidade é destacada no meio de um fluxo. Retorno `0` = tenant errado
ou linha removida; é logado (CA9).

**Desativação no `catch` genérico do sync manual (`StravaActivityServiceImpl:211-216`).** Hoje o
`save(ativo = false)` roda dentro da transação de `syncActivitiesForAtleta`, e o relançamento de uma
`RuntimeException` a desfaz. **Na prática, a falha manual nunca desativa a integração.** Sem a transação
externa, esse `save` passaria a commitar sozinho, e um único 5xx ou timeout desligaria o atleta, inclusive
para o scheduler. O comportamento efetivo é preservado: o `catch` **não desativa**. Grava só
`lastSyncError` via `atualizarStatusSync` e relança. O `setAtivo(false)` morto é removido.

## D1. Cursor exclusivo do pull, fora do alcance do ORM

- Coluna `pull_cursor TIMESTAMPTZ NULL` em `tb_integracao_externa`.
- Na entidade: `@Column(name = "pull_cursor", insertable = false, updatable = false) Instant pullCursor`.
  `IntegracaoExterna` não tem `@DynamicUpdate`, e o Hibernate grava todas as colunas mapeadas em cada
  `UPDATE`. Sem `updatable = false`, o push (`IntervalsIcuPushListener:120`), o retry, o webhook e o sync
  manual reescreveriam `pull_cursor` com o valor antigo da instância que carregaram.
- Único escritor: `atualizarPullCursor` (D0). O JPQL de update ignora `updatable = false`. O IT 1.2
  comprova isso no Hibernate do projeto. Se falhar, o fallback é `nativeQuery = true` com o mesmo predicado.
- **Horizonte inicial:** se `pull_cursor` é nulo, o scheduler grava `now − syncDaysBack` via
  `atualizarPullCursor` (transação curta própria) **antes** de buscar. O ciclo seguinte, mesmo depois de
  falha, parte do mesmo ponto (CA4). Vale para as duas plataformas.
- `ultimaSincronizacao` não muda de significado. Os schedulers de pull passam a gravá-la (`now`) com
  `atualizarStatusSync`, **separada** do cursor. Hoje o scheduler do intervals.icu grava o cursor nela
  (`IntervalsIcuActivitySyncScheduler:184-187`).

## D2. O que é progresso confirmado

| Item | Avança o cursor? |
|---|---|
| importado (inserção) ou já existente | sim |
| modalidade não suportada (filtrada na listagem) | sim |
| 404 / 422 (intervals.icu) | sim, registrado como descartado (D7) |
| sem data válida (intervals.icu) | não bloqueia (não tem posição); pull `PARCIAL`, contado em `ignoradas` |
| rejeitado pelo limite de retroatividade | não ocorre no scheduler (D4) |
| exceção inesperada na atividade | não, até a 3ª tentativa; depois descartada (D7) |
| rate limit, 401/403, erro transitório, Strava ativo | não |

## D3. Strava

### D3.1 Entradas separadas
- `StravaActivityService.pullAgendado(UUID atletaId): PullResultado`, chamado só por
  `StravaActivitySyncScheduler`. Lê e avança `pull_cursor`.
- `syncActivitiesForAtleta` (sync manual) chama a varredura a partir de `pull_cursor − overlap` (ou do
  horizonte de 90 dias, se nulo, **sem gravá-lo**) e **nunca** chama `atualizarPullCursor`.
- `syncActivities(UUID): int` sai da interface e da implementação. Os testes que o usam migram para
  `pullAgendado` (scheduler) ou `syncActivitiesForAtleta` (manual).
- A varredura comum fica em `varrer(integracaoId, atletaId, tenantId, inicio, fim, aoConcluirFatia)`. As
  entradas diferem só no callback de fim de fatia: o agendado avança o cursor, o manual não faz nada.

### D3.2 Varredura por fatias
- Janela: de `pull_cursor − 7 dias` (overlap, `StravaProperties.syncOverlapDays`, novo, default 7) até
  `now` capturado no início do ciclo.
- Fatias de 14 dias em ordem cronológica. Consecutivas se **sobrepõem em 60 s**
  (`after = fimAnterior − 60s`): a task 0.1 confirmou que `after` e `before` são **exclusivos**. A
  duplicata na sobreposição é absorvida pelo "já importada" (D3.3). Há teste com atividade exatamente no
  segundo da fronteira.
- A ordem dentro da fatia é **descendente** quando há `before` (task 0.1). O processamento não depende
  dela: o cursor só avança no fim da fatia.
- Em cada fatia, pagina (`per_page = 30`) até a página **original** vir vazia.
  `fetchActivitiesWithHeaders` devolve `(originais, corridas, headers)`.
- Fatia varrida inteira → `atualizarPullCursor(fimDaFatia)` antes da próxima. Não depende da ordem da API.
- Rate limit ou erro no meio da fatia → para. O que já foi inserido nessa fatia **fica** (D3.5), mas o cursor
  não passa do fim da última fatia completa (CA10). O resultado é `PARCIAL` (houve inserção ou fatia
  completa) ou `FALHA`.
- **Progresso garantido sob cota curta:** no ciclo seguinte, a fatia interrompida é relistada, e o que já
  foi inserido custa zero requisição de laps (D3.3). Cada ciclo avança pelo menos até onde a cota deixou.
- Instante da atividade: `start_date` (UTC), campo novo no `StravaActivityDto`. `start_date_local` continua
  servindo só para a **data** do treino (`dataTreino`), como hoje.

### D3.3 Já importada
- `findByExternalIdAndAtletaId` presente → pula: sem `attachLaps`, sem `registrar`, não conta como inserção
  (CA7). Edição posterior no Strava chega pelo webhook `update`, que segue em `syncSingleActivityById`.
- Nova → merge + laps + `registrar`. Conta como inserção só se o find veio vazio **e** o `registrar`
  devolveu `inserted = true`. `SaveResult.inserted` sozinho é `true` também em update
  (`TreinoDedupHelper:94`); e o `false` do caminho de corrida concorrente com o webhook não conta.

### D3.4 Merge preserva o atleta
`mergeActivityIntoTreino`: `percepcaoEsforco` só é gravado se o treino ainda não tiver RPE (mesma regra de
`enriquecerTreinoComStrava`). O merge não toca `feedbackAtleta`, `sensacoes` nem `feedbackRegistradoEm` —
fica coberto por teste.

### D3.5 Transação por atividade
- `pullAgendado`, a varredura do manual e `syncActivitiesForAtleta` **não** são `@Transactional` como um
  todo (hoje `syncActivities` e `syncActivitiesForAtleta` são).
- Cada atividade nova é persistida num `TransactionTemplate` próprio (merge + laps + `registrar` +
  `recalcularSeDataMudou`), como o `IntervalsIcuActivityPersister` já faz no intervals.icu. Dentro dela, o
  atleta é **recarregado** (`findByIdAndTenantId`), porque `mergeActivityIntoTreino` lê
  `atleta.getAssessoria()` (lazy) e uma instância carregada fora da transação falharia.
- A chamada de laps fica dentro da transação da atividade (1 chamada, como hoje).
- Uma exceção desfaz só aquela atividade. A varredura para, e o cursor fica no fim da última fatia completa.
- Uma atividade que falha com `INESPERADO` conta tentativas (D7). Até a 3ª, ela bloqueia a fatia (o cursor
  não passa, e a atividade é retentada no ciclo seguinte). Na 3ª, é **descartada**: registrada com o motivo,
  logada em `WARN` com o id, contada em `ignoradas`, e a fatia segue. Isso dá visibilidade e uma saída
  operacional sem travar o atleta para sempre.
- `atualizarPullCursor` e `atualizarStatusSync` rodam fora das transações de atividade, cada um em
  transação curta (D0).

### D3.6 Classificação de erro HTTP
`fetchActivitiesWithHeaders` e `fetchActivityLaps` passam a mapear o status (`onStatus`/
`WebClientResponseException`):
- 429 → `StravaRateLimitException` (`RATE_LIMIT`), além da checagem atual por header (`:419`);
- 401/403 → `CREDENCIAL`;
- 5xx, timeout, erro de conexão → `TRANSITORIO`;
- outros → `INESPERADO`.

### D3.7 Resposta do sync manual
O contrato fica o mesmo (`StravaSyncResponseDto(imported, message)`). O comportamento muda assim:
- `COMPLETO`: como hoje ("X atividades importadas com sucesso", `lastSyncError = null`).
- `PARCIAL` ou `FALHA` por `RATE_LIMIT`: 200 com as inserções. Mensagem: "X atividades importadas;
  sincronização parcial (limite do Strava) — o restante entra no próximo ciclo". `lastSyncError` recebe
  essa frase. Hoje o rate limit é engolido e reportado como sucesso.
- Outras falhas: grava `lastSyncError` e relança, **sem desativar** (D0). É o efeito real de hoje.
- Em todos os casos, `ultimaSincronizacao = now` e `syncActivityCount`, via `atualizarStatusSync`.

## D4. intervals.icu

- `IntervalsIcuActivityIngestionService` ganha `importarAtividadeAgendada(atletaId, activityId, tenantId):
  ImportacaoResultado(TreinoRealizadoOutputDto treino, boolean inserida)`. Ela chama o mesmo corpo privado de
  `importarAtividade` com `aplicarLimiteRetroatividade = false`. `importarAtividade` (controller) mantém o
  limite e a assinatura.
- `IntervalsIcuActivityPersister.persistir` passa a devolver o `SaveResult`, em vez de só o treino. Hoje a
  flag é descartada (`:60-82`), e o treino vencedor de uma corrida concorrente volta como se fosse inserção
  própria. `inserida` = `SaveResult.inserted()` do persister, lido depois que a transação dele commitou.
  É `false` no retorno antecipado de "já importada" e no caminho de concorrência.
- `IntervalsIcuActivitySyncScheduler`:
  - horizonte inicial (D1), depois `oldest = pull_cursor − syncOverlapDays`;
  - chama `importarAtividadeAgendada` e soma `inserida`. O delta de contagem sai: com um import manual
    concorrente ou uma exclusão, ele mediria outra coisa;
  - no laço, além dos `catch` atuais, `RuntimeException` inesperada → para o lote como transitória,
    `categoria = INESPERADO`. O que já foi commitado é preservado na contagem;
  - `calcularCursor(falha, esgotouJanela, ultimaProcessada, pullCursorAtual)`: a entrada passa a ser
    `pull_cursor`, e o resultado vai para `atualizarPullCursor`;
  - `ultimaSincronizacao = now`, `syncActivityCount` e `lastSyncError` via `atualizarStatusSync`. Isso
    substitui o reload + `save` de `:175-187`, que já evitava instância antiga e passa a ser pontual;
  - o `catch` externo (falha na listagem, antes de qualquer inserção) → `FALHA` com 0.
- Atividade sem `start_date` ou com data ilegível (`Pendente.de`): segue pulada, mas conta em `ignoradas`
  e deixa o resultado `PARCIAL`/`DADOS_INVALIDOS`.
- O filtro de pendentes exclui, além das já persistidas, as **descartadas** (D7), **antes** de aplicar o
  teto `syncMaxActivitiesPerCycle`. Sem isso, 6 atividades com 422 dentro do overlap seriam selecionadas de
  novo a cada ciclo, consumiriam o teto e travariam o backlog atrás delas. Os 404/422 vêm de
  `buscarAtividade` (`IntervalsIcuActivityIngestionServiceImpl`), já mapeados para
  `DomainNotFoundException`/`DomainRuleViolationException`.
- Os testes existentes do scheduler que fazem mock de `importarAtividade` passam para o método novo. É
  mudança de comportamento especificada, não teste errado.

## D5. Resultado e registro do pull

- `record PullResultado(Resultado resultado, @Nullable ErroCategoria erro, int insercoes, int ignoradas)`,
  com `Resultado { COMPLETO, PARCIAL, FALHA }` e
  `ErroCategoria { RATE_LIMIT, CREDENCIAL, TRANSITORIO, DADOS_INVALIDOS, INESPERADO }`.
- Os pulls agendados (`pullAgendado` e `IntervalsIcuActivitySyncScheduler.syncAtleta`) **nunca lançam**.
  Um acumulador (`inserções`, `ignoradas`, `categoria`) nasce no início e vale para o método inteiro: carga,
  varredura **e finalização** (gravação de cursor e status). Qualquer exceção em qualquer fase é capturada
  e vira `PullResultado` com o que já foi acumulado. Uma falha ao gravar o cursor depois de 2 inserções dá
  `PARCIAL`/`INESPERADO` com 2, e o cursor não avançado é o lado seguro. O `catch` do scheduler em volta da
  chamada fica só como rede para bug, e registra `FALHA`/`INESPERADO` com 0.
- Entidade `SyncPullLog` + `SyncPullLogRepository` + `SyncPullLogWriter` (bean próprio) com
  `@Transactional(propagation = REQUIRES_NEW) registrar(...)`. É chamado pelos **schedulers**, beans
  diferentes do serviço, então passa pelo proxy. Falha ao gravar o registro é logada e não derruba o ciclo.
- Webhook, push e sync manual não gravam registro.
- Tabela:
  ```sql
  CREATE TABLE IF NOT EXISTS tb_sync_pull_log (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id      UUID NOT NULL,                                     -- solto (regra do projeto)
      atleta_id      UUID NOT NULL REFERENCES tb_atleta(id) ON DELETE CASCADE,
      plataforma     VARCHAR(50) NOT NULL,
      executado_em   TIMESTAMPTZ NOT NULL,
      resultado      VARCHAR(20) NOT NULL,
      erro_categoria VARCHAR(40),
      insercoes      INTEGER NOT NULL DEFAULT 0,
      ignoradas      INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT chk_sync_pull_log_resultado CHECK (resultado IN ('COMPLETO','PARCIAL','FALHA'))
  );
  CREATE INDEX IF NOT EXISTS idx_sync_pull_log_executado_em ON tb_sync_pull_log(executado_em);
  CREATE INDEX IF NOT EXISTS idx_sync_pull_log_tenant_atleta ON tb_sync_pull_log(tenant_id, atleta_id, executado_em);
  ```
- Expurgo: `SyncPullLogPurgeScheduler`, `@Scheduled(cron = "0 30 4 * * *")`. Apaga em lotes de 1000
  (`DELETE ... WHERE id IN (SELECT id ... WHERE executado_em < now() - 90d LIMIT 1000)`) até afetar menos
  de 1000 linhas. É idempotente, e duas instâncias concorrentes só dividem o trabalho.

## D6. Migration V98

```sql
ALTER TABLE tb_integracao_externa ADD COLUMN IF NOT EXISTS pull_cursor TIMESTAMPTZ;
UPDATE tb_integracao_externa SET pull_cursor = ultima_sincronizacao WHERE pull_cursor IS NULL;
-- + tb_sync_pull_log (D5) + tb_sync_atividade_descartada (D7)
```

Integração com `ultima_sincronizacao` nula fica com `pull_cursor` nulo, e é o horizonte inicial (D1) que a
trata.

## D7. Descarte registrado

A atividade que o pull decide não importar precisa sair da seleção, e não só ser pulada uma vez.

```sql
CREATE TABLE IF NOT EXISTS tb_sync_atividade_descartada (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL,
    atleta_id     UUID NOT NULL REFERENCES tb_atleta(id) ON DELETE CASCADE,
    plataforma    VARCHAR(50) NOT NULL,
    external_id   VARCHAR(100) NOT NULL,
    motivo        VARCHAR(40) NOT NULL,        -- PERMANENTE (404/422) | FALHA_RECORRENTE
    tentativas    INTEGER NOT NULL DEFAULT 0,
    descartada_em TIMESTAMPTZ,                 -- nulo = ainda em tentativa
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sync_descartada UNIQUE (atleta_id, plataforma, external_id)
);
```

- **Permanente** (404/422 no intervals.icu) → linha com `descartada_em = now` na 1ª vez.
- **Inesperado** → `tentativas++` (upsert). Na 3ª tentativa, `descartada_em = now`, motivo `FALHA_RECORRENTE`.
- A seleção de pendentes (intervals.icu) e a varredura agendada (Strava) ignoram `external_id` com
  `descartada_em IS NOT NULL`.
- **Só o pull agendado lê ou grava D7.** O sync manual não incrementa tentativas nem filtra descartadas.
  Uma tentativa manual pode até recuperar uma descartada, e o descarte continua valendo "3 ciclos agendados
  seguidos". A política é um parâmetro da varredura, e não um estado global.
- **Uma tentativa por ciclo:** o incremento acontece no máximo uma vez por atividade por ciclo agendado.
- A gravação fica em `SyncDescarteWriter` (`REQUIRES_NEW`), para sobreviver ao rollback da atividade.
- **Saída operacional:** apagar a linha faz a atividade voltar ao próximo ciclo, desde que ainda esteja na
  janela, ou ao import manual. O expurgo de D5 também apaga as linhas com `atualizado_em` de mais de 90 dias.

## Riscos

- **Cota do Strava compartilhada entre atletas** — atrasa, mas não perde. Cada ciclo retoma do que foi
  commitado.
- **Edição no Strava de corrida já importada** deixa de ser pega pelo pull — o webhook `update` cobre;
  aceito.
- **Backfill herda cursor adiantado** — aceito; perda antiga fora do escopo.
- **Recálculo de TSB no backlog antigo** — limitado pelo teto por ciclo (6).
- **Transação por atividade muda o sync manual:** uma falha no meio deixa gravado o que já entrou, em vez
  de desfazer tudo. É o desejado (o progresso não se perde), mas é diferente de hoje.
- **Atividade com erro determinístico** bloqueia a fatia por até 3 ciclos (~6h) e depois é descartada com
  registro (D7). É uma perda deliberada, mas visível e reversível.
- **Cooldown do sync manual** (`isRecentlySynced`, 30 s) passa a ver o `now` gravado por cada pull agendado.
  É intencional e desprezível: a janela é de 30 s num ciclo de 2h.
- **Push, retry e webhook seguem fazendo `save` de instância possivelmente antiga** (tokens, status) — dívida
  anterior a esta change. Eles já não conseguem tocar `pull_cursor` (D1). O resto fica fora do escopo.

## Rollback

Depois do deploy, os schedulers gravam `ultimaSincronizacao = now` mesmo em pull `PARCIAL`. O código antigo
lê esse campo como cursor, então reverter só o binário faria o pull antigo pular a janela parcial. Por isso
o rollback tem dois passos:

1. Reverter o PR.
2. **Antes** do primeiro ciclo do código antigo, rodar:
   ```sql
   UPDATE tb_integracao_externa
      SET ultima_sincronizacao = pull_cursor
    WHERE pull_cursor IS NOT NULL
      AND (ultima_sincronizacao IS NULL OR pull_cursor < ultima_sincronizacao);
   ```
   Isso devolve ao campo antigo o progresso confirmado. O `lastSync` exibido recua, o que é aceitável num
   rollback.

A migration é aditiva: a coluna e as tabelas ficam sem uso ou saem numa limpeza. O script fica versionado
como `docs/rollback/fix-sync-cursor-data-loss.sql` no backend (task 5.3).
