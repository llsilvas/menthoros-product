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

## Critérios de aceite

- **CA1 — Reparo determinístico** — *Given* um treino com violação trivial/inequívoca (REGENERATIVO sem desaquecimento, etapas fora de ordem, `repeticoes != 1`), *When* a validação roda, *Then* o sistema repara (sintetiza/reordena/expande), **conta na telemetria**, e o plano retorna com sucesso (sem 503). *(fixtures offline)*
- **CA2 — Retry único com feedback** — *Given* uma violação não-reparável (falta PRINCIPAL, regras de intervalado), *When* a 1ª geração falha, *Then* o LLM é re-chamado **no máx. 1 vez** com o motivo da rejeição; plano válido → sucesso. *(teste com LLM mockado)*
- **CA3 — Falha final clara** — *Given* reparo não-aplicável + retry também falho, *Then* erro de domínio (mapeado no `GlobalExceptionHandler`) com **mensagem orientada ao treinador** (não o detalhe estrutural); log/telemetria registram o motivo estrutural + falha final.
- **CA4 — Regras preservadas** — um plano válido satisfaz exatamente as mesmas regras estruturais de antes; nenhuma regra relaxada.
- **CA5 — Telemetria** — contadores Micrometer de violações por tipo, reparos aplicados, retries e falhas finais, no registry existente.
- **CA6 — Sem mudança de contrato** — `./mvnw clean test` verde; sem mudança em endpoints/DTOs de API/entidades/migrations; golden-master sem regressão não-intencional.

## Métrica de sucesso

**KPI de produto (a acompanhar pós-deploy):** **taxa de sucesso de geração** = planos entregues ÷ tentativas de geração — deve subir (fim do 503 intermitente). Proxy via contadores: `(gerações − falhas_finais) / gerações`.
**Métrica de entrega (verificável agora):** fixtures reproduzem o cenário "REGENERATIVO 2 etapas" e o sistema recupera (reparo) em vez de lançar; cenário não-reparável recupera via retry mockado.

## Open Questions & Assumptions

- **A1 (resolvida, common-ground):** o reparo é **sinalizado por telemetria/log** nesta change; **sem campo de auditoria no contrato do plano** (não há tela de revisão de etapas consumindo isso ainda). Flag visual ao treinador = follow-up quando a tela existir.
- **A2 (resolvida, common-ground):** na falha final, **erro de domínio com mensagem ao treinador** (não retorna plano quebrado). Detalhe estrutural só em log/telemetria.
- **Q1:** threshold de **reparo-rate** que dispara revisão do prompt (ex.: > 5–10% das gerações) — definir o alarme sobre o contador (a telemetria sozinha é painel sem alarme).
- **Q2:** instrumentar **custo por geração** (com/sem retry)? Barato de adicionar e útil p/ decisões de modelo; candidato a incluir na telemetria (CA5) ou follow-up.

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
- **Telemetria sem alarme** (product-review): contadores sem threshold são painel sem ação → definir reparo-rate de alerta (Q1).
- **Retry ineficaz quando a causa é o prompt** (product-review): se a violação vem de ambiguidade no prompt (não "a LLM se perdeu"), o retry repete o erro → hipótese a monitorar: reparo-rate/retry-fail alto por tipo aponta o prompt, não a resiliência.
- **Reparo transparente demais** (product-review): treinador aprova plano com etapa sintetizada sem saber → mitigado por A1 (telemetria agora; flag na UI quando houver tela de revisão).

## Relação com outras changes

- **`debito-tecnico-camada-ia`** (já mergeada): reduziu a frequência via temperatura 0.2.
- **`introduce-plan-constraints`** (irmã, **já mergeada** ✅): `Constraint`/`PlanQualityChecker` tratam aderência de *coaching*; aqui é validade *estrutural*. Distintas, ambas pós-geração — o checker já roda após a geração no `IaServiceImpl`; o loop reparo+retry desta change envolve essa mesma região (sem conflito de janela, mas integrar com cuidado).
- **`refactor-iaservice-decomposition`**: extrair o validador/normalizador como colaborador durante esta change.
