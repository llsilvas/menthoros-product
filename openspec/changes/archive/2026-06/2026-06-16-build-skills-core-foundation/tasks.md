> **STATUS: ARQUIVADA — SUPERADA (2026-06-16).**
> A infraestrutura desta change (Seções 1–4) já foi entregue e mergeada em `develop`
> pela change `introduce-domain-skills-architecture` (arquivada 2026-06-02) e seus commits
> de follow-up (`feat(skills): ...`). O código real **excede** este escopo: pacote
> `skills/core` (`DomainSkill`, `SkillContext`, `SkillResult`, `SkillCategory`,
> `SkillSeverity`, `AthleteAnalysisSnapshot`, `SkillRegistry`, `SkillOrchestratorService`),
> entidade `SkillExecution` + repo + migration `V32`, e 7+ skills implementadas
> (analysis, eligibility, prescription, recovery, race) com testes e `DomainSkillContractTest`.
> Os serviços legados (`IntervaladoElegibilidadeService`, `MetricasAlertaService`) já delegam
> às skills (D6).
>
> **Único gap real:** a Seção 5 (integração do orquestrador na geração de plano —
> `IaServiceImpl` → orquestrador, `PlanoTreinoPromptBuilder` consome o snapshot) **não foi
> implementada** — foi explicitamente *adiada* na change original (tasks 4.3/4.4/6.5 de
> `introduce-domain-skills-architecture`). Esse gap foi extraído para a change dedicada
> **`wire-skills-into-plan-generation`**.
>
> Disposição por seção: §1–§4 ✅ entregues (outra change) · §5 ➡️ movida para
> `wire-skills-into-plan-generation` · §6–§7 ➡️ verificação coberta pela change nova.

## 1. Contratos Base — pacote `skills/` — ✅ ENTREGUE (`introduce-domain-skills-architecture`)

- [ ] 1.1 Criar enum `SkillSeverity` em `br.com.menthoros.backend.skills` com valores: `NONE, INFO, WARNING, CRITICAL`
- [ ] 1.2 Criar enum `SkillCategory` em `br.com.menthoros.backend.skills` com valores: `LOAD_MANAGEMENT, INTERVAL_ELIGIBILITY, PRESCRIPTION_GUARD, WORKOUT_ANALYSIS`
- [ ] 1.3 Criar record `SkillResult` em `br.com.menthoros.backend.skills` com campos:
  - `String skillKey`
  - `String skillVersion`
  - `boolean applicable`
  - `SkillSeverity severity`
  - `double confidence` (0.0–1.0)
  - `String payloadJson`
  - `String evidenceJson` (nullable)
  - `String recommendationsJson` (nullable)
  - Factory method estático `SkillResult.notApplicable(String key, String version)`
- [ ] 1.4 Criar record `SkillContext` em `br.com.menthoros.backend.skills` com campos:
  - `Atleta atleta`
  - `UUID tenantId`
  - `Optional<TreinoRealizado> treinoRealizado`
  - `Optional<PlanoSemanal> planoSemanal`
  - `TreinoHistoricoProvider historicoProvider`
- [ ] 1.5 Criar interface `DomainSkill` em `br.com.menthoros.backend.skills` com métodos:
  - `String key()`
  - `String version()`
  - `SkillCategory category()`
  - `boolean isApplicable(SkillContext context)`
  - `SkillResult execute(SkillContext context)`
- [ ] 1.6 Criar classe `AthleteAnalysisSnapshot` em `br.com.menthoros.backend.skills` com:
  - `List<SkillResult> results` (imutável)
  - `List<String> mandatoryConstraints` (derivado dos resultados CRITICAL)
  - Método `toMarkdown()` serializando cada resultado como subseção `### <skillKey>`
  - Factory method estático `AthleteAnalysisSnapshot.empty()`

## 2. Registry e Orquestrador — ✅ ENTREGUE (`introduce-domain-skills-architecture`)

- [ ] 2.1 Criar `SkillRegistry` anotado com `@Component` em `br.com.menthoros.backend.skills`:
  - Construtor recebe `List<DomainSkill> skills` (injeção automática Spring)
  - Método `List<DomainSkill> getApplicable(SkillContext context)` filtrando por `isApplicable`
