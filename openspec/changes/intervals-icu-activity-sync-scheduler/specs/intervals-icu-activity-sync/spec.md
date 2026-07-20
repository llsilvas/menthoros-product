# Spec delta: intervals-icu-activity-sync

> Capability nova: sync automático (scheduler, sem ação do coach) de atividades realizadas do
> intervals.icu como `TreinoRealizado`, complementando a capability `intervals-icu-ingestion`
> (import manual). Formato: requirements com cenários BDD verificáveis.

## Requirement: Ciclo automático de sincronização por atleta

O scheduler DEVE, a cada ciclo, buscar e ingerir automaticamente as atividades novas de cada atleta
com conexão intervals.icu ativa e não pausada, sem qualquer ação do coach.

#### Scenario: Sync automático feliz
- **Given** um atleta com conexão intervals.icu ativa (`ativo=true`, `autoSyncPausado=false`)
- **And** atividades novas no provedor desde a última sincronização
- **When** o ciclo do scheduler executa
- **Then** cada atividade nova é ingerida como `TreinoRealizado` (`fonteDados=INTERVALS_ICU`),
  reconciliada inline com o planejado — mesma lógica de `intervals-icu-ingestion`
- **And** nenhuma ação do coach é necessária

#### Scenario: Idempotência preservada entre ciclos
- **Given** uma atividade já importada (manual ou automaticamente) em um ciclo anterior
- **When** o scheduler processa novamente o mesmo `externalId` em uma janela sobreposta
- **Then** nenhum `TreinoRealizado` duplicado é criado

#### Scenario: Atleta com sync pausado é pulado
- **Given** um atleta com `autoSyncPausado=true` na própria integração intervals.icu, ou
  `ativo=false`
- **When** o ciclo do scheduler executa
- **Then** esse atleta é pulado, sem chamada ao provedor, com log estruturado

## Requirement: Cursor incremental e janela de lookback

O scheduler DEVE usar um cursor incremental por atleta para não reprocessar o histórico completo a
cada ciclo, com uma janela de fallback limitada no primeiro ciclo.

#### Scenario: Ciclos subsequentes usam cursor incremental
- **Given** um atleta já sincronizado em um ciclo anterior
- **When** o próximo ciclo executa
- **Then** a janela de busca (`oldest`) parte do momento do último ciclo bem-sucedido (menos um
  overlap de segurança configurável), não do início do histórico

#### Scenario: Cursor não avança quando o ciclo tem falha transitória
- **Given** um atleta cujo lote de atividades inclui uma falha transitória (rate limit do provedor,
  ou conflito de precondição cross-fonte com o Strava)
- **When** o scheduler processa o lote
- **Then** o cursor (`ultimaSincronizacao`) NÃO avança para esse atleta
- **And** o próximo ciclo reprocessa a mesma janela, sem perder atividades que ficaram sem
  tentativa

#### Scenario: Primeiro ciclo usa janela de fallback
- **Given** um atleta conectado ao intervals.icu sem nenhuma sincronização anterior
- **When** o primeiro ciclo do scheduler executa para esse atleta
- **Then** a janela de busca usa o fallback configurado (`intervals-icu.sync-days-back`, default 90
  dias) a partir de hoje

## Requirement: Isolamento de falhas, classificado por tipo

Uma falha PERMANENTE de uma atividade específica NÃO DEVE interromper o processamento das demais
atividades/atletas do mesmo ciclo. Uma falha TRANSITÓRIA (rate limit, conflito de estado) DEVE
abortar o restante do lote daquele atleta, para não insistir contra um provedor já sinalizando
limite ou contra uma colisão cross-fonte não resolvida.

#### Scenario: Falha permanente em uma atividade não aborta o lote do atleta
- **Given** um atleta com múltiplas atividades novas no ciclo
- **And** uma dessas atividades falha permanentemente ao ser importada (ex.: modalidade não
  suportada, atividade não encontrada)
- **When** o scheduler processa o lote desse atleta
- **Then** as demais atividades do mesmo atleta continuam sendo processadas normalmente
- **And** o cursor avança normalmente ao final (essa falha não é retryable)

#### Scenario: Falha transitória aborta o restante do lote do atleta
- **Given** um atleta com múltiplas atividades novas no ciclo
- **And** uma dessas atividades falha por rate limit do provedor, ou por conflito de precondição
  cross-fonte com o Strava
- **When** o scheduler processa o lote desse atleta
- **Then** as atividades seguintes do MESMO lote não são tentadas neste ciclo
- **And** o cursor não avança (ver Requirement "Cursor incremental")

#### Scenario: Falha em um atleta não aborta o ciclo
- **Given** múltiplos atletas com conexão ativa no mesmo ciclo
- **And** a chamada ao provedor falha para um desses atletas (rate limit, credencial revogada,
  timeout)
- **When** o ciclo do scheduler executa
- **Then** os demais atletas continuam sendo processados normalmente
- **And** o erro é registrado no atleta afetado (`lastSyncError`), visível para auditoria
- **And** o cursor desse atleta não avança

## Requirement: Consistência com desconexão concorrente

O scheduler NÃO DEVE reverter uma desconexão da integração feita pelo coach durante o
processamento do ciclo.

#### Scenario: Atleta desconecta durante o processamento do lote
- **Given** um atleta cuja integração intervals.icu está sendo processada pelo scheduler
- **And** o coach desconecta essa integração antes do scheduler terminar o lote
- **When** o scheduler tenta salvar o resultado do ciclo (cursor, contador, erro)
- **Then** a integração permanece desconectada — nada é sobrescrito ou reativado

## Requirement: Isolamento multi-tenant

O scheduler DEVE processar atletas de tenants diferentes sem vazamento de dados entre tenants.

#### Scenario: Ciclo com atletas de tenants diferentes
- **Given** atletas de tenants diferentes com integração intervals.icu ativa
- **When** o scheduler processa o ciclo completo
- **Then** cada atleta é processado com o contexto de tenant correto
- **And** nenhum dado de um tenant é acessível durante o processamento de outro
