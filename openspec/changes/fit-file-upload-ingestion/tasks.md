# Tasks: fit-file-upload-ingestion

## 0. Backend — dependência e parse

- [ ] 0.1 Adicionar dependência `com.garmin:fit-sdk` no `pom.xml`. Verificar a versão mais recente
  no Maven Central (ex: `com.garmin:fit:21.141.0` ou similar). **Atenção:** o SDK oficial da Garmin
  está no Maven Central como `com.garmin:fit` — não confundir com wrappers de terceiros.
  - verify: `./mvnw dependency:resolve` baixa o artefato sem erro.
- [ ] 0.2 `FitParseService`: recebe `InputStream` (ou `byte[]`) do .fit, percorre as mensagens:
  - `FileIdMesg` → tipo de arquivo, fabricante, produto, serial
  - `SessionMesg` → timestamp de início, timestamp de fim, distância total, duração, FC média,
    FC máxima, TSS (se presente), esporte
  - `LapMesg` → splits/km cada um com distância, duração, pace, FC média/máx, elevação
  - Construir `externalId` a partir de `serialNumber` + `session.startTime` — único por treino
    (dedup contra re-upload).
  - verify: `.fit` extraído de um Garmin real → todos os campos preenchidos; `.fit` de esteira →
    GPS nulo mas resto ok; `.fit` corrompido → `FitParseException` descritiva.
- [ ] 0.3 `FitUploadController`: `POST /api/v1/treinos/importar-fit`, `@RequestParam("file") MultipartFile`,
  `@PreAuthorize("hasRole('ATLETA')")`, retorna `TreinoRealizadoOutputDto`.
  - verify: endpoint responde 201 com dados reais; 422 para arquivo inválido; 401 sem token.
- [ ] 0.4 Mapeamento `FitSessionData → TreinoRealizado`:
  - Reusar `TreinoRealizado` entity já existente (src/main/java/.../entity/).
  - Preencher `externalId`, `fonteDados = MANUAL` (ou `FIT_FILE` se criar novo enum value).
  - Preencher `etapasRealizadas[]` a partir dos laps (reusa `EtapaRealizada` entity já existente).
  - Reusar `saveIdempotent` pattern (igual `StravaActivityServiceImpl`).
  - verify: treino persiste com FC e laps; `externalId` único; re-upload não duplica.
- [ ] 0.5 `./mvnw clean test` verde; nenhuma regressão nos imports existentes (Strava, manual).

## 1. Frontend — upload + preview

- [ ] 1.1 `FileUploadZone` componente: drag-and-drop + `input[type=file][accept=.fit,.FIT]` com
  estilo dark-first (linha tracejada, ícone de upload, cor muda no hover/drag-over).
  - verify: renderiza; drag-over muda estilo visual; clique abre seletor de arquivos.
- [ ] 1.2 `FitUploadService` (cliente curado): `importFit(file: File)` → `POST /treinos/importar-fit`
  como multipart/form-data. Hook `useFitUpload` → `{ upload, uploading, error, result }`.
  - verify: `npm run build` verde; chamada de rede é multipart.
- [ ] 1.3 `FitUploadResultCard` componente: preview dos dados extraídos (distância, duração, FC,
  nº de laps) após upload bem-sucedido. Botão "Importar outro" + link para Home.
  - verify: renderiza dados corretos do response; sem crash com dados parciais.
- [ ] 1.4 Integrar na `ManualTrainingFormPage` (ou página `/importar-fit`): seção de upload no topo,
  formulário manual imediatamente abaixo — atleta escolhe o caminho. Após upload bem-sucedido,
  collapse da seção de manual (não desaparece, fica visível como fallback).
  - verify: ambos os caminhos funcionam; upload não impede registro manual no mesmo dia.
- [ ] 1.5 `npm run lint && npm run build && npm run test:run` verde.

## 2. Fechamento

- [ ] 2.1 Smoke: enviar .fit real de um Garmin → treino aparece na Home e no Progresso com FC/laps.
- [ ] 2.2 Smoke: re-enviar mesmo .fit → 200 com o mesmo treino (não duplica).
- [ ] 2.3 Smoke: enviar arquivo não-FIT (.txt, .jpg) → 422 com mensagem de erro.
- [ ] 2.4 Suíte completa front + backend verde.