- [ ] 2.2 Criar `SkillOrchestratorService` anotado com `@Service` em `br.com.menthoros.backend.skills`:
  - Injeta `SkillRegistry` e `SkillExecutionRepository`
  - Método `AthleteAnalysisSnapshot execute(SkillContext context)`:
    - Obtém skills aplicáveis via registry
    - Executa cada skill em bloco try/catch individual (falha numa não cancela as demais)
    - Persiste `SkillExecution` para resultados com `severity != NONE`
    - Retorna snapshot consolidado
  - Documenta: **Idempotent: NO** | **Side Effects: Database insert (SkillExecution)** | **Tenant-aware: YES**

## 3. Persistência — Entidade e Migration — ✅ ENTREGUE (`introduce-domain-skills-architecture`, migration `V32`)

- [ ] 3.1 Criar entity `SkillExecution` em `br.com.menthoros.backend.entity` com campos:
  - `UUID id` (gerado)
  - `String skillKey` (indexed)
  - `String skillVersion` (indexed)
  - `String severity` (indexed — persiste o nome do enum como string)
  - `BigDecimal confidence`
  - `UUID atletaId` (FK `tb_atleta`, not null)
  - `UUID treinoRealizadoId` (FK `tb_treino_realizado`, nullable)
  - `UUID planoSemanalId` (FK `tb_plano_semanal`, nullable)
  - `UUID tenantId` (not null, indexed)
  - `String payloadJson` (column type `jsonb`)
  - `String evidenceJson` (column type `jsonb`, nullable)
  - `String recommendationsJson` (column type `jsonb`, nullable)
  - `Instant executedAt` (not null, default now)
- [ ] 3.2 Criar migration Flyway `V{N}__add_skill_execution.sql` com:
  - DDL da tabela `tb_skill_execution` conforme schema definido no design
  - Índices: `atleta_id`, `treino_realizado_id`, `severity`, `(skill_key, skill_version)`, `tenant_id`
- [ ] 3.3 Criar `SkillExecutionRepository` em `br.com.menthoros.backend.repository` estendendo `JpaRepository<SkillExecution, UUID>` com queries:
  - `List<SkillExecution> findByAtletaIdAndTenantId(UUID atletaId, UUID tenantId)`
  - `List<SkillExecution> findByTreinoRealizadoIdAndTenantId(UUID treinoId, UUID tenantId)`
  - `List<SkillExecution> findByAtletaIdAndSeverityAndTenantId(UUID atletaId, String severity, UUID tenantId)`

## 4. Skills Iniciais — Formalização de Lógica Existente — ✅ ENTREGUE (`skills/eligibility`, `skills/recovery`; serviços legados delegam — D6)

- [ ] 4.1 Criar `IntervalEligibilitySkill` em `br.com.menthoros.backend.skills.impl` implementando `DomainSkill`:
  - `key()` → `"interval-eligibility"`
  - `version()` → `"1.0.0"`
  - `category()` → `SkillCategory.INTERVAL_ELIGIBILITY`
  - `isApplicable(context)` → `true` se contexto tem atleta com dados de histórico suficientes
  - `execute(context)` → encapsula a lógica atual de `IntervaladoElegibilidadeService` (avaliação de recuperação, TSB, dias consecutivos, última sessão intensa)
  - Payload JSON: `{ "eligible": bool, "maxSessionsThisWeek": int, "lastIntervalDaysAgo": int, "tsbAtual": double }`
- [ ] 4.2 Criar `LoadRecoverySkill` em `br.com.menthoros.backend.skills.impl` implementando `DomainSkill`:
  - `key()` → `"load-recovery"`
  - `version()` → `"1.0.0"`
  - `category()` → `SkillCategory.LOAD_MANAGEMENT`
  - `isApplicable(context)` → `true` se atleta tem `PlanoMetaDados` com TSB/CTL/ATL calculados
  - `execute(context)` → encapsula a lógica de alertas de `MetricasAlertaService` (TSB abaixo de limiar crítico, ATL excessivo, dias consecutivos)
  - Payload JSON: `{ "tsb": double, "ctl": double, "atl": double, "consecutiveLoadDays": int, "alerts": [string] }`
  - `severity` = `CRITICAL` se TSB < -25 ou consecutiveDays >= 7; `WARNING` se TSB < -15; `INFO` caso contrário
