# Design — garmin-activity-ingestion

## Context

Ver `proposal.md` e ADR-0013. Estado que molda o desenho:

- `FitUploadServiceImpl.importar(atletaId, InputStream)` = `FitParseService.parse(in)` (fora de
  transação) → `FitTreinoPersister.persistir(atletaId, dados)` (transacional): monta
  `TreinoRealizado(fonteDados=GARMIN, criadoPor=GARMIN, externalId=<atletaId>-<serial>-<start>,
  tipoTreino=CONTINUO)` com etapas e chama `IngestaoTreinoRealizadoService.registrar` (dedup por
  `UNIQUE(tenant_id, fonte_dados, external_id)`, TSS, evento de análise, carga do dia). Não há
  `deviceName` em `FitSessionData`; `TreinoRealizado.deviceName` existe (o intervals.icu preenche).
- `TreinoRealizadoOutputDto` tem `fonteDados` e `externalId`, não `deviceName`.
- Webhook Garmin (`garmin-connection`): `POST /api/v1/garmin/webhook/{segredo}`, corpo roteado
  pela chave da lista; `activityFiles` hoje cai em "chave desconhecida → 200".
- Activity API: item de `activityFiles` traz `userId`, `summaryId`, `fileType` (FIT/TCX/GPX),
  `callbackURL` (token próprio, válido 24 h, segundo download → 410), `activityType`,
  `deviceName`, `startTimeInSeconds`, `activityId`, `manual`. Starter: 50 downloads/min por client
  ID. Push tem timeout de 30 s; responder 200 antes de processar.
- `IntervalsIcuRetrySchedulerImpl` é o molde de `@Scheduled` que processa um lote de linhas
  pendentes com transações curtas e HTTP fora delas.
- `MelhorEsforcoServiceImpl` usa `pace-curves` do intervals.icu (não existe no Garmin).
- Front — pontos que exibem treino realizado com fonte, cada um com seu DTO:
  `TodayFeedbackCard` (`AtletaHomeDto` → `AthleteRealizadoHoje`), `RecentTrainingsList` do atleta
  (`TreinoRealizadoDto`), `RecentTrainingsPanel` do treinador
  (`AtletaPerfilCoachOutputDto.RealizadoRecenteDto`) e `DetalheTreinoDialog` (`TreinoService`).
  `CoachCalendarPage` não mostra realizado e `WorkoutDetailDrawer` mostra o planejado + análise de
  IA. `SyncStatusChip`, `CoachWatchLine`; flag `garminHabilitado` de `garmin-connection`. O produto
  não exporta treinos.
- `FitTreinoPersister.persistir` exige `TenantContext.getRequiredTenantId()`; o scheduler não tem
  request. Molde para instalar/limpar o contexto: `StravaWebhookServiceImpl` (`setTenantId` +
  `clear` em `finally`).
- `IngestaoTreinoRealizadoServiceImpl` devolve o treino existente na duplicata sem tocá-lo.
- `GlobalExceptionHandler` mapeia `DataIntegrityViolationException` para 409 e loga a causa SQL; o
  handler genérico loga a exceção com cadeia de causas. Violação de `NOT NULL` no Postgres inclui
  "Failing row contains (...)" — a linha inteira, com o `callback_url`, que carrega token.
- `IntegracaoExterna.ultimaSincronizacao` existe e já sai em `GarminConnectionStatusDto`, mas
  nenhum código Garmin a grava hoje (só o intervals.icu, em `IntervalsIcuRetrySchedulerImpl`).
- Melhores esforços no front: `AthleteProgressPage` dispara `fetchMelhoresEsforcos` sozinha;
  `EffortsBlock`/`MelhoresEsforcosPanel` são apresentacionais.
- Webhook: `GarminWebhookController` valida o segredo e chama `GarminWebhookService.processar(Map)`
  sempre devolvendo 200; o roteamento por chave está em `GarminWebhookServiceImpl`, deliberadamente
  sem `@Transactional` no lote, cada item em transação própria e exceção por item engolida com log.
- `GarminConnectionStatusDto` (tela do atleta) já tem `activityExport` e `ultimaSincronizacao`. O
  treinador lê outro DTO: `CoachWatchLine` consome `AtletaPerfilCoachOutputDto.ConexaoCanalDto`,
  que tem `plataforma`, `ativo`, `workoutImport`, `activityExport` e `lastSyncError`, mas **não**
  `ultimaSincronizacao` — esse campo entra nele e no montador.
