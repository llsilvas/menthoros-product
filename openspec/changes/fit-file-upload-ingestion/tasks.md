# Tasks: fit-file-upload-ingestion

> **Refinado após DoR gate (NOT READY na 1ª submissão) — ver `design.md` para o detalhamento
> completo.** Achados que corrigem a versão original:
> - Coordenada Maven errada: `com.garmin:fit` (não `fit-sdk`), versão `21.205.0` — confirmado no
>   Maven Central (D0.5).
> - Constraint de dedup real é `UNIQUE(tenant_id, fonte_dados, external_id)` — não
>   `(externalId, atleta_id)`. Compor `externalId` incluindo o `atletaId` evita colisão
>   cross-atleta dentro do mesmo tenant (D0.2).
> - `TipoTreino` não tem nenhum valor para esporte não-corrida (ciclismo/natação) — é uma
>   taxonomia de propósito de treino de corrida, não de esporte. Todo import usa
>   `tipoTreino = CONTINUO` + esporte real anotado em `descricao` (D0.6).
> - Nomes de campo corrigidos: `fcMax` (não `fcMaxima`), `paceMedia`/`duracaoMin` são `Duration`
>   (não string formatada) (D0.7).
> - Classe correta é `TssCalculatorService` (não `TssCalculator`) (D0.3).
> - `saveIdempotent` sozinho não diferencia 200 de 201 — o controller deve checar existência
>   antes de persistir (D0.8).

## 0. Backend — dependência e parse

- [ ] 0.1 Adicionar dependência `com.garmin:fit` (groupId `com.garmin`, artifactId `fit`, versão
  `21.205.0` — confirmado no Maven Central, ver `design.md` D0.5) no `pom.xml`.
  - verify: `./mvnw dependency:resolve` baixa o artefato sem erro.
- [ ] 0.2 `FitParseService`: recebe `InputStream` (ou `byte[]`) do .fit, percorre as mensagens:
  - `FileIdMesg` → tipo de arquivo, fabricante, produto, serial
  - `SessionMesg` → timestamp de início, timestamp de fim, distância total, duração, FC média,
    FC máxima, TSS (se presente), esporte
  - `LapMesg` → splits/km cada um com distância, duração, pace, FC média/máx, elevação
  - Construir `externalId` = `"{atletaId}-{serialNumber}-{session.startTime.seconds}"` (D0.2 —
    inclui `atletaId` para evitar colisão cross-atleta sob a constraint real, escopada só por
    tenant+fonteDados+externalId).
  - Regras de nulidade: `Session.AvgHeartRate`/`Session.TotalDistance` ausentes → `null` (nunca
    `0`); `Session.TrainingStressScore` ausente → calcular via `TssCalculatorService` (D0.3);
    `LapMesg[]` vazio → `etapasRealizadas = []` (não é erro).
  - verify: `.fit` extraído de um Garmin real → todos os campos preenchidos; `.fit` de esteira →
    GPS nulo mas resto ok; `.fit` corrompido → `FitParseException` descritiva; `.fit` de esporte
    não-corrida (ciclismo) → `tipoTreino = CONTINUO` + esporte em `descricao` (D0.6), não falha.
- [ ] 0.3 `FitUploadController`: `POST /api/v1/treinos/importar-fit`, `@RequestParam("file") MultipartFile`,
  `@PreAuthorize("hasRole('ATLETA')")`, retorna `TreinoRealizadoOutputDto`. Verifica existência via
  `treinoRealizadoRepository.findByExternalIdAndAtletaId(...)` antes de persistir para decidir
  200 (já existe) vs 201 (novo) — ver `design.md` D0.8.
  - verify: endpoint responde 201 com dados reais (novo); 200 no re-upload do mesmo `.fit`
    (dedup); 422 para arquivo inválido; 401 sem token.
- [ ] 0.4 Mapeamento `FitSessionData → TreinoRealizado`:
  - Reusar `TreinoRealizado` entity já existente (`fcMax`, `paceMedia`/`duracaoMin` como
    `Duration`, `tssCalculado`, `externalId`, `descricao` — nomes confirmados contra a entity
    real, D0.7).
  - Preencher `externalId` (D0.2), `fonteDados = MANUAL` (D0.1).
  - Preencher `etapasRealizadas[]` a partir dos laps (reusa `EtapaRealizada` entity já existente).
  - Reusar `mapToTreinoRealizado`/`saveIdempotent` de `StravaActivityServiceImpl` (confirmados
    existentes e reutilizáveis, D0.2).
  - verify: treino persiste com FC e laps; `externalId` único por atleta; re-upload não duplica.
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
- [ ] 1.4 Integrar em `ManualTrainingFormPage.tsx` (path confirmado —
  `src/features/athlete/pages/ManualTrainingFormPage.tsx`, já tocada pela 9.9 que adicionou o
  `PostWorkoutFeedbackCard`): `FileUploadZone` como nova seção **acima** do
  `ManualTrainingForm` existente, sem substituí-lo. Após upload bem-sucedido, mostrar
  `FitUploadResultCard` no lugar da zona de upload (mesmo padrão já usado pelo
  `PostWorkoutFeedbackCard` — substitui a seção, não a página inteira); o formulário manual
  abaixo continua sempre visível e funcional como fallback, independente do estado do upload.
  - verify: upload bem-sucedido mostra o preview; formulário manual continua registrável no
    mesmo carregamento de página, sem bloqueio mútuo entre os dois caminhos.
- [ ] 1.5 `npm run lint && npm run build && npm run test:run` verde.

## 2. Fechamento

- [ ] 2.1 Smoke: enviar .fit real de um Garmin → treino aparece na Home e no Progresso com FC/laps.
- [ ] 2.2 Smoke: re-enviar mesmo .fit → 200 com o mesmo treino (não duplica).
- [ ] 2.3 Smoke: enviar arquivo não-FIT (.txt, .jpg) → 422 com mensagem de erro.
- [ ] 2.4 Suíte completa front + backend verde.
