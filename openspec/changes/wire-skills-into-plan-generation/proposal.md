**Tamanho · Trilha:** M · Full

## Why

A arquitetura de domain skills (contratos, registry, orquestrador, persistência `tb_skill_execution` e 7+ skills) já está em `develop` — entregue por `introduce-domain-skills-architecture` e pela infraestrutura de `build-skills-core-foundation` (arquivada como superada). Falta o **último elo**: a análise determinística das skills ainda **não chega ao LLM**. Hoje `IaServiceImpl.geraPlanoSemanalAvancado(...)` monta o prompt via `PlanoTreinoPromptBuilder.buildOptimizedPrompt(...)` sem nenhum contexto de skills.

Essa integração foi explicitamente *adiada* na change original (`introduce-domain-skills-architecture`, tasks 4.3/4.4/6.5). Este change a entrega de forma isolada e enxuta, fechando o objetivo "integração mínima com geração de plano" do Bloco 1.

## What Changes

- **`PlanoTreinoPromptBuilder`**: novo overload de `buildOptimizedPrompt(...)` que aceita um `AthleteAnalysisSnapshot` (nullable, retrocompatível). Quando o snapshot não é nulo/vazio, a seção `## Análise Fisiológica (SkillOrchestrator)` (via `snapshot.toPromptSummary()`) é anexada ao prompt; constraints de bloqueio (`hasBlocker()`/`hasCritical()`) entram com marcação explícita de prioridade.
- **Montagem do `SkillContext` + inputs tipados**: as skills relevantes à geração de plano exigem inputs construídos a partir do atleta/metadados/histórico (regra "JPA não cruza para a skill"). Este change introduz a montagem desses inputs e a execução do conjunto curado de skills aplicáveis à geração de plano, consolidando em `AthleteAnalysisSnapshot`.
- **`IaServiceImpl.geraPlanoSemanalAvancado(...)`**: executa as skills (via orquestrador/helper) **antes** da chamada ao LLM e passa o `AthleteAnalysisSnapshot` ao prompt builder. Documenta o novo side effect (persistência de `SkillExecution`).

## Capabilities

### Modified Capabilities

- `plan-generation`: a geração de plano semanal avançada passa a injetar a análise determinística das skills no prompt do LLM, com constraints de bloqueio destacadas.

## Impact

**Backend (`apps/menthoros-backend`):**
- Adaptação de `PlanoTreinoPromptBuilder` (novo overload) e `IaServiceImpl.geraPlanoSemanalAvancado`.
- Possível novo helper em `services/helper` ou `skills/core` para montar os inputs tipados das skills de plano (decisão no `design.md`).
- Novos testes: `PlanoTreinoPromptBuilderTest` (seção presente/ausente), teste da seleção/execução de skills e da integração em `IaServiceImpl`.

**Sem impacto em:** contratos das skills já existentes, entidade/migration `SkillExecution`, frontend, controllers, DTOs, fluxos de Strava. A delegação legada (`IntervaladoElegibilidadeService`, `MetricasAlertaService`) permanece intacta.
