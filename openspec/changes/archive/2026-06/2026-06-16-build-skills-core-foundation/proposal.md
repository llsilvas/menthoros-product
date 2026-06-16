## Why

O Menthoros já possui lógica determinística valiosa espalhada entre helpers (`IntervaladoElegibilidadeService`, `MetricasAlertaService`) e o contexto do prompt (`PlanoTreinoPromptBuilder`). Sem um contrato formal, esse conhecimento não pode ser reutilizado, auditado ou evoluído de forma controlada.

O change `introduce-domain-skills-architecture` captura essa visão completa, mas é grande demais para ser implementado de uma vez. Este change extrai e entrega apenas a **infraestrutura base** — os contratos, o registry, o orquestrador, a persistência e a integração mínima com o fluxo de geração de plano — de forma que as capabilities específicas (prescription-guard, análise de intervalado/longão) possam ser construídas sobre uma fundação sólida.

## What Changes

- **Novo pacote `br.com.menthoros.backend.skills`**: contratos `DomainSkill`, `SkillContext`, `SkillResult`; enums `SkillCategory` e `SkillSeverity`; value object `AthleteAnalysisSnapshot`
- **`SkillRegistry`**: descoberta automática de skills Spring via injeção de lista
- **`SkillOrchestratorService`**: execução ordenada, isolamento de falhas por skill, consolidação em `AthleteAnalysisSnapshot`
- **`SkillExecution` entity + migration Flyway**: persistência audit-first com payload integral e colunas indexadas
- **Duas skills iniciais formalizando lógica existente**: `IntervalEligibilitySkill` (wraps `IntervaladoElegibilidadeService`) e `LoadRecoverySkill` (wraps `MetricasAlertaService`)
- **Integração com geração de plano**: `IaServiceImpl` executa o orquestrador antes do LLM; `PlanoTreinoPromptBuilder` recebe e serializa o snapshot como seção markdown `## Skills Analysis`

## Capabilities

### New Capabilities

- `domain-skill-orchestration`: executar skills de domínio aplicáveis, consolidar resultados em `AthleteAnalysisSnapshot` reutilizável e persistir execuções para auditoria
- `skill-execution-persistence`: armazenar resultado integral de cada execução de skill com versionamento, severidade, confiança e evidências estruturadas

### Modified Capabilities

- `plan-generation`: a geração de plano semanal passa a ter contexto estruturado de skills determinísticas antes da chamada ao LLM

## Impact

**Backend (`apps/menthoros-backend`):**
- Novo pacote `skills/` com 8–10 classes novas
- Nova entidade e migration Flyway (`tb_skill_execution`)
- Adaptação de `IaServiceImpl`, `PlanoTreinoPromptBuilder`
- Delegação interna em `IntervaladoElegibilidadeService` e `MetricasAlertaService` (sem breaking changes)

**Sem impacto em:** frontend, controllers existentes, DTOs, fluxos de Strava
