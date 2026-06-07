## Why

A change `add-race-time-prediction` introduziu um cálculo simples de predição via Riegel/VDOT. Na prática, o coach precisa de mais: não apenas "qual o tempo estimado", mas **com que base matemática**, **qual a confiança**, **o que o TSB e a periodização mudam nisso**, e **como essa projeção compara com a meta do atleta**.

Além disso, a predição existente não persiste histórico, não tem visibilidade controlada para o atleta, e não expõe dados suficientes para o coach comunicar expectativas com segurança.

Esta change introduz a `RaceProjectionSkill` — uma skill completa com três camadas determinísticas, confiança explícita, snapshots imutáveis e dashboard do atleta. O LLM é usado apenas para gerar narrativa e premissas em linguagem natural; toda a matemática é determinística e auditável.

**Lacunas da `add-race-time-prediction` que esta change endereça:**

| Limitação atual | Solução nesta change |
|---|---|
| Método único (Riegel ou VDOT) | 3 camadas: regressão de pace + Riegel + ajuste por TSB/fase |
| Sem sinal de confiança | Confiança LOW/MEDIUM/HIGH baseada em R² e qualidade de dados |
| Sem ajuste por TSB projetado | Camada 3 aplica fator 0.975–1.08 conforme fase e TSB da prova |
| Sem histórico de projeções | `tb_race_projection_snapshot` append-only com flag `is_official` |
| Atleta nunca vê projeção | Dashboard do atleta com evolução temporal (somente projeções oficiais) |
| Sem gap analysis vs meta | `GoalGapAnalysis` coach-only: ON_TRACK / REACHABLE / STRETCH / UNLIKELY |
| LLM não envolvido | Claude Haiku gera narrativa + premissas + coach_note em pt-BR |

## What Changes

**Skill e modelo determinístico:**
- `RaceProjectionSkill` em `br.com.menthoros.backend.skills.race` — skill on-demand acionada pelo coach
- Camada 1: regressão OLS de pace normalizado por FC (8–12 semanas, via `commons-math3`)
- Camada 2: fórmula de Riegel com expoente padrão 1.06, calibrável por histórico de provas
- Camada 3: ajuste por fase de periodização e TSB projetado (6 cenários com fatores 0.975–1.08)
- `HRZoneCalculator` — normalização de pace pela FC para remover ruído de condições externas

**DTOs de I/O:**
- `RaceProjectionInput` (atleta, histórico 60–90 dias, projeção de carga, histórico de provas, distâncias-alvo)
- `RaceProjectionOutput` (projeções por distância, narrativa, premissas, coach_note, goal_gap_analysis, metadata)

**Persistência:**
- `tb_race_projection_snapshot` (append-only, `is_official`, `projections_json` JSONB, campos de auditoria do modelo)
- Apenas uma projeção oficial por atleta/prova/distância

**LLM (Claude Haiku):**
- Recebe números já calculados; gera `progression_narrative` (max 500 chars), `key_assumptions` (max 5), `coach_note` (max 400 chars) em pt-BR
- Fallback para Claude Sonnet 4 em caso de falha do Haiku

**Visibilidade:**
- Coach: output completo (projeções, confiança, gap analysis, coach_note)
- Atleta: somente quando `is_official=true` E `coach_reviewed=true` — view simplificada sem confiança numérica e sem gap de meta

**UI (entry points):**
- Botão "Gerar Projeção de Prova" no perfil do atleta
- Botão "Projetar Tempo" no calendário de provas, ao lado de cada prova futura
- Ação opcional no painel de revisão semanal

## Capabilities

### New Capabilities

- `race-projection-skill`: projeção de tempos de prova com modelo de 3 camadas, confiança explícita, snapshots persistentes e dashboard do atleta

### Modified Capabilities

- `race-time-prediction`: esta change **substitui** a capability de predição simples; `add-race-time-prediction` pode ser arquivada após rollout

## Impact

**Entidades e banco:**
- Nova tabela: `tb_race_projection_snapshot` (id, athlete_id, race_id, generated_at, weeks_to_race_at_generation, projections_json JSONB, confidence, is_official, coach_id, coach_reviewed_at, ctl_at_generation, tsb_at_generation, regression_r_squared, riegel_exponent_used, riegel_calibrated, training_weeks_used, model_used)
- Índice: `(athlete_id, race_id, generated_at DESC)` para snapshot mais recente
- Regra "apenas uma oficial por atleta/prova" garantida via código: `UPDATE SET is_official=false` antes de marcar nova — sem constraint UNIQUE declarativa (ver D5 em design.md)

**APIs:**
- `POST /api/v1/atletas/{atletaId}/projecoes-prova` — gera e persiste nova projeção (coach only)
- `GET /api/v1/atletas/{atletaId}/projecoes-prova?provaId=X` — histórico de snapshots
- `GET /api/v1/atletas/{atletaId}/projecoes-prova/oficial?provaId=X` — projeção oficial atual
- `PATCH /api/v1/atletas/{atletaId}/projecoes-prova/{snapshotId}/oficial` — marca como oficial
- `GET /api/v1/atletas/{atletaId}/projecoes-prova/visao-atleta?provaId=X` — view simplificada para o atleta (somente se oficial + revisado)

**Custo estimado por chamada:**
- Camada determinística: < 100ms, custo zero
- LLM (Haiku): ~$0.0007 por chamada
- Total P95: < 2.5s

## Riscos e mitigações

- **Dados insuficientes (< 4 semanas)**: confiança forçada para LOW, `key_assumption` explícita, sem bloqueio da skill
- **Atleta sem dados de FC**: pace bruto com confiança LOW e premissa documentada (oq_004 → decidido)
- **Riegel subestima elite / superestima iniciante**: aceitável na v0.1; correção por VO2max planejada para v0.2
- **Coach expõe projeção com confiança LOW ao atleta**: flag override disponível no `is_official`, coach tem controle total

## Referências

- **Artifact de origem**: `menthoros-product/artifacts/race-projection-skill.openspec.yaml`
- **OpenSpec `add-race-time-prediction`** — predecessor a ser arquivado após rollout desta change
- **OpenSpec `introduce-domain-skills-architecture`** — contrato de skill que esta change implementa
- **commons-math3 3.6.1**: `OLSMultipleLinearRegression` para regressão de pace
- Riegel, P.S. — *Athletic Records and Human Endurance* (1981)
