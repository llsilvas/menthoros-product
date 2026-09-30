**Tamanho:** L · **Trilha:** Full

# fix-sync-cursor-data-loss

Um repositório (backend) com **migration** e comportamento de ingestão de dados reais de atleta. Full pelo
risco: um erro aqui perde ou duplica treinos, que alimentam PMC, aderência e o motor de plano. Origem:
pré-mortem Codex de `add-sync-health-signal` (2026-09-30); os defeitos foram conferidos no código. Subiu de M
para L depois do pré-mortem desta própria change, que achou mais três caminhos de perda; o DoR de
2026-09-30 achou mais quatro (ver "Revisões").

## Por quê

Treino que o atleta fez pode **nunca chegar** ao Menthoros, sem erro visível. O pull de atividades usa
`IntegracaoExterna.ultimaSincronizacao` como cursor ("busque a partir daqui"), mas **cinco caminhos** gravam
nesse campo sem ter importado nada até ali:

1. **Push do intervals.icu** grava `now()` (`IntervalsIcuPushListener.java:112`,
   `IntervalsIcuRetrySchedulerImpl.java:146`). Com o pull atrasado, um plano aprovado pelo coach salta o
   cursor para hoje; o pull busca a partir de `cursor − 7 dias` e o que ficou para trás sai da janela.
2. **Webhook do Strava** grava `now()` a cada evento (`StravaActivityServiceImpl.java:171`).
3. **Sync manual do Strava** grava `now()` ao fim (`:204`), mesmo quando o rate limit interrompeu a varredura
   — e, por passar pelo **mesmo** `syncActivities` do scheduler (`:202` e `StravaActivitySyncScheduler:47`),
   também grava o cursor calculado dentro da varredura (`:331`).
4. **Paginação do Strava** para quando a página *filtrada* (só corridas) vem vazia (`:296`; o filtro fica em
   `fetchActivitiesWithHeaders`): 30 atividades seguidas de outra modalidade encerram a varredura, e sem
   corrida processada o cursor vai para `now()` (`:333`).
5. **Backlog do intervals.icu com mais de 90 dias** é rejeitado pela validação do import manual, reusada
   pelo scheduler (`IntervalsIcuActivityIngestionServiceImpl.java:117-131`), tratado como erro permanente
   (`IntervalsIcuActivitySyncScheduler.java:161`) — e o cursor passa por cima.

E mais três defeitos no mesmo caminho:

- O cursor do Strava lê `start_date_local` como UTC (`:459`): no Brasil erra para trás (seguro), mas em
  fusos positivos pula corridas. O DTO nem tem `start_date` hoje.
- O Strava **não tem overlap** (`:137`): uma atividade enviada depois com data anterior ao cursor nunca é
  listada. Com cursor nulo, a janela inicial `now − 90d` é recalculada a cada ciclo, então falhas seguidas
  encolhem a cobertura.
- Relistar uma corrida já importada **apaga o RPE** que o atleta registrou (`mergeActivityIntoTreino` grava
  o `perceived_exertion` do Strava, nulo na maioria) e refaz a busca de laps (1 requisição por atividade
  relistada).

Para o coach: um atleta aparece com lacuna, inativo na fila ou com aderência baixa por treinos que fez, e o
motor pode reduzir o plano dele. E não há registro de que o pull funcionou.

## O que muda

- **Cursor exclusivo do pull** (`pull_cursor`, coluna nova), **fora do alcance do ORM**: mapeado como somente
  leitura na entidade, gravado só por `UPDATE` pontual com `id` + `tenant_id`. Quem salva a entidade inteira
  (push, retry, webhook, sync manual) não consegue sobrescrevê-lo. Só os schedulers de pull o avançam, e só
  até o que foi **confirmado**. `ultimaSincronizacao` **mantém o significado e os escritores atuais** (última
  atividade de sync, exibida ao coach e usada no cooldown do sync manual).
- **Strava:**
  - o scheduler ganha uma entrada própria; o sync manual continua com a sua, que **lê** `pull_cursor` mas
    nunca o grava;
  - varredura por **fatias de tempo** (`after` + `before`, 14 dias), cada uma paginada até a página
    **original** vazia. O cursor avança para o fim da fatia só quando ela termina inteira. Isso independe da
    ordem da API e retoma de onde parou depois de rate limit;
  - instante da atividade = `start_date` (UTC); overlap de 7 dias;
  - atividade já importada não é reprocessada pelo pull (zero requisição de laps, RPE intocado);
  - mesmo assim, `mergeActivityIntoTreino` passa a preservar o RPE já preenchido (o webhook de update
    continua usando o merge).
