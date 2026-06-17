## Context

Estado real (2026-06-16):

- `PlanoTreinoPromptBuilder.buildOptimizedPrompt(Atleta, PlanoMetaDados, Prova, LocalDate, List<DiaSemana>)` — 533 linhas; agrega 8 formatters + `IntervaladoElegibilidadeService`. Monta um `historicoFinal` na ordem: alertas → hierarquia → evento → restrições lesão → decisão intervalado → histórico/dados. Sem testes.
- Skills do plano em sombra: `IntervaladoElegibilidadeService` e `MetricasAlertaService` chamam a skill correspondente só para log (D6 "delegação paralela"), com `UUID.randomUUID()` como atletaId/tenantId, e descartam o `SkillResult`.
- `SkillOrchestratorService.execute(List<DomainSkill<?,?>>, SkillContext)` → `List<SkillResult<?>>`, persiste `SkillExecution`. Mas chama `skill.execute(null, context)` — **não passa input tipado**. Skills do plano exigem inputs (ex.: `IntervaladoElegibilidadeInput`, `RecoveryCargaInput`).
- `AthleteAnalysisSnapshot(atletaId, dataReferencia, List<SkillResult<?>>)` — hoje só `toPromptSummary()` (plano demais), `hasBlocker()`, `hasCritical()`.

## D1 — Snapshot prompt-capable (pré-requisito de tudo)

A serialização atual (`toPromptSummary`) é uma lista plana. Para substituir os formatters precisa reproduzir a **semântica de prioridade e mandatoriedade** do prompt atual:

- Seções ordenadas por prioridade (constraints mandatórias no topo, depois análises, depois dados de apoio).
- Bloco explícito de **constraints mandatórias** derivado dos resultados `BLOCKER`/`CRITICAL`, com instrução textual de que o LLM não pode contrariá-las (equivalente aos marcadores `[PROIBIDO]`/`[FORBIDDEN]` de hoje).
- Cada `SkillResult` expõe payload/evidence/recommendations já no padrão de saída desejado.

Decisão: estender `AthleteAnalysisSnapshot` (ou introduzir um `SnapshotPromptRenderer` dedicado e testável) para emitir essas seções. Renderer dedicado é preferível — mantém o record do snapshot limpo e isola a formatação em uma unidade testável.

## D2 — Inputs reais + fim da execução-sombra

- Introduzir mappers entidade→input por skill (`Atleta`/`PlanoMetaDados`/histórico → `*Input`), seguindo a regra "JPA não cruza para a skill".
- Resolver o null-input do orquestrador: ou um overload `execute(List<SkillInvocation>, ctx)` com input pré-construído, ou um runner dedicado de plano que monta inputs e invoca as skills. (Mesma decisão D1 que estava na finada `wire-skills-into-plan-generation` — recomendação: runner dedicado, sem alterar o contrato já testado do orquestrador.)
- `SkillContext` com `atletaId`/`tenantId` reais (não mais `UUID.randomUUID()`), `dataReferencia` = `inicioSemana`.

## D3 — Strangler por domínio, atrás do golden-master

Ordem por risco crescente (começar onde já há skill):

```
1. interval-eligibility   (skill existe)   ── prova o padrão, ponto de injeção único
2. load/recovery          (skill existe)
3. periodization          (nova skill)
4. variability            (nova skill)
5. recovery-detail        (absorver em RecoveryCarga?)
6. pace-ceiling           (nova skill)
7. availability           (nova skill/regra)
```

Regra invariante: **cada incremento mantém o golden-master verde, ou diverge de propósito com diff revisado** e sem nova `ViolacaoQualidade` na eval determinística (ambos de `add-plan-generation-eval-harness`). É isso que torna a migração segura apesar de o prompt ser o produto.

Por incremento: (a) skill produz o resultado; (b) renderer injeta a seção a partir do snapshot; (c) remove a chamada ao formatter correspondente no `PromptBuilder`; (d) deleta o formatter e a execução-sombra; (e) golden-master regenerado com diff revisado.

## D4 — `PromptBuilder` como montador fino

Estado final: `buildOptimizedPrompt` monta `SkillContext` → roda o runner de skills → obtém `AthleteAnalysisSnapshot` → `SnapshotPromptRenderer` produz as seções determinísticas → concatena com dados do atleta + template. Os 8 formatters deixam de existir; a lógica vive nas skills (testáveis isoladamente).