- `FitTreinoPersister.persistir(atletaId, dados)` devolve `FitImportResultado` com `novo()` e o id
  do treino (novo ou existente).
- Última migration em `develop`: `V108__add_zonas_manuais_atleta.sql`.

## Goals / Non-Goals

**Goals:**
- Zero mapper novo: o FIT é a verdade e o pipeline já existe.
- Nunca perder um arquivo por causa do download único: o ping é persistido antes do 200.
- Nunca guardar o binário. A licença não proíbe guardar o FIT em si — 15.11(e) proíbe reter dado
  Garmin de forma que permita treinar/avaliar IA; descartar após o parse elimina o risco e o custo
  de armazenamento, e o treino parseado já carrega o que o produto usa.
- Atribuição completa na primeira entrega (licença 6.4; 14 dias para corrigir).

**Non-Goals:**
- Resumos `activities`/`activityDetails`/`moveIQ`; TCX/GPX (raros — descartados com motivo);
  histórico (Starter não tem); inferência de `TipoTreino`; cálculo de melhores esforços a partir
  do FIT (`add-athlete-best-efforts`); aviso de migração aos atletas do intervals.icu.

## Decisions

### D1: `tb_garmin_ping` como fila durável mínima
Colunas: `id`, `tenant_id`, `atleta_id` (resolvido na recepção via `IntegracaoExterna(GARMIN,
externalAthleteId=userId)`), `user_id`, `summary_id` UNIQUE, `activity_id`, `callback_url`,
`activity_type`, `device_name`, `start_time`, `manual`, `status` (PENDENTE, SINCRONIZANDO,
PROCESSADO, DESCARTADO, ERRO), `motivo`, `tentativas`, `proxima_tentativa_em`,
`sincronizando_desde` nullable, `treino_realizado_id` nullable, `criado_em`, `processado_em`.
Sem `bytea`. Padrão de tabela do CLAUDE.md do backend (UUID, TIMESTAMPTZ,
índice `(tenant_id, status)` e `(status, criado_em)`). Migration `V109__create_tb_garmin_ping.sql`
(conferir o último número antes de criar). Tipos: `summary_id`/`activity_id`/`user_id`
`VARCHAR(100)`, `callback_url VARCHAR(1000)`, `activity_type VARCHAR(50)`, `device_name
VARCHAR(255)`, `start_time TIMESTAMPTZ`, `manual BOOLEAN NOT NULL`, `status VARCHAR(20) NOT NULL`
com `CHECK` nos cinco valores, `motivo VARCHAR(500)`, `tentativas INT NOT NULL DEFAULT 0`,
`proxima_tentativa_em TIMESTAMPTZ NOT NULL`; `tenant_id`/`atleta_id` `NOT NULL` com FK.
`summary_id` UNIQUE **global**, não por tenant: o `summaryId` é único no Garmin. Alternativa
rejeitada: baixar inline no
request — se a persistência falhar depois do 200, o arquivo some para sempre.

