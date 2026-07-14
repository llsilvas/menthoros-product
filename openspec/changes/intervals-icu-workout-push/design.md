# Design: intervals-icu-workout-push

> Fundado nas sondagens reais contra a API do intervals.icu (2026-07-14, conta do founder) e na
> exploração do código. Herda de `export-planned-workout-fit` (arquivada): des-expansão N×,
> conversão best-effort de alvos, autorização `/me`. O que muda: o alvo do conversor é o
> `workout_doc` JSON do intervals.icu, não o protocolo FIT — sem offset +100 de FC, sem inversão
> pace→speed, sem encoder binário.

## D0 — Gate residual de canal (primeira task, antes de qualquer código de produção)

Já validado (2026-07-14): `POST /api/v1/athlete/{id}/events` com `description` em texto →
servidor parseia em `workout_doc` → push imediato ao Garmin Connect (`icu_garmin_last_upload` ==
timestamp da criação) → treino estruturado no relógio. Sondagens adicionais: POST com
`workout_doc` direto é aceito e ecoado integralmente, incluindo `pace secs/km` (faixa/valor),
`hr bpm` absoluto, `%hr`, `hr_zone` e blocos aninhados `reps`.

Falta UMA verificação: push **doc-only** (sem `description`) chegando ao relógio com alvos
corretos — em particular FC absoluta em bpm, que a sintaxe de texto não suporta. Executar com a
conta do founder, registrar no `tasks.md`. Saídas:

- **Doc-only chega estruturado** → design segue como está.
- **Doc-only não sincroniza (só texto)** → decisão do founder: reescrever o D2 para emitir
  `description` em sintaxe de texto validada (`Pace` sufixo, `% HR`, zonas), com FC absoluta
  degradada para `%hr` calculada da FC máx do atleta no Menthoros — degradação documentada.
- **Nada sincroniza via API** (contradiria o gate de ontem) → parar e reavaliar com o founder.

**Sem caminho duplo em runtime** (achado do pre-mortem cross-model): o fallback texto é uma
saída do GATE que substitui o D2 por decisão formal antes da implementação — o conversor de
produção implementa UM formato, nunca os dois. A proibição do caminho texto no D2 vale para o
design vigente (doc-only).

Subproduto obrigatório do gate: **capturar os transcripts reais** (request/response de POST,
PUT, PUT 404, GET de listagem, 401, 422) — eles viram as fixtures do WireMock da task 1.3, para
os mocks espelharem a API real e não uma API imaginária (achado do pre-mortem).

## D1 — Credencial e conexão (reuso de `IntegracaoExterna`)

- Novo valor `INTERVALS_ICU` no enum `FonteDados` (coluna STRING — sem migration).
- Mapeamento: `accessToken` = API key; `externalAthleteId` = id `i…` do intervals.icu;
  `refreshToken`/`tokenExpiraEm`/`scopes` = null (API key não expira); `ativo`, `lastSyncError`,
  `ultimaSincronizacao` com a semântica existente. Unique `(atleta_id, plataforma)` já garante
  uma credencial por atleta.
- **Validação na conexão:** `GET /api/v1/athlete/0` (id `0` = atleta autenticado — **validado
  empiricamente em 2026-07-14**: retorna o próprio atleta com a key; key inválida → 401
  `{"status":401,"error":"Unauthorized"}`). 200 → persiste com o id retornado; 401/403 → 422
  curado ("API key inválida — verifique em Settings → Developer no intervals.icu"), nada
  persistido.
- **Autenticação do client:** HTTP Basic `API_KEY:<key>` (padrão da API). A key nunca aparece em
  logs, respostas ou DTOs — o GET de status devolve apenas conectado/desde/último push/último
  erro.
- Endpoints em controller dedicado `IntervalsIcuConnectionController`, padrão `/me`
  (`resolverAtletaIdAtual`, sem resource-id na URL — anti-IDOR por construção):
  - `POST /api/v1/integracoes/me/intervals-icu` `{apiKey}` → 201 com o status (sem a key);
  - `GET /api/v1/integracoes/me/intervals-icu` → 200 status | 404 não conectado;
  - `DELETE /api/v1/integracoes/me/intervals-icu` → 204 (soft-disconnect, padrão Strava:
    `ativo=false`, tokens zerados).
- Coach NÃO gerencia a credencial (é pessoal do atleta), mas enxerga o efeito: status de sync
  por treino (D5). Diferença deliberada em relação ao Strava (onde o coach conecta).

