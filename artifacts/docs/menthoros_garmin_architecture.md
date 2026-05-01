# Integração Garmin + Menthoros

## Objetivo
Construir um sistema fechado de treino inteligente:
- Ingerir dados de treino e saúde
- Interpretar com IA
- Tomar decisões automáticas
- Enviar treinos ao dispositivo

## Problema Atual
Dispositivo → Dados → Dashboard → Treinador decide → Treino manual

## Proposta Menthoros
Dispositivo → Menthoros → IA → Decisão → Treino → Dispositivo

## Arquitetura Completa

### Visão Macro
Garmin → Ingestion → Queue → Normalization → IA → Decision → Delivery → Garmin

### Camadas

#### Ingestion Layer
- Webhook Garmin
- Validação
- Persistência raw

#### Event Layer
- Kafka/RabbitMQ
- Desacoplamento

#### Normalization
- Converter dados Garmin → modelo interno

#### Intelligence Layer
- Drift cardíaco
- Fadiga
- Assimetria

#### Decision Engine
- Ajuste de carga
- Sugestão de treino

#### Delivery
- Envio via Training API

#### Persistência
- PostgreSQL
- OpenSearch

## Fluxo End-to-End
1. Treino
2. Sync Garmin
3. Webhook
4. Ingestão
5. Fila
6. Normalização
7. IA
8. Decisão
9. Novo treino
10. Envio

## MVP

### Objetivo
Validar valor da interpretação

### Escopo
- Sem Garmin inicialmente
- Strava ou upload manual

### Pipeline
Upload → Processamento → Análise → Insight

### Intelligence MVP
- FC média
- Drift cardíaco
- Classificação esforço

### Output
Insight + ação recomendada

### Arquitetura MVP
API → Processor → Rules → Output

### Stack
- Spring Boot
- PostgreSQL
- OpenSearch (opcional)

## Evolução
1. MVP
2. Garmin Read
3. IA avançada
4. Loop fechado

## Checklist
- Modelo de dados
- Endpoint ingestão
- Algoritmo análise
- Validação com dados reais
- Preparação Garmin