- **intervals.icu:**
  - o limite de retroatividade (90 dias) fica só no import manual; o scheduler usa uma entrada sem ele;
  - atividade sem data válida não bloqueia o cursor, mas deixa o pull `PARCIAL` e é contada.
- **Horizonte inicial estável:** com `pull_cursor` nulo, o primeiro ciclo grava `now − 90d` antes de buscar.
  Falhas seguintes partem desse ponto, e não de um `now − 90d` que anda.
- **Descarte registrado** (`tb_sync_atividade_descartada`): atividade rejeitada de forma permanente, ou que
  falha 3 vezes seguidas, sai da seleção. Não trava o backlog nem consome o teto, fica visível e pode ser
  reaberta apagando a linha.
- **Resultado estruturado do pull** (`PullResultado`: completo/parcial/falha, categoria do erro, inserções
  reais), no lugar do `int` de hoje.
- **Registro de cada pull** (`tb_sync_pull_log`), gravado pelo scheduler **depois** que o serviço de pull
  retorna ou lança, por um bean próprio em `REQUIRES_NEW`. É o instrumento da métrica abaixo e da medição
  prospectiva de `add-sync-health-signal`. Retenção de 90 dias, expurgo diário em lotes.
- Migration aditiva **V98**: `pull_cursor` com backfill a partir de `ultima_sincronizacao`, e as duas
  tabelas.
- **Rollback em dois passos:** reverter o PR e rodar o script que devolve `pull_cursor` para
  `ultimaSincronizacao` (design, "Rollback"). Reverter só o binário faria o código antigo pular janelas
  parciais.

## Fora do escopo

- Recuperar atividades já perdidas (reimportação) — follow-up, se a linha de base mostrar perda real.
- Saúde da sincronização no perfil e na fila (`add-sync-health-signal`, em espera).
- Mudar o que push, webhook e sync manual gravam em `ultimaSincronizacao`.
- Mudar a política de desativação da integração. O `setAtivo(false)` no `catch` do sync manual (`:213`)
  hoje é desfeito pelo rollback da própria transação, então nunca vale. Esta change preserva esse efeito
  real (não desativa) e remove a linha morta, sem criar desativação nova (design D0).
- Push, retry e webhook fazendo `save` de instância possivelmente antiga (tokens, status): dívida anterior.
  Eles já não alcançam `pull_cursor`; o resto é follow-up.
- Upload no Strava com mais de 7 dias de atraso: fora do alcance do pull (overlap), coberto pelo webhook
  `create`. Declarado, não resolvido.

## Contrato de API

**Sem mudança.** `lastSync`/status continuam lendo `ultimaSincronizacao`
(`IntervalsIcuConnectionServiceImpl:160`, `StravaOAuthServiceImpl:140`, `getSyncStatus`). `pull_cursor` e
`tb_sync_pull_log` não são expostos nesta change.

## Critérios de aceite

- **CA1 — Push não move o pull.** Given `pull_cursor` em D−20, When um push conclui salvando a entidade,
  Then `pull_cursor` continua em D−20 e o próximo pull do intervals.icu lista a partir de D−27.
- **CA2 — Webhook e sync manual não movem o pull.** Given `pull_cursor` em D−20, When chega um webhook ou o
  sync manual termina (com ou sem rate limit), Then `pull_cursor` continua em D−20.
- **CA3 — Página só de outras modalidades.** Given na fatia a página 1 do Strava com 30 atividades de bike
  e a página 2 com 3 corridas, Then as 3 corridas são importadas.
- **CA4 — Sem progresso, cursor parado.** Given rate limit na primeira página de uma conexão nova, Then
  `pull_cursor` fica no horizonte inicial gravado (`now − 90d` do primeiro ciclo) e o pull é
  `FALHA`/`RATE_LIMIT`; no ciclo seguinte, o horizonte é o mesmo.
- **CA5 — Backlog antigo no intervals.icu.** Given `pull_cursor` em D−120, When o scheduler roda, Then as
  atividades de D−120 a D−90 são importadas, não descartadas; e o import manual de uma atividade de D−100
  continua recusado.
