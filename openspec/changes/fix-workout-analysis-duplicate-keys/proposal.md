# Proposal: fix-workout-analysis-duplicate-keys

**Tamanho:** XS · **Trilha:** Fast (backend-only, sem migration, sem mudança de contrato de API —
correção isolada no parse da resposta do LLM e uma entrada de preço)

## Status

- Proposta inicial (2026-09-27), a partir de erro no log local reportado pelo founder.

## Why

A análise pós-treino (`WorkoutAnalysisListener`, rota `COMPLEX` → `claude-sonnet-4-6`) falha e fica
`FAILED` quando o modelo devolve JSON com **chave repetida**. Log de 2026-09-27 20:17:56, treino
`c5b6be16-…`: `primary_cause` e `execution_score` vieram duas vezes cada, e o Jackson recusou:

```
InvalidDefinitionException: No fallback setter/field defined for creator property
'execution_score' (of AnaliseWorkoutRawDto)
```

`AnaliseWorkoutRawDto` é um record: o Jackson preenche tudo pelo construtor e, ao encontrar a mesma
chave de novo, não tem setter nem campo mutável onde gravar o segundo valor. A chamada usa
`.entity(...)` do Spring AI, que com a Anthropic só acrescenta instruções de formato ao prompt — nada
impede o modelo de repetir campos, e a temperatura 0.7 da rota aumenta a chance.

Não é caso isolado: o log de 2026-09-17 registra a mesma exceção 3 vezes. Para o treinador, cada
ocorrência é um treino sem análise — justamente o insumo que ele usa para revisar a semana.

Junto, um problema menor visto no mesmo log: o `CostTrackingAdvisor` avisa
`modelo 'gpt-4o-mini-2024-07-18' sem preço em llm-pricing.yml`. A OpenAI devolve o nome do snapshot
datado na resposta, e o registro só conhece `gpt-4o-mini` — o custo dessas chamadas (tradução, rota
`SIMPLE`) não é contabilizado.

## What Changes

- **Parse tolerante a chave repetida** na resposta da análise: obter o texto da resposta, ler com
  `ObjectMapper.readTree` (que por padrão mantém o **último** valor de cada chave) e converter com
  `treeToValue(..., AnaliseWorkoutRawDto.class)`. Remoção de cercas de markdown (```json) preservada,
  como o `BeanOutputConverter` já fazia.
- **Temperatura 0.2 na chamada da análise**, via opções por chamada no `WorkoutAnalysisListener`.
  A rota `COMPLEX` segue em 0.7 — o outro consumidor (`RaceProjectionNarrativeGenerator`) é texto
  narrativo e não muda. Ataca a causa (saída estruturada com temperatura alta), enquanto o parse
  tolerante segura o sintoma.
- **`llm-pricing.yml`**: entrada `gpt-4o-mini-2024-07-18` com os mesmos valores de `gpt-4o-mini` —
  mesmo padrão já usado para `claude-haiku-4-5-20251001`.

## Impact

- `WorkoutAnalysisListener` (ponto de conversão) e, se fizer sentido, um helper pequeno de parse.
- `src/main/resources/llm-pricing.yml`.
- **Migration:** nenhuma. **Contrato de API:** nenhum. **Front:** nenhum.

## Critérios de aceite

- **CA1 — Chave repetida não derruba a análise**
  - **Given** uma resposta do LLM com `execution_score` e `primary_cause` repetidos
  - **When** a análise é processada
  - **Then** a análise termina `COMPLETED`, usando o último valor de cada chave

- **CA2 — Resposta normal continua igual**
  - **Given** uma resposta sem chaves repetidas (inclusive envolta em ```json)
  - **When** a análise é processada
  - **Then** o resultado é idêntico ao de hoje

- **CA3 — JSON inválido continua falhando como antes**
  - **Given** uma resposta que não é JSON
  - **When** a análise é processada
  - **Then** a análise fica `FAILED`, como hoje

- **CA5 — Análise chamada com temperatura baixa**
  - **Given** um treino elegível para análise
  - **When** o listener chama o LLM
  - **Then** a chamada usa a rota `COMPLEX` com temperatura 0.2, sem alterar a configuração da rota

- **CA4 — Custo do snapshot datado registrado**
  - **Given** uma resposta com modelo `gpt-4o-mini-2024-07-18`
  - **When** o `CostTrackingAdvisor` processa o uso
  - **Then** o custo é registrado, sem WARN de modelo sem preço

## Métrica de sucesso

- Zero ocorrências de `No fallback setter/field defined for creator property` no log após o deploy.
- Zero WARN `sem preço` para `gpt-4o-mini-2024-07-18`.

## Open Questions & Assumptions

1. **Último valor vence** — nas ocorrências observadas as duplicatas tinham o mesmo valor, então a
   escolha não altera o resultado. Se um dia divergirem, fica o último, que é o comportamento padrão
   do Jackson e reflete a "conclusão final" do modelo.

## Riscos e mitigações

- **Mascarar resposta degradada** (BAIXO): aceitar duplicata poderia esconder uma saída malformada.
  Mitigação: registrar `WARN` quando a resposta tiver chave repetida, para manter a frequência
  observável.

## Non-goals

- Migrar a rota para saída estruturada nativa da Anthropic (mais robusto, mudança maior).
- Mudar o modelo da rota `COMPLEX` ou a temperatura configurada da rota (a 0.2 vale só para esta chamada).
- Aplicar o parse tolerante em outras chamadas `.entity(...)` do backend.
- Resolver automaticamente sufixos de data no `LlmPricingRegistry`.

## Referências

- Log: `apps/menthoros-backend/logs/menthoros.log:173-204` (2026-09-27 20:17:56).
- Código: `WorkoutAnalysisListener.java:122-127`, `dto/llm/AnaliseWorkoutRawDto.java`,
  `ai/cost/CostTrackingAdvisor.java:185`.
