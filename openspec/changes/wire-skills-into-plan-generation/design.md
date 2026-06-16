## Context

A infraestrutura de skills já existe em `develop`. APIs reais relevantes (confirmadas no código em 2026-06-16):

- `SkillContext` — `record (UUID atletaId, UUID tenantId, LocalDate dataReferencia, Map<String,Object> metadata)`; atalho `SkillContext.of(atletaId, tenantId, dataReferencia)`.
- `DomainSkill<I, O>` — `SkillResult<O> execute(I input, SkillContext context)`. **Exige input tipado `I`.**
- `SkillResult<O>` — `skillKey/skillVersion/severity/confidence(enum SkillConfidence)/payload/evidence(List<String>)/recommendations(List<String>)`.
- `SkillSeverity` — inclui `BLOCKER` e `CRITICAL` (entre outros).
- `AthleteAnalysisSnapshot` — `record (UUID atletaId, LocalDate dataReferencia, List<SkillResult<?>> results)`; expõe `toPromptSummary()`, `hasBlocker()`, `hasCritical()`, `getSeverityCount(severity)`.
- `SkillRegistry` — `findByKey(key)` e `listAll()`. **Não** há `getApplicable(context)`.
- `SkillOrchestratorService.execute(List<DomainSkill<?,?>> skills, SkillContext context)` → `List<SkillResult<?>>`; persiste cada resultado como `SkillExecution` (best-effort) e isola falhas por skill.
- Ponto de integração: `IaServiceImpl.geraPlanoSemanalAvancado(Atleta, PlanoMetaDados, Prova, ModoGeracaoPlano)` → `promptBuilder.buildOptimizedPrompt(atleta, metaDados, prova, inicioSemana, diasEfetivos)`.

## Decisão central — D1: como alimentar inputs tipados às skills

**Problema:** `SkillOrchestratorService.execute(skills, ctx)` invoca `skill.execute(null, ctx)` — passa `null` como input. Isso funciona apenas para skills que não dependem do input. As skills fisiológicas relevantes ao plano (`RecoveryCargaSkill`, `IntervaladoElegibilidadeSkill`) **exigem** inputs (`RecoveryCargaInput`, `IntervaladoElegibilidadeInput`) construídos a partir do atleta/metadados/histórico — e a regra de arquitetura proíbe passar entidades JPA à skill.

**Opções:**
- **(A) Helper de montagem + execução direta das skills curadas, consolidando o snapshot, e persistência via caminho existente.** O `IaServiceImpl` (ou um `PlanGenerationSkillRunner` em `services/helper`/`skills/core`) mapeia entidades → inputs via mappers, executa o conjunto curado, monta `AthleteAnalysisSnapshot` e persiste. Mais controle sobre quais skills rodam e com quais inputs.
- **(B) Estender o orquestrador** com um overload `execute(List<SkillInvocation> invocations, ctx)` onde `SkillInvocation` carrega `(skill, inputPréConstruído)`. Centraliza persistência/isolamento de falha, mas exige mudar o contrato do orquestrador.

**Recomendação:** **(A)** para este change (escopo mínimo, sem mexer no contrato já testado do orquestrador). Avaliar (B) como refino futuro se mais fluxos precisarem do mesmo padrão. A decisão final é confirmada na implementação (task 2), sob supervisão `--step`.

## D2 — Seleção das skills de plano

Conjunto curado (não `listAll()` cego, pois várias skills — race/analysis — não se aplicam à geração de plano e exigem inputs específicos de outro contexto). Selecionar explicitamente as skills fisiológicas de planejamento (recovery/carga, elegibilidade de intervalado) por `skillKey` via `SkillRegistry.findByKey(...)`, ou por injeção direta dos beans. Inputs de skill ausentes (dados insuficientes) → a skill é omitida do snapshot, sem erro.

## D3 — Injeção no prompt

`buildOptimizedPrompt` ganha overload com `AthleteAnalysisSnapshot snapshot` (nullable):
- `snapshot == null` ou `results` vazio → prompt idêntico ao atual (retrocompatível).
- caso contrário → anexa `snapshot.toPromptSummary()` como seção; se `hasBlocker()`/`hasCritical()`, prefixa um bloco de **constraints mandatórias** com instrução explícita de que o modelo não pode ignorá-las.

A assinatura legada de `buildOptimizedPrompt` (sem snapshot) é mantida e passa a delegar ao overload com `null`, preservando todos os callers.

## Risks / Trade-offs

- **[Risco] Overhead antes da geração.** Skills são determinísticas e in-memory; persistência de `SkillExecution` já é best-effort e não bloqueia. Aceitável.
- **[Risco] Inputs insuficientes para uma skill.** Mitigação: skill omitida do snapshot; geração prossegue sem a seção daquela skill.
- **[Trade-off] Execução direta (A) duplica levemente o laço de persistência do orquestrador.** Aceitável no escopo mínimo; reavaliar com (B) se o padrão se repetir.
