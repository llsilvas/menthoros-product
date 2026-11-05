# Tasks — garmin-activity-ingestion

Backend valida com `./mvnw clean verify`; frontend com `npm run lint && npm run build && npm run
test:run`. Pré-requisito: `garmin-connection` mergeada (arquivada em 2026-11-01).
`garmin-training-push` é independente.

Ordem: 1 → 2 → 3.1 no backend (cada task depende da anterior); 3.2 backend antes do front;
4.1 depois que o backend com `deviceName` nos quatro DTOs estiver no ar (regenera o
cliente); 4.4 por último, depois do gate 5.2. Worktrees: `backend-garmin-activity-ingestion` e
`front-garmin-activity-ingestion`.

## 1. Fila de pings (backend)

- [ ] 1.1 Migration `V109__create_tb_garmin_ping.sql` conforme D1: UUID, TIMESTAMPTZ, tipos e
  `CHECK` do `status` do D1, `summary_id` UNIQUE global, `tenant_id`/`atleta_id` `NOT NULL` com FK,
  `proxima_tentativa_em`, `sincronizando_desde`, índices `(tenant_id, status)` e
  `(status, criado_em)`. Conferir o último `V` em `develop` antes de numerar.
  verify: `./mvnw clean test` sobe o contexto com a migration aplicada no Testcontainers.
- [ ] 1.2 Entidade `GarminPing` + enum de status + `GarminPingRepository`
  (`findPendentesPorAntiguidade(limite, agora, desde)`, `findExpirados`,
  `findSincronizandoPresos`, `deleteAntesDe(status, data)`).
  verify: `@DataJpaTest` dos quatro métodos, inclusive a ordem por `criado_em` e o filtro de
  `proxima_tentativa_em`.
- [ ] 1.3 `GarminPingService.registrar(List<JsonNode>)` (D2), **sem `@Transactional`**: um `save`
  por item; `DataIntegrityViolationException` em `summary_id` = repetido, ignora; resolve
  `userId → IntegracaoExterna(GARMIN)` → `atletaId`/`tenantId`; `userId` sem conexão registrada
  não grava; descarte com motivo por modalidade, `manual=true`, `fileType != FIT` e conexão inativa;
  outras falhas de gravação propagam.
  verify: testes parametrizados pelos 9 `activityType` de corrida + amostra de não-corrida, por
  cada motivo de descarte, `userId` desconhecido (nada gravado), `summaryId` repetido (ignorado) e
  falha de gravação propagando (CA1, CA2, CA6).
- [ ] 1.4 `GarminWebhookServiceImpl.processar` trata a chave `activityFiles` delegando a
  `registrar` **fora do `porItem`** (exceção não é engolida); falha de gravação que não é o dedup
  vira `GarminPingRegistroException` sem causa, com log só do tipo (D2); controller sem mudança.
  verify: teste do service — `activityFiles` chega a `registrar`, falha de gravação propaga sem a
  mensagem SQL;
  `@WebMvcTest` do controller — 200 com lote válido, 500 quando `registrar` lança, e nenhuma
  chamada a `GarminClient` durante o request (CA1).

## 2. Processamento (backend)

- [ ] 2.1 `GarminClient.baixarArquivo(callbackUrl)` devolvendo `byte[]`; valida esquema `https`,
  host `apis.garmin.com` e path `/wellness-api/rest/activityFile` antes de qualquer requisição
  (CA6b); erros HTTP viram `GarminApiException` com status.
  verify: `MockRestServiceServer` para sucesso, 401, 403, 404, 410, 412, 429, 5xx e timeout; URL
  rejeitada (host alheio, `http`, path alheio) sem nenhuma requisição.
- [ ] 2.2 `FitTreinoPersister.persistir(atletaId, dados, deviceName)` — o `FitImportResultado`
  (`novo()` + id do treino) é o que o scheduler usa para o CA4; `FitUploadServiceImpl` passa
  `null`; na duplicata, preenche `deviceName` do existente só se nulo, sem repetir TSS/evento/carga
  (D4). `deviceName` (campo anulável, não quebra o cliente) nos quatro DTOs:
  `TreinoRealizadoOutputDto` via `TreinoMapper`, `AtletaHomeDto` (realizado de hoje) e
  `AtletaPerfilCoachOutputDto.RealizadoRecenteDto`, cada um no seu montador.
  verify: testes existentes do persister e do upload verdes com a assinatura nova + asserção de
  `deviceName` persistido, preenchido na duplicata e presente em cada DTO (teste do montador, não
  só do record).
- [ ] 2.3 `GarminPingProcessorScheduler` (D3): reclaim de `SINCRONIZANDO` preso > 10 min,
  expiração > 24 h, lote de 20 por antiguidade; por ping, `TenantContext` do ping instalado e limpo
  em `finally`; claim em TX própria; revalida conexão ativa (inativa → `DESCARTADO`, sem
  download); download + parse fora de TX; persistência em TX gravando
  `IntegracaoExterna.ultimaSincronizacao`; transições `PROCESSADO` / `PENDENTE` + `tentativas+1` + backoff
  `min(2^tentativas, 60)` min sem teto de tentativas / `ERRO` por tipo de falha (410/404,
  401/403/412, `FitParseException`, URL inválida). Premissa: uma instância (D3 `shortcut`).
  verify: testes unitários no molde de `IntervalsIcuRetrySchedulerImpl` cobrindo CA3–CA7b, inclusive
  6 falhas 5xx seguidas dentro da janela sem virar `ERRO`, 429 seguindo o backoff, conexão revogada
  entre a recepção e o job (sem download), lote com pings de dois tenants (cada treino no seu tenant,
  contexto limpo depois) e `ultimaSincronizacao` gravada.
