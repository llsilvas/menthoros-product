**Tamanho:** M · **Trilha:** Full

## Why

A arquitetura de ingestão deixa dois ganchos abertos sobre um treino importado: o **cálculo determinístico de métricas** (tempo em zona, decoupling aeróbico) e a **análise narrativa** para o treinador. Hoje o `WorkoutAnalysisListener` já gera análise via LLM, mas (a) faz parsing frágil do JSON do modelo (tratado em `debito-tecnico-camada-ia`) e (b) **não há uma camada determinística** que calcule zona/decoupling em Java puro antes do LLM.

Regra de arquitetura a honrar: **a camada de cálculo é determinística (zero LLM, <50ms)** e a **camada de narrativa (LLM) só interpreta números que recebe** — nunca recalcula. Isso reduz custo, elimina erro aritmético do modelo e mantém rastreabilidade.

> Conteúdo técnico detalhado (código, fórmulas, Gherkin) preservado em `design.md`.

## What Changes

- **`AthleteZoneProfile`** — zonas de FC **por atleta** (derivadas de LTHR/HRmax do perfil; nunca hardcoded), com `zoneFor(bpm)` e fábrica `fromLthr(...)` por metodologia.
- **`WorkoutMetricsCalculator.enrich(CompletedWorkout)`** — tempo em zona (peso = gap até a próxima amostra) e **decoupling aeróbico** (Pa:Hr/Pw:Hr; null se < 60 amostras úteis). Determinístico, in-transaction.
- **Skill `workout-analyzer`** — `SKILL.md` versionado + execução roteada (Haiku), code-switching (fatos em inglês, saída PT-BR, termos técnicos em inglês), `maxTokens` baixo. Escreve narrativa **só sobre os fatos determinísticos**.
- **`WorkoutAnalysis` como proposta `PENDING`** — entra no **mesmo loop** `PENDING → ACCEPTED/MODIFIED/REJECTED` das sugestões (ver `add-coach-suggestion-inbox`), alimentando o mesmo flywheel de aprendizado. Nunca exibida direto ao atleta.
- **Wiring:** `WorkoutImportedEvent` (`@TransactionalEventListener(AFTER_COMMIT)` `@Async`) dispara o analyzer fora do hot path.
- **Reconciliar o `WorkoutAnalysisListener` existente** — integrar/substituir pela nova camada determinística + skill, sem duplicar a análise.

## Capabilities

### Added Capabilities
- `workout-metrics`: métricas determinísticas por sessão (tempo em zona, decoupling) sem custo de LLM.

### Modified Capabilities
- `workout-post-analysis`: narrativa escrita sobre fatos determinísticos (não recalcula), como proposta do treinador.

## Impact

**Código novo:** `AthleteZoneProfile`, `WorkoutMetricsCalculator`, `WorkoutAnalyzerSkill`, `WorkoutAnalysis` (+ `AnalysisFlag`), `skills/workout-analyzer/SKILL.md`.
**Código alterado/reconciliado:** `WorkoutAnalysisListener` (existe hoje) — decidir refactor vs. substituição.
**Depende de:** `CompletedWorkout`, `WorkoutImportService`, `WorkoutImportedEvent` e o caminho de import vêm de `first-party-ingestion-architecture` (já criada como change).
**Migration:** provável tabela `tb_workout_analysis` (estado PENDING/flags) — confirmar contra o que já existe (`SkillExecution`, análise atual).

## Riscos e mitigações

- **Depende do parent de ingestão** (Alto): `WorkoutImportService`/`CompletedWorkout`/evento são definidos em `first-party-ingestion-architecture` — sequenciar depois dela, ou recortar para começar pela camada determinística com um `CompletedWorkout` mínimo.
- **Sobreposição com `WorkoutAnalysisListener`** (Médio): mapear o que o listener atual faz e decidir reconciliação no `design.md`; não criar um segundo caminho de análise em paralelo.
- **Decoupling exige amostras de FC por segundo** (Médio): qualidade depende da ingestão (streams detalhados Strava ou Health Connect). Sem samples densos, `decoupling = null` (já previsto).
- **Zonas dependem de LTHR/HRmax no perfil do atleta** (Médio): se ausente, sem perfil de zona — definir fallback/precondição (ligação com `add-zone-confidence-management`).
- **Custo/latência LLM** (Baixo): Haiku + `maxTokens` baixo + AFTER_COMMIT async; cálculo determinístico é zero-token.

## Referências
- `design.md` (spec técnica original).
- Changes relacionadas: `debito-tecnico-camada-ia` (parsing/roteamento), `add-coach-suggestion-inbox` (loop PENDING), `add-post-workout-debrief` (consome estas métricas), `add-zone-confidence-management` (zonas).
- **`fit-lap-derived-metrics` (criada 2026-07-12):** entrega as mesmas famílias de métrica em granularidade de VOLTA (curva de EF, Pw:HR, GAP interno) sobre `tb_etapa_realizada`, sem depender de `first-party-ingestion-architecture`. Quando esta change chegar com amostras por segundo, o cálculo lap-based vira fallback para treinos sem samples — desenhar o `WorkoutMetricsCalculator` compondo com os calculators de lá (cláusula de supersessão documentada no proposal daquela change).