## D2 — Conversor `TreinoPlanejado` → `workout_doc` (classe pura `IntervalsIcuWorkoutConverter`)

Payload do evento (`POST /api/v1/athlete/{externalAthleteId}/events`):

```json
{
  "category": "WORKOUT",
  "start_date_local": "<dataTreino>T00:00:00",
  "type": "Run",
  "name": "<TipoTreino> <dd/MM>",
  "external_id": "menthoros-<treinoPlanejadoId>",
  "workout_doc": {
    "description": "<descricao humana do treino>",
    "steps": [ ... ]
  }
}
```

**Regra absoluta nº 1: steps SEMPRE via `workout_doc`, nunca via texto na `description`.** A
sondagem provou que o parser de texto ignora bpm absoluto e pode **absorver o número na
duração** (`"2m 145 bpm"` → step de 265s) — falso-positivo silencioso.

**Regra absoluta nº 2 (descoberta no gate CA0, 2026-07-14): o campo `description` do EVENTO
NÃO pode ser enviado junto com `workout_doc`** — o servidor parseia a description e
**sobrescreve o doc estruturado** (payload com ambos retornou `steps: []`; o mesmo payload sem
`description` ecoou os 3 steps + reps intactos). A descrição humana vai em
`workout_doc.description`, nunca no nível do evento.

**Des-expansão de blocos (herdada, premissa confirmada no código):** o banco persiste blocos JÁ
EXPANDIDOS (`TreinoPlanejadoServiceImpl.expandirBlocoParaAdicao` grava N cópias com o mesmo
`blocoId` e `blocoRepeticoes=N`). Estratégia:

1. Agrupar etapas consecutivas por `blocoId`; com `blocoRepeticoes=N > 1`, dividir em N janelas e
   verificar que são idênticas (tipo/duração/distância/alvos por posição).
2. OK → emitir bloco `{"reps": N, "text": "<nome>", "steps": [<uma iteração>]}`.
3. Verificação falha (bloco editado pós-expansão, legado) → fallback seguro: steps individuais
   expandidos, sem `reps` — verboso, sempre correto. Nunca inferir repetição de dado
   inconsistente.

**Mapeamento de step:**

| EtapaTreino | step do workout_doc | Regra |
|---|---|---|
| `duracaoMin` (Integer, minutos) | `duration` (segundos) | ×60; em `EtapaTreino` é Integer — não confundir com `TreinoBase.duracaoMin` (`Duration`) |
| `distanciaKm` presente | `distance` (metros) | distância vence quando ambos presentes |
| nenhum | step aberto | conforme suporte do doc; senão duração simbólica + nota "encerre no lap" (confirmar no gate D0) |
| `descricaoEtapa` | `text` | primeira linha curta |
| `ritmoAlvo` `"5:30-5:45/km"` | `pace: {units: "secs/km", start: 330, end: 345}` | canônico do planner; sem inversão (start=mais rápido? conferir eco da API no gate: sondagem mostrou start=270/end=285 para 4:30-4:45 — start é o menor valor em segundos) |
| `ritmoAlvo` `"5:30"` (tolerante) | `pace: {units: "secs/km", value: 330}` | valor único aceito pela API |
| `fcAlvoEtapa` `"140-150 bpm"` | `hr: {units: "bpm", start: 140, end: 150}` | absoluto, sem offset (diferença do FIT) |
| `fcAlvoEtapa` `"70-80% FCmáx"` (tolerante) | `hr: {units: "%hr", start: 70, end: 80}` | |
| `zonaAlvo` do treino `"Z2"`/`"z2-z3"` | `hr: {units: "hr_zone", value: 2}` | só no step único (treino sem etapas); faixa → zona inferior |
| ritmo E FC na mesma etapa | pace no alvo; FC no `text` | um alvo primário por step no Garmin (Open Question — ajustar se o doc propagar ambos) |
| alvo não parseável | step sem alvo | string original no `text`; parser nunca lança, sem log de erro |

Treino sem etapas (CA4 da change anterior): step único com duração/distância do próprio treino
(`TreinoBase.duracaoMin` é `Duration` — conversão própria) e alvo da `zonaAlvo` se parseável.

