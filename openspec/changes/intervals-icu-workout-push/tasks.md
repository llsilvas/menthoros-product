# Tasks: intervals-icu-workout-push

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

- [ ] 1.1 `FonteDados.INTERVALS_ICU` + testes de round-trip do enum. Validação: `./mvnw clean test`.
- [ ] 1.2 `IntervalsIcuWebClientConfig` (bean dedicado, `responseTimeout` 5s/10s) +
      `IntervalsIcuProperties` (`app.intervals-icu.base-url`). Teste de config.
- [ ] 1.3 `IntervalsIcuClient` (interface + impl): `validarApiKey(key)` → `GET /api/v1/athlete/0`
      (Basic `API_KEY:<key>`), criar/atualizar/deletar/listar eventos (mecanismo de idempotência
      do D3), mapeamento de erros do D4. Testes com WireMock **usando as fixtures capturadas na
      task 0.1** (200/401/404-no-PUT/422/429/5xx/timeout) — mocks nunca inventam contrato;
      teste garante que a key não aparece em log capturado nem em stacktrace de exceção (CA5).
- [ ] 1.4 `IntervalsIcuConnectionService`: conectar (valida antes de persistir, grava
      `externalAthleteId`), status, desconectar (soft, padrão Strava). Testes unitários incluindo
      key inválida → nada persistido (CA1).
- [ ] 1.5 `IntervalsIcuConnectionController` padrão `/me` (POST/GET/DELETE
      `/api/v1/integracoes/me/intervals-icu`), `@PreAuthorize` ATLETA/ADMIN,
      `resolverAtletaIdAtual`. Testes de controller: status nunca contém a key; ATLETA de outro
      tenant/atleta não acessa (CA6). Validação: `./mvnw clean test`.

## 2. Backend — conversor workout_doc (D2)

- [ ] 2.1 `IntervalsIcuTargetParser` (classe pura): pace canônico/tolerante → `secs/km`
      (faixa/valor), FC `bpm` absoluta, `%hr`, `zonaAlvo` → `hr_zone`; não parseável → vazio.
      Teste unitário por formato da tabela D2 (parametrizado), incluindo nunca-lança.
- [ ] 2.2 `IntervalsIcuWorkoutConverter` (classe pura): mapeamento de etapas (duração ×60,
      distância m, ordem, text), des-expansão por `blocoId` com verificação de janelas idênticas
      → `reps` N (teste 4×→4×, nunca N²), fallback expandido para bloco inconsistente, treino
      sem etapas → step único (conversão `Duration` própria), precedência pace > FC conforme
      task 0.2. Validação: `./mvnw clean test`.

- [ ] 2.3 Extrair `StructuredWorkout` (record) + `WorkoutChannel` (interface
      `push(StructuredWorkout) -> PushResult`) + refatorar `IntervalsIcuWorkoutConverter`
      para retornar `StructuredWorkout` em vez de JSON + criar `IntervalsIcuAdapter`
      implementando `WorkoutChannel` com a lógica de geração do `workout_doc` que
      antes estava no conversor. Zero mudança de comportamento — só extração do seam.
      Testes do conversor passam a asserir `StructuredWorkout`; testes do adapter cobrem
      os mesmos cenários de serialização JSON que o conversor cobria antes (CA3, CA4).
      Validação: `./mvnw clean test`.

- [ ] 2.4 Adicionar campo opcional `namePrefix` (String, default null) em
      `StructuredWorkout`; `IntervalsIcuAdapter` pré-concatena ao `name` do
      evento quando presente. Listener define com base em `TrainingPhase` (quando
      disponível). Teste unitário: com prefixo → nome prefixado; sem prefixo → nome
      original. Sem baseline = comportamento inalterado (prefixo sempre null). Validação:
      `./mvnw clean test`.

## 3. Backend — push na aprovação + retry (D3)

