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
>
> **Correções feitas durante a implementação da Task 0** (não escaladas para o design, só
> registradas aqui):
> - Path do endpoint mudado de `/api/v1/treinos/importar-fit` para
>   `/api/v1/atletas/me/treinos/importar-fit` — segue o padrão self-resolving `/me/` já usado por
>   `AtletaTreinoController`/`AtletaProgressController`/`AtletaKudosController` (atletaId resolvido
>   do JWT via `AtletaProgressService.resolverAtletaIdAtual()`, sem `@RequireTenant`).
> - `mapToTreinoRealizado`/`saveIdempotent` de `StravaActivityServiceImpl` são `private` —
>   NÃO reutilizados diretamente. `FitUploadServiceImpl` implementa o mesmo padrão
>   independentemente (não é uma dependência cross-service).

## 0. Backend — dependência e parse

- [x] 0.1 Adicionar dependência `com.garmin:fit` (groupId `com.garmin`, artifactId `fit`, versão
  `21.205.0` — confirmado no Maven Central, ver `design.md` D0.5) no `pom.xml`.
  - verify: `./mvnw dependency:resolve` baixa o artefato sem erro.
- [x] 0.2 `FitParseService`: recebe `InputStream` (ou `byte[]`) do .fit, percorre as mensagens:
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
- [x] 0.3 `FitUploadController`: `POST /api/v1/atletas/me/treinos/importar-fit` (path corrigido —
  padrão self-resolving `/me/`, ver nota acima), `@RequestPart("arquivo") MultipartFile`,
  `@PreAuthorize("hasAnyRole('ATLETA','ADMIN')")`, retorna `TreinoRealizadoOutputDto`. Verifica
  existência via `treinoRealizadoRepository.findByExternalIdAndAtletaId(...)` antes de persistir
  para decidir 200 (já existe) vs 201 (novo) — ver `design.md` D0.8.
  - verify: endpoint responde 201 com dados reais (novo); 200 no re-upload do mesmo `.fit`
    (dedup); 422 para arquivo inválido; 401 sem token. (Coberto por
    `FitUploadServiceImplTest` + `FitParseServiceImplTest`; smoke HTTP fica para a Task 2.)
- [x] 0.4 Mapeamento `FitSessionData → TreinoRealizado`:
  - Reusar `TreinoRealizado` entity já existente (`fcMax`, `paceMedia`/`duracaoMin` como
    `Duration`, `tssCalculado`, `externalId`, `descricao` — nomes confirmados contra a entity
    real, D0.7).
  - Preencher `externalId` (D0.2), `fonteDados = MANUAL` (D0.1).
  - Preencher `etapasRealizadas[]` a partir dos laps (reusa `EtapaRealizada` entity já existente).
  - `mapToTreinoRealizado`/`saveIdempotent` de `StravaActivityServiceImpl` são `private` — não
    reutilizados; `FitUploadServiceImpl` implementa o mesmo padrão de forma independente (ver
    nota acima).
  - verify: treino persiste com FC e laps; `externalId` único por atleta; re-upload não duplica.
    Coberto por `FitUploadServiceImplTest` (7 testes: novo, re-upload, esporte não-corrida,
    fallback de TSS, dados parciais sem fabricar valores, atleta não encontrado, concorrência).
- [x] 0.5 `./mvnw clean test` verde; nenhuma regressão nos imports existentes (Strava, manual).
  - verify: `1163 tests, 0 failures, 0 errors` (suíte completa).

## 1. Frontend — upload + preview

- [x] 1.1 `FileUploadZone` componente: drag-and-drop + `input[type=file][accept=.fit,.FIT]` com
  estilo dark-first (linha tracejada, ícone de upload, cor muda no hover/drag-over).
  - verify: renderiza; drag-over muda estilo visual; clique abre seletor de arquivos.
  Coberto por `FileUploadZone.test.tsx` (5 testes: render, seleção via input, extensão inválida
  ignorada, drop válido, disabled bloqueia).