**Regra operacional de "exportável"** (achado do pre-mortem — evita drift): um treino é
exportável se `tipoTreino != DESCANSO` E possui ao menos um conteúdo prescritivo (≥ 1 etapa com
duração ou distância positiva, OU duração/distância no próprio treino). Fora disso, não gera
evento. **Normalização de degenerados:** duração/distância ≤ 0 ou nula na etapa → step aberto
(sem `duration`/`distance`); etapa nula/vazia na coleção → ignorada; texto vazio → `text`
omitido. O conversor nunca lança por dado degenerado.

**Timezone:** `start_date_local` = `dataTreino` (LocalDate, sem hora) + `T00:00:00` — o campo é
*local do atleta* por contrato da API (mesma semântica do gate validado); nenhuma conversão de
zona no backend.

Parser de alvos: espelhar os patterns canônicos já parseados no backend (`parseFcRange` em
`IaServiceImpl`, validação de pace) — não criar dialeto divergente. Trim/normalização antes do
match; vazio é caminho normal.

## D2.5 — Modelo canônico e abstração de canal

O conversor do D2 é puro de domínio mas atualmente acoplado ao formato JSON do
intervals.icu. Extrair um contrato intermediário:

- **`StructuredWorkout`** (record canônico): `externalId` (String), `name` (String),
  `sport` (enum), `scheduledDate` (LocalDate), `steps` (List<WorkoutStep>).
  `WorkoutStep` contém text, duration, distance, pace, hr, reps — a representação
  universal de uma etapa prescritiva, sem conhecimento de formato de destino.
- **`WorkoutChannel`** (interface): `push(StructuredWorkout) -> PushResult`. Contrato
  único que todo canal de entrega implementa.
- **`IntervalsIcuAdapter` implementa `WorkoutChannel`**: recebe `StructuredWorkout`,
  gera o `workout_doc` JSON conforme D2 e faz o POST/PUT na API. É o único adapter
  concreto nesta change.
- **`IntervalsIcuWorkoutConverter` produz `StructuredWorkout`** em vez de
  `workout_doc` JSON diretamente. A lógica de des-expansão, parsing de alvos e
  normalização não muda — só o tipo de retorno.
- O listener (D3) injeta `WorkoutChannel` e chama `channel.push(workout)` — sem
  conhecer intervals.icu, HTTP, ou JSON.

Regra de ouro: zero adapters especulativos. `IntervalsIcuAdapter` é o único concreto.
`GarminTrainingApiAdapter`, `FitWorkoutExporter`, etc. só nascem quando o canal
existir. Mas a interface `WorkoutChannel` já está lá — o próximo canal pluga sem
tocar no conversor nem no listener, exatamente o que `exportadoPara` promete.

**Prefixo de calibração (campo opcional, zero acoplamento):**

`StructuredWorkout` expõe `namePrefix` (String, default null). O listener define
o prefixo com base no `TrainingPhase` do plano (campo que já existe ou será populado
por `deterministic-planner-engine`). Regra: se `phase == CALIBRATION` e score de
confiança < 45, `namePrefix = "[Calibração]"`. O adapter pré-concatena ao
`name` do evento. Sem baseline implantado, `namePrefix` é sempre null —
comportamento idêntico ao atual. O conversor não conhece calibração, onboarding ou
score — só aplica o prefixo se presente no record.

## D3 — Disparo, idempotência e retry

**Gatilho:** `PlanoReviewServiceImpl.aprovarPlano` publica `PlanoAprovadoEvent(planoId,
atletaId, tenantId)` (record em `events/`, 1 linha no service — único toque em código
existente). Consumo: `IntervalsIcuPushListener` com `@TransactionalEventListener(phase =
AFTER_COMMIT)` + `@Async` (convenção documentada em `SemanaEncerradaEvent`; referência
`WorkoutAnalysisListener`) — a resposta do coach não espera rede externa.

**Pool de executor dedicado (P1 — segurança de produção):**

O listener usa `@Async("intervalsIcuPushExecutor")` — pool dedicado (core=2, max=4,
queue=100), mesmo padrão de `WorkoutAnalysisAsyncConfig`. Push é rápido (~200ms HTTP)
mas não pode competir com chamadas LLM do pool `workoutAnalysisExecutor` (até 30s).
Timeout: o `responseTimeout` 5s/10s do WebClient (D4) cobre o `@Async` — a thread
nunca fica pendurada por mais de 10s. Configuração: classe `IntervalsIcuPushAsyncConfig`,
30 linhas, template idêntico ao `WorkoutAnalysisAsyncConfig`.

**Fluxo por treino exportável do plano:**

