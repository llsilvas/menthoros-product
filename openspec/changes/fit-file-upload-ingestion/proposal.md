# Proposal: fit-file-upload-ingestion

**Tamanho:** S · **Trilha:** Full (backend + frontend)

## Status

Proposed (2026-07-03). Priorizada para **Sprint 10** — antes de `add-llm-tool-use` (que se desloca
para Sprint 11-12) — porque o dado rico de treino (FC real, pace real por km, GPS) melhora a
qualidade dos dados que o LLM consome na geração de plano, e porque a pesquisa de mercado
confirmou que não há alternativa viável de API para Garmin no curto prazo.

## Why

O Menthoros hoje só recebe dados de treino via registro manual (Sprint 9d) — tipo, duração,
distância, RPE. Isso é suficiente para a fila de atenção, mas não dá ao LLM dados fisiológicos
precisos (FC real, pace real, zonas) na geração do plano semanal. O coach que usa Garmin, Suunto,
Coros ou Polar não tem como exportar dados ricos para o Menthoros.

**Pesquisa realizada em 2026-07-03 (`add-fit-file-upload-ingestion` research):**
- Garmin Health API continua exigindo aprovação individual — inacessível para empresa solo.
- Health Connect/HealthKit não recebem dados ricos de GPS do Garmin Connect (só dados básicos).
- Strava API existe e está 90% implementada no código, mas tem restrição legal nos termos de
  nov/2024 para uso de dados em ML/prescrição.
- **Upload de .fit é a única alternativa que funciona com TODOS os dispositivos, sem burocracia,
  sem restrição legal de uso dos dados (incluindo para ML), e com fidelidade total do dado**
  (FC a cada segundo, GPS lat/lon, pace instantâneo, zonas, cadência, elevação).

O SDK oficial da Garmin (`com.garmin.fit`) é open-source e maduro. O pipeline de import
(`StravaActivityServiceImpl` com 645 linhas) já resolve a normalização, dedup por `externalId`,
match com treino planejado e persistência — esta change reusa exatamente essa camada, só trocando
a fonte (parser .fit → DTO → pipeline existente).

## What Changes

### Backend (`apps/menthoros-backend`)

- Dependência Maven: `com.garmin:fit-sdk` (versão estável mais recente, open-source).
- `FitParseService`: serviço que recebe `InputStream` do .fit, percorre os records do arquivo e
  extrai:
  - Session record → dados agregados (distância total, duração, FC média/máx, TSS estimado,
    data/hora, tipo de esporte)
  - Lap records → splits/km com pace, FC média/máx, elevação
  - Event/Record → (futuro) dados por segundo para análises mais finas
  - Unique identifier → `externalId` a partir do campo `timestamp` + `session.Timestamp`
    concatenado — permite dedup contra re-upload do mesmo treino.
- `FitUploadController`: `POST /api/v1/treinos/importar-fit` — multipart file upload, aceita
  `.fit`. Retorna `TreinoRealizadoOutputDto` com os dados extraídos + feedback de parsing
  (campos encontrados, warnings de dados ausentes).
- Mapeamento: `FitSessionData` → `TreinoRealizado` (reusa o padrão de
  `StravaActivityServiceImpl.mapToTreinoRealizado` e `saveIdempotent`).
- Reuso total da entidade `IntegracaoExterna`? **Não para esta change** — o .fit é upload avulso,
  não uma integração contínua. A fonte é registrada como `FonteDados.MANUAL` (ou um novo
  `FonteDados.FIT_FILE` se justificado) no primeiro upload. Uma integração contínua com pasta
  watch/Garmin Connect automático é pós-MVP.

### Frontend (`apps/menthoros-front`)

- Seção de upload na `ManualTrainingFormPage` (ou página dedicada `/importar-fit`): drag-and-drop
  zone + `input[type=file][accept=.fit,.FIT]`.
- Preview pós-upload: card com dados extraídos (distância, duração, FC, laps) + botão "Confirmar
  importação" (o upload já persiste; o preview é só confirmação visual, sem dois-passos).
- Fallback para registro manual imediatamente abaixo — atleta decide qual caminho usar.

### Fora de escopo

- Parsing de .gpx/.tcx (pode ser adicionado depois como extensão do mesmo `FitParseService`).
- Integração contínua com Garmin Connect (automatizar download de .fit).
- Análise pós-import (métricas detalhadas, drift, decoupling — Sprint 23 `add-workout-metrics-analyzer`).
- App mobile com Health Connect nativo (onda mobile futura).

## Critérios de aceite

- **CA1 — Upload bem-sucedido:** arquivo .fit válido é enviado → 201 + `TreinoRealizadoOutputDto`
  com distância, duração, FC média/máx, laps (quando disponíveis) preenchidos.
- **CA2 — Dedup:** re-upload do mesmo .fit (mesmo `externalId` + `atletaId`) retorna 200 com o
  treino já existente, não duplica.
- **CA3 — Arquivo inválido:** .fit corrompido ou não-FIT → 422 com mensagem de erro descritiva.
- **CA4 — Tenant isolation:** upload só persiste no tenant do atleta autenticado.
- **CA5 — Dados parciais:** .fit sem GPS (ex: esteira) → persiste com os dados disponíveis (FC,
  duração), não falha.
- **CA6 — Frontend:** drag-and-drop funcional, preview dos dados extraídos, fallback para registro
  manual visível.
- **CA7 — Sem regressão:** `./mvnw clean test` + `npm run lint && npm run build && npm run test:run`
  verdes.

## Métrica de sucesso

**Métrica de adoção (pós-deploy, sem baseline):** % de atletas que usam upload de .fit vs. registro
manual após 30 dias do lançamento. **Métrica de qualidade:** % de uploads que resultam em FC
registrada vs. manuais sem FC. Proxy de fidelidade do dado para o pipeline de prescrição.

## Impact

- **Depende de:** `manual-training-entry-lightweight` (9d) — estrutura de `TreinoRealizado` e
  `tb_treino_realizado` já existentes; reuso do pipeline de persistência.
- **Repos:** `apps/menthoros-backend` (nova dependência Maven + 1 controller + 1 service) +
  `apps/menthoros-front` (drag-and-drop zone + preview card).
- **Migrações:** nenhuma — reuso total das tabelas existentes (`tb_treino_realizado`,
  `tb_etapa_realizada`).
- **Roadmap:** inserida como Sprint 10, antes do `add-llm-tool-use` (que vira Sprint 11-12).
  `coach-batch-plan-generation` (11b) vira 12b; `rag-tool-calling` (12-14) vira 13-15.
  Demais sprints do Bloco 1 e 2 reindexadas.