- [ ] 4.3 Adaptar `IntervaladoElegibilidadeService` para delegar à `IntervalEligibilitySkill`:
  - Injeta `IntervalEligibilitySkill` via construtor
  - Método `avaliar(...)` monta `SkillContext` e chama `skill.execute(context)`
  - Converte `SkillResult` de volta ao tipo legado `RecomendacaoIntervalado` (sem breaking change nos callers)
- [ ] 4.4 Adaptar `MetricasAlertaService` para delegar à `LoadRecoverySkill`:
  - Injeta `LoadRecoverySkill` via construtor
  - Métodos existentes delegam para a skill e convertem resultado
  - Nenhum caller externo é afetado

## 5. Integração com Geração de Plano — ➡️ MOVIDA para `wire-skills-into-plan-generation` (gap real, ainda não feita)

- [ ] 5.1 Adaptar `TreinoHistoricoProvider` para expor os dados necessários ao `SkillContext` (verificar se já está adequado ou se precisa de novos métodos)
- [ ] 5.2 Adaptar `PlanoTreinoPromptBuilder.buildOptimizedPrompt(...)` para aceitar `AthleteAnalysisSnapshot` como parâmetro adicional (nullable para retrocompatibilidade):
  - Se snapshot não nulo e não vazio: appenda seção `## Skills Analysis` com `snapshot.toMarkdown()`
  - Se snapshot tem `mandatoryConstraints`: adiciona bloco de constraints mandatórias logo após o system context
- [ ] 5.3 Adaptar `IaServiceImpl.gerarPlano(...)` para:
  - Montar `SkillContext` com atleta, tenant, histórico
  - Chamar `SkillOrchestratorService.execute(context)` antes da chamada ao LLM
  - Passar o `AthleteAnalysisSnapshot` resultante ao `PlanoTreinoPromptBuilder`
  - Documentar os novos side effects: **Side Effects: SkillExecution persists (async via orchestrator)**

## 6. Testes — ✅ §1–4 cobertas (testes existentes) · ➡️ §6.6 (PromptBuilder) movida para `wire-skills-into-plan-generation`

- [ ] 6.1 Criar `SkillRegistryTest` — verificar que registry retorna apenas skills com `isApplicable = true`
- [ ] 6.2 Criar `SkillOrchestratorServiceTest`:
  - Cenário: uma skill falha, as demais continuam e snapshot é retornado com skill marcada como não aplicável
  - Cenário: skill com CRITICAL gera constraint mandatória no snapshot
  - Cenário: nenhuma skill aplicável retorna snapshot vazio sem erro
- [ ] 6.3 Criar `IntervalEligibilitySkillTest` — cobrir casos: elegível, inelegível por TSB, inelegível por dias consecutivos
- [ ] 6.4 Criar `LoadRecoverySkillTest` — cobrir casos: INFO (TSB ok), WARNING (TSB baixo), CRITICAL (TSB crítico ou 7+ dias)
- [ ] 6.5 Criar `AthleteAnalysisSnapshotTest` — verificar `toMarkdown()` para snapshot com múltiplos resultados e com constraints críticas
- [ ] 6.6 Criar `PlanoTreinoPromptBuilderTest` — verificar que seção `## Skills Analysis` aparece no prompt quando snapshot é fornecido e não aparece quando snapshot é nulo/vazio
- [ ] 6.7 Executar `./mvnw clean test` — todos os testes devem passar sem regressões

## 7. Validação Final — ➡️ coberta por `wire-skills-into-plan-generation`

- [ ] 7.1 Executar `./mvnw clean test` com suite completa passando
- [ ] 7.2 Verificar que `IntervaladoElegibilidadeService` e `MetricasAlertaService` continuam funcionando para seus callers existentes (sem breaking changes)
- [ ] 7.3 Verificar que nenhum controller foi alterado
- [ ] 7.4 Confirmar migration Flyway aplicada sem erros em banco local
- [ ] 7.5 Atualizar este `tasks.md` com checkmarks para todas as tasks concluídas
