# Spec: fit-upload-ingestion

**Mudança vs versão anterior:** o Menthoros passa a aceitar upload de arquivos .fit diretamente
pelo atleta, permitindo que dados ricos de treino (FC, pace real por km, GPS, cadência, elevação)
sejam importados de qualquer dispositivo que exporte FIT (Garmin, Suunto, Coros, Polar, Wahoo).
O pipeline de persistência e dedup reusa a infraestrutura já construída para o Strava.

## Requirement: Upload de .fit

- **WHEN** um `ATLETA` envia um arquivo .fit válido via `POST /api/v1/treinos/importar-fit`
- **THEN** o sistema:
  1. Parseia o .fit usando o SDK oficial da Garmin (`com.garmin.fit`)
  2. Extrai dados de sessão (distância, duração, FC, TSS, esporte)
  3. Extrai laps/km individuais quando disponíveis
  4. Persiste como `TreinoRealizado` + `EtapaRealizada[]` com `externalId` único
  5. Retorna 201 com preview completo dos dados

#### Scenario: Re-upload do mesmo .fit

- **WHEN** o atleta envia um .fit já importado anteriormente
- **THEN** o sistema retorna 200 com o treino já existente (dedup via `externalId` + `atletaId`)

#### Scenario: Arquivo inválido

- **WHEN** o atleta envia um arquivo que não é .fit válido (.txt, .jpg, .fit corrompido)
- **THEN** o sistema retorna 422 com mensagem de erro descritiva

#### Scenario: Dados parciais (sem GPS)

- **WHEN** o .fit é de um treino de esteira (sem coordenadas GPS)
- **THEN** o sistema persiste com FC, duração e distância disponíveis — não falha

## Requirement: Frontend de upload

- **WHEN** um `ATLETA` acessa a página de registro de treino
- **THEN** o sistema exibe uma zona de drag-and-drop para .fit no topo, com o formulário manual
  visível logo abaixo como fallback

#### Scenario: Upload bem-sucedido

- **WHEN** o upload é concluído
- **THEN** o sistema exibe um card com preview dos dados extraídos e a opção de importar outro
  ou voltar para a Home

## Requirement: Dedup e idempotência

- **WHEN** um .fit é enviado e o sistema detecta colisão de `externalId` + `atletaId`
- **THEN** o sistema retorna o registro existente em vez de duplicar (comportamento idempotente)

## Status: proposto — aguardando implementação (Sprint 10, antes de add-llm-tool-use)
