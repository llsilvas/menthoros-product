**Tamanho:** M · **Trilha:** Full

# Proposal — add-fit-historico-lote

O treinador carrega o histórico de treinos de um atleta novo que usa Garmin, enviando vários arquivos
`.fit` na tela do atleta. Reaproveita o pipeline de importação de `.fit` que já existe (hoje só o
próprio atleta consegue usar, um arquivo por vez).

## Status

- draft (2026-11-01): aberta a partir da conversa sobre CSV do Garmin Connect. O CSV foi descartado
  (só resumo por atividade, sem etapas nem FC por segundo); o `.fit` é a fonte rica e o pipeline já
  existe. A ingestão direta do Garmin (`garmin-activity-ingestion`) não traz histórico — está nos
  non-goals dela ("histórico: Starter não tem") —, então este é o caminho para atleta novo.

- Revisão de produto (2026-11-01, `product-reviewer`): **Refine**. Problema real, escopo pequeno e
  custo de IA zero. Ajustes incorporados: LGPD vira **gate** antes do front (não nota de
  fechamento); aviso de autorização na tela; resumo com o período coberto; métrica ponta a ponta;
  "sem desfazer" registrado como risco aceito; esta change é **ponte de onboarding**, não feature
  central (a ingestão direta do Garmin cobre o fluxo contínuo).

## Why

Atleta novo chega sem histórico no Menthoros. Sem treinos realizados, o motor não tem CTL/ATL/TSB, o
treinador não vê planejado × executado e a primeira semana de plano é gerada às cegas. Hoje a única
saída é pedir ao atleta que envie os arquivos um a um pelo app dele, ou digitar treino à mão.

O treinador já está na tela do atleta no momento do cadastro e é quem precisa do histórico para
decidir a primeira carga. Dar a ele a ação "carregar histórico" encurta o início do atleta novo e
tira a dependência do atleta.

## What Changes

- **Backend:** novo `POST /api/v1/coach/atletas/{atletaId}/treinos/importar-fit` (multipart, um
  `.fit` por requisição), restrito a `TECNICO`/`ADMIN` e ao tenant do treinador. Chama o
  `FitUploadService.importar` que já existe, sem mudar o parse nem a persistência. 201 para treino
  novo, 200 para já importado, 422 para arquivo inválido, 404 para atleta fora do tenant.
- **Frontend:** seção "Importar histórico" na tela do atleta (`CoachAthleteProfilePage`), com
  seleção de vários `.fit`, fila enviada **em sequência** (um arquivo por vez) com progresso e um
  resumo final: importados, já existentes, com erro (por arquivo, com o motivo).
- **Sem migration.** A deduplicação por `(tenant, fonte, externalId)` com
  `externalId = atletaId-serial-startTime` já impede duplicar, inclusive contra a futura ingestão
  direta do Garmin, que usa o mesmo formato.
- **Non-goals:** CSV; `.zip` (extração no servidor traz risco de zip bomb e path traversal; o
  treinador seleciona os `.fit` extraídos); processamento assíncrono/fila no servidor; importação
  feita pelo atleta em lote; histórico de fontes que não são `.fit` (Strava, intervals.icu já têm
  ingestão própria); edição ou exclusão de treino importado.

## Impact

- **Backend:** `CoachFitUploadController` (ou método no controller de atleta do treinador),
  testes; nenhum serviço novo. Limite multipart (10 MB por requisição) permanece; é por arquivo.
- **Contrato de API:** endpoint novo (aditivo).
- **Frontend:** componente da seção + hook `useImportarHistoricoFit` (fila, progresso, resultado),
  adapter do resumo, cliente curado em `src/api`. Reaproveita `fitUploadResultAdapter` do atleta.
- **Multi-tenancy:** `@RequireTenant(resourceParamIndex = 0)` e o persister já filtra o atleta por
  `(id, tenantId)`; atleta de outro tenant é 404.
- **Custo de IA:** nenhum. `WorkoutAnalysisListener` só analisa treino com RPE e com menos de 30
  dias (`app.workout-analysis.max-idade-dias`); `.fit` não traz RPE.
- **Carga:** cada treino novo recalcula a carga diária da data dele até hoje
  (`IngestaoTreinoRealizadoService.registrar`). Por isso a fila é sequencial (sem corrida no
  upsert da carga do mesmo atleta). Custo medido no IT da task 1.3.

## Critérios de aceite

- **CA1 — Importa um `.fit`.** Given atleta do tenant do treinador, When o treinador envia um
  `.fit` válido, Then 201 com o treino realizado (etapas e métricas do arquivo) vinculado ao
  atleta do path, e a carga diária do atleta é recalculada.
- **CA2 — Idempotência.** Given `.fit` já importado, When o treinador envia o mesmo arquivo, Then
  200 com o mesmo treino e nenhuma linha nova.
- **CA3 — Arquivo inválido.** Given arquivo que não é `.fit` válido, When enviado, Then 422 e nenhum
  treino criado; na tela, a fila continua com os demais arquivos.
- **CA4 — Isolamento de tenant.** Given atleta de outro tenant, When o treinador envia, Then 404 e
  nada é gravado.
- **CA5 — Papel.** Given usuário `ATLETA`, When chama o endpoint do treinador, Then 403.
- **CA6 — Fila sequencial com progresso.** Given 30 arquivos selecionados, When o treinador inicia
  a importação, Then os arquivos são enviados um por vez, a tela mostra "n de 30", e ao final
  mostra importados, já existentes e com erro (nome do arquivo e motivo).