- [ ] 2.4 `@Scheduled` diário de limpeza (D5): `PROCESSADO`/`DESCARTADO` > 30 dias, `ERRO` > 90
  dias.
  verify: teste do filtro de datas e status.

## 3. Melhores esforços e estado da conexão

- [ ] 3.1 `MelhorEsforcoServiceImpl`: conexão de canal Garmin → `DomainConflictException`
  "indisponível para o canal Garmin", sem chamar `pace-curves`.
  verify: teste unitário — 409 e nenhuma interação com `IntervalsIcuClient` (CA9).
- [ ] 3.2 Front: `CoachWatchLine` mostra canal direto, estado e última atividade (`ultimaSincronizacao`
  e `activityExport`, que o `GarminConnectionStatusDto` já expõe — nenhum campo novo) e
  `SyncStatusChip` lê a conexão Garmin.
  verify: testes de componente para os três cenários da spec `watch-connection-guide` (ativa, sem
  permissão, revogada).

## 4. Atribuição no front

- [ ] 4.1 Regenerar o cliente OpenAPI (`deviceName`) e alinhar os tipos manuais
  (`AthleteRealizadoHoje`, `TreinoRealizadoDto`, `RealizadoRecenteDto`); componente
  `FonteAttribution` (D6).
  verify: teste do componente — GARMIN + "Forerunner 970" → "Garmin Forerunner 970"; GARMIN +
  "Garmin Fenix 8" sem duplicar; GARMIN sem modelo ou `unknown` → "Garmin"; outra fonte → nada
  (CA8).
- [ ] 4.2 Inserir `FonteAttribution` junto ao título em `TodayFeedbackCard`, `RecentTrainingsList`,
  `RecentTrainingsPanel` e `DetalheTreinoDialog`. A análise de IA do `WorkoutDetailDrawer` só entra
  se a Open Question (d) do design confirmar — pausar e perguntar ao chegar aqui.
  verify: um teste por ponto afirmando o texto visível sem interação (CA8), com o `deviceName`
  vindo no formato do DTO real.
- [ ] 4.3 Hook de melhores esforços trata o 409 como estado "indisponível";
  `EffortsBlock`/`MelhoresEsforcosPanel` renderizam o aviso (D7). Quem dispara a busca é a página
  (`AthleteProgressPage` e a do treinador), não os painéis.
  verify: teste da página/hook — resposta 409 vira o texto "Indisponível para o canal Garmin por
  enquanto" no atleta e no treinador (CA9).
- [ ] 4.4 Remover a flag (D8), depois do gate 5.2. Backend: `GarminProperties.habilitado`,
  `application.yml` (`GARMIN_HABILITADO`), checagem em `GarminOAuthServiceImpl`, javadoc de
  `GarminCanalIndisponivelException` (a exceção fica para "sem client ID/secret"). Front:
  `src/config/env.ts`, `public/env-config.js`, `docker/docker-entrypoint.sh`,
  `AthleteProfilePage`, `OnboardingRelogioStep`, `watchCompatibility.ts` (apagar
  `GARMIN_VIA_INTERVALS`, promover GARMIN a "Suportado") e os testes correspondentes. Validação
  canal × marca do onboarding passa a valer sem flag.
  verify: `grep -ri "garmin.\?habilitado"` vazio nos dois repos; stack gate verde nos dois (CA10).
  Pós-deploy, manual: apagar `GARMIN_HABILITADO`/`VITE_GARMIN_HABILITADO` do Railway.

## 5. Integração

- [ ] 5.1 IT de ponta a ponta: POST `activityFiles` (segredo correto) → ping `PENDENTE` → scheduler
  com `callbackURL` stubada devolvendo `src/test/resources/fit/corrida-15km-16laps.fit` →
  `TreinoRealizado(GARMIN, deviceName, 16 etapas, TSS)` → segundo POST igual não duplica → upload
  manual do mesmo FIT não duplica (CA1, CA3, CA4).
  verify: o IT passa em `./mvnw clean verify`.
- [ ] 5.2 Validar no ambiente de testes com relógio real (summary type `activityFiles` habilitado
  no portal) e registrar em `menthoros-infra/docs`: tempo ping → treino, `deviceName` real.
  verify: treino real aparece com "Garmin [modelo]" no card e na lista do treinador; registro
  commitado no `menthoros-infra`.

## Gates de go-live (não bloqueiam implementar)

- Aviso prévio de 30 dias ao Garmin (licença 6.6) enviado, com data — antes de habilitar
  `activityFiles` em produção. Dono: founder.
- Confirmações de IA 15.10/15.11 (design, Open Questions). Dono: founder.

## Workflow follow-up

- Habilitar `activityFiles` no Developer Portal de produção só depois da troca do webhook.
- Abrir change XS para o aviso e prazo de 30 dias dos atletas Garmin ainda no intervals.icu
  quando o número (Q11) existir.
