**Tamanho:** S · **Trilha:** Fast

# Proposal — add-fit-historico-lote

O treinador carrega o histórico de treinos de um atleta novo que usa Garmin, enviando arquivos `.fit`
para o atleta. Reaproveita o pipeline de importação de `.fit` que já existe (hoje só o próprio
atleta consegue usar, um arquivo por vez). Esta change entrega **só o endpoint do treinador**; a
tela de envio em lote é a change `add-fit-historico-lote-front`, adiada até o pilot provar a dor.

## Status

- draft (2026-11-01): aberta a partir da conversa sobre CSV do Garmin Connect. O CSV foi descartado
  (só resumo por atividade, sem etapas nem FC por segundo); o `.fit` é a fonte rica e o pipeline já
  existe. A ingestão direta do Garmin (`garmin-activity-ingestion`) não traz histórico — está nos
  non-goals dela ("histórico: Starter não tem") —, então este é o caminho para atleta novo.

- Revisão de produto (2026-11-01, `product-reviewer`): **Refine**. Problema real, escopo pequeno e
  custo de IA zero. Esta change é **ponte de onboarding**, não feature central (a ingestão direta do
  Garmin cobre o fluxo contínuo).

- Grilling + visão do CPO (2026-11-01), decisões do fundador:
  - **Só backend agora.** O pilot usa o endpoint por `curl`; o front vira change separada
    (`add-fit-historico-lote-front`), aberta só quando o gatilho abaixo disparar. Por isso a change
    caiu de M/Full para **S/Fast**.
  - **LGPD:** base legal = cláusula no contrato assessoria–atleta. O aviso na tela é lembrete, não
    base legal.
  - **Risco "sem desfazer" aceito** no pilot; correção por SQL de ops (ver `tasks.md`, Notas).
  - **Escopo por tenant**, sem ownership por treinador.
  - **Métrica:** só o ponta a ponta (ver abaixo).
  - ROI (CPO): backend 1,5 (impacto 3 × confiança 50% ÷ esforço 1) → "Fazer em seguida"; front 0,3 →
    "Experimentar depois". A confiança de 50% vem do gap documentado no spec do Garmin, não de dado de
    pilot.

## Why

Atleta novo chega sem histórico no Menthoros. Sem treinos realizados, o motor não tem CTL/ATL/TSB, o
treinador não vê planejado × executado e a primeira semana de plano é gerada às cegas. Hoje a única
saída é pedir ao atleta que envie os arquivos um a um pelo app dele, ou digitar treino à mão.

O treinador é quem precisa do histórico para decidir a primeira carga. Dar a ele a ação "carregar
histórico" encurta o início do atleta novo e tira a dependência do atleta.

## What Changes

- **Backend:** novo `POST /api/v1/coach/atletas/{atletaId}/treinos/importar-fit` (multipart, um
  `.fit` por requisição), restrito a `TECNICO`/`ADMIN` e ao tenant do treinador. Chama o
  `FitUploadService.importar` que já existe, sem mudar o parse nem a persistência. 201 para treino
  novo, 200 para já importado, 422 para arquivo inválido, 404 para atleta fora do tenant.
- **Sem migration.** A deduplicação já existe em dois índices únicos parciais (`V29`):
  `(tenant_id, fonte_dados, external_id)` e `(tenant_id, atleta_id, external_id)`, com
  `externalId = atletaId-serial-startTime`. O segundo ignora a fonte; o treino importado por `.fit`
  grava `fonte_dados = GARMIN` (`FitTreinoPersister`), a mesma fonte da futura ingestão direta, então
  os dois índices impedem duplicar contra ela.
- **Non-goals:** a tela de envio em lote (change `add-fit-historico-lote-front`); CSV; `.zip`
  (extração no servidor traz risco de zip bomb e path traversal); processamento assíncrono/fila no
  servidor; importação feita pelo atleta em lote; histórico de fontes que não são `.fit` (Strava,
  intervals.icu já têm ingestão própria); edição ou exclusão de treino importado.

## Impact

- **Backend:** controller do treinador (`CoachFitUploadController` ou método no controller de atleta
  do treinador), testes; nenhum serviço novo. Limite multipart (10 MB por requisição) permanece.
- **Contrato de API:** endpoint novo (aditivo).
- **Frontend:** nenhum nesta change.
- **Multi-tenancy:** `@RequireTenant(resourceParamIndex = 0)` e o persister já filtra o atleta por
  `(id, tenantId)`; atleta de outro tenant é 404.
- **Custo de IA:** nenhum. `WorkoutAnalysisListener` só analisa treino com RPE e com menos de 30
  dias (`app.workout-analysis.max-idade-dias`); `.fit` não traz RPE.
- **Carga:** cada treino novo recalcula a carga diária da data dele até hoje
  (`IngestaoTreinoRealizadoService.registrar`). Por isso quem chama deve enviar em sequência (sem
  corrida no upsert da carga do mesmo atleta). Custo medido no IT da task 1.3.

## Critérios de aceite

