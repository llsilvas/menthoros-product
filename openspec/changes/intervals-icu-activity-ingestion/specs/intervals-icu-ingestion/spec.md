# Spec delta: intervals-icu-ingestion

> Capability nova: ingestão pontual de uma atividade realizada do intervals.icu como
> `TreinoRealizado`, disparada pelo coach (coach-in-the-loop), com dedup, pós-ingestão (TSS,
> TSB, evento) e reconciliação imediata com o treino planejado. Sentido inverso (pull) da
> capability `intervals-icu-push`. Formato: requirements com cenários BDD verificáveis.

## Requirement: Import manual de uma atividade específica pelo coach

O coach (TECNICO/ADMIN) DEVE poder importar uma atividade de corrida específica do intervals.icu
de um atleta do seu tenant que possua conexão ativa, informando o id da atividade; o resultado é
um `TreinoRealizado` com `fonteDados=INTERVALS_ICU`.

#### Scenario: Import bem-sucedido de atividade de corrida
- **Given** um atleta do tenant com conexão intervals.icu ativa
- **And** uma atividade de corrida existente no intervals.icu acessível pela API key do atleta
- **When** o coach envia `POST /api/v1/intervals-icu/atletas/{atletaId}/activities/{activityId}/import`
- **Then** um `TreinoRealizado` é criado com `fonteDados=INTERVALS_ICU`, `externalId={activityId}`
  e métricas mapeadas (data, duração, distância, pace, FC média/máx, RPE quando presente)
- **And** a resposta é 200 com o `TreinoRealizadoOutputDto`

#### Scenario: Atleta sem conexão ativa
- **Given** um atleta do tenant sem conexão intervals.icu ativa
- **When** o coach chama o endpoint de import
- **Then** a resposta é 409 e nada é persistido nem chamado externamente

#### Scenario: Atividade inexistente ou de outro atleta
- **Given** um id de atividade inexistente, ou pertencente a atleta diferente do conectado
- **When** o coach chama o endpoint de import
- **Then** a resposta é 404 e nada é persistido

#### Scenario: Modalidade não suportada
- **Given** uma atividade que não é corrida (ex.: Ride)
- **When** o coach chama o endpoint de import
- **Then** a resposta é 422 e nada é persistido

#### Scenario: Isolamento de tenant
- **Given** um `atletaId` que pertence a outro tenant
- **When** o coach chama o endpoint de import
- **Then** a resposta é 403/404 via validação de tenant
- **And** nenhuma chamada ao intervals.icu é feita

## Requirement: Idempotência por dedup de fonte externa

O import DEVE ser idempotente pela chave `(tenant, INTERVALS_ICU, externalId)`: re-imports não
criam duplicatas nem repetem side effects.

#### Scenario: Re-import da mesma atividade
- **Given** uma atividade já importada anteriormente
- **When** o coach chama o endpoint de import novamente com o mesmo id
- **Then** nenhum registro novo é criado
- **And** a resposta é 200 com o treino existente
- **And** nenhum `TreinoRegistradoEvent` é republicado e o TSB não é recalculado

#### Scenario: Corrida de concorrência no insert
- **Given** dois imports simultâneos da mesma atividade
- **When** ambos tentam persistir
- **Then** exatamente um registro existe ao final (constraint única) e ambos respondem 200

## Requirement: Pós-ingestão no padrão das demais fontes

No insert novo, o sistema DEVE calcular TSS quando houver insumos, atualizar o TSB do dia do
treino e publicar `TreinoRegistradoEvent` exatamente uma vez.

#### Scenario: Pós-ingestão completa
- **Given** um import que resulta em insert novo
- **When** a transação conclui
- **Then** `tssCalculado` está preenchido (insumos presentes), `atualizarTsbDia` foi chamado para
  a data do treino e `TreinoRegistradoEvent(treinoId, tenantId)` foi publicado uma única vez

## Requirement: Reconciliação imediata com o planejado

O treino importado DEVE sair da requisição com decisão de reconciliação gravada (mesma janela de
candidatos D-1..D+1, mesmos thresholds e auditoria do fluxo batch), sem depender do agendamento
do scheduler — a decisão de import inline e de batch deve ser idêntica para o mesmo caso.

#### Scenario: Planejado compatível na janela
- **Given** um `TreinoPlanejado` do atleta na janela D-1..D+1 da data da atividade com alta
  compatibilidade (score ≥ 0.80)
- **When** o import conclui
- **Then** o treino sai com `reconciliationStatus=VINCULADO_AUTOMATICO`, vínculo ao planejado,
  planejado marcado como realizado e auditoria `TreinoReconciliacao(RECONCILIACAO_AUTOMATICA)`

#### Scenario: Sem planejado compatível
- **Given** nenhum `TreinoPlanejado` do atleta na janela D-1..D+1 da atividade
- **When** o import conclui
- **Then** o treino sai com `reconciliationStatus=NAO_PLANEJADO` e aparece na fila de pendentes
  da reconciliação manual

#### Scenario: Scheduler mantém paridade após a extração
- **Given** o `CandidateSelector` e o `ReconciliationDecisionExecutor` extraídos e reutilizados
  pelo import inline e pelo scheduler
- **When** o scheduler roda seu ciclo normal sobre outros treinos pendentes
- **Then** as decisões produzidas são idênticas às que o import inline produziria para um caso
  equivalente, e as suítes de teste do scheduler permanecem verdes

## Requirement: Segurança da credencial e do canal

A API key do atleta NUNCA deve aparecer em logs ou respostas; erros do intervals.icu não devem
vazar corpo de resposta; a atividade buscada DEVE pertencer ao atleta da conexão.

#### Scenario: Divergência de athlete_id
- **Given** uma resposta do intervals.icu cujo `athlete_id` difere do `externalAthleteId` da conexão
- **When** o serviço valida a atividade
- **Then** o import falha com 404 e nada é persistido

#### Scenario: Credencial revogada não é confundida com atividade inexistente
- **Given** uma conexão cuja API key foi revogada no intervals.icu (o provedor responde 401/403)
- **When** o coach chama o endpoint de import
- **Then** o erro indica falha de autenticação/necessidade de reconexão, distinto de "atividade
  não encontrada"

#### Scenario: `externalAthleteId` duplicado entre atletas do mesmo tenant é bloqueado
- **Given** duas conexões `IntegracaoExterna` ativas do mesmo tenant apontando para a mesma
  `externalAthleteId` do intervals.icu
- **When** um import é tentado para qualquer um dos dois atletas
- **Then** a requisição falha com 409 antes de qualquer chamada externa