- [ ] 3.0 `IntervalsIcuPushAsyncConfig` (config de pool dedicado): bean
      `intervalsIcuPushExecutor` (core=2, max=4, queue=100, prefixo
      `INTERVALS-ICU-PUSH-`), template idêntico ao `WorkoutAnalysisAsyncConfig`.
      Isola o push do pool de análise de treino (LLM, até 30s). Timeout do `@Async`
      coberto pelo `responseTimeout` 10s do WebClient (D4) — verificar com teste de
      integração que simula 10s de latência e confirma que a thread libera. Validação:
      `./mvnw clean test`.

- [ ] 3.1 `PlanoAprovadoEvent` (record em `events/`, javadoc com a convenção AFTER_COMMIT) +
      publicação em `PlanoReviewServiceImpl.aprovarPlano`. Teste: evento publicado na aprovação,
      não publicado em transição inválida.
- [ ] 3.2 `IntervalsIcuPushListener` (`@TransactionalEventListener(AFTER_COMMIT)` + `@Async`):
      fluxo do D3 por treino exportável (regra operacional do D2; atleta não conectado encerra
      sem erro), claim atômico via transição condicional + `@Version`
      (`OptimisticLockingFailure` → desistir silencioso), idempotência via `externalId`
      armazenado + guarda por listagem de data, reconciliação de órfãos `menthoros-*` da semana.
      Testes: aprovação → N eventos criados; re-aprovação → PUT sem duplicar (CA2); treino
      removido/recriado → órfão deletado; re-aprovações concorrentes → um worker só por treino;
      erro por treino não aborta os demais; teste negativo cross-tenant explícito (CA6).
- [ ] 3.3 Scheduler de retry (padrão `DailyActivitySyncScheduler`): varre APENAS
      `AGUARDANDO_RETRY`/`ERRO_TEMPORARIO`/`ERRO_LIMITE_RATE` (nunca `SINCRONIZANDO` —
      precedência do D3) com `podeRetentarSincronizacao()` e `atingiuLimiteTentativas()`;
      esgotou → `ERRO_PERMANENTE`; log estruturado sem key. Testes de seleção, precedência e
      estado final (CA5). Validação: `./mvnw clean test`.

## 4. Backend — status para o coach (D5, contrato)

- [ ] 4.1 Expor `statusSincronizacao` + `atletaConectadoIntervalsIcu` (derivado) no DTO de resumo
      do plano usado por `CurrentWeekPlan` (via endpoint existente do perfil coach). Teste de
      serialização e de N+1 (fetch junto do plano). Validação: `./mvnw clean test`.

## 5. Frontend — conexão do atleta (D5)

- [ ] 5.1 Adapter + `useIntervalsIcuConnection` (status/conectar/desconectar) sobre os endpoints
      `/me`. Sem lógica em componente.
- [ ] 5.2 Card "Conexões — intervals.icu" na `AthleteProfilePage` (substitui o placeholder):
      input da key + instruções com link, estados conectado/desconectado/erro (mensagem curada
      do backend visível — CA7), Desconectar com confirmação. Validação:
      `npm run lint && npm run build`.

## 6. Frontend — chip de status no plano do coach (D5)

- [ ] 6.1 Chip de status por treino no `TreinoCard` (`CurrentWeekPlan`): Enviado/Pendente/Erro
      (tooltip com mensagem)/Atleta não conectado; renderiza só em plano aprovado; tipos do DTO
      atualizados. Validação: `npm run lint && npm run build`.

## 7. Validação ponta a ponta e DoD

- [ ] 7.1 Walking skeleton real: conectar a key do founder via UI → aprovar um plano de teste →
      treinos aparecem no intervals.icu e no relógio; re-aprovar após editar → evento atualizado
      sem duplicar. Registrar evidências.
- [ ] 7.2 QA gate (`/qa`): code-reviewer + security-reviewer (foco: não-exposição da key,
      tenant isolation nos fluxos assíncronos) + test-master.
- [ ] 7.3 `./mvnw clean test` e `npm run lint && npm run build` verdes nos dois repos (CA8);
      atualizar este `tasks.md`; PRs `feature/intervals-icu-workout-push` → develop.