## D6 — Resiliência estrutural do plano gerado (folded de `harden-plan-generation-resilience`)

A validação pós-geração em `IaServiceImpl.validarENormalizarPlanoGerado` rejeita o plano inteiro com `LLMException` (→ 503, após ~80s) na primeira violação estrutural que a LLM produz. Como a saída é não-determinística, isso ocorre de forma intermitente (caso real 2026-06-17: `REGENERATIVO` com 2 etapas). A `debito-tecnico-camada-ia` já reduziu a frequência ao baixar a temperatura para 0.2, mas não elimina.

**Inventário real das validações que HARD-FAIL (throw):**

| Validação | Reparável (determinístico)? |
|---|---|
| 4 validadores "3 etapas" **idênticos** (`REGENERATIVO`/`LONGO`/`CONTINUO`/`TEMPO_RUN`): `size != 3` ou ordem ≠ AQUEC→…→DESAQ | Parcial — ver abaixo |
| `validarRepeticoes` (`repeticoes != 1`) | ✅ sim — expandir (lógica `expandirEtapasAgregadas` já existe) |
| `validarTreinoIntervalado` (regras de FC/intervalo) | ❌ não — retry |

> Já são **WARN-only** (não falham, sem ação): `validarTrianguloPaceDuracaoDistancia`, `validarDistribuicaoCargaSemanal`, limites "mínimo recomendado" de duração/distância.

**Classificação de reparo dos "3 etapas":**
- Falta **AQUECIMENTO** ou **DESAQUECIMENTO** → ✅ sintetizar (formulaico: zona fácil, ~5–10 min).
- Ordem trocada mas os 3 tipos presentes → ✅ reordenar para o canônico.
- Falta **PRINCIPAL** (o estímulo real) → ❌ retry (inventar o treino principal é perigoso).

**Decisão — reparo-first + 1 retry (teto):**
1. **Dedup primeiro:** unificar os 4 validadores idênticos em um `validarEstrutura3Etapas(tipo)` e um único ponto de reparo.
2. **Reparar** o que é seguro (aquec/desaq faltante, ordem, `repeticoes`) — cobre o caso comum sem custo de LLM; reparo **logado e contado** (telemetria Micrometer), nunca silencioso.
3. **Retry único** (1 tentativa, ~80s) só quando o reparo não se aplica, re-chamando o LLM com o motivo da rejeição anexado ao prompt. Teto = 1 para não criar esperas de minutos.
4. **Falha clara** (erro de domínio mapeado no `GlobalExceptionHandler`) só após reparo + retry esgotados.

Onde mora: como o D4 já reescreve `buildOptimizedPrompt`/o miolo da geração, a orquestração de reparo+retry entra junto — preferir um colaborador dedicado (não re-inflar o `IaServiceImpl`; coordenar com `refactor-iaservice-decomposition`). As **regras** de validação permanecem inalteradas — muda só o comportamento de recuperação.

## D5 — Relação com as changes vizinhas

- **`add-plan-generation-eval-harness` (depende):** rede obrigatória. Sem ela, esta migração é cega.
- **`llm-code-switching` (vem depois):** as skills migradas já emitem estrutura em EN / valores em PT — o code-switching só precisa cuidar do que sobrar (templates, system-prompt, formatters não migrados). Fazer code-switching antes seria traduzir código condenado.
- **`add-llm-tool-use` (ortogonal):** tools = dado sob demanda; skills = decisão determinística. Compatíveis; a migração não bloqueia nem é bloqueada.
- **`refactor-iaservice-decomposition` (coordenar janela):** mesma vizinhança de código (`IaServiceImpl`/prompt). Sequenciar para não conflitar.

## Risks / Trade-offs

- **[Risco] O prompt é o produto — regressão de qualidade.** Mitigação central: golden-master + eval determinística por incremento; nunca migrar dois domínios sem revalidar.
- **[Risco] Mudança grande (L/XL).** Mitigação: strangler — entregável por domínio, cada um mergeável e reversível isoladamente.
- **[Risco] Skills novas reimplementam lógica sutil dos formatters.** Mitigação: caracterizar o formatter (teste) antes de extrair; portar a lógica 1:1 e comparar saída.
- **[Trade-off] Indireção snapshot→renderer vs. formatter direto.** Aceitável: troca um método de 533 linhas por skills testáveis + um renderer testável.
