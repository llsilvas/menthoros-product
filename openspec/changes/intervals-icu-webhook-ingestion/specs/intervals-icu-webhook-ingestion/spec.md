# Spec delta: intervals-icu-webhook-ingestion

> Capability nova: ingestão em **tempo real** de atividades do intervals.icu por webhook do
> provedor, complementando `intervals-icu-activity-sync` (pull a cada 2h, que passa a ser
> fallback/reconciliação). Formato: requirements com cenários BDD verificáveis.

## Requirement: Endpoint de webhook autenticado pelo provedor

O sistema DEVE expor uma rota pública para o provedor entregar eventos, aceitando somente
entregas que carreguem os dois segredos configurados, e responder antes de processar.

#### Scenario: Evento autêntico é aceito e processado fora do request
- **Given** header `Authorization` e secret do payload iguais aos configurados
- **When** o provedor entrega um evento
- **Then** a resposta é `200` imediata
- **And** o processamento acontece em thread própria, depois da resposta

#### Scenario: Header ausente ou diferente é rejeitado antes de ler o corpo
- **Given** um POST sem `Authorization`, ou com valor diferente do configurado
- **When** chega à rota
- **Then** a resposta é `401` sem corpo, o corpo da requisição não é consumido, e nada é processado
- **And** nem o valor recebido nem o esperado aparecem em log

#### Scenario: Corpo acima do limite é rejeitado
- **Given** header correto e `Content-Length` acima de 64 KB
- **When** chega à rota
- **Then** a resposta é `413` e nada é processado

#### Scenario: Secret do payload diferente é rejeitado
- **Given** header correto e secret do corpo ausente ou diferente
- **When** chega à rota
- **Then** `401`, nada processado, secret fora do log

#### Scenario: Configuração incompleta impede o boot
- **Given** `webhook.authorization` ou `webhook.secret` em branco
- **When** a aplicação sobe
- **Then** o contexto falha — a rota pública nunca fica no ar sem os dois segredos

## Requirement: Ingestão por evento de análise

O evento `ACTIVITY_ANALYZED` DEVE acionar o mesmo pipeline de ingestão do import manual e do
scheduler, para cada integração ativa e não pausada do atleta. `ACTIVITY_UPLOADED` não é
consumido: os laps só existem depois da análise e não há recuperação automática de laps.

#### Scenario: Análise vira treino com etapas, sem ação do coach
- **Given** atleta com integração intervals.icu ativa e não pausada
- **And** `ACTIVITY_ANALYZED` para uma atividade de corrida ainda não importada
- **When** o evento é processado
- **Then** o `TreinoRealizado` (`fonteDados=INTERVALS_ICU`) existe, com etapas, reconciliado com o
  planejado

#### Scenario: Re-análise não duplica nem custa
- **Given** treino já importado
- **When** um novo `ACTIVITY_ANALYZED` chega para a mesma atividade
- **Then** não há segundo `TreinoRealizado` e nenhuma chamada ao provedor é feita

#### Scenario: Um atleta em dois tenants
- **Given** o mesmo id de atleta do provedor com integração ativa em dois tenants
- **When** um evento chega
- **Then** o treino é importado nos dois, cada um com o contexto do próprio tenant, limpo ao final

#### Scenario: Atleta desconhecido, tipo não suportado, integração pausada
- **Given** evento de atleta sem integração ativa, **ou** de tipo diferente de
  `ACTIVITY_ANALYZED` (inclusive `ACTIVITY_UPLOADED`), **ou** de integração inativa/pausada no
  momento do processamento
- **When** o evento é processado
- **Then** é ignorado com log, sem chamada ao provedor, e a resposta ao provedor já foi `200`

## Requirement: Idempotência por evento

Uma entrega repetida do mesmo evento NÃO DEVE gerar reprocessamento nem chamada ao provedor.

#### Scenario: Mesmo evento entregue duas vezes
- **Given** um evento já registrado como processado
- **When** a mesma entrega chega de novo
- **Then** o processamento não roda e nenhuma chamada ao provedor é feita

#### Scenario: Falha libera o evento para nova tentativa
- **Given** um evento cujo processamento falhou em todas as integrações do atleta
- **When** a mesma entrega chega de novo
- **Then** o processamento roda de novo — o registro da primeira tentativa foi removido

## Requirement: Falha no processamento não volta ao provedor

Erros na ingestão DEVEM ficar visíveis na integração do atleta e ser absorvidos pelo scheduler,
nunca devolvidos como erro HTTP ao provedor.

#### Scenario: Ingestão falha depois do 200
- **Given** `importarAtividade` lança (rate limit, modalidade, credencial)
- **When** o evento é processado
- **Then** a falha fica em log e em `lastSyncError` (sanitizada, até 500 caracteres)
- **And** o próximo ciclo do scheduler reprocessa a janela

#### Scenario: Fila do executor cheia
- **Given** o executor assíncrono sem vaga
- **When** chega mais um evento
- **Then** a rota continua respondendo `200`, o evento é descartado com log e contador (nunca em
  silêncio), e a thread HTTP não bloqueia
