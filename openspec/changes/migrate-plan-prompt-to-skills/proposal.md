**Tamanho · Trilha:** L/XL · Full

## Why

A geração de plano hoje é montada por um emaranhado de **8 formatters** dentro de `PlanoTreinoPromptBuilder.buildOptimizedPrompt` (533 linhas, zero testes). A lógica determinística que decide o treino — elegibilidade de intervalado, alertas de carga/recuperação, periodização, variabilidade, teto de pace, disponibilidade — vive espalhada nesses formatters e nos serviços legados.

Em paralelo, a arquitetura de **domain skills** já existe e é pura/determinística/testável (`DomainSkill`, `SkillOrchestratorService`, `AthleteAnalysisSnapshot`, 7+ skills). Mas as skills relevantes ao plano (`IntervaladoElegibilidadeSkill`, `RecoveryCargaSkill`) rodam **em sombra**: são invocadas só para log, com identidade aleatória, e o resultado é descartado. **Quem realmente monta o prompt são os formatters.**

Este change executa a modernização que faltava: **as skills passam a ser a fonte determinística do prompt**, o `PromptBuilder` vira um montador fino sobre o `AthleteAnalysisSnapshot`, e os formatters são retraídos. Resultado: lógica organizada em skills testáveis (em vez de um método de 533 linhas), e menos alucinação — o LLM recebe constraints determinísticas explícitas que não pode sobrescrever, em vez de um despejo de texto montado ad-hoc.

Nem `add-llm-tool-use` (adiciona getters de dado + prompt enxuto) nem `llm-code-switching` (traduz e **mantém** os formatters) cobrem isso — confirmado nos seus `tasks.md`/`design.md`.

## What Changes

- **Snapshot vira "prompt-capable":** serialização estruturada do `AthleteAnalysisSnapshot` em seções ordenadas por prioridade, com bloco de **constraints mandatórias** (severidade `BLOCKER`/`CRITICAL`) marcado de forma que o LLM não possa ignorar — substituindo a semântica de "instrução mandatória" hoje nos formatters.
- **Orquestrador roda com inputs reais:** as skills do plano recebem inputs tipados construídos das entidades via mappers (regra "JPA não cruza para a skill"), com `atletaId`/`tenantId` corretos (fim da execução-sombra com `UUID.randomUUID()`), e persistem `SkillExecution`.
- **Migração strangler, um domínio por vez** (cada incremento validado contra o golden-master de `add-plan-generation-eval-harness`):
  1. **interval-eligibility** — `IntervaladoElegibilidadeSkill` vira a fonte; aposenta `formatarDecisaoIntervalado` + a execução-sombra em `IntervaladoElegibilidadeService`.
  2. **load/recovery** — `RecoveryCargaSkill` vira a fonte; aposenta `AlertasPromptFormatter` (alertas/hierarquia) + execução-sombra em `MetricasAlertaService`.
  3. **periodization** — nova skill a partir de `PeriodizacaoPromptFormatter`.
  4. **variability** — nova skill a partir de `VariabilidadePromptFormatter`.
  5. **recovery-detail** — absorver `RecuperacaoPromptFormatter` (na RecoveryCarga ou nova skill).
  6. **pace-ceiling** — nova skill a partir de `PaceHistoricoFormatter` (teto de pace).
  7. **availability** — regras de `DisponibilidadePromptFormatter`.
- **`PromptBuilder` vira montador fino:** passa a compor o prompt a partir do snapshot + dados do atleta, em vez de orquestrar 8 formatters. Cada formatter migrado é **deletado**.
- **`PlanQualityChecker` por domínio (herdado da eval-harness):** contrato (`ViolacaoQualidade`) + 1ª regra (intervalado) na primeira fatia; **uma regra nova a cada domínio migrado** (teto de pace, TSS alvo, dias consecutivos, lesão). Verifica que o plano gerado respeita as constraints determinísticas — eval offline sobre fixtures "bom"/"alucinado", sem chamar o LLM. (Originalmente previsto em `add-plan-generation-eval-harness`; movido para cá pelo reescopo product-lens — só faz sentido onde há plano para verificar.)

## Capabilities

### Modified Capabilities

- `plan-generation`: o conteúdo determinístico do prompt de geração de plano passa a ser produzido pelas domain skills (via `AthleteAnalysisSnapshot`), de forma organizada e testável, com constraints mandatórias explícitas — substituindo a montagem por formatters ad-hoc.

## Impact

**Backend (`apps/menthoros-backend`):**
- Serialização estruturada em `AthleteAnalysisSnapshot` (seções, prioridade, constraints mandatórias).
- Novas skills: periodization, variability, pace-ceiling, availability (+ absorção de recovery-detail).
- Mappers entidade→input por skill (sem JPA cruzando para a skill).
- `PlanoTreinoPromptBuilder` reescrito como montador fino; **deleção** dos formatters migrados e da execução-sombra nos serviços legados.
- Cada incremento valida contra o golden-master e a eval determinística de `add-plan-generation-eval-harness`.

**Dependências e ordem:**
- **Depende de `add-plan-generation-eval-harness`** — o golden-master é a rede que garante que cada passo do strangler não regride o prompt.
- **Antes de `llm-code-switching`** — não faz sentido traduzir 8 formatters que serão aposentados; as skills já emitem no padrão (estrutura EN / valores PT), reduzindo o escopo do code-switching.
- **Complementa `add-llm-tool-use`** — decisão determinística nas skills e busca de dado sob demanda nas tools são camadas distintas e compatíveis.
- **Coordena com `refactor-iaservice-decomposition`** — ambos tocam o miolo da geração; evitar conflito de janela.

**Sem impacto em:** controllers, DTOs de API, entidades persistidas, migrations (a `SkillExecution`/`V32` já existe), frontend.