- **CA6b — Aviso e período coberto.** Given a seção "Importar histórico", When o treinador a abre,
  Then vê o aviso "Confirme que tem autorização do atleta para carregar estes dados" e a orientação
  de obter os arquivos; e Given a importação concluída, Then o resumo mostra o período coberto
  (data do treino mais antigo e do mais recente e o número de semanas) e que a importação não tem
  desfazer.
- **CA7 — Sem custo de IA.** Given importação de histórico, When os treinos são registrados, Then
  nenhuma chamada de LLM é feita (treino sem RPE e/ou com mais de 30 dias não é elegível).
- **CA8 — Dedup com a ingestão direta.** Given treino importado por `.fit`, When o mesmo treino
  chegar depois pela ingestão do Garmin com o mesmo `externalId`, Then não duplica.

## Métrica de sucesso

Atleta novo com Garmin chega a **≥ 6 semanas de histórico no Menthoros em ≤ 5 minutos do
treinador na tela** (selecionar os arquivos e conferir o resumo). Esse número **não inclui** o passo
de obter os `.fit` com o atleta, que é o gargalo real e fica fora do controle do produto; por isso a
métrica que decide o sucesso é a ponta a ponta: **tempo entre o pedido ao atleta e o histórico no
motor**, medido no pilot com 1–2 assessorias (observação manual).
Sinais de apoio, só como observação (N pequeno no pilot, não são gate): proporção de arquivos
importados sobre os enviados (esperado ≥ 95%; o resto são arquivos inválidos) e a **taxa de
aceitação das propostas da primeira semana** de atletas com histórico × sem histórico.

## Open Questions & Assumptions

- **Premissa:** o treinador consegue obter os `.fit` do atleta. O Garmin Connect permite "Exportar
  o original" por atividade e "Exportar dados" (todos os dados da conta, em `.zip`). O treinador
  recebe do atleta; extrair o `.zip` fica com quem recebe. Zip no servidor é non-goal; vira change
  própria se o passo de extrair atrapalhar.
- **Premissa:** "cadastro do atleta" = a tela do atleta do treinador (`CoachAthleteProfilePage`),
  acessível logo após criar o atleta. Não há fluxo de criação de atleta com passo de importação
  nesta change.
- **Premissa:** uma requisição por arquivo, orquestrada pelo front. Evita estourar o limite de
  10 MB por requisição, evita job assíncrono no servidor e dá progresso real. Não há endpoint
  "em lote" no backend.
- **Premissa:** a janela útil de histórico é ~12 semanas (calibra CTL/ATL). O front sugere isso no
  texto, sem limitar por data nem por quantidade além de um teto de arquivos por seleção (200).
- **Aberto — LGPD (gate):** o treinador sobe dado de saúde do atleta (art. 11) e isso **não** é
  coberto automaticamente pelo consentimento do treinador (`add-coach-lgpd-consent`). A base legal
  (consentimento do atleta por esta via ou cláusula do contrato assessoria–atleta) precisa estar
  decidida **antes de implementar o front** (task 0.1), não ao fim. O `.fit` traz GPS (localização,
  possivelmente a casa do atleta): o binário não é guardado (só o que o parser extrai vira
  `TreinoRealizado`) e o log não grava nome de arquivo — a task 1.2 confirma isso por teste.
- **Aberto — `.zip` no navegador:** aceitar `.zip` extraindo no cliente evita o risco de zip bomb
  no servidor e tira do treinador o passo de extrair, mas exige uma biblioteca de zip no front
  (dependência nova, que o CLAUDE.md do front pede justificar). Fica **fora** desta change até
  haver confirmação, no pilot, de que o passo de extrair atrapalha.
- **Aberto — necessidade para o pilot:** com 1–2 atletas novos, carregar o histórico por script/ops
  pode bastar. A entrega em duas fases cobre isso: o endpoint do backend já serve a esse uso por
  API, e o front só é construído depois de a dor ser confirmada.
- **Risco aceito — sem desfazer:** o `externalId` usa o `atletaId` do path, então nada checa que o
  arquivo é do atleta certo, e não há exclusão de treino importado (non-goal). Arquivo de outra
  pessoa contamina CTL e plano. Mitigação mínima: o aviso e o período coberto na tela (CA6b); a
  exclusão fica para change própria se acontecer.
- **Aberto:** se o treinador de uma assessoria com vários treinadores pode importar para atleta de
  outro treinador da mesma assessoria. Assumido sim (o escopo é o tenant, como nos demais endpoints
  de treinador); não há ownership por treinador hoje.
- **Aberto — ordem:** a ordem de envio não importa para o resultado final (cada registro recalcula
  a carga até hoje); assumido enviar na ordem selecionada.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Recalculo de carga por arquivo deixa a fila lenta (N arquivos × janela até hoje) | Fila sequencial; IT mede o custo com 50 arquivos (task 1.3); se passar de ~1 s por arquivo, otimiza o recalculo como change própria |
| Arquivo malicioso ou gigante | Já limitado a 10 MB e validado pelo parser; erro vira 422 por arquivo, sem derrubar a fila |
| Treinador fecha a aba no meio da fila | Idempotência: reenviar a seleção retoma sem duplicar (CA2) |
| Dado de saúde de terceiro sem base legal clara | Pergunta aberta de LGPD acima; bloqueio de release, não de implementação |
| Atleta importado em duplicidade pelo Garmin direto depois | Mesmo formato de `externalId` (CA8), coberto por teste |
| Corrida: dois treinadores importam para o mesmo atleta ao mesmo tempo | Dedup por UNIQUE no banco; o perdedor da corrida recebe o registro existente |

## Referências

- `garmin-activity-ingestion` (non-goal de histórico; formato do `externalId`)
- `ingestao-treino-realizado` (seam `registrar`, D5 guard de custo)
- Upload do atleta: `FitUploadController` (`/me/treinos/importar-fit`)
