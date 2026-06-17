**Tamanho · Trilha:** M · Full

## Why

A geração de plano semanal (`IaServiceImpl.geraPlanoSemanalAvancado` → `validarENormalizarPlanoGerado`) **rejeita o plano inteiro com `LLMException` (HTTP 503) na primeira violação estrutural** que a LLM produz — sem retry e sem reparo. Como a saída do LLM é não-determinística, isso acontece de forma intermitente.

Caso real observado (2026-06-17, atleta `a43c8cba…`): a LLM gerou um treino `REGENERATIVO` com **2 etapas** em vez das 3 obrigatórias (aquecimento/principal/desaquecimento). Resultado: `validarTreinoRegenerativo` lançou `LLMException` → o plano inteiro foi descartado → o usuário esperou **~83 segundos** e recebeu **503**. Toda a geração (e o custo do LLM) foi desperdiçada por um único treino malformado.

O problema é agravado por:
- **Resiliência inconsistente** no próprio `validarENormalizarPlanoGerado`: ele já **repara** alguns tipos (expansão de FARTLEK, reconciliação de distância/pace/duração) mas **lança exceção** em outros (estrutura de etapas de `REGENERATIVO`/`LONGO`/`CONTINUO`/`TEMPO_RUN`, `validarRepeticoes`, triângulo pace×distância×duração, distribuição de carga semanal). Não há critério claro de quando reparar vs. falhar.
- **Ausência de retry**: diferente do `WorkoutAnalysisListener` (que tinha retry), a geração de plano falha na primeira violação. Uma simples nova tentativa do LLM frequentemente produziria um plano válido.
- **Custo e UX**: cada tentativa custa ~80s + tokens de gpt-4o; um 503 após esse tempo é a pior experiência possível para o treinador.

> A change `debito-tecnico-camada-ia` já reduziu a frequência ao corrigir a temperatura de geração (0.7 → 0.2). Mas mesmo a 0.2 a LLM ocasionalmente viola regras estruturais — a resiliência precisa ser tratada na camada de validação.

## What Changes

Tornar a geração de plano **resiliente a violações estruturais ocasionais da LLM**, em vez de falhar com 503:

1. **Reparo determinístico (quando seguro):** para violações estruturais triviais e sem ambiguidade (ex.: `REGENERATIVO` sem etapa de desaquecimento), sintetizar a etapa faltante a partir de regras de domínio, em vez de rejeitar. Estende a lógica de normalização já existente.
2. **Retry com feedback (quando o reparo não é seguro):** quando a validação ainda falhar após o reparo, **re-chamar a LLM** um número limitado de vezes (ex.: 2), injetando no prompt o motivo da rejeição anterior ("o treino REGENERATIVO veio com 2 etapas; deve ter exatamente 3: aquecimento, principal, desaquecimento"). Backoff e teto de tentativas para limitar latência/custo.
3. **Falha clara só no fim:** se as tentativas se esgotarem, retornar um erro de domínio claro (mantendo o mapeamento atual no `GlobalExceptionHandler`), com log do motivo estrutural.
4. **Telemetria:** expor contadores (violações por tipo de treino, reparos aplicados, retries, falhas finais) via Micrometer para medir a taxa real e priorizar melhorias de prompt.

As **regras de validação não mudam** (REGENERATIVO continua exigindo 3 etapas). O que muda é o **comportamento de recuperação** diante de uma violação.

## Capabilities

### Modified Capabilities

- `plano-semanal-generation`: geração resiliente — repara violações estruturais triviais e faz retry com feedback antes de falhar; um único treino malformado deixa de derrubar o plano inteiro.

## Impact

**Código afetado (provável):**
- `IaServiceImpl.validarENormalizarPlanoGerado` / `geraPlanoSemanalAvancado` / `gerarPlanoSemanal` — loop de retry e ponto de reparo.
- Novo colaborador para encapsular retry+reparo (evitar inflar ainda mais o `IaServiceImpl`, já ~1500 linhas — coordenar com `refactor-iaservice-decomposition`).
- Validadores estruturais (`validarTreinoRegenerativo` etc.) podem ganhar uma variante "reparar ou sinalizar" em vez de só lançar.
- Métricas Micrometer (alinhado a `add-external-call-resilience`).

**Sem impacto em API:** mesmo endpoint `POST /api/v1/planos/atletas/{id}/gerar`; muda só o comportamento interno de recuperação.

## Riscos e mitigações

- **Latência do retry** (Médio): cada retry custa ~80s. Mitigar com teto baixo (1–2 retries) e preferir reparo determinístico quando possível.
- **Reparo mascarar problema real de prompt** (Médio): se a LLM erra muito, o reparo esconde a causa. Mitigar com telemetria — o reparo é registrado e medido, não silencioso.
- **Acoplamento com a thread de IA** (Baixo): o `PlanQualityChecker` (de `migrate-plan-prompt-to-skills`) cuida de aderência de coaching; esta change cuida de validade estrutural. São distintos mas tocam a mesma validação — sequenciar para não conflitar. O golden-master (`add-plan-generation-eval-harness`) protege contra regressão de prompt durante o trabalho.

## Relação com outras changes

- **`debito-tecnico-camada-ia`** (pré-requisito de contexto): já corrigiu a temperatura (0.2) que agravava a frequência.
- **`migrate-plan-prompt-to-skills`**: o `PlanQualityChecker` é complementar (qualidade de coaching ≠ validade estrutural). Coordenar a janela de edição do `IaServiceImpl`.
- **`refactor-iaservice-decomposition`**: oportunidade de extrair o validador/normalizador como colaborador testável durante esta change.
