## ADDED Requirements

### Requirement: Upload de .fit
O sistema SHALL aceitar o upload de arquivos `.fit` pelo atleta autenticado e importá-los como
treino realizado, com dados ricos (FC, pace, laps) de qualquer dispositivo que exporte o formato
FIT (Garmin, Suunto, Coros, Polar, Wahoo).

#### Scenario: Upload bem-sucedido
- **WHEN** um `ATLETA` envia um arquivo `.fit` válido via `POST /api/v1/treinos/importar-fit`
- **THEN** o sistema SHALL parsear o `.fit` usando o SDK oficial da Garmin (`com.garmin.fit`),
  extrair dados de sessão (distância, duração, FC, TSS, esporte) e laps/km individuais quando
  disponíveis, persistir como `TreinoRealizado` + `EtapaRealizada[]` com `externalId` único por
  atleta, e retornar 201 com o preview completo dos dados

#### Scenario: Re-upload do mesmo .fit
- **WHEN** o atleta envia um `.fit` já importado anteriormente (mesmo `externalId`)
- **THEN** o sistema SHALL retornar 200 com o treino já existente, sem criar um novo registro

#### Scenario: Arquivo inválido
- **WHEN** o atleta envia um arquivo que não é `.fit` válido (`.txt`, `.jpg`, `.fit` corrompido)
- **THEN** o sistema SHALL retornar 422 com uma mensagem de erro descritiva

#### Scenario: Dados parciais (sem GPS)
- **WHEN** o `.fit` é de um treino de esteira (sem coordenadas GPS)
- **THEN** o sistema SHALL persistir com FC, duração e distância disponíveis — SHALL NOT falhar

#### Scenario: Esporte não-corrida (ciclismo, natação)
- **WHEN** o `.fit` enviado é de um esporte diferente de corrida
- **THEN** o sistema SHALL persistir o treino com `tipoTreino = CONTINUO` e o esporte real
  anotado em `descricao` — SHALL NOT fabricar uma classificação de propósito de treino
  (`INTERVALADO`/`TIRO`/etc.) que o dado não sustenta

### Requirement: Frontend de upload
O sistema SHALL exibir, na página de registro de treino do atleta, uma zona de drag-and-drop
para `.fit` com o formulário manual visível logo abaixo como fallback sempre disponível.

#### Scenario: Upload bem-sucedido
- **WHEN** o upload é concluído
- **THEN** o sistema SHALL exibir um card com preview dos dados extraídos e a opção de importar
  outro arquivo ou voltar para a Home

### Requirement: Dedup e idempotência
O sistema SHALL tratar o upload repetido do mesmo `.fit` como uma operação idempotente.

#### Scenario: Colisão de externalId
- **WHEN** um `.fit` é enviado e o sistema detecta colisão de `externalId` para o mesmo atleta
- **THEN** o sistema SHALL retornar o registro existente em vez de duplicar

## Status: proposto — aguardando implementação (Sprint 10, antes de add-llm-tool-use)
