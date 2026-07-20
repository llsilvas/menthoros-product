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
- **Visibilidade do plano via `PlanoReviewStatus` (mecanismo ja existente, nao novo)**: todo `PlanoSemanal` hoje ja nasce em `AGUARDANDO_REVISAO` e so fica visivel ao atleta quando o coach aprova via `PlanoReviewServiceImpl` (nao existe nenhum caminho de auto-aprovacao no codigo atual). Cenario C (`MANDATORY_BLOCKING`) portanto **nao exige trabalho novo** — e o comportamento padrao de hoje, sem alteracao. O trabalho novo real e o oposto: **auto-aprovar** o plano para Cenario A (`EXCEPTION_ONLY`), reduzindo a fila de revisao do coach para os atletas de alta confianca. Cenario B (`MANDATORY_NON_BLOCKING`) mantem o gate de aprovacao (nao auto-aprova), mas com badge/indicador de "baixa confianca" na tela de revisao do coach (reaproveita a UI existente de `listarPlanosPendentes`), nao um novo endpoint.
- **Migracao de atletas existentes**: atletas pre-ONBOARD entram como Cenario B (baseline calculado do historico real existente, score recalculado na primeira geracao pos-deploy).
- **Acesso a dado de saude do onboarding** (lesoes, dor, fadiga, sono, recuperacao): visivel ao atleta dono do dado e ao coach responsavel pelo atleta (vinculo `Atleta.assessoria`/coach designado) — mesmo modelo de acesso ja usado no resto do produto. Nenhum outro coach do tenant ve por padrao.
- **`dataProva` do onboarding cria/atualiza uma `Prova` real** (via o CRUD de `Prova` ja existente), marcada `provaAlvo=true` — nao e um campo solto duplicado; evita duas fontes de verdade para a mesma prova.

### Frontend

- **Formulario de onboarding estendido** — coleta dos 11 campos obrigatorios (objetivo, dataProva, nivelExperiencia, volumeAtual, maiorTreinoRecente, diasDisponiveis, duracaoDisponivel, historicoLesoes, restricoes, modalidade, percepcaoCondicionamento). Dados opcionais (fcMaxima, fcRepouso, ritmoLimiar, ftp, etc.) nao bloqueiam. Estado intermediario salvo como draft, retomavel.
- **Extensao do feedback pos-treino** — durante `CALIBRATION`, modal coleta campos adicionais (dor, fadiga, sono, recuperacao entre sessoes) alem do RPE ja existente. Reaproveita o modal atual, sem novo canal de captura.
- **Indicador de calibracao** — banner/progresso na Home do atleta mostrando em qual semana de calibracao esta e o que falta para o plano personalizado.

## Criterios de aceite

