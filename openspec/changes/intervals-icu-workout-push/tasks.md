# Tasks: intervals-icu-workout-push

> **Status da implementação (2026-07-15):** seções 1-6 e 8 IMPLEMENTADAS nas branches
> `feature/intervals-icu-workout-push` (backend fae8d49..5a5e8a0, 18 commits, suíte 1559;
> front 0d7651d..a9cb2aa, 5 commits, suíte 552), via plano SDD com review por task + review
> final de branch cross-model. O review final pegou e corrigiu 1 Critical de costura (set de
> reconciliação de órfãos usava o id numérico do evento — teria deletado os eventos recém-
> criados a cada aprovação). Pendências: 0.2/0.3 (gates manuais — pace+FC no relógio; formatos
> reais no banco de dev), 7.1 (walking skeleton com a conta do founder), 7.2/7.3 (QA formal +
> PRs). **Follow-ups registrados para change futura:** TX única no batch do listener/scheduler
> (fix estrutural = REQUIRES_NEW por treino no Processor; auto-cura via guarda de listagem já
> validada); retry scheduler não atualiza ultimaSincronizacao da conexão; dependência de teste
> nova autorizada: org.wiremock:wiremock-standalone 3.10.0 (escopo test, exigida pela task 1.3);
> TipoTreino.DESCANSO adicionado ao enum (valor aditivo que a regra de exportabilidade assumia).
>
> **Achados do walking skeleton (2026-07-15):** (a) deleção de plano deixava eventos órfãos —
> CORRIGIDO (Task extra: `PlanoDeletadoEvent` + listener de limpeza best-effort, commit 2c3b3f4);
> (b) **debounce do uploader Garmin do intervals.icu**: push em rajada de N eventos pode deixar
> os últimos fora do upload ao Garmin (2º evento criado ~600ms após o 1º não re-disparou o
> upload; nudge via PUT no-op re-disparou e entregou) — mitigação candidata: re-PUT no último
> evento do lote; DECISÃO PENDENTE do founder (fix nesta change vs follow-up).

> Trilha Full. Sequência de risco decrescente (design D6): gate de canal → conexão → conversor →
> push → front → superfícies de status. Backend valida com `./mvnw clean test`; frontend com
> `npm run lint && npm run build`.

## 0. Gate residual de canal (CA0 — antes de qualquer código de produção)

- [x] 0.1 Push manual `workout_doc`-only (sem `description` de steps) via curl com a conta do
      founder: treino com aquecimento (pace range), bloco `reps: 4` (pace + FC bpm absoluta) e
      soltura (`hr_zone`). Verificar no Garmin Connect e no relógio: steps, repetições (4×, não
      16×), alvos de pace e FC corretos. Registrar resultado aqui (prints/observações).
      **✅ GATE FECHADO (2026-07-14):** evento `menthoros-gate-ca0` (id 122887509, treino de
      15/07) enviado doc-only e **verificado no relógio pelo founder — "apareceu certinho"**:
      steps, 4 repetições e alvos (pace 6:00-6:30 e 4:30-4:45/km, FC 140-150 bpm, Z1)
      corretos. Canal aprovado; design D2 vigente (doc-only) confirmado. Blocos 1-6 liberados.
      **Capturar os transcripts reais** (POST, PUT, PUT 404 → recria, GET listagem, 401, 422)
      como fixtures para o WireMock da task 1.3.
      **Se falhar:** aplicar a matriz do design D0 (decisão do founder: fallback texto com
      degradação bpm→%hr, ou parar) e reescrever o D2 antes de seguir — sem caminho duplo em
      runtime.
      *Nota (2026-07-14):* upsert já sondado com a conta do founder — `PUT /events/{id}`
      funciona; POST repetido com mesmo `external_id` DUPLICA (API não deduplica); não há
      filtro server-side por external_id (`ext` é extensão de formato); `GET /athlete/0`
      retorna o atleta da key; key inválida → 401. **Descoberta crítica na execução:**
      `description` no nível do evento faz o servidor SOBRESCREVER o `workout_doc`
      (`steps: []`) — descrição humana vai em `workout_doc.description` (regra nº 2 do D2).
      *Push doc-only executado (2026-07-14 17:54):* evento `menthoros-gate-ca0` (id 122887509)
      criado com 3 steps + `reps: 4` (pace secs/km + FC bpm) ecoados intactos;
      `icu_garmin_last_upload` = timestamp da criação. **Pendente: verificação visual no
      relógio pelo founder (treino de 2026-07-15, "Menthoros Gate CA0").** Transcripts em
      scratchpad da sessão (`ca0-request-v2.json`/`ca0-response-v2.json`) — regenerar como
      fixtures na task 1.3.
