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
  novo, 200 para já importado, 422 para arquivo inválido, 403 para atleta fora do tenant (o aspecto
  `@RequireTenant` lança `AccessDeniedException` antes do persister, mapeada para 403 no
  `GlobalExceptionHandler` — mesmo comportamento dos demais endpoints de treinador).
- **Sem migration.** A deduplicação já existe: o índice único `(external_id, atleta_id)` (`V23`,
  independe da fonte) e o índice único `(tenant_id, fonte_dados, external_id)` (`V29`, parcial;
  o auxiliar não único do `V29` é `(tenant_id, atleta_id, external_id)`), com `externalId = atletaId-serial-startTime`. O treino importado por `.fit` grava
  `fonte_dados = GARMIN` (`FitTreinoPersister`), a mesma fonte da futura ingestão direta; como o
  `V23` ignora a fonte, um treino com o mesmo `externalId` não duplica.
- **Non-goals:** a tela de envio em lote (change `add-fit-historico-lote-front`); CSV; `.zip`
  (extração no servidor traz risco de zip bomb e path traversal); processamento assíncrono/fila no
  servidor; importação feita pelo atleta em lote; histórico de fontes que não são `.fit` (Strava,
  intervals.icu já têm ingestão própria); edição ou exclusão de treino importado.

## Impact

- **Backend:** controller do treinador (`CoachFitUploadController` ou método no controller de atleta
  do treinador), testes; nenhum serviço novo. Limite multipart (10 MB por requisição) permanece.
- **Contrato de API:** endpoint novo (aditivo).
- **Frontend:** nenhum nesta change.
- **Multi-tenancy:** `@RequireTenant(resourceParamIndex = 0)` — o `atletaId` precisa ser o **primeiro
  parâmetro** do método do controller (o `MultipartFile` vem depois). Atleta de outro tenant é 403
  (aspecto); o persister ainda filtra por `(id, tenantId)` como segunda barreira (404).
- **Custo de IA:** nenhum. `WorkoutAnalysisListener` só analisa treino com RPE e com menos de 30
  dias (`app.workout-analysis.max-idade-dias`); `.fit` não traz RPE.
- **Carga:** cada treino novo recalcula a carga diária da data dele até hoje
  (`IngestaoTreinoRealizadoService.registrar`). **O reenvio de arquivo já importado também recalcula**
  (o ramo de duplicata chama `recalcularDesde`): é idempotente, não é barato. O recálculo já toma
  lock transacional por atleta (`TsbServiceImpl`); o envio sequencial serve para não acumular
  contenção e custo, não para evitar corrida no upsert. Custo medido no IT da task 1.3 (novo e
  reenvio).
- **Teto de materialização:** sem métricas diárias anteriores, o recálculo materializa no máximo
  `MAX_DIAS_NOVOS_POR_EXECUCAO` dias (400) por execução (`TsbRecalculoTransacional`); o restante fica
  para o job. Um `.fit` com mais de ~400 dias responde 201, mas a carga só chega a hoje após uma ou mais
  execuções do job (cada execução materializa até 400 dias; 1.000 dias sem métricas pedem várias). **Aceito:** a janela útil é ~12 semanas (premissa abaixo); arquivo mais antigo que
  isso vale pelo registro do treino, não pela calibração imediata de CTL/ATL.

## Critérios de aceite

- **CA1 — Importa um `.fit`.** Given atleta do tenant do treinador, When o treinador envia um
  `.fit` válido, Then 201 com o treino realizado (etapas e métricas do arquivo) vinculado ao
  atleta do path, e a carga diária do atleta é recalculada.
- **CA2 — Idempotência.** Given `.fit` já importado, When o treinador envia o mesmo arquivo, Then
  200 com o mesmo treino e nenhuma linha nova (o recálculo de carga roda de novo, sem alterar o
  resultado).
- **CA3 — Arquivo inválido.** Given arquivo que não é `.fit` válido, When enviado, Then 422 e nenhum
  treino criado.
- **CA4 — Isolamento de tenant.** Given atleta de outro tenant, When o treinador envia, Then 403 e
  nada é gravado. Coberto por IT HTTP com o aspecto `@RequireTenant` ativo (não só `@WebMvcTest`).
- **CA5 — Papel.** Given usuário `ATLETA`, When chama o endpoint do treinador, Then 403.
- **CA7 — Sem custo de IA.** Given importação de histórico, When os treinos são registrados, Then
  nenhuma chamada de LLM é feita (treino sem RPE e/ou com mais de 30 dias não é elegível).
  Verificação: fixture de `.fit` com mais de 30 dias e sem RPE; nenhuma interação com o roteador de
  modelo e nenhuma `AnaliseWorkout` criada.
- **CA8 — Dedup por `externalId` (premissa, não verificada contra a ingestão real).** Given treino
  importado por `.fit`, When `registrar` receber outro treino com o mesmo `externalId`
  (`<atletaId>-<serial>-<start>`) e `fonte_dados = GARMIN`, Then não duplica. O teste fixa o lado do
  dado; que a ingestão direta (`garmin-activity-ingestion`, ainda não implementada) vá produzir esse
  mesmo `externalId` é **dependência dessa change**, e deve ser conferida quando ela for
  implementada.

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

- **Premissa (conferida na web em 2026-11-01, fontes de terceiros e fórum Garmin):** o treinador
  consegue obter os `.fit` do atleta, mas **não pela exportação em lote da lista de atividades, que
  é só CSV**. Caminhos: (a) "Exportar original" por atividade, um clique por treino; (b) pedido de
  dados da conta (Gerenciamento de conta), com `.fit` em `.zip` aninhado em
  `DI_CONNECT/DI-Connect-Uploaded-Files/` e prazo de 24–48 h até dias; (c) script comunitário
  `garmin-connect-export`, **não oficial**, rodado localmente com a credencial do atleta. Quem recebe
  o `.zip` extrai; zip no servidor é non-goal. Se extrair atrapalhar no pilot, vira change própria
  (por exemplo, extração no navegador).
- **Decidido — não integrar o `garmin-connect-export` ao produto:** exigiria guardar ou transitar a
  senha do Garmin do atleta, depende de raspagem do login (quebra com mudanças de SSO/MFA) e
  provavelmente viola os termos do Garmin. O caminho oficial para o fluxo contínuo é
  `garmin-activity-ingestion` (OAuth). O script serve só como ferramenta de pilot, fora do produto:
  o atleta ou o treinador gera a pasta de `.fit` localmente e o loop de `curl` (`tasks.md`, Notas)
  envia. Não conferido: se o script ainda funciona com o login atual do Garmin.
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
| Corrida: dois treinadores importam para o mesmo atleta ao mesmo tempo | Dedup por UNIQUE no banco impede a duplicata. Sob corrida real a transação perdedora é abortada e a exceção propaga (`TreinoDedupHelper`): o perdedor recebe erro (o helper relança a `ConstraintViolationException` crua do Hibernate, que hoje cai no handler genérico: **500**; 409 só se chegar como `DataIntegrityViolationException`; o status não é prometido) e **reenviar** devolve o registro existente (CA2). Não há recuperação automática |
| Atleta ou treinador entrega arquivo de outra pessoa | Risco aceito no pilot (acima) |

## Referências

- `garmin-activity-ingestion` (non-goal de histórico; formato do `externalId`)
- `ingestao-treino-realizado` (seam `registrar`, D5 guard de custo)
- Upload do atleta: `FitUploadController` (`/me/treinos/importar-fit`)
- `add-fit-historico-lote-front` (tela de envio em lote, rascunho)
