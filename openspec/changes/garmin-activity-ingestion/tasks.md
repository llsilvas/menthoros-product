# Tasks — garmin-activity-ingestion

Backend valida com `./mvnw clean verify`; frontend com `npm run lint && npm run build && npm
test`. Pré-requisito: `garmin-connection` mergeada (`garmin-training-push` é independente).

## 1. Fila de pings

- [ ] 1.1 Migration `Vxx__create_tb_garmin_ping.sql` conforme D1 (UUID, TIMESTAMPTZ, `summary_id`
  UNIQUE, índices `(tenant_id, status)` e `(status, criado_em)`); `./mvnw clean test` sobe com a
  migration.
- [ ] 1.2 Entidade `GarminPing` + `GarminPingRepository` (`findPendentesPorAntiguidade(limite,
  maxTentativas, desde)`, `findExpirados`, `deleteProcessadosAntesDe`); `@DataJpaTest` dos três.
- [ ] 1.3 `GarminPingService.registrar(List<JsonNode>)` (D2): dedup por `summaryId`, resolução
  `userId → IntegracaoExterna(GARMIN)` → `atletaId`/`tenantId`, descarte por modalidade, `manual`,
  `fileType` e conexão inativa; testes parametrizados por `activityType` e pelos quatro motivos de
  descarte (CA1, CA2, CA6).
- [ ] 1.4 `GarminWebhookController` roteia `activityFiles` para `registrar` e responde 200 depois
  do `INSERT`; `@WebMvcTest` prova que nenhuma chamada HTTP de saída acontece no request (CA1).

## 2. Processamento

- [ ] 2.1 `GarminClient.baixarArquivo(callbackUrl)` devolvendo `byte[]`/`InputStream`; 410 e 404
  viram `GarminApiException` com status; teste com `MockRestServiceServer` (sucesso, 410, 5xx,
  timeout).
- [ ] 2.2 `FitTreinoPersister.persistir(atletaId, dados, deviceName)`; `FitUploadServiceImpl` passa
  `null`; `TreinoMapper`/`TreinoRealizadoOutputDto` expõem `deviceName`; testes existentes
  ajustados + asserção do `deviceName` (D4).
- [ ] 2.3 `GarminPingProcessorScheduler` (D3): claim em TX própria, download + parse fora de TX,
  persistência em TX, transições `PROCESSADO`/`PENDENTE+tentativas`/`ERRO` por tipo de falha,
  expiração em 24 h, ordem por antiguidade; testes unitários no molde de
  `IntervalsIcuRetrySchedulerImpl` cobrindo CA3–CA7.
- [ ] 2.4 `@Scheduled` diário de limpeza (D5); teste do filtro de datas.

## 3. Melhores esforços e estado da conexão

- [ ] 3.1 `MelhorEsforcoServiceImpl`: conexão de canal Garmin → `DomainConflictException`
  "indisponível para o canal Garmin"; teste (CA9).
- [ ] 3.2 `GarminConnectionStatusDto` ganha `ultimaAtividadeEm` (do ping `PROCESSADO` mais
  recente) e `activityExport`; `AtletaPerfilCoachOutputDto`/`CoachWatchLine` mostram canal direto,
  estado e última atividade; `SyncStatusChip` lê a conexão Garmin; testes de componente para os
  três cenários da spec `watch-connection-guide`.

## 4. Atribuição no front

- [ ] 4.1 Regenerar cliente OpenAPI (`deviceName`, `ultimaAtividadeEm`); componente
  `FonteAttribution` com teste: GARMIN+modelo, GARMIN sem modelo, outra fonte (CA8).
- [ ] 4.2 Inserir `FonteAttribution` junto ao título em `TodayFeedbackCard`, análise do treino,
  `RecentTrainingsPanel`, `CoachCalendarPage` e nos exports PDF/CSV; um teste por ponto afirmando
  o texto visível sem interação (CA8).
- [ ] 4.3 `MelhoresEsforcosPanel`/`EffortsBlock`: aviso de indisponibilidade quando o canal é
  Garmin, sem requisição; teste (CA9).
- [ ] 4.4 Remover as flags `VITE_GARMIN_HABILITADO` (front) e `garmin.habilitado` (backend) e seus
  testes; apagar a entrada `GARMIN_VIA_INTERVALS` de `watchCompatibility.ts` e promover a entrada
  GARMIN a "Suportado" após o gate com atleta real pelo canal direto (5.2); validação canal × marca
  do onboarding passa a valer sem flag; `npm run lint && npm run build && npm test` verdes (CA10).

## 5. Integração

- [ ] 5.1 IT de ponta a ponta: POST `activityFiles` (segredo correto) → ping `PENDENTE` → scheduler
  com `callbackURL` stubada devolvendo `src/test/resources/fit/corrida-15km-16laps.fit` →
  `TreinoRealizado(GARMIN, deviceName, 16 etapas, TSS)` → segundo POST igual não duplica → upload
  manual do mesmo FIT não duplica (CA1, CA3, CA4).
- [ ] 5.2 Validar no ambiente de testes com relógio real (summary type `activityFiles` habilitado
  no portal) e registrar em `menthoros-infra/docs`: tempo ping → treino, `deviceName` real;
  `./mvnw clean verify` verde.

## Workflow follow-up

- Habilitar `activityFiles` no Developer Portal de produção só depois da troca do webhook.
- Abrir change XS para o aviso e prazo de 30 dias dos atletas Garmin ainda no intervals.icu
  quando o número (Q11) existir.
