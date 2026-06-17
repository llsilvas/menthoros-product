**Tamanho · Trilha:** M · Full

## Why

A validação pós-geração (`IaServiceImpl.validarENormalizarPlanoGerado`) **rejeita o plano inteiro com `LLMException`/503 na primeira violação estrutural** ocasional da LLM — sem retry e sem reparo. Como a saída é não-determinística, isso ocorre de forma intermitente.

Caso real (2026-06-17, atleta `a43c8cba…`): a LLM gerou um treino `REGENERATIVO` com **2 etapas** em vez de 3 → `validarTreinoRegenerativo` lançou → plano descartado → o usuário esperou **~83s** e recebeu **503**. Toda a geração (e o custo de gpt-4o) foi desperdiçada por um único treino malformado. A `debito-tecnico-camada-ia` já reduziu a frequência (temperatura 0.2), mas não elimina.

Esta change é **independente** do seam `Constraint` (de `introduce-plan-constraints`) e do strangler (de `migrate-plan-prompt-to-skills`): trata **validade estrutural de etapas**, não regras de coaching. Por isso pode sequenciar livremente e entregar o fim do 503 sem esperar o strangler.

## What Changes

Tornar a geração resiliente a violações estruturais ocasionais — **reparo-first + 1 retry**:

1. **Dedup dos validadores:** os 4 validadores "3 etapas" idênticos (`REGENERATIVO`/`LONGO`/`CONTINUO`/`TEMPO_RUN`) viram um `validarEstrutura3Etapas(tipo)` + ponto único de reparo.
2. **Reparo determinístico** (seguro e inequívoco): aquecimento/desaquecimento faltante → sintetizar etapa formulaica (zona fácil); ordem trocada com os 3 tipos presentes → reordenar; `repeticoes != 1` → expandir (reusar `expandirEtapasAgregadas`). Reparo **logado e contado** (telemetria), nunca silencioso.
3. **Retry único com feedback:** quando o reparo não se aplica (ex.: falta a etapa PRINCIPAL, regras de intervalado), re-chamar o LLM **1 vez** injetando o motivo da rejeição anterior. Teto = 1 para não criar esperas de minutos (~80s/tentativa).
4. **Falha clara só no fim:** esgotados reparo + retry, erro de domínio claro (mapeado no `GlobalExceptionHandler`).

As **regras** de validação não mudam.

## Capabilities

### Modified Capabilities

- `plan-generation`: geração resiliente — repara violações estruturais triviais e faz 1 retry com feedback antes de falhar; um único treino malformado deixa de derrubar o plano inteiro.

## Impact

**Backend (`apps/menthoros-backend`):**
- `IaServiceImpl.validarENormalizarPlanoGerado` / `geraPlanoSemanalAvancado` — loop reparo+retry.
- Colaborador dedicado para reparo+retry (não inflar o `IaServiceImpl`, ~1500 linhas — coordenar com `refactor-iaservice-decomposition`).
- Dedup dos 4 validadores "3 etapas".
- Telemetria Micrometer (alinhado a `add-external-call-resilience`).

**Inventário (o que HOJE faz hard-fail vs. o que já é resiliente):**
- **Hard-fail:** 4 validadores "3 etapas" (idênticos) + `validarRepeticoes` + `validarTreinoIntervalado`.
- **Já WARN-only (sem ação):** `validarTrianguloPaceDuracaoDistancia`, `validarDistribuicaoCargaSemanal`, limites "mínimo recomendado".

**Sem impacto em:** API/endpoints (mesmo contrato), regras de validação.

## Riscos e mitigações

- **Latência do retry** (Médio): ~80s/tentativa → teto = 1; preferir reparo determinístico.
- **Reparo mascarar problema de prompt** (Médio): telemetria mede a frequência; reparo nunca silencioso.
- **Falta-de-PRINCIPAL não é reparável** (sintetizar o estímulo é perigoso) → sempre retry, nunca reparo.

## Relação com outras changes

- **`debito-tecnico-camada-ia`** (já mergeada): reduziu a frequência via temperatura 0.2.
- **`introduce-plan-constraints`** (irmã): `Constraint`/checker tratam aderência de *coaching*; aqui é validade *estrutural*. Distintas, ambas pós-geração — coordenar janela do `IaServiceImpl`.
- **`refactor-iaservice-decomposition`**: extrair o validador/normalizador como colaborador durante esta change.