- **CA6 — Fuso.** Given uma corrida com `start_date` 06:00Z e `start_date_local` 09:00 (UTC+3), Then o
  instante usado é 06:00Z.
- **CA7 — Relistar não duplica nem apaga enriquecimento.** Given uma corrida já importada com RPE 7 do
  atleta, When o pull a relista, Then não há duplicata, o RPE fica 7, não há chamada de laps e ela não conta
  como inserção. When o webhook de update traz `perceived_exertion` nulo, Then o RPE fica 7.
- **CA8 — Registro sobrevive à falha e conta só o commitado.** Given um pull que falha antes de qualquer
  inserção (por exemplo, ao carregar a integração), Then existe o registro `FALHA` com `insercoes = 0`.
  Given um pull do Strava com rate limit depois de 3 inserções, Then o registro é `PARCIAL`/`RATE_LIMIT` com
  `insercoes = 3`. Given um pull do intervals.icu com exceção inesperada depois de 2 inserções commitadas,
  Then o registro é `PARCIAL`/`INESPERADO` com `insercoes = 2`.
- **CA9 — Tenant.** O registro tem o tenant da integração; o `UPDATE` de `pull_cursor` com tenant errado
  afeta zero linhas.
- **CA10 — Fatia retomável.** Given rate limit na página 3 da segunda fatia, Then `pull_cursor` fica no fim
  da primeira fatia e o próximo ciclo recomeça na segunda.
- **CA11 — Descarte não trava o backlog.** Given 6 atividades do intervals.icu com 422 dentro do overlap e
  uma 7ª válida depois delas, When rodam dois ciclos seguidos, Then a 7ª é importada no segundo ciclo e as 6
  não são buscadas de novo.
- **CA12 — Falha recorrente tem saída.** Given uma corrida cuja importação lança exceção inesperada em todo
  ciclo, Then nos 2 primeiros ciclos o cursor não passa dela, e no 3º ela é descartada com registro, contada
  em `ignoradas`, e a fatia segue.

## Métrica de sucesso

**Treinos que não chegam = 0**, com linha de base.

**Antes do deploy (task 0):** para cada atleta do piloto com integração (todos; o piloto é pequeno),
comparar as corridas dos últimos 60 dias na API (intervals.icu, Strava) com as importadas e contar as
faltantes por atleta. Responsável: founder, com script de apoio.

**4 semanas depois:**
- a mesma comparação, com meta de 0 faltantes em janelas de pull `COMPLETO`;
- do lado do coach, atletas do piloto com lacuna ou `INATIVIDADE` na fila que tinham treino na API
  (meta: 0) — é o que tira do coach a checagem manual "ele treinou ou o sync falhou?".

Mecânica secundária: pulls `PARCIAL`/`FALHA` seguidos de recuperação no ciclo seguinte. A medição de 4
semanas **não bloqueia o arquivamento**: é registrada em `add-sync-health-signal`, que depende dela.

## Open Questions & Assumptions

- **Ordenação do Strava:** deixa de importar. As fatias fazem o cursor avançar só quando a fatia inteira foi
  varrida. A task 0.1 vira só uma confirmação de que `before` + `after` + `page` funcionam juntos.
- **Custo:** a primeira carga de 90 dias ocupa 7 fatias, cerca de 1 listagem por fatia sem corrida e mais 1
  por página. Cada corrida nova custa 1 chamada de laps. Já importadas custam zero. O limite do app Strava
  (100/15min, 1000/dia) é **compartilhado entre atletas**, e o rate limit interrompe o ciclo daquele atleta
  sem perder progresso.
- **Backfill de `pull_cursor`** a partir de `ultimaSincronizacao`: herda um valor que pode já ter sido
  adiantado; perda antiga não é recuperada (fora do escopo).
- **Backlog antigo no intervals.icu custa recálculo de TSB:** cada atividade de D−120 recalcula ~120 dias.
  Limitado a `syncMaxActivitiesPerCycle` (6) por atleta a cada 2h, na thread do scheduler, e não na de
  request. Aceito.
- **Sem ShedLock no projeto:** os schedulers atuais também rodam sem ele (o Railway roda uma instância). O
  expurgo é um `DELETE` por lote idempotente, seguro em execução concorrente.
- **Decisão do founder (2026-09-30):** esta correção vem antes das changes de sinal de sincronização.

## Revisões antes da implementação (2026-09-30)

- **product-reviewer: Refine.** As correções são o núcleo; o registro de pull deve ser mínimo e justificado
  como instrumento da métrica; métrica do lado do coach com linha de base. Incorporado.
