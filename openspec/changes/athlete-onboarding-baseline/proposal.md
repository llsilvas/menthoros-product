**Tamanho:** L · **Trilha:** Full

> Full porque toca backend (novo fluxo de onboarding + normalizacao + baseline + calibracao) e frontend (formulario de onboarding estendido + UI de calibracao + extensao do feedback pos-treino). Depende de `deterministic-planner-engine` (consome `PlannerEngine`, `TrainingPhase.CALIBRATION`, `OnboardingContext`).

## Why

Hoje o Menthoros nao tem um fluxo formal de onboarding do atleta. O cadastro e simples (nome, email, vinculo com assessoria) e o primeiro plano e gerado sem baseline, sem score de confianca, sem fase de calibracao. Isso cria tres riscos:

1. **Plano inseguro no cold start**: sem historico, o LLM recebe dados insuficientes e pode gerar carga inadequada (ex: atleta iniciante recebendo volume de avancado porque o prompt nao tem sinal de "va devagar").
2. **Primeira impressao ruim**: o atleta recebe um plano generico, nao personalizado, e o coach precisa editar tudo — mina a confianca no produto nos primeiros dias.
3. **Sinal de aprendizado contaminado**: sem baseline, o delta `WeekSuggestion` ACCEPTED/MODIFIED/REJECTED nao distingue "plano ruim por falta de dado" de "plano ruim por prescricao errada do LLM".

**Esta change define o fluxo completo**: coleta de dados no onboarding -> normalizacao de atividades -> baseline + score de confianca -> fase de calibracao -> primeiro plano seguro e auditavel.

## What Changes

### Backend

- **Activity Normalizer** — converte atividades de qualquer fonte (Garmin, FIT, Strava, manual, planilha) para estrutura canonica unica. Deduplicacao entre fontes por janela de tempo + similaridade. `dataQuality` composto (completude de metricas, confiabilidade da fonte, consistencia interna).
- **Baseline Calculator** — calcula CTL/ATL/TSB inicial. Tres cenarios: A (historico completo >= 8 semanas, baseline direto), B (parcial 2-6 semanas, hibrido real + extrapolacao), C (sem historico, 100% estimado por heuristica). Reuso da calculadora TSS/CTL/ATL/TSB existente.
- **Confidence Scorer** — score 0-100 (normalizado para 0.0-1.0 no `OnboardingContext`) baseado em 8 criterios ponderados: semanas de historico, onboarding completo, FC valida, ritmo/potencia de limiar, RPE, consistencia, prova recente, fonte confiavel. Classifica automaticamente em Cenario A (>=75), B (45-74), C (<45).
- **Calibration Phase** — extensao de `TrainingPhase.CALIBRATION` com `CalibrationStage` (OBSERVATION/CALIBRATION/STABILIZATION). Duracao: 1 semana (A), 2 semanas (B), 2-4 semanas (C). Re-baseline ao final de cada semana; score recalculado pode subir OU descer -> reclassificacao automatica de cenario.
- **PlanningPolicy** derivada da faixa de confianca: `reviewMode` (EXCEPTION_ONLY / MANDATORY_NON_BLOCKING / MANDATORY_BLOCKING) + `maxProgressionAllowed` + `explanationRequired`.
- **Gate de aprovacao obrigatoria** no Cenario C: `WeekSuggestion` nao visivel ao atleta ate ACCEPTED ou MODIFIED explicito do treinador.
- **Migracao de atletas existentes**: atletas pre-ONBOARD entram como Cenario B (baseline calculado do historico real existente, score recalculado na primeira geracao pos-deploy).

### Frontend

- **Formulario de onboarding estendido** — coleta dos 11 campos obrigatorios (objetivo, dataProva, nivelExperiencia, volumeAtual, maiorTreinoRecente, diasDisponiveis, duracaoDisponivel, historicoLesoes, restricoes, modalidade, percepcaoCondicionamento). Dados opcionais (fcMaxima, fcRepouso, ritmoLimiar, ftp, etc.) nao bloqueiam. Estado intermediario salvo como draft, retomavel.
- **Extensao do feedback pos-treino** — durante `CALIBRATION`, modal coleta campos adicionais (dor, fadiga, sono, recuperacao entre sessoes) alem do RPE ja existente. Reaproveita o modal atual, sem novo canal de captura.
- **Indicador de calibracao** — banner/progresso na Home do atleta mostrando em qual semana de calibracao esta e o que falta para o plano personalizado.

## Criterios de aceite

- **CA1 — Classificacao automatica:** atleta com 10 semanas de historico completo -> score >= 75 -> Cenario A.
- **CA2 — Baseline Cenario C:** atleta sem historico -> baseline marcado ESTIMATED, fase CALIBRATION, requiresCoachReview = true.
- **CA3 — Re-baseline:** apos semana de calibracao com dado real -> baseline atualizado para MEASURED, score recalculado.
- **CA4 — Bloqueio Cenario C:** WeekSuggestion de atleta score < 45 nao visivel ao atleta ate aprovacao do treinador.
- **CA5 — Planejamento automatico:** atleta score >= 75 -> fluxo normal, sem gate adicional de cold start.
- **CA6 — Score bidirecional:** score pode descer durante calibracao -> reclassificacao automatica de cenario (ex: A -> B).
- **CA7 — Coach como proxy:** perfil preenchido pelo coach (nao auto-declarado) -> bonus de confianca (sobe um tier).
- **CA8 — Onboarding retomavel:** progresso parcial salvo como draft; atleta retoma de onde parou.
- **CA9 — Dedup entre fontes:** mesma atividade em Garmin + Strava -> merge preservando superset de metricas, sem duplicar.
- **CA10 — Atleta legado migrado:** atleta existente pre-ONBOARD -> Cenario B automatico na primeira geracao pos-deploy.

## Metrica de sucesso

**Taxa de conclusao de onboarding** (campos obrigatorios preenchidos / cadastros iniciados). Alvo: > 80%. Onboarding incompleto e o maior risco de abandono — se o formulario for longo demais, o atleta desiste antes de chegar ao primeiro plano.

## Impact

- **Depende de:** `deterministic-planner-engine` (consome `PlannerEngine`, `TrainingPhase.CALIBRATION`, `OnboardingContext`)
- **Repos:** `menthoros-backend` + `menthoros-front`
- **Nao bloqueia nem altera:** `add-aerobic-decoupling`, bloco de seguranca
- **Reordenacao:** posicionada apos `deterministic-planner-engine` (dependencia hard)

## Open Questions & Assumptions

- ✅ **SourcedValue<T>** — dropado para v1; usar coluna `proveniencia` simples (decisao CPO 2026-07-13)
- ✅ **OnboardingContext vs DadosPlanoDto** — composicao (decisao founder 2026-07-13)
- ✅ **Coach como proxy** — bonus de confianca de um tier (decisao CPO 2026-07-13)
- ✅ **Score bidirecional** — implementado na v1; regressao de score -> reclassificacao (decisao CPO 2026-07-13)
- **Heuristica Cenario C** — tabela hardcoded; calibrar com Design Partners
- **Duracao exata de calibracao por cenario** — hipotese inicial; ajustar com dado real
- **Aderencia minima para saida da calibracao** — threshold a definir com Design Partners
