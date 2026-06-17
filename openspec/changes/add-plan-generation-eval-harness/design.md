## Context

`PlanoTreinoPromptBuilder.buildOptimizedPrompt(Atleta, PlanoMetaDados, Prova, LocalDate inicioSemana, List<DiaSemana>)` — 533 linhas, agrega 8 formatters + `IntervaladoElegibilidadeService`. **Zero testes.** A data de referência vem de `ctx.dataReferencia()` (via `TreinoHistoricoProvider`).

A thread de modernização (`debito-tecnico → migrate-plan-prompt-to-skills → add-llm-tool-use → llm-code-switching`) vai mutar o prompt repetidamente. Esta change entrega a rede mínima — golden-master — **antes** disso.

> **Reescopo (product-lens):** o `PlanQualityChecker` (verificação da saída do plano contra constraints) e a eval ao vivo com LLM saíram desta change. Justificativa em `PRODUCT-BRIEF.md` (ICE: golden-master = 25; checker = 3; eval ao vivo = 1). O checker passa a ser construído em `migrate-plan-prompt-to-skills`, por domínio.

## D1 — Golden-master determinístico

- Capturar a saída de `buildOptimizedPrompt` por arquétipo em `src/test/resources/golden/plano-prompt/<arquetipo>.txt`.
- Teste assert por igualdade; mensagem de falha aponta o arquivo e como regenerar.
- **Regeneração explícita:** system property (ex.: `-Dgolden.update=true`) reescreve os arquivos; nunca automática.
- **Determinismo:** fixar `dataReferencia` (clock fixo / `TreinoHistoricoProvider` stubado). Normalizar qualquer outro campo volátil antes do assert.

### Arquétipos mínimos
`iniciante-sem-lesao` · `avancado-tsb-baixo` (degrada intervalado) · `com-lesao-ativa` (proíbe intervalado) · `taper-semana-prova` · `sem-dados` (exercita fallbacks).

## D2 — Disposição das camadas removidas

- **Camada B — `PlanQualityChecker` (aderência do plano às constraints):** movida para `migrate-plan-prompt-to-skills`. Lá há plano gerado para verificar, e cada regra (intervalado, teto de pace, TSS alvo, dias consecutivos, lesão) nasce **junto** do domínio migrado — não toda de uma vez sem uso.
- **Camada C — eval ao vivo com LLM:** deferida ao Pós-MVP. Não-determinística, custa tokens e depende de **uso real** para baseline de comparação.

## Risks / Trade-offs

- **[Risco] Golden-master quebradiço.** Mitigação: poucos arquétipos, data fixa, regeneração explícita revisada. Falhar no diff é o recurso, não o bug.
- **[Trade-off] Sem medir qualidade semântica do plano nesta change.** Aceitável: o golden-master pega regressão **não-intencional** de prompt — que é o risco imediato da migração. Qualidade semântica entra com o checker (na migração) e com a eval ao vivo (Pós-MVP, com uso real).
