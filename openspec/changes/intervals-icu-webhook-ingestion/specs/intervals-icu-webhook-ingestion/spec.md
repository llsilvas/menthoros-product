# Spec delta: intervals-icu-webhook-ingestion

> Capability nova: ingestão em **tempo real** de atividades do intervals.icu por webhook do
> provedor, complementando `intervals-icu-activity-sync` (pull a cada 2h, que passa a ser
> fallback/reconciliação). Formato: requirements com cenários BDD verificáveis.

## Requirement: Endpoint de webhook autenticado pelo secret do provedor

O sistema DEVE expor uma rota pública para o provedor entregar lotes de eventos, autenticada pelo
secret que vem no envelope do payload (o provedor não envia header de autorização — gate 0.2), e
responder antes de processar. Um lote com N eventos vira N processamentos independentes.

#### Scenario: Lote autêntico é aceito e cada evento processado fora do request
- **Given** secret do envelope igual ao configurado e um lote com N eventos
- **When** o provedor entrega o payload
- **Then** a resposta é `200` imediata, o secret foi validado **uma** vez
- **And** cada um dos N eventos é enfileirado individualmente, em thread própria

#### Scenario: Corpo acima do limite é rejeitado antes do parse
- **Given** `Content-Length` acima de 64 KB
- **When** chega à rota
- **Then** a resposta é `413`, o corpo não é desserializado e nada é processado

#### Scenario: Secret do envelope diferente é rejeitado
- **Given** secret do corpo ausente ou diferente do configurado
- **When** chega à rota
- **Then** `401`, nada processado, secret fora do log

#### Scenario: Configuração incompleta impede o boot
- **Given** `webhook.secret` em branco
- **When** a aplicação sobe
- **Then** o contexto falha — a rota pública nunca fica no ar sem o secret

## Requirement: Ingestão por evento de atividade

Os eventos `ACTIVITY_UPLOADED` (gatilho principal — dispara depois da análise do provedor, gate
0.2) e `ACTIVITY_ANALYZED` (re-análise, idempotente) DEVEM acionar o mesmo pipeline de ingestão do
import manual e do scheduler, para cada integração ativa e não pausada do atleta.

#### Scenario: Upload vira treino com etapas, sem ação do coach
- **Given** atleta com integração intervals.icu ativa e não pausada
- **And** `ACTIVITY_UPLOADED` para uma atividade de corrida ainda não importada
- **When** o evento é processado
- **Then** o `TreinoRealizado` (`fonteDados=INTERVALS_ICU`) existe, com etapas, reconciliado com o
  planejado

#### Scenario: Re-análise não duplica nem custa
- **Given** treino já importado **com etapas**
- **When** um `ACTIVITY_ANALYZED` chega para a mesma atividade
- **Then** não há segundo `TreinoRealizado` e nenhuma chamada ao provedor é feita

#### Scenario: Análise completa um treino que entrou sem etapas
- **Given** treino importado **sem etapas** (upload que disparou antes da análise)
- **When** um `ACTIVITY_ANALYZED` chega para essa atividade
- **Then** as etapas passam a existir (backfill por atividade, uma chamada ao provedor) e não há
  segundo `TreinoRealizado`

#### Scenario: Um atleta em dois tenants
- **Given** o mesmo id de atleta do provedor com integração ativa em dois tenants
- **When** um evento chega
- **Then** o treino é importado nos dois, cada um com o contexto do próprio tenant, limpo ao final

#### Scenario: Atleta desconhecido, tipo não suportado, integração pausada
- **Given** evento de atleta sem integração ativa, **ou** de tipo fora de
  {`ACTIVITY_UPLOADED`, `ACTIVITY_ANALYZED`} (ex.: o `CALENDAR_UPDATED` observado no gate 0.2),
  **ou** de integração inativa/pausada no momento do processamento
- **When** o evento é processado
- **Then** é ignorado com log, sem chamada ao provedor, e a resposta ao provedor já foi `200`

## Requirement: Idempotência por evento

Uma entrega repetida do mesmo evento NÃO DEVE gerar reprocessamento nem chamada ao provedor.

#### Scenario: Mesmo evento entregue duas vezes
- **Given** um evento já registrado como processado
- **When** a mesma entrega chega de novo
- **Then** o processamento não roda e nenhuma chamada ao provedor é feita

#### Scenario: Falha em qualquer integração libera o evento para nova tentativa
- **Given** um evento cujo processamento falhou em **ao menos uma** das integrações do atleta
  (inclusive no caso de dois tenants com falha em só um)
- **When** a mesma entrega chega de novo
- **Then** o processamento roda de novo — o registro foi removido; a integração que já tinha
  sucedido é absorvida pelo dedup do pipeline, sem chamada ao provedor

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