- **CA1 — Importa um `.fit`.** Given atleta do tenant do treinador, When o treinador envia um
  `.fit` válido, Then 201 com o treino realizado (etapas e métricas do arquivo) vinculado ao
  atleta do path, e a carga diária do atleta é recalculada.
- **CA2 — Idempotência.** Given `.fit` já importado, When o treinador envia o mesmo arquivo, Then
  200 com o mesmo treino e nenhuma linha nova.
- **CA3 — Arquivo inválido.** Given arquivo que não é `.fit` válido, When enviado, Then 422 e nenhum
  treino criado.
- **CA4 — Isolamento de tenant.** Given atleta de outro tenant, When o treinador envia, Then 404 e
  nada é gravado.
- **CA5 — Papel.** Given usuário `ATLETA`, When chama o endpoint do treinador, Then 403.
- **CA7 — Sem custo de IA.** Given importação de histórico, When os treinos são registrados, Then
  nenhuma chamada de LLM é feita (treino sem RPE e/ou com mais de 30 dias não é elegível).
- **CA8 — Dedup com a ingestão direta.** Given treino importado por `.fit`, When o mesmo treino
  chegar depois pela ingestão do Garmin com o mesmo `externalId`, Then não duplica.

CA6 (fila sequencial com progresso) e CA6b (aviso de autorização e período coberto) foram para a
change `add-fit-historico-lote-front`.

## Métrica de sucesso

**Tempo entre o pedido ao atleta e o histórico no motor**, observado manualmente no pilot com 1–2
assessorias. É o ponta a ponta porque o gargalo real é obter os `.fit` com o atleta, fora do controle
do produto. Sinal de apoio, só observação (N pequeno, não é gate): proporção de arquivos importados
sobre os enviados (esperado ≥ 95%; o resto são arquivos inválidos). A meta "≥ 6 semanas em ≤ 5 min
na tela" saiu junto com o front: media a interface, que não existe nesta entrega.

## Gatilho para abrir o front

Abrir `add-fit-historico-lote-front` (promover o rascunho) quando **o treinador do pilot pedir a
tela, ou quando mais de 3 atletas precisarem de histórico em um mês**. Sem isso, o `curl` basta.

## Open Questions & Assumptions

- **Premissa:** o treinador consegue obter os `.fit` do atleta. O Garmin Connect permite "Exportar
  o original" por atividade e "Exportar dados" (todos os dados da conta, em `.zip` com `.zip`
  aninhados). Quem recebe o `.zip` extrai; zip no servidor é non-goal. Se extrair atrapalhar no
  pilot, vira change própria (por exemplo, extração no navegador).
- **Premissa:** a janela útil de histórico é ~12 semanas (calibra CTL/ATL).
- **Decidido — LGPD:** o treinador sobe dado de saúde do atleta (art. 11) e o `.fit` traz GPS. Base
  legal: cláusula no contrato assessoria–atleta (`ContratoAtletaService`). **Gate de release:** o
  texto da cláusula precisa estar em vigor antes de usar o endpoint com atleta real. O binário não
  é guardado (só o que o parser extrai vira `TreinoRealizado`) e o log não grava nome de arquivo —
  a task 1.2 confirma isso por teste.
- **Risco aceito — sem desfazer:** o `externalId` usa o `atletaId` do path, então nada checa que o
  arquivo é do atleta certo, e não há exclusão de treino importado (non-goal). Arquivo de outra
  pessoa contamina CTL e plano. Mitigação no pilot: o treinador conhece cada atleta, e a limpeza é
  por SQL de ops (`tasks.md`, Notas). Exclusão própria fica para change própria se acontecer.
- **Decidido — ownership:** o escopo é o tenant, como nos demais endpoints de treinador; não há
  ownership por treinador hoje. Se virar problema, é change transversal.
- **Ordem de envio:** não importa para o resultado final (cada registro recalcula a carga até hoje).

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Recalculo de carga por arquivo deixa o envio lento (N arquivos × janela até hoje) | Envio sequencial pelo cliente; IT mede o custo com 50 arquivos (task 1.3); se passar de ~1 s por arquivo, otimiza o recalculo como change própria |
| Arquivo malicioso ou gigante | Já limitado a 10 MB e validado pelo parser; erro vira 422 por arquivo |
| Dado de saúde de terceiro sem base legal | Cláusula contratual como gate de release (acima) |
| Atleta importado em duplicidade pelo Garmin direto depois | Mesmo formato de `externalId` e dedup no banco (CA8), coberto por teste |
| Corrida: dois treinadores importam para o mesmo atleta ao mesmo tempo | Dedup por UNIQUE no banco; o perdedor da corrida recebe o registro existente |
| Atleta ou treinador entrega arquivo de outra pessoa | Risco aceito no pilot (acima) |

## Referências

- `garmin-activity-ingestion` (non-goal de histórico; formato do `externalId`)
- `ingestao-treino-realizado` (seam `registrar`, D5 guard de custo)
- Upload do atleta: `FitUploadController` (`/me/treinos/importar-fit`)
- `add-fit-historico-lote-front` (tela de envio em lote, rascunho)
