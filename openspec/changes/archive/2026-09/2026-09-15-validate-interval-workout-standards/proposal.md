> **SUPERSEDED por `semantic-session-schema` (F4), arquivada em 2026-09-15.** A proposta pedia
> validação rigorosa + padronização automática de treinos intervalados propostos pela LLM — ideia
> superada por dois caminhos que já existem no código: (1) `PlanoLlmValidator`/`NormalizacaoDeTreino`
> (F2.5/F2, `pipeline-normalizacao-treino`/`refactor-iaservice-decomposition`) já validam/corrigem
> treinos intervalados por família, com gates estruturais e correção aritmética; (2)
> `semantic-session-schema` (F4) tira da LLM o cálculo de pace/FC/distância/duração — ela decide só
> a estrutura qualitativa (blocos por papel/repetições/zona), o Java resolve os números. Com isso,
> a classe de erro que esta proposta original mirava ("LLM propõe treino fora do padrão") deixa de
> existir por construção no schema v2, em vez de precisar de validação pós-hoc mais rigorosa.
> 0/79 tasks implementadas sob este desenho — nunca chegou a ser codificada.
>
> ---

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