- **Pré-mortem Codex: NO-GO → incorporado.** Conferidos no código e procedentes: webhook e sync manual
  também gravam `now()` no cursor; `start_date_local` lido como UTC; o scheduler do intervals.icu herda o
  limite de 90 dias do import manual e descarta backlog como permanente; o registro de pull ficaria dentro
  da transação; relistar pode sobrescrever enriquecimento e contar update como inserção; salvar a entidade
  inteira permite sobrescrita concorrente; `ultimaSincronizacao` nula quebraria consumidores do status
  (resolvido mantendo o campo). Desenho trocado para cursor exclusivo do pull.
- **DoR (spec-reviewer: READY WITH GAPS · Codex: NO-GO) → incorporado.** Conferidos no código:
  - `IntegracaoExterna` sem `@DynamicUpdate`: o `save` de uma instância antiga reescreveria `pull_cursor`.
    Coluna passa a ser somente leitura no ORM.
  - O Strava não tem o overlap que o design supunha, e o horizonte com cursor nulo andava a cada ciclo.
  - O sync manual e o scheduler do Strava compartilham `syncActivities`. Agora têm entradas separadas.
  - `syncActivities` devolve `int` e engole o rate limit. Passa a devolver `PullResultado`.
  - `SaveResult.inserted` vem `true` também em update (`TreinoDedupHelper:94`). A inserção passa a ser
    contada pelo find-or-new antes do save.
  - O intervals.icu transaciona por atividade (`IntervalsIcuActivityPersister:51`), então o CA8 foi reescrito
    por plataforma. `REQUIRES_NEW` fica num bean próprio (auto-invocação não passa pelo proxy).
  - `mergeActivityIntoTreino` apaga o RPE do atleta.
  - Ordenação do Strava sem contrato: trocada por fatias de tempo.
- **DoR rodada 2 (spec-reviewer: READY WITH GAPS · Codex: NO-GO) → incorporado.** Conferidos no código:
  - `@Modifying` não abre transação e o repositório não tem `@Transactional`. Os métodos pontuais passam a
    ser `@Transactional` (REQUIRED).
  - Sem a transação externa, `getValidToken` (`StravaOAuthServiceImpl:99`) commita a renovação sozinho, e o
    `save` de uma instância antiga a apagaria. Regra D0: nada de `save` de instância antiga; status gravado
    por `UPDATE` pontual.
  - A transação por fatia travaria o progresso sob cota curta e destacaria o atleta lazy. Trocada por
    transação por atividade, com o atleta recarregado.
  - A fronteira das fatias pode ser exclusiva: sobreposição de 60 s.
  - O delta de contagem no intervals.icu mede outra coisa sob concorrência: passa a contar por `inserida`.
    Exceção inesperada no laço preserva o progresso.
  - 429 sem header não vira rate limit: há mapeamento de status HTTP.
  - O sync manual passa a informar o `PARCIAL` em vez de reportar sucesso.
- **DoR rodada 3 (spec-reviewer: READY WITH GAPS, sem Critical · Codex: NO-GO, sem Critical) → incorporado.**
  Conferidos no código:
  - O filtro de pendentes do intervals.icu (`IntervalsIcuActivitySyncScheduler:136-143`) só exclui o que já
    foi persistido, então 422 recorrentes consumiriam o teto para sempre. Entra o descarte registrado (D7).
  - O persister descarta `SaveResult.inserted` (`IntervalsIcuActivityPersister:60-82`). Passa a devolvê-lo.
  - A falha na finalização zeraria a contagem: o pull nunca lança, e o acumulador cobre todas as fases.
  - Reverter só o binário faria o código antigo pular janelas: rollback com script.
  - Uma atividade com falha determinística travaria para sempre: descarte na 3ª tentativa.
- **DoR rodada 4 (Codex: NO-GO, sem Critical; os três Importantes da rodada 3 confirmados como fechados) →
  incorporado.**
  - O sync manual consumiria tentativas do D7: só o pull agendado usa o D7, com uma tentativa por ciclo.
  - Sem a transação externa, o `setAtivo(false)` do `catch` manual passaria a commitar, e hoje o rollback o
    desfaz. O efeito real (não desativar) é preservado.
  - Com isso, a convergência foi 4 → 2 → 0 → 0 Críticos. A implementação segue com essas correções.
