# Design — add-fit-historico-lote

## Context

Ver `proposal.md`. Estado do código que molda o desenho (verificado em 2026-11-01):

- `FitUploadController` expõe `POST /api/v1/atletas/me/treinos/importar-fit` só para
  `ATLETA`/`ADMIN`; resolve o `atletaId` do JWT (`resolverAtletaIdAtual`) e devolve 201 (novo) ou 200
  (já importado) com `TreinoRealizadoOutputDto`.
- `FitUploadService.importar(atletaId, InputStream)` já recebe o `atletaId`: faz o parse fora da
  transação e chama `FitTreinoPersister.persistir` (`@Transactional`), que carrega o atleta por
  `findByIdAndTenantId(atletaId, TenantContext.getRequiredTenantId())` (404 se fora do tenant) e
  monta `externalId = atletaId-serial-startTime`.
- `IngestaoTreinoRealizadoService.registrar` deduplica por `(atleta, externalId)`, calcula
  `tssCalculado`, publica `TreinoRegistradoEvent` só na inserção nova e **recalcula a carga da data
  do treino até hoje**.
- `WorkoutAnalysisListener` só analisa treino com RPE e com menos de
  `app.workout-analysis.max-idade-dias` (30) dias: importação de histórico não gera chamada de LLM.
- `spring.servlet.multipart` limita 10 MB por arquivo e por requisição.
- Front: o atleta já tem `fitUploadResultAdapter` (preview do treino importado). O treinador não tem
  upload algum; a tela do atleta é `CoachAthleteProfilePage`.

## Decisões

### D1 — Um arquivo por requisição, fila no front

O endpoint recebe **um** `.fit`. A fila de N arquivos é do front, sequencial. Alternativas
descartadas:

- **Multipart com N arquivos:** estoura o limite de 10 MB por requisição (um histórico de 12
  semanas passa disso), prende a requisição por minutos e perde o progresso real.
- **Job assíncrono com fila no servidor:** exige armazenar os binários (o `FitUploadService` lê de
  stream, não guarda arquivo), estado de job, polling e limpeza. Desproporcional para ~100 arquivos.
- **`.zip` no servidor:** zip bomb, path traversal e arquivos aninhados. Non-goal desta change.

O custo é N round-trips; com arquivos de centenas de KB e sequencial, o ganho de simplicidade e de
progresso honesto compensa.

### D2 — Fila sequencial (concorrência 1)

Cada `registrar` recalcula a carga diária do atleta da data do treino até hoje. Dois uploads
concorrentes do mesmo atleta disputariam o upsert das métricas diárias. Sequencial elimina a
disputa sem lock novo no servidor. Se o IT mostrar tempo por arquivo alto, o ajuste é otimizar o
recalculo (change própria), não paralelizar.

### D3 — Endpoint do treinador, reaproveitando o serviço

`POST /api/v1/coach/atletas/{atletaId}/treinos/importar-fit` (`consumes = multipart/form-data`,
parte `arquivo`).

- `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` e `@RequireTenant(resourceParamIndex = 0)`,
  como os demais endpoints de treinador com `{atletaId}` no path.
- Chama `fitUploadService.importar(atletaId, stream)` sem alteração. O persister já garante o
  isolamento por tenant (404).
- Respostas e códigos iguais ao endpoint do atleta (201/200/422), mais 403 e 404.
- Log de auditoria: atletaId, tenantId, `novo`/`existente` (sem nome de arquivo nem conteúdo).
- Sem novo método de serviço: a regra é a mesma, só muda quem chama.

### D4 — Resumo e erros por arquivo (movido para o front)

Movido para a change `add-fit-historico-lote-front` (hook de fila, resumo, teto de 200 arquivos).
O contrato que ela consome é o desta change: erro em um arquivo (422) não invalida os demais, e
reenviar uma seleção é seguro porque o endpoint é idempotente (CA2).

### D5 — Sem mudança de dados nem de contrato existente

Sem migration. O `externalId` usa o mesmo formato que `garmin-activity-ingestion` prevê, então um
treino importado aqui não duplica quando a ingestão direta passar a receber o mesmo evento (CA8).
Teste de CA8 fixa esse formato do lado do dado, sem depender da implementação da ingestão direta.

### D6 — Lugar na UI (movido para o front)

Movido para `add-fit-historico-lote-front`. Nesta change não há UI.

## Rollback

Sem migration. Reverter o PR do backend remove o endpoint. Treinos já importados são registros
normais de `TreinoRealizado` (`fonte_dados = GARMIN`, mesma origem da ingestão direta) e não
precisam de reversão; a limpeza de um lote errado é por SQL de ops (ver `tasks.md`, Notas).

## Ordem de entrega

Backend (endpoint + testes + IT de custo) → `develop` → `main`. O pilot usa o endpoint por `curl`.
O front só entra quando o gatilho do `proposal.md` disparar.
