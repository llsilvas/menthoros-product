## Why

O LLM propõe treinos intervalados que frequentemente divergem do padrão esperado, resultando em treinos inválidos ou fora do padrão que precisam ser corrigidos manualmente. Sem validação rigorosa e padronização, treinos inconsistentes prejudicam a confiabilidade do sistema e aumentam carga de gerenciamento manual.

## What Changes

- Validação rigorosa de propostas de treinos intervalados antes de aceitar/aplicar
- Padronização automática de treinos propostos para conformidade com padrões esperados
- Identificação e tratamento de treinos fora de padrão (com opções: rejeitar, corrigir, alertar)
- Feedback claro ao LLM quando propõe treinos inválidos, melhorando futuras propostas

## Capabilities

### New Capabilities
- `interval-workout-validation`: Validar treinos intervalados contra regras de padrão (duração, intensidade, número de séries, etc.)
- `interval-workout-standardization`: Padronizar automaticamente treinos para conformidade com padrões
- `interval-workout-expert-validation`: Validação por especialista LLM contra regras biomecânicas (compatibilidade de estímulos, segurança, progressão)
- `non-standard-workout-handling`: Gerenciar e reportar treinos que violam padrões, com opções de ação

### Modified Capabilities
- `llm-workout-proposal`: Adicionar validação de padrão, feedback especialista, e loop iterativo com LLM gerador

## Impact

- Backend (apps/menthoros-backend): Novos validadores, regras de padrão, lógica de tratamento
- Frontend (apps/menthoros-front): UI para revisar/corrigir treinos fora de padrão
- Specs: Novas regras de validação, definições de padrão, contrato de resposta