- **CA1 — Classificacao automatica:** atleta com >= 8 semanas de historico completo -> score >= 75 -> Cenario A.
- **CA2 — Baseline Cenario C:** atleta sem historico -> baseline marcado ESTIMATED, fase CALIBRATION, requiresCoachReview = true.
- **CA3 — Re-baseline:** apos semana de calibracao com dado real -> baseline atualizado para MEASURED, score recalculado.
- **CA4 — Bloqueio Cenario C (comportamento ja existente, sem trabalho novo):** plano de atleta score < 45 permanece `PlanoReviewStatus.AGUARDANDO_REVISAO` — invisivel ao atleta ate o coach aprovar via `PlanoReviewServiceImpl.aprovar`. Esta change so garante que Cenario C **nunca** recebe o auto-approve do CA5.
- **CA5 — Auto-aprovacao Cenario A (trabalho novo):** atleta score >= 75 -> plano gerado ja nasce `PlanoReviewStatus.APROVADO` (pula a fila de revisao do coach), em vez do `AGUARDANDO_REVISAO` padrao.
- **CA6 — Score bidirecional:** score pode descer durante calibracao -> reclassificacao automatica de cenario (ex: A -> B).
- **CA7 — Coach como proxy:** perfil preenchido pelo coach (nao auto-declarado) -> bonus de confianca (sobe um tier).
- **CA8 — Onboarding retomavel:** progresso parcial salvo como draft; atleta retoma de onde parou.
- **CA9 — Dedup entre fontes:** mesma atividade em Garmin + Strava -> merge preservando superset de metricas, sem duplicar.
- **CA10 — Atleta legado migrado:** atleta existente pre-ONBOARD -> Cenario B automatico na primeira geracao pos-deploy.
- **CA11 — Saida de calibracao (aderencia minima):** atleta sai de CALIBRATION quando score >= 45 E sem HIGH_RISK E `percentualRealizacao` (`MetricasAdesaoService`/`SemanaAdesaoDto`, ja existente) >= 70% na semana mais recente. Default v1 a calibrar com Design Partners (ver Open Questions).
- **CA12 — Acesso a dado de saude:** campos de lesao/dor/fadiga/sono/recuperacao do onboarding e do feedback pos-treino durante CALIBRATION sao visiveis ao atleta dono do dado e ao coach responsavel; nenhum outro coach do tenant os ve por padrao.
- **CA13 — `dataProva` cria `Prova`:** ao concluir o onboarding com `dataProva` preenchido, uma `Prova` e criada (ou atualizada, se ja existir uma `Prova` identica pendente) com `provaAlvo=true` — nao fica como campo solto fora do CRUD de `Prova`.

## Metrica de sucesso

**Do atleta:** taxa de conclusao de onboarding (campos obrigatorios preenchidos / cadastros iniciados). Alvo: > 80%. Onboarding incompleto e o maior risco de abandono — se o formulario for longo demais, o atleta desiste antes de chegar ao primeiro plano.

**Do coach (a que realmente importa para o North Star do produto):** tamanho da fila de `listarPlanosPendentes` por coach, segmentado por cenario de confianca — o objetivo direto desta change e reduzir revisao manual para atletas de alta confianca (CA5, auto-approve) sem aumentar risco para os de baixa confianca (CA4, gate mantido). Sem essa metrica, a change poderia melhorar retencao de atleta e piorar a rotina do coach ao mesmo tempo, sem ninguem perceber.

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
- ✅ **Acesso a dado de saude** — atleta dono + coach responsavel; nenhum outro coach do tenant (decisao 2026-07-20)
- ✅ **Gate de visibilidade do plano (Cenario C)** — reaproveita `PlanoReviewStatus`/`PlanoReviewServiceImpl` ja existente; sem UI/endpoint novo (decisao 2026-07-20, achado de codigo)
- ✅ **`dataProva` do onboarding** — cria/atualiza `Prova` real via CRUD existente, nao campo solto (decisao 2026-07-20)
- ✅ **Aderencia minima para saida da calibracao** — default v1: `percentualRealizacao` (`SemanaAdesaoDto`, ja existente) >= 70% na semana mais recente (decisao 2026-07-20) — **numero em si permanece hipotese**, ajustar com Design Partners
- ⚠️ **Proveniencia (SourcedValue<T> dropado) x historico de dedup retido** — contradicao entre este arquivo (linha 64, coluna simples) e design.md Decisao 2 ("valor descartado retido no historico de proveniencia, nunca apagado"). Resolvido em design.md Decisao 2 (ver correcao la): coluna `proveniencia` simples no registro ativo + tabela de auditoria separada (append-only) para os valores descartados no dedup — sem reintroduzir `SourcedValue<T>` como tipo de campo.
- **Heuristica Cenario C** — tabela hardcoded; calibrar com Design Partners
- **Duracao exata de calibracao por cenario** — hipotese inicial (1/2/2-4 semanas); ajustar com dado real. O coach precisa ser avisado (banner/notificacao) de quando cada atleta sai da calibracao — nao pode ser silencioso (achado do pre-mortem).