### D2: Recepção decide descarte sem rede
`GarminWebhookServiceImpl.processar` ganha a chave `activityFiles` e delega a
`GarminPingService.registrar(List<JsonNode>)`. O controller não muda. `registrar` segue a regra de
insert-or-ignore do CLAUDE.md do backend: **sem `@Transactional`**, cada item é um `save` em
transação própria, e `DataIntegrityViolationException` na UNIQUE de `summary_id` = repetido →
ignora. Diferente de `deregistrations`/`userPermissionsChange`, `activityFiles` **não passa pelo
`porItem` que engole exceção**: qualquer outra falha de gravação propaga, o
`GlobalExceptionHandler` (handler genérico) responde 500 e o Garmin reenvia o lote inteiro — o que
já foi gravado é absorvido pelo dedup. Engolir aqui perderia o arquivo para sempre. **A falha
propaga sanitizada:** `registrar` captura a exceção de gravação que não é o dedup, loga só o tipo
(como o `porItem`) e lança `GarminPingRegistroException` **sem causa** — o handler genérico
responde 500 sem que a mensagem SQL (que pode conter o `callback_url` com token) chegue ao log.
Isso não basta sozinho: o `SqlExceptionHelper` do Hibernate loga a mensagem do Postgres antes do
catch (`org.hibernate` em WARN no `logback-spring.xml`). Por isso `registrar` **valida antes do
`save`** os campos obrigatórios (`userId`, `summaryId`, `callbackURL`, `startTimeInSeconds`) e
pula o item inválido com log só do motivo — assim nenhuma violação de `NOT NULL`/`CHECK` ("Failing
row contains") acontece. A única violação esperada é a UNIQUE de `summary_id`, cuja mensagem traz
só o `summaryId`; o resto (conexão, timeout) não carrega dados da linha.
`userId` sem nenhuma `IntegracaoExterna(GARMIN)` → **não grava**,
só loga (ADR-0013: "200 sem efeito"; sem atleta não há `tenant_id`, que é `NOT NULL`);
`activityType` fora do conjunto de corrida, `manual=true`, `fileType != FIT`, ou conexão do
atleta inativa → `DESCARTADO` com motivo; senão `PENDENTE`. O controller responde 200 depois
disso (um `INSERT` por item, bem abaixo de 30 s; Activity API §8.2: ping com status ≠ 200 é
reenviado com backoff). Conjunto de corrida (Activity API, Appendix A): `RUNNING,
INDOOR_RUNNING, OBSTACLE_RUN, STREET_RUNNING, TRACK_RUNNING, TRAIL_RUNNING, TREADMILL_RUNNING,
ULTRA_RUN, VIRTUAL_RUN`.

### D3: `GarminPingProcessorScheduler` a cada minuto
Lote de até 20 pings `PENDENTE` com `proxima_tentativa_em <= now` e `criado_em > now − 24 h`,
ordenados por `criado_em` (mais antigo primeiro = mais perto de expirar). Para cada um, com
`TenantContext.setTenantId(ping.tenantId)` instalado e limpo em `finally` (molde
`StravaWebhookServiceImpl` — o persister exige o contexto e o scheduler não tem request): marca
`SINCRONIZANDO` com `sincronizando_desde = now` (claim em TX própria, como o processor do
intervals.icu); **revalida a conexão** — sem `IntegracaoExterna(GARMIN)` ativa para o atleta
(desconectou ou foi desregistrado enquanto o ping esperava) → `DESCARTADO "conexão inativa"`, sem
download; fora de TX, `GarminClient.baixarArquivo` + `FitParseService.parse`; em TX,
`FitTreinoPersister.persistir(atletaId, dados, deviceName)`, `PROCESSADO` com
`treino_realizado_id` e `IntegracaoExterna.ultimaSincronizacao = now` (o mesmo campo que o
intervals.icu grava e que o `GarminConnectionStatusDto` já expõe; sobrevive à limpeza do D5).
O download usa o `garminWebClient`, cujo limite de agregação em memória é o padrão do Spring
(256 KiB) — menor que a própria fixture (584 KB); o client ganha `maxInMemorySize` de 16 MiB
(FIT de ultra longa fica em poucos MB) e o teste do download passa pelo WebClient real com a
fixture, não só por mock. Estourar o limite depois de consumir o link perderia o arquivo (410).
**Antes do download**, o `callbackURL` é validado: esquema `https`, host
`apis.garmin.com` e path `/wellness-api/rest/activityFile`; fora disso → `ERRO "callbackURL
inválido"` sem requisição (a URL chega no corpo de um request externo — sem a checagem o backend
faz GET em host arbitrário, SSRF; o segredo no path do webhook não basta). Erros: 5xx/timeout/429
→ `PENDENTE`, `tentativas+1` e
`proxima_tentativa_em = now + min(2^tentativas, 60) min`; **sem teto de tentativas** — o limite é a
janela de 24 h, porque o link continua válido e uma queda do Garmin maior que alguns minutos não
pode queimar o arquivo (mesmo erro do `garmin-reenvio-plano`: 5 tentativas em 5 min). 410/404 →
`ERRO` (link já consumido, não há reenvio possível; o caminho é o upload manual do FIT); 401/403/412
→ `ERRO` sem retry com motivo de permissão (Activity API Appendix B: token inválido, consentimento
retirado ou `ACTIVITY_EXPORT` ausente — mesmo mapeamento do `GarminTrainingAdapter` no push), que
alimenta o estado de conexão do `watch-connection-guide`;
`FitParseException` → `ERRO` sem retry; `DataIntegrityViolation` do dedup é tratado por
`registrar` (treino existente) → `PROCESSADO`. Pings com mais de 24 h → `ERRO "expirado"` pelo
mesmo job. **Reclaim:** ping `SINCRONIZANDO` há mais de 10 min (processo caiu após o claim) volta a
`PENDENTE` com `tentativas+1`; se o link já tiver sido consumido, o retry dá 410 e vai a `ERRO`. Alternativa rejeitada: `@Async` por ping — perde o controle de lote e de retry que o
scheduler dá de graça. `shortcut: 20 pings/min por instância; com 50/min de cota do Garmin e
mais de ~200 corridas/dia, subir o lote`.

### D4: `deviceName` entra pelo persister
`FitTreinoPersister.persistir(UUID atletaId, FitSessionData dados, @Nullable String deviceName)`;
`FitUploadServiceImpl` passa `null`. Na duplicata (`novo() == false`, o atleta subiu o FIT antes
do ping), o persister preenche `deviceName` no treino existente **só se estiver nulo**, sem
repetir TSS/evento/carga — senão o modelo que o Garmin informou se perde. O `deviceName` chega à
tela pelos DTOs do Context: `TreinoMapper`/`TreinoRealizadoOutputDto` (lista do atleta),
`AtletaHomeDto` (realizado de hoje), `AtletaPerfilCoachOutputDto.RealizadoRecenteDto` (lista do
treinador), cada um com seu montador. Dois a mais, decididos na implementação (2026-11-05):
`TreinoPlanejadoOutputDto` ganha `completedSource`/`completedDeviceName`, lidos do realizado
vinculado como já faz com `percepcaoEsforcoRealizado` — o `DetalheTreinoDialog` carrega o
**planejado**, cujo `fonteDados` é a fonte do plano (`IA_GERADO`/`MANUAL`), não a do realizado; e
`AthleteWorkoutAnalysisOutputDto.Executado` ganha `fonteDados`/`deviceName` para a análise de IA
(Open Question (d), confirmada).
Alternativa rejeitada: `UPDATE` depois da persistência — segunda escrita para um campo que cabe
na primeira.

### D5: Limpeza dos pings
`@Scheduled` diário apaga pings `PROCESSADO`/`DESCARTADO` com mais de 30 dias; `ERRO` fica 90
dias para investigação.

### D6: Atribuição por componente único no front
`FonteAttribution({ fonteDados, deviceName })` renderiza o modelo do dispositivo ou "Garmin" para
`GARMIN`, nada para as demais fontes; usado nos cinco pontos que exibem treino realizado:
`TodayFeedbackCard` e `TodayCompletedCard` (substitui o primeiro depois do feedback, mesmo
`AthleteRealizadoHoje`), `RecentTrainingsList`, `RecentTrainingsPanel` e `DetalheTreinoDialog`,
mais a análise de IA (`WorkoutAnalysisCard`, que serve o `WorkoutDetailDrawer` e os cards da
Home) — Open Question (d) confirmada pelo founder em 2026-11-05. Onde o componente já mostrava a
fonte, o rótulo genérico do Garmin dá lugar ao modelo (`rotuloGarmin`), sem repetir "Garmin" ao
lado. Não usa o logo (evita as regras do tag logo).
Alternativa rejeitada: `fonteDados.label` genérico — a licença pede o modelo do dispositivo.

Texto: o `deviceName` vem inconsistente na Activity API — "Garmin Fenix 8" no exemplo de
`activityFiles` (§6.4), "Forerunner 910XT" no de `activities` (§4.1) e "unknown" em atividade
manual (§6.2). Regra: `deviceName` vazio, nulo ou `unknown` (case-insensitive) → "Garmin"; começa
com "Garmin" (case-insensitive) → exibe como vem; senão → "Garmin " + `deviceName`. Evita "Garmin
Garmin Fenix 8". O backend guarda o valor cru; a normalização é só de exibição.

### D7: Melhores esforços
Backend: `MelhorEsforcoServiceImpl` devolve 409 "indisponível para o canal Garmin" quando a
conexão de canal não é intervals.icu, em vez de tentar `pace-curves` — é aqui que a chamada ao
intervals.icu é cortada. Front do atleta: quem busca é `AthleteProgressPage`, não o
`EffortsBlock`; o hook de esforços trata o 409 como estado "indisponível" e o bloco renderiza o
aviso. Front do treinador: os esforços vêm no perfil agregado, e
`CoachAthleteProfileServiceImpl.buscarLista` engole a falha (lista vazia + `avisos`, resposta 200)
— então o `MelhoresEsforcosPanel` decide pelo `conexaoCanal.plataforma == GARMIN` do próprio
perfil, que já está no DTO.

### D8: Flag `garminHabilitado` removida
Último passo da change; a conexão Garmin passa a ser oferecida a todo atleta com marca GARMIN.
Sítios: backend `GarminProperties.habilitado` + `application.yml` (`GARMIN_HABILITADO`) + a
checagem em `GarminOAuthServiceImpl`; front `src/config/env.ts`, `public/env-config.js`,
`docker/docker-entrypoint.sh`, `AthleteProfilePage`, `OnboardingRelogioStep`,
`watchCompatibility.ts` e os testes que os cobrem (`env`, `ConnectionCardGarmin`, `CoachWatchLine`,
`OnboardingRelogioStep`, `AthleteProfilePage`, `watchCompatibility`).
`GarminCanalIndisponivelException` continua para o caso "sem client ID/secret"; só o javadoc perde
a menção à flag. Env var `GARMIN_HABILITADO`/`VITE_GARMIN_HABILITADO` que sobrar no Railway é
ignorada; apagá-las é passo manual pós-deploy.

## Risks / Trade-offs

- [Falha entre download e persistência] → o link já foi consumido (410 no retry); o ping vai a
  `ERRO` com motivo e o treinador vê "treino não chegou" via `watch-connection-guide`; o atleta
  pode subir o FIT à mão (mesmo dedup). Aceito: janela de risco de milissegundos.
- [Upload manual e ping no mesmo instante] → corrida genuína no `TreinoDedupHelper` (risco
  residual já documentado nele): a TX do scheduler faz rollback, o retry dá 410 e o ping vai a
  `ERRO` com o treino existindo pelo upload. Nada se perde; só a linha de auditoria fica errada.
  Aceito.
- [FIT de relógio antigo sem `serialNumber`] → `externalId` usa `0` como serial (comportamento
  atual do persister); colisão só se dois arquivos do mesmo atleta tiverem o mesmo `startTime`.
- [Cota de 50 downloads/min] → lote de 20/min por instância, uma instância. Ver D3.
- [`deviceName` ausente] → "Garmin" (permitido pelas brand guidelines).
- [Análise de IA sobre treino Garmin] → `IngestaoTreinoRealizadoService.registrar` publica
  `TreinoRegistradoEvent`, e o `WorkoutAnalysisListener` envia o treino ao LLM. Pela 15.11, a
  saída também é dado Garmin: não pode alimentar treino de modelo e a análise exibida precisa da
  atribuição. Ver Open Questions.
- [Atribuição esquecida num ponto novo da UI] → teste de componente cobre os cinco pontos; a
  licença dá 14 dias para corrigir.

## Migration Plan

1. Migration `tb_garmin_ping` + deploy; o webhook já recebe `activityFiles` e começa a enfileirar.
2. Habilitar `activityFiles` no Developer Portal (endpoint configuration) para o ambiente de
   testes; validar CA1–CA7 com relógio real.
3. Produção: habilitar o summary type após a troca do webhook; remover `garminHabilitado`.
4. Rollback: desabilitar o summary type no portal ("On Hold" segura até 7 dias sem perder dado);
   reverter o deploy.

## Open Questions

- Se o Garmin mandar `activityFiles` também para atividade editada depois (mesmo `activityId`,
  `summaryId` novo), o dedup do persister já evita duplicar; decidir se atualiza o treino
  existente só quando aparecer um caso real. Não muda spec nem tasks.
- **Bloqueia o go-live (task 4.4) — aviso prévio 6.6.** A licença exige avisar o Garmin
  (`connect-support@developer.garmin.com`, com mockups e descrição da conformidade) **30 dias antes**
  de lançar UI nova que exibe dado Garmin. Esta change cria cinco pontos de exibição.
  Falta confirmar se o aviso já foi enviado (inclusive para `garmin-connection`) e a data; o
  `activityFiles` em produção não deve ser habilitado antes do prazo.
- **Bloqueia o go-live (task 4.4) — IA sobre dado Garmin (15.10/15.11).** Confirmar com o founder:
  (a) o texto de IA enviado no cadastro do app está guardado como evidência (pendência herdada de
  `garmin-connection`); (b) o provedor do LLM não usa os dados para treino (termos da API);
  (c) a declaração de transparência de IA está na política de privacidade; (d) a análise
  pós-treino exibida leva a atribuição "Garmin [modelo]" — **confirmado em 2026-11-05: sim**,
  entrou na task 4.2.
