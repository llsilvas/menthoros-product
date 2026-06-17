## Context

`IaServiceImpl.validarENormalizarPlanoGerado(PlanoSemanalLlmDto, atletaId)` roda após o `.entity(PlanoSemanalLlmDto.class)` e faz duas coisas misturadas, por tipo de treino:

- **Normaliza/repara** (não lança): expande etapas agregadas de FARTLEK, reconcilia distância↔etapas, corrige `ritmoAlvo` contra teto/piso (`PaceValidator`), recalcula duração pela soma das etapas.
- **Valida e lança `LLMException`**: `validarTreinoLongo`, `validarTreinoRegenerativo` (exige 3 etapas), `validarTreinoContinuo`, `validarTreinoTempoRun`, `validarRepeticoes`, `validarTrianguloPaceDuracaoDistancia`, `validarDistribuicaoCargaSemanal`.

A primeira exceção aborta o `stream` inteiro → `geraPlanoSemanalAvancado` embrulha em `LLMException` → `GlobalExceptionHandler` → 503. Não há retry. A temperatura já foi baixada para 0.2 em `debito-tecnico-camada-ia`, reduzindo (mas não eliminando) a frequência.

## Goals

- Um treino estruturalmente inválido **não** deve derrubar o plano inteiro com 503 na primeira ocorrência.
- Recuperar de forma barata quando possível (reparo determinístico) e com retry limitado quando não.
- Medir a frequência real de violações por tipo, para feedback ao prompt/skills.

## Non-Goals

- Alterar as **regras** de validação (REGENERATIVO continua com 3 etapas; triângulo pace×dist×dur continua válido).
- Reescrever o prompt de geração (`plano-treino-otimizado-claude.txt`) — escopo da migração para skills.
- Mudar modelo/temperatura (já tratado em `debito-tecnico-camada-ia`).

## Decisions (a explorar na implementação)

### D1 — Retry com feedback no nível da geração
Envolver a chamada `prompt().entity()` + `validarENormalizarPlanoGerado` num loop com teto (proposta: 1 tentativa inicial + até 2 retries). A cada falha de validação, anexar ao prompt uma instrução corretiva derivada da `LLMException` (ex.: "A tentativa anterior gerou REGENERATIVO com 2 etapas; gere exatamente 3: aquecimento, principal, desaquecimento."). Backoff curto. Vantagem: cobre qualquer violação. Custo: latência (~80s/tentativa) — daí o teto baixo e a preferência por reparo.

### D2 — Reparo determinístico antes de falhar
Para violações triviais e não-ambíguas, sintetizar a correção a partir de regras de domínio em vez de lançar:
- `REGENERATIVO` com 2 etapas (sem desaquecimento) → inserir etapa de desaquecimento padrão (zona/pace/duração derivados das regras já existentes).
- `validarRepeticoes` ≠ 1 → normalizar para 1 (se a semântica permitir).

Só reparar o que é **inequívoco**; o resto cai no D1 (retry). O reparo deve ser **logado e contado** (telemetria), nunca silencioso.

### D3 — Tightening do JSON Schema (parcial)
`defaultJsonSchemaOptions()` já usa `strict:true`. Avaliar adicionar `minItems`/`maxItems` na lista de etapas. Limitação: a contagem exigida é **condicional ao tipo de treino**, o que JSON Schema expressa mal (exigiria `if/then` por tipo). Provavelmente só ajuda como rede genérica (ex.: `minItems: 1`), não substitui D1/D2.

### D4 — Onde colocar a lógica (coesão)
`IaServiceImpl` já tem ~1500 linhas. Preferir extrair a orquestração de retry+reparo para um colaborador dedicado (ex.: `services/helper/PlanoGenerationRetryPolicy` ou similar), mantendo o `IaServiceImpl` como orquestrador fino. Coordenar com `refactor-iaservice-decomposition`.

### Recomendação inicial
Híbrido **D2 + D1**: reparar o que é seguro (D2), e para o restante, retry com feedback limitado a 2 tentativas (D1). D3 como rede de baixo custo se couber. Telemetria (Micrometer) em todos os caminhos. Decisão final de teto/quais reparos fica para a fase de implementação, validada contra o golden-master da `add-plan-generation-eval-harness`.

## Open questions

- Teto de retries ideal (latência vs. taxa de sucesso) — medir com a telemetria.
- Quais validações são seguramente reparáveis vs. exigem retry — inventariar uma a uma.
- O retry deve reusar o mesmo prompt + feedback, ou um prompt de "correção" dedicado?