1. Atleta sem `IntegracaoExterna` ativa de `INTERVALS_ICU` → marca nada, encerra (estado
   informativo "atleta não conectado" é derivado, não erro).
2. `registrarTentativaSincronizacao()` + `SINCRONIZANDO`.
3. **Idempotência é responsabilidade NOSSA — comprovado empiricamente (2026-07-14) que a API
   NÃO deduplica por `external_id`** (dois POSTs com o mesmo `external_id` criaram dois eventos)
   **e não há consulta server-side por `external_id`** (o param `ext` do GET /events é extensão
   de formato, não filtro). Mecanismo:
   - `TreinoPlanejado.externalId` **preenchido** (id do evento gravado no primeiro push) →
     `PUT /events/{id}` (validado: atualiza nome e `workout_doc`); `404` no PUT (atleta apagou
     o evento) → `POST` novo e regrava o id.
   - `externalId` **vazio** → guarda defensiva contra duplicata de push anterior meio-completo
     (POST ok + save local falhou): `GET /events?oldest=<dataTreino>&newest=<dataTreino>` e
     match de `external_id` client-side (o campo vem na listagem); achou → adota o id e faz
     PUT; não achou → `POST`.
   O `external_id` `menthoros-<treinoId>` é gravado em todo evento para permitir esse match e
   auditoria.
4. Sucesso → `marcarComoSincronizado("INTERVALS_ICU")` (grava `exportadoPara`, `externalId` do
   evento, `sincronizadoEm`); falha → `marcarErroSincronizacao(status, msg)` com o mapeamento do
   D4. Tentativas esgotadas (`atingiuLimiteTentativas()`) → **`ERRO_PERMANENTE`** (estado final
   explícito — sem loop infinito; visível no chip do coach).

**Concorrência (achados do pre-mortem cross-model):**

- **Claim atômico por treino:** antes de chamar a rede, o worker faz a transição condicional
  para `SINCRONIZANDO` salvando o `TreinoPlanejado` (que tem `@Version`) — um
  `OptimisticLockingFailureException` significa que outro worker (re-aprovação concorrente ou
  scheduler) assumiu o treino: desistir silenciosamente, sem erro. Nenhum treino é processado
  por dois workers ao mesmo tempo.
- **Precedência listener × scheduler:** o scheduler NUNCA toca treino em `SINCRONIZANDO` (em
  voo) nem `PENDENTE` de aprovação recém-publicada — só os estados de retry
  (`AGUARDANDO_RETRY`, `ERRO_TEMPORARIO`, `ERRO_LIMITE_RATE`). O claim atômico acima resolve a
  corrida residual entre os dois.

**Reconciliação de órfãos na re-aprovação** (resolve dois achados: treino removido do plano e
treino recriado com UUID novo): ao processar uma aprovação, além do push dos treinos atuais, o
worker lista os eventos da janela da semana do plano
(`GET /events?oldest=<semanaInicio>&newest=<semanaFim>`) e **deleta os eventos com
`external_id` prefixo `menthoros-` que não correspondem a nenhum treino atual do plano**.
Eventos criados pelo próprio atleta (sem o prefixo) nunca são tocados. Com isso o calendário
espelha sempre o plano aprovado vigente — nada de prescrição fantasma no relógio.

**Retry:** scheduler dedicado (padrão `DailyActivitySyncSchedulerImpl`: erro por-treino não
aborta o batch, validação de tenant, log estruturado) varre `AGUARDANDO_RETRY`/`ERRO_TEMPORARIO`
respeitando `podeRetentarSincronizacao()` (janela 5min) e `atingiuLimiteTentativas()` (5) — tudo
helper existente do `TreinoPlanejado`. Sem tabela nova: auditoria = campos de sync +
`metadadosSincronizacao` (id do evento, timestamps).

**Multi-tenancy:** listener e scheduler operam fora de request — queries explicitamente
tenant-scoped com o `tenantId` do evento/registro (padrão do scheduler Strava, incluindo o log
de segurança em mismatch).

## D4 — Client HTTP e mapeamento de erros

- Bean dedicado `intervalsIcuWebClient` (à la `StravaWebClientConfig`) com **`responseTimeout`
  obrigatório** (5s connect / 10s response — referência Keycloak; o client Strava sem timeout é
  o anti-exemplo documentado). Sem Resilience4j (decisão pertence à change
  `add-external-call-resilience`); retry desta change é o de domínio (D3), não de transporte.
