## Why

Hoje, quando um atleta registra o resultado de uma prova, o Menthoros simplesmente persiste os dados. Não há análise automática, não há feedback estruturado para o coach e não há nenhum retorno ao atleta sobre o que aconteceu na corrida.

Essa lacuna tem consequências práticas: o coach precisa analisar manualmente cada prova (splits, FC, desvio de meta, TSB na largada), o que consome tempo e é inconsistente entre atletas. O atleta, por sua vez, não recebe feedback além do que o coach envia manualmente via mensagem.

A `RaceEvaluationSkill` resolve isso com uma abordagem **determinística primeiro, LLM segundo**: os cálculos objetivos (análise de splits, distribuição de FC por zona, TSB na largada, desvio de meta, detecção de largada quente) são feitos em < 50ms sem custo de LLM. O LLM (Claude Haiku) recebe os números prontos e gera exclusivamente a narrativa em português — sem risco de alucinação numérica.

O coach sempre revisa antes do atleta ver qualquer coisa — modelo coach-in-the-loop padrão do Menthoros.

## What Changes

**Skill e camada determinística:**
- `RaceEvaluationSkill` em `com.menthoros.skills.race` — acionada automaticamente após registro de prova pelo atleta
- 5 cálculos determinísticos: análise de pace (NEGATIVE/EVEN/POSITIVE/FADE), distribuição de FC por zona (Z1–Z5), contexto de carga (TSB_ASSESSMENT), desvio de meta, detecção de largada quente
- `HRZoneCalculator` para distribuição de zonas por splits com interpolação linear quando HR parcial

**DTOs de I/O:**
- `RaceEvaluationInput` (Race, RaceResult com KmSplits, AthleteProfile, TrainingContext, RaceGoal opcional)
- `RaceEvaluationOutput` (overall_assessment, pace_analysis, hr_zones, load_context, strengths, improvement_areas, coach_note, metadata)

**LLM (Claude Haiku 4):**
- Recebe todos os cálculos como JSON estruturado; gera `overall_assessment` (max 600 chars), `strengths` (max 3), `improvement_areas` (max 3), `coach_note` (max 400 chars) em pt-BR
- Tom: honesto, tecnicamente embasado, motivacional sem falsa positividade
- Fallback para Claude Sonnet 4 em caso de falha do Haiku

**Visibilidade:**
- Coach: output completo (incluindo `coach_note` e todos os flags técnicos)
- Atleta: somente após `coach_reviewed=true` — sem `coach_note`

**Trigger:**
- Automático após atleta registrar resultado de prova via `POST /api/provas/{provaId}/resultado`

## Capabilities

### New Capabilities

- `race-evaluation-skill`: análise pós-prova automática com camada determinística + narrativa LLM, entregue ao coach para revisão antes do atleta ter acesso

### Modified Capabilities

- `race-result-registration`: registro de resultado passa a disparar a skill automaticamente (event-driven via `ApplicationEventPublisher`)

## Impact

**Entidades e banco:**
- Nova tabela: `tb_race_evaluation` (id, atleta_id, prova_id, tenant_id, result_json JSONB, deterministic_output_json JSONB, llm_output_json JSONB, coach_reviewed, coach_reviewed_at, coach_id, generated_at, model_used, deterministic_version)
- Índice: `(atleta_id, prova_id)` para lookup rápido
- Constraint: `UNIQUE (atleta_id, prova_id)` — uma avaliação por atleta/prova (re-geração substitui)

**APIs:**
- `GET /api/athletes/{atletaId}/race-evaluations/{provaId}` — avaliação completa (coach only)
- `GET /api/athletes/{atletaId}/race-evaluations/{provaId}/athlete-view` — view sem coach_note (somente se revisado)
- `POST /api/athletes/{atletaId}/race-evaluations/{provaId}/review` — coach marca como revisado
- `POST /api/athletes/{atletaId}/race-evaluations/{provaId}/regenerate` — regenera avaliação (coach only)

**Custo estimado por chamada:**
- Camada determinística: < 50ms, custo zero
- LLM (Haiku): ~$0.0008 por chamada (~800 tokens input+output)
- Total P95: < 2.5s

## Riscos e mitigações

- **Splits ausentes (atleta registra só tempo total)**: avaliação parcial com badge "dados incompletos" — sem bloqueio da skill; métricas de pace não calculadas, HR estimado conservadoramente
- **Dados de HR ausentes**: distribuição estimada linearmente com flag `estimated_only`; `coach_note` sinaliza ausência de HR
- **Atleta com < 4 semanas de histórico**: skill executa normalmente com flag LOW no contexto de carga; coach_note documenta limitação
- **LLM Haiku indisponível**: fallback para Sonnet 4; se ambos falharem, output parcial apenas com dados determinísticos (narrativa pendente)

## Referências

- **Artifact de origem**: `menthoros-product/artifacts/race-evaluation-skill.openspec.yaml`
- **OpenSpec `add-race-projection-skill`** — consumidor do `RaceEvaluationSkill` como âncora de performance em provas reais (dependência declarada)
- **OpenSpec `introduce-domain-skills-architecture`** — contrato de skill que esta change implementa
- **OpenSpec `strava-activity-sync`** — fonte futura de splits automáticos (v0.2)