- [ ] 0.2 Confirmar comportamento de step com pace E FC simultâneos (Open Question): o que o
      Garmin exibe? Fixar a regra do conversor (pace vence / ambos) no design D2.
- [ ] 0.3 Conferir no banco de dev os formatos reais de `ritmoAlvo`/`fcAlvoEtapa`/`zonaAlvo`
      (query por distinct) e ajustar a tabela de conversão do D2 se houver formato fora do
      previsto.

## 1. Backend — conexão intervals.icu (D1)

- [x] 1.1 `FonteDados.INTERVALS_ICU` + testes de round-trip do enum. Validação: `./mvnw clean test`.
- [x] 1.2 `IntervalsIcuWebClientConfig` (bean dedicado, `responseTimeout` 5s/10s) +
      `IntervalsIcuProperties` (`app.intervals-icu.base-url`). Teste de config.
- [x] 1.3 `IntervalsIcuClient` (interface + impl): `validarApiKey(key)` → `GET /api/v1/athlete/0`
      (Basic `API_KEY:<key>`), criar/atualizar/deletar/listar eventos (mecanismo de idempotência
      do D3), mapeamento de erros do D4. Testes com WireMock **usando as fixtures capturadas na
      task 0.1** (200/401/404-no-PUT/422/429/5xx/timeout) — mocks nunca inventam contrato;
      teste garante que a key não aparece em log capturado nem em stacktrace de exceção (CA5).
- [x] 1.4 `IntervalsIcuConnectionService`: conectar (valida antes de persistir, grava
      `externalAthleteId`), status, desconectar (soft, padrão Strava). Testes unitários incluindo
      key inválida → nada persistido (CA1).
- [x] 1.5 `IntervalsIcuConnectionController` padrão `/me` (POST/GET/DELETE
      `/api/v1/integracoes/me/intervals-icu`), `@PreAuthorize` ATLETA/ADMIN,
      `resolverAtletaIdAtual`. Testes de controller: status nunca contém a key; ATLETA de outro
      tenant/atleta não acessa (CA6). Validação: `./mvnw clean test`.

## 2. Backend — conversor workout_doc (D2)

- [x] 2.1 `IntervalsIcuTargetParser` (classe pura): pace canônico/tolerante → `secs/km`
      (faixa/valor), FC `bpm` absoluta, `%hr`, `zonaAlvo` → `hr_zone`; não parseável → vazio.
      Teste unitário por formato da tabela D2 (parametrizado), incluindo nunca-lança.
- [x] 2.2 `IntervalsIcuWorkoutConverter` (classe pura): mapeamento de etapas (duração ×60,
      distância m, ordem, text), des-expansão por `blocoId` com verificação de janelas idênticas
      → `reps` N (teste 4×→4×, nunca N²), fallback expandido para bloco inconsistente, treino
      sem etapas → step único (conversão `Duration` própria), precedência pace > FC conforme
      task 0.2. Validação: `./mvnw clean test`.

- [x] 2.3 Extrair `StructuredWorkout` (record) + `WorkoutChannel` (interface
      `push(StructuredWorkout) -> PushResult`) + refatorar `IntervalsIcuWorkoutConverter`
      para retornar `StructuredWorkout` em vez de JSON + criar `IntervalsIcuAdapter`
      implementando `WorkoutChannel` com a lógica de geração do `workout_doc` que
      antes estava no conversor. Zero mudança de comportamento — só extração do seam.
      Testes do conversor passam a asserir `StructuredWorkout`; testes do adapter cobrem
      os mesmos cenários de serialização JSON que o conversor cobria antes (CA3, CA4).
      Validação: `./mvnw clean test`.

- [x] 2.4 Adicionar campo opcional `namePrefix` (String, default null) em
      `StructuredWorkout`; `IntervalsIcuAdapter` pré-concatena ao `name` do
      evento quando presente. Listener define com base em `TrainingPhase` (quando
      disponível). Teste unitário: com prefixo → nome prefixado; sem prefixo → nome
      original. Sem baseline = comportamento inalterado (prefixo sempre null). Validação:
      `./mvnw clean test`.

## 3. Backend — push na aprovação + retry (D3)