- Basic auth por chamada com a key do atleta (não é bean-level: a credencial varia por atleta).
- Mapeamento de resposta → `StatusSincronizacao`:

| Resposta | Status | Ação |
|---|---|---|
| 2xx | `SINCRONIZADO` | grava external event id |
| 401/403 | `ERRO_AUTENTICACAO` | marca `lastSyncError` na conexão — atleta vê "key inválida/revogada" no status; sem retry automático |
| 404 no PUT de upsert | recria via POST | evento apagado pelo atleta no intervals.icu |
| 422 | `ERRO_VALIDACAO` | payload rejeitado — sem retry; erro visível ao coach (chip) |
| 429 | `ERRO_LIMITE_RATE` | retry via scheduler |
| 5xx / timeout / IO | `ERRO_TEMPORARIO` | retry via scheduler |

- A key nunca entra em log (nem em `DEBUG` de request/response do WebClient — sem
  `ExchangeFilterFunction` de logging de headers nesse client).

## D5 — Frontend

- **Atleta — `AthleteProfilePage` (hoje placeholder):** card "Conexões — intervals.icu": input
  da API key + instruções curtas ("intervals.icu → Settings → Developer → API Key") com link,
  botão Conectar; conectado → mostra desde quando, último push, botão Desconectar; erro de
  autenticação da conexão aparece aqui com ação ("gerar nova key"). Adapter + hook
  (`useIntervalsIcuConnection`), componente só apresentação — convenção do repo. Shell novo
  `features/athlete/` (não `pages/` legado).
- **Coach — `TreinoCard` em `CurrentWeekPlan`:** chip compacto no header do card (junto ao ícone
  de editar): `Enviado ao relógio` (success) / `Envio pendente` (info) / `Erro no envio`
  (warning, tooltip com a mensagem) / `Atleta não conectado` (neutro, tooltip explicativo).
  Requer `statusSincronizacao` (e derivado "conectado") no DTO de resumo do plano — mudança de
  contrato backend correspondente. Chip só renderiza em plano aprovado (antes da aprovação não
  há push).
- Erros nunca engolem a mensagem curada do backend (aprendizado de QA registrado).

## D6 — Validação real como gate, não como fé

Ordem de implementação de risco decrescente: gate D0 (doc-only no relógio, conta do founder) →
conexão (D1, testável com key real) → conversor puro com testes unitários por formato + N×→N×
→ push listener + upsert → front. O walking skeleton é "conectar + aprovar plano → treino no
relógio"; ZIP de conveniências (chip, retry scheduler) vem depois do esqueleto de pé.

## Pre-mortem

> Adversarial cross-model (Codex, 2026-07-14) executado sobre estes artefatos. Achados críticos
> incorporados acima: contradição D0×D2 resolvida (fallback é decisão de gate, não caminho
> duplo em runtime); upsert comprovado empiricamente ANTES da implementação (a API NÃO
> deduplica por `external_id` — mecanismo client-side no D3); fixtures do WireMock devem nascer
> dos transcripts reais do gate; claim atômico via `@Version` + precedência listener×scheduler;
> reconciliação de órfãos na re-aprovação (cobre treino removido E recriado com UUID novo);
> `GET /athlete/0` validado com key real e inválida; regra operacional de "exportável" +
> normalização de degenerados; `ERRO_PERMANENTE` como estado final de retries esgotados.
> Riscos aceitos e documentados no proposal: credencial em TEXT puro (débito transversal,
> paridade com Strava), zonas do intervals.icu ≠ zonas do Menthoros (alvos absolutos são os
> canônicos).

- *"Doc-only não sincroniza ao Garmin"* → gate D0 primeiro; fallback texto documentado com
  degradação conhecida (bpm → %hr).
- *"Parser de texto absorve bpm na duração"* → proibido caminho texto no conversor (regra
  absoluta do D2); só doc estruturado.
- *"Re-aprovação duplica eventos"* → upsert por `external_id` determinístico; CA2 testa.
- *"N² no relógio"* → des-expansão herdada com verificação + fallback; teste 4×→4× no CI.
- *"Key vaza em log/response"* → CA1/CA5 com testes de não-exposição; client sem logging de
  headers.
- *"Listener falha em silêncio"* → estados visíveis nas duas superfícies; retry com limite;
  `erroSincronizacao` persistido.
- *"Aprovação fica lenta/falha por causa da rede externa"* → AFTER_COMMIT + @Async; a aprovação
  nunca depende do push.