- [x] 1.2 `FitUploadService` (cliente curado): `importar(arquivo: File)` →
  `POST /api/v1/atletas/me/treinos/importar-fit` como multipart/form-data (via `formData` do
  `request.ts`, sem setar `mediaType` — o axios calcula o boundary automaticamente). Hook
  `useFitUpload` → `{ upload, uploading, error, result, reset }`.
  - verify: `npm run build` verde; `useFitUpload.test.ts` (3 testes: sucesso, erro propagado,
    reset).
- [x] 1.3 `FitUploadResultCard` componente: preview dos dados extraídos (duração, distância, FC
  média, nº de laps) via novo adapter `fitUploadResultAdapter.ts` (`buildFitUploadPreview`,
  mesmo padrão de `postWorkoutFeedbackAdapter` — nunca fabrica campo ausente). Botão
  "Importar outro" + link para Home. Estendidos campos opcionais `fcMedia` e
  `etapasRealizadas` em `TreinoRealizadoDto` (types/TreinoManual.ts) para suportar o preview.
  - verify: `FitUploadResultCard.test.tsx` (4 testes) + `fitUploadResultAdapter.test.ts`
    (6 testes) — renderiza dados corretos; omite linhas com dados parciais, sem crash.
- [x] 1.4 Integrado em `ManualTrainingFormPage.tsx`: `FileUploadZone` como nova seção **acima**
  do `ManualTrainingForm` existente, sem substituí-lo. Após upload bem-sucedido, mostra
  `FitUploadResultCard` no lugar da zona de upload (mesmo padrão do `PostWorkoutFeedbackCard`);
  o formulário manual abaixo continua sempre visível e funcional, independente do estado do
  upload (estado local `treinoImportado`, próprio da página — mesmo padrão de
  `treinoRegistrado` já usado para o fluxo manual).
  - verify: 4 novos testes em `ManualTrainingFormPage.test.tsx` (zona de upload visível junto
    com o form manual; upload bem-sucedido mostra preview sem esconder o form; "Importar outro"
    volta à zona de upload; erro de upload não afeta o form manual).
- [x] 1.5 `npm run lint && npm run build && npm run test:run` verde — 73 arquivos, 462 testes.

## 2. Fechamento

- [x] 2.1 Smoke: enviar .fit real (gerado via o mesmo `FileEncoder` do SDK usado nos testes —
  ambiente local sem um dispositivo Garmin físico à mão; round-trip já validado por
  `FitParseServiceImplTest`) → treino aparece na Home (Volume 42.3→47.3 km, Treinos 7→8) e no
  Progresso (126 km, 7 de 8 treinos concluídos), com FC média e laps corretos no card de
  resultado ("30 min · 5.0 km · FC média 152 bpm · 2 laps"). Verificado via browser real
  (login manual do usuário, atleta autenticado) contra o backend local após restart (o processo
  já em execução no IntelliJ antecedia a dependência `com.garmin:fit` e o novo controller —
  precisou reiniciar para o classpath pegar ambos).
- [x] 2.2 Smoke: re-enviar o mesmo .fit → confirmado 201 na 1ª vez, 200 na 2ª (rede), Home/
  Progresso inalterados (mesmo volume/CTL/ATL/TSB) — sem duplicar.
- [x] 2.3 Smoke: enviar arquivo com extensão `.fit` mas conteúdo corrompido (não é possível
  testar `.txt`/`.jpg` via UI real — o próprio `FileUploadZone` já filtra por extensão no
  client, então nunca chega à rede; isso é o comportamento correto e já coberto por
  `FileUploadZone.test.tsx`) → 422 confirmado na rede, toast "Erro ao importar arquivo .fit.
  Verifique se é um arquivo válido." exibido, formulário manual abaixo não afetado, sessão
  do usuário preservada (não desloga em 422, só em 401 inesperado).
- [x] 2.4 Suíte completa: backend `./mvnw clean test` — 1163 testes, 0 falhas. Frontend
  `npm run lint && npm run build && npm run test:run` — 73 arquivos, 462 testes, 0 falhas.