- [x] 3.0 `IntervalsIcuPushAsyncConfig` (config de pool dedicado): bean
      `intervalsIcuPushExecutor` (core=2, max=4, queue=100, prefixo
      `INTERVALS-ICU-PUSH-`), template idêntico ao `WorkoutAnalysisAsyncConfig`.
      Isola o push do pool de análise de treino (LLM, até 30s). Timeout do `@Async`
      coberto pelo `responseTimeout` 10s do WebClient (D4) — verificar com teste de
      integração que simula 10s de latência e confirma que a thread libera. Validação:
      `./mvnw clean test`.

- [x] 3.1 `PlanoAprovadoEvent` (record em `events/`, javadoc com a convenção AFTER_COMMIT) +
      publicação em `PlanoReviewServiceImpl.aprovarPlano`. Teste: evento publicado na aprovação,
      não publicado em transição inválida.
- [x] 3.2 `IntervalsIcuPushListener` (`@TransactionalEventListener(AFTER_COMMIT)` + `@Async`):
      fluxo do D3 por treino exportável (regra operacional do D2; atleta não conectado encerra
      sem erro), claim atômico via transição condicional + `@Version`
      (`OptimisticLockingFailure` → desistir silencioso), idempotência via `externalId`
      armazenado + guarda por listagem de data, reconciliação de órfãos `menthoros-*` da semana.
      Testes: aprovação → N eventos criados; re-aprovação → PUT sem duplicar (CA2); treino
      removido/recriado → órfão deletado; re-aprovações concorrentes → um worker só por treino;
      erro por treino não aborta os demais; teste negativo cross-tenant explícito (CA6).
- [x] 3.3 Scheduler de retry (padrão `DailyActivitySyncScheduler`): varre APENAS
      `AGUARDANDO_RETRY`/`ERRO_TEMPORARIO`/`ERRO_LIMITE_RATE` (nunca `SINCRONIZANDO` —
      precedência do D3) com `podeRetentarSincronizacao()` e `atingiuLimiteTentativas()`;
      esgotou → `ERRO_PERMANENTE`; log estruturado sem key. Testes de seleção, precedência e
      estado final (CA5). Validação: `./mvnw clean test`.

## 4. Backend — status para o coach (D5, contrato)

- [x] 4.1 Expor `statusSincronizacao` + `atletaConectadoIntervalsIcu` (derivado) no DTO de resumo
      do plano usado por `CurrentWeekPlan` (via endpoint existente do perfil coach). Teste de
      serialização e de N+1 (fetch junto do plano). Validação: `./mvnw clean test`.

## 5. Frontend — conexão do atleta (D5)

- [x] 5.1 Adapter + `useIntervalsIcuConnection` (status/conectar/desconectar) sobre os endpoints
      `/me`. Sem lógica em componente.
- [x] 5.2 Card "Conexões — intervals.icu" na `AthleteProfilePage` (substitui o placeholder):
      input da key + instruções com link, estados conectado/desconectado/erro (mensagem curada
      do backend visível — CA7), Desconectar com confirmação. Validação:
      `npm run lint && npm run build`.

## 6. Frontend — chip de status no plano do coach (D5)

- [x] 6.1 Chip de status por treino no `TreinoCard` (`CurrentWeekPlan`): Enviado/Pendente/Erro
      (tooltip com mensagem)/Atleta não conectado; renderiza só em plano aprovado; tipos do DTO
      atualizados. Validação: `npm run lint && npm run build`.


## 7. Validação ponta a ponta e DoD

- [ ] 7.1 Walking skeleton real: conectar a key do founder via UI → aprovar um plano de teste →
      treinos aparecem no intervals.icu e no relógio; re-aprovar após editar → evento atualizado
      sem duplicar. Registrar evidências.
- [x] 7.2 QA gate (`/qa`) executado 2026-07-15: 4 reviewers Claude + Codex cross-model + suítes.
      Zero Critical remanescente; security aprovado (key nunca exposta, tenant isolation ok).
      Fixes aplicados no gate: estado stale de treino que vira não-exportável (achado Codex —
      reset de sincronização + limpeza de externalId), regra de nome com distância formalizada
      ("12 Km - LONGO"; fallback "TIPO dd/MM"), limpezas de clean-code (acumulador, prefixo
      external_id centralizado, validação de tenant compartilhada), rel noreferrer no front.
      **Convergência Claude+Codex** elevou a prioridade do follow-up de TX única do batch
      (fix estrutural: REQUIRES_NEW por treino no Processor). Suítes: backend 1571 / front 559.
- [ ] 7.3 `./mvnw clean test` e `npm run lint && npm run build` verdes nos dois repos (CA8);
      atualizar este `tasks.md`; PRs `feature/intervals-icu-workout-push` → develop.
## 8. Gaps de teste e cenários de borda (CPO + arquitetura)

Cenários que as seções 0–7 já cobrem parcialmente, mas precisam de teste
explícito para não escaparem no QA gate.

### P1 — Segurança de produção (deve ter)

- [x] 8.1 **Listener usa `findById` fresco, não entidade managed da transação pai.**
      O `@Transactional(REQUIRES_NEW)` do listener carrega `TreinoPlanejado` do banco
      (via `repository.findById`), nunca recebe a instância gerenciada da transação
      de aprovação. Se o listener reusar a entidade managed, o `@Version` não protege
      contra concorrência — dois workers veem a mesma versão. Teste: mock do repositório
      retorna versão diferente da entidade passada; listener falha com
      `OptimisticLockingFailureException`. Validação: `./mvnw clean test`.

- [x] 8.2 **Scheduler NUNCA toca treino `PENDENTE` de aprovação recém-publicada.**
      A task 3.3 cobre “nunca `SINCRONIZANDO`” mas não cobre `PENDENTE`. Treino
      recém-aprovado fica `PENDENTE` até o listener iniciar (janela de milissegundos).
      Se o scheduler rodar nessa janela e tocar o treino, duplica o processamento.
      Teste: scheduler query filtra `PENDENTE`; assert que nenhum treino selecionado
      está em `PENDENTE`. Validação: `./mvnw clean test`.

- [x] 8.3 **WireMock com 10s de latência confirma que thread libera.**
      A task 3.0 menciona “verificar com teste de integração” mas não detalha.
      WireMock com `withFixedDelay(10000)` no endpoint de eventos; listener dispara
      push; assert que a thread do `intervalsIcuPushExecutor` libera em ≤ 11s e o
      treino fica `ERRO_TEMPORARIO`. Teste próprio (não embedado nos testes do
      client). Validação: `./mvnw clean test`.

- [x] 8.4 **Log em DEBUG do WebClient não expõe header Authorization.**
      A task 1.3 cobre “key não aparece em log capturado nem stacktrace”.
      Estender: configurar `logging.level...IntervalsIcuClient=DEBUG` no teste,
      capturar logs, assert que o header `Authorization: Basic ...` não aparece.
      WebClient pode logar headers em DEBUG automaticamente. Validação:
      `./mvnw clean test`.

### P2 — Cenários de borda (bom ter)

- [x] 8.5 **PUT 404 (evento apagado pelo atleta) → recria via POST.**
      A task 3.2 cobre “re-aprovação → PUT sem duplicar” mas não cobre o
      cenário de PUT 404. WireMock retorna 404 no PUT do externalId armazenado;
      listener faz POST novo; assert que externalId foi atualizado com o novo id
      retornado. Validação: `./mvnw clean test`.

- [x] 8.6 **Normalização de dados degenerados no conversor.**
      A task 2.2 cobre “treino sem etapas” mas não lista explicitamente:
      duracaoMin=0 ou negativo → step aberto; etapa com todos os campos nulos
      → ignorada; descricaoEtapa vazia → text omitido; distanciaKm=0 → não
      emitir distance. Teste parametrizado com todos os casos.
      Validação: `./mvnw clean test`.

- [x] 8.7 **Aprovação retorna 200 mesmo com push falhando.**
      Estruturalmente garantido por `AFTER_COMMIT + @Async`, mas sem teste
      explícito. WireMock retorna 500 no POST de eventos; aprovação retorna
      200; treino fica `ERRO_TEMPORARIO`. Se alguém mover o listener para
      síncrono, esse teste quebra — é o guard rail. Validação:
      `./mvnw clean test`.

- [x] 8.8 **Mapeamento de cada `StatusSincronizacao` → texto curado no chip.**
      A task 4.1 expõe `statusSincronizacao` no DTO mas não testa o mapeamento
      de cada estado para o texto do chip do coach (Enviado/Pendente/Erro/Não
      conectado). Teste parametrizado: cada status → texto e tooltip esperados.
      Validação: `./mvnw clean test` + `npm run test`.

