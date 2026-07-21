# Tasks — athlete-onboarding-baseline

> Cross-repo. Ordem: spec (0) -> backend (1-5) -> contrato (6) -> frontend (7-9).
> Depende de `deterministic-planner-engine` merged (consome `PlannerEngine`, `OnboardingContext`, `TrainingPhase.CALIBRATION`) — **confirmado mergeado em `develop`, 2026-07-20**.
> Validacao: backend `./mvnw clean test`; frontend `npm run lint && npm run build && npm run test:run`.

## 0. Spec (DoR)

- [x] 0.1 `specs/athlete-onboarding/spec.md` — cenarios Given/When/Then para CA1-CA13, espelhando o padrao de `deterministic-planner-engine/specs/planner-engine/spec.md`.

## 0.2. Migrations (Flyway) — achado do DoR gate (spec-reviewer, 2026-07-20)

Nenhuma migration estava listada apesar de 3 estruturas novas persistidas + 1 tabela alterada.
Próxima migration livre: **V59**. Todas aditivas (`CREATE TABLE`/`ADD COLUMN`, sem `DROP`/`ALTER`
destrutivo) — ver "Rollback" no proposal.md.

- [x] 0.2.1 `V59__create_tb_athlete_baseline_snapshot.sql` — nova tabela `tb_athlete_baseline_snapshot`
      (1 linha por atleta, `UNIQUE(atleta_id, tenant_id)`): `id UUID PK`, `atleta_id UUID FK`,
      `tenant_id UUID`, `ctl_estimado NUMERIC`, `atl_estimado NUMERIC`, `tsb_estimado NUMERIC`,
      `ctl_flag`/`atl_flag`/`tsb_flag VARCHAR(20)` (`ESTIMATED`/`MEASURED` por componente),
      `confidence_score INTEGER`, `confidence_tier VARCHAR(1)` (`A`/`B`/`C`), `calculated_at TIMESTAMP`,
      `criado_em`/`atualizado_em`. Substitui o "para uso futuro" vago da Decisão 6 do design.md por
      persistência real. **Não é o mesmo tipo que o record `AthleteBaseline.java` já reservado por
      `deterministic-planner-engine`** (contrato mínimo de leitura, 2 campos, inalterado) — esta
      tabela é o lado de escrita/persistência completo desta change; o record existente é mapeado a
      partir dela na borda do `OnboardingContext`. **verify:** migration roda limpa em dev
      (`./mvnw flyway:migrate` ou subida da app), `\d tb_athlete_baseline_snapshot` confere o schema.
- [x] 0.2.2 `V60__create_tb_atividade_proveniencia_descartada.sql` — nova tabela append-only
      (design.md Decisão 2, nome definitivo — substitui "ou equivalente"): `id UUID PK`,
      `atividade_id UUID FK` (para a `TreinoRealizado` ativa), `tenant_id UUID`,
      `fonte_descartada VARCHAR(50)`, `dados_descartados JSONB`, `motivo_descarte VARCHAR(255)`,
      `criado_em TIMESTAMP`. Sem `UPDATE`/`DELETE` no fluxo normal (auditoria). **verify:** teste de
      integração do `ActivityDedupService` (task 1.4) confirma insert nesta tabela ao descartar uma
      atividade duplicada.
- [x] 0.2.3 `V61__create_tb_perfil_onboarding_atleta.sql` — nova tabela `tb_perfil_onboarding_atleta`
      **corrigida durante a implementação (design.md Decisão 10 — achado: 7 dos 11 campos já
      existem em `Atleta`, não duplicar)**: (`UNIQUE(atleta_id, tenant_id)`): `id UUID PK`,
      `atleta_id UUID FK`, `tenant_id UUID`, `status VARCHAR(20)` (`RASCUNHO`/`COMPLETO` — suporta
      retomar draft, CA8), **apenas os 5 campos genuinamente novos** (`maior_treino_recente_km
      NUMERIC`, `duracao_disponivel_min INTEGER`, `restricoes TEXT`, `modalidade VARCHAR(30)`,
      `percepcao_condicionamento VARCHAR(30)`), `preenchido_por_coach BOOLEAN DEFAULT false` (bônus
      coach-como-proxy, Decisão 3), `criado_em`/`atualizado_em`. Os outros 7 campos obrigatórios
      (objetivo, nivelExperiencia, diasDisponiveis, historicoLesoes/temLesao/descricaoLesao/
      dataUltimaLesao, volumeSemanalMax) são escritos DIRETO em `tb_atleta` — colunas já existentes,
      sem migration nova para eles. **verify:** teste de integração cobrindo save-parcial (status
      RASCUNHO, incluindo campos já escritos em `Atleta` antes da conclusão) + retomada (CA8, task
      9.3).
- [x] 0.2.4 `V62__add_calibration_fields_treino_realizado.sql` — `ALTER TABLE tb_treino_realizado ADD
      COLUMN nivel_dor INTEGER NULL`, `ADD COLUMN nivel_fadiga INTEGER NULL`, `ADD COLUMN
      nivel_recuperacao INTEGER NULL` (1-10, mesmo padrão de `nivel_estresse`/
      `qualidade_sono_noite_anterior` já existentes na mesma tabela — **sono e estresse já existem,
      não recriar**). Usados pelas tasks 8.3/8.4 (campos extras visíveis só durante `CALIBRATION`).
      **verify:** `TreinoRealizado` entity atualizada, teste de mapeamento JPA verde.

## 1. Activity Normalizer

- [x] 1.1 TDD: `ActivityNormalizerTest` — cobrir normalizacao de cada campo (sport, pace, power null vs 0, rpe null), dataQuality nas 3 dimensoes. **Corrigido durante a implementacao:** `toCanonical` tem 1 parametro so (`TreinoRealizado`), nao 2 — a fonte ja vem de `treino.getFonteDados()`, sem precisar de um `DataSource` separado (cada conector ja filtra modalidade antes de persistir). **verify:** testes vermelhos → 11 testes verdes.
- [x] 1.2 Implementar `ActivityNormalizer` — `NormalizedActivity toCanonical(TreinoRealizado)`, dataQuality = 0.5*completude + 0.3*confiabilidadeFonte + 0.2*consistenciaInterna. **verify:** `./mvnw -Dtest=ActivityNormalizerTest test` verde (11/11).
- [x] 1.3 TDD: `ActivityDedupServiceTest` — mesma atividade em 2 fontes -> merge (retem 1, descarta a outra pra auditoria); atividades distintas no mesmo dia -> nao merge. **Escopo corrigido durante a implementacao (design.md Decisao 2):** o dedup roda como leitura no calculo do baseline (`OnboardingService`), NAO no momento da ingestao — nao mexe nos 3 pipelines existentes (Strava/FIT/intervals.icu), nao cria/altera/apaga `TreinoRealizado`. Cobrir: 2 calculos de baseline concorrentes do MESMO atleta nao duplicam auditoria (residual real, mais estreito que o originalmente pensado). **verify:** testes vermelhos.
- [x] 1.4 Implementar `ActivityDedupService` — `List<NormalizedActivity> deduplicar(List<NormalizedActivity>
      historico)`: agrupa por `dataTreino`, dentro do mesmo dia funde por similaridade +-5%
      duracao/distancia (janela degradada de +-10min de horario — schema sem precisao de hora,
      correcao durante a implementacao), ordena por `sourcePriority`, retem a de maior prioridade na
      lista devolvida e grava a(s) descartada(s) em `tb_atividade_proveniencia_descartada` (FK pro
      `TreinoRealizado` vencedor) — **NAO cria/altera/apaga nenhum `TreinoRealizado`** (correcao de
      escopo durante a implementacao, design.md Decisao 2: dedup e leitura no calculo do baseline,
      nao ingestao). `@Transactional` na escrita da auditoria — sem lock pessimista dedicado (o
      residual de 2 calculos de baseline concorrentes do mesmo atleta e aceito, mesma classe dos
      demais TOCTOUs sem lock ja aceitos no projeto). **verify:**
      `./mvnw -Dtest=ActivityDedupServiceTest test` verde.

## 2. Baseline Calculator

- [x] 2.1 TDD: `BaselineCalculatorTest` — Cenario A (8+ semanas, baseline direto), Cenario B (4 semanas, hibrido real + extrapolacao), Cenario C (zero, heuristica). **verify:** testes vermelhos.
- [x] 2.2 Implementar `BaselineCalculator` — reusa `TsbService` para CTL/ATL/TSB; Cen B preenche lacunas com TSS estimado (marcado ESTIMATED); Cen C usa tabela heuristica (`nivelExperiencia` x `modalidade`). **verify:** `./mvnw -Dtest=BaselineCalculatorTest test` verde.
- [x] 2.3 Criar entidade JPA `AthleteBaselineSnapshot` mapeando `tb_athlete_baseline_snapshot`
      (migration 0.2.1) — persiste CTL/ATL/TSB + flags ESTIMATED/MEASURED por componente +
      `calculatedAt` + `confidenceScore`/`confidenceTier`. Mapper para o record `AthleteBaseline`
      (2 campos, já reservado por `deterministic-planner-engine`) na borda de leitura do
      `OnboardingContext` — o record em si não muda. **verify:** compila + teste de repositório.

## 3. Confidence Scorer

- [x] 3.1 TDD: `ConfidenceScorerTest` — cobrir cada um dos 8 criterios, cenarios A/B/C por score, bonus coach-como-proxy. **verify:** testes vermelhos.
- [x] 3.2 Implementar `ConfidenceScorer` — soma ponderada 0-100, normalizacao para 0.0-1.0 na borda do `OnboardingContext`. **verify:** `./mvnw -Dtest=ConfidenceScorerTest test` verde.

## 4. Calibration Phase + PlanningPolicy

- [x] 4.1 `CALIBRATION` ja existe em `TrainingPhase` (reservado por `deterministic-planner-engine`, merged) — so criar `CalibrationStage` enum interno, sem editar o enum de fase.
- [x] 4.2 TDD: `CalibrationServiceTest` — transicao OBSERVATION->CALIBRATION->STABILIZATION, re-baseline semanal, score bidirecional (sobe e desce), saida da calibracao (score >= 45 + sem HIGH_RISK + `percentualRealizacao` >= 70% via o novo `getAdesaoSemana(atletaId, dataReferencia)`, design.md Decisao 5). **verify:** testes vermelhos.
- [x] 4.2.1 Adicionar `MetricasAdesaoService.getAdesaoSemana(String atletaId, LocalDate dataReferencia)`
      — novo metodo publico, delega para o `calcularSemana(Atleta, LocalDate)` privado ja existente
      (`MetricasAdesaoService.java:252`); aditivo, nao altera `getAdesaoSemanal(atletaId)` existente
      (correcao do pre-mortem rodada 2 — o metodo publico atual sempre usa `LocalDate.now()`, nao
      serve para avaliar "a semana mais recente de calibracao" quando ela nao e a semana corrente).
      **verify:** teste unitario comparando `getAdesaoSemana(id, dataPassada)` vs. `calcularSemana`
      direto.
- [x] 4.3 Implementar `CalibrationService` — gerencia `CalibrationStage`, recalcula baseline e score a cada semana (usando `getAdesaoSemana` da task 4.2.1 para a semana correta, nao `LocalDate.now()`), emite alerta ao treinador se preso em CALIBRATION alem da semana 4. **verify:** `./mvnw -Dtest=CalibrationServiceTest test` verde.
- [x] 4.4 TDD: `PlanningPolicyResolverTest` — derivar reviewMode/maxProgression/explanationRequired da faixa de score. **verify:** testes vermelhos.
- [x] 4.5 Implementar `PlanningPolicyResolver` — tabela de faixas (>=75, 45-74, <45) -> `PlanningPolicy`. **verify:** `./mvnw -Dtest=PlanningPolicyResolverTest test` verde.

## 5. Integracao com fluxo de geracao de plano

- [ ] 5.1 TDD: `OnboardingServiceTest` — fluxo completo onboarding -> baseline -> score -> OnboardingContext. **verify:** testes vermelhos.
- [ ] 5.2 Implementar `OnboardingService` — orquestra ActivityNormalizer -> BaselineCalculator -> ConfidenceScorer -> OnboardingContext. **verify:** `./mvnw -Dtest=OnboardingServiceTest test` verde.
- [ ] 5.3 Integrar no `PlanoServiceImpl` — se `OnboardingContext` presente e `planner-engine.enabled`,
      montar `PlannerInputSnapshot` (populando o campo `onboardingContext`, hoje `Optional.empty()`
      em `PlannerShadowService.java:178-180`) e chamar **`PlannerEngine.planWeek(PlannerInputSnapshot)`**
      — correcao do pre-mortem rodada 2: a assinatura `planWeek(dados, ctx)` da versao anterior desta
      task nao existe no codigo real; o metodo real e `planWeek(PlannerInputSnapshot)`
      (`PlannerEngine.java:49`). Definir onde vive o mapper `DadosPlanoDto + OnboardingContext ->
      PlannerInputSnapshot`. **verify:** teste de integracao.
- [ ] 5.4 TDD: auto-approve Cenario A (CA5, design.md Decisao 7 — **2 achados criticos do pre-mortem
      rodada 2, ambos corrigidos abaixo**):
      (a) apos `criarPlanoEntity`, se `PlanningPolicy.reviewMode == EXCEPTION_ONLY` E flag
      `onboarding.auto-approve.enabled` (nova, default true — kill-switch isolado, ver proposal.md
      "Rollback e Riscos") E `!weekPlanSkeleton.requiresCoachReview()` E
      `injuryRisk.level() != InjuryRiskLevel.HIGH_RISK` (checagem redundante por design, defesa em
      profundidade), chamar o metodo de transicao extraido (ver 5.4.1) para aprovar automaticamente;
      se qualquer condicao falhar, mantem `AGUARDANDO_REVISAO` padrao.
      (b) para `MANDATORY_NON_BLOCKING`/`MANDATORY_BLOCKING`, mantem `AGUARDANDO_REVISAO`
      (comportamento ja existente, sem alteracao — CA4).
      **verify:** teste de integracao cobrindo os 3 `reviewMode` **e** o caso "score alto mas
      requiresCoachReview=true" (nao deve auto-aprovar).
- [ ] 5.4.1 Extrair de `PlanoReviewServiceImpl.aprovarPlano` (linhas 67-78) um metodo interno
      reutilizavel (ex.: `aprovarTransicao(PlanoSemanal plano, UUID tenantId)`) com os mesmos 4
      efeitos: `setReviewStatus(APROVADO)`, `setReviewComment(null)`, `save` +
      `inicializarAssociacoes`, e **publicar `PlanoAprovadoEvent`** — chamado tanto pelo fluxo manual
      (`aprovarPlano`) quanto pelo auto-approve (5.4). Correcao do achado critico do pre-mortem
      rodada 2: a versao anterior desta task so setava o campo `reviewStatus`, sem publicar o
      evento que `IntervalsIcuPushListener` consome via `@TransactionalEventListener(AFTER_COMMIT)`
      para empurrar o treino ao relogio do atleta — sem isso, planos auto-aprovados nunca
      sincronizariam com integracoes externas. **verify:** teste de integracao confirma
      `PlanoAprovadoEvent` publicado nos dois caminhos (manual e auto-approve).
- [ ] 5.5 Badge de baixa confianca na fila de revisao do coach (Cenario B, `MANDATORY_NON_BLOCKING`) — reaproveita `listarPlanosPendentes`/`PlanoReviewServiceImpl`, sem endpoint novo. **verify:** teste de integracao.
- [ ] 5.6 `dataProva` do onboarding cria/atualiza `Prova` (CA13, design.md Decisao 8) — reaproveita o
      CRUD de `Prova` existente. **Na mesma transacao, desmarcar `provaAlvo=false` de qualquer outra
      `Prova` ativa do atleta antes de marcar a nova/atualizada como `provaAlvo=true`** (correcao do
      pre-mortem rodada 2 — `ProvaRepository.findByAtletaAndProvaAlvoTrue` nao garante unicidade e
      `PeriodizationPlanner.findFirst()` nao tem ordenacao determinada; sem essa correcao, o planner
      pode escolher uma prova diferente da que o onboarding acabou de criar). **verify:** teste de
      integracao confirmando no maximo 1 `Prova` com `provaAlvo=true` por atleta apos o fluxo.
- [ ] 5.7 Migracao de atletas existentes — flag `onboarding.migrate-existing` que calcula baseline + score para atletas sem `AthleteBaseline`. **verify:** teste com atleta legado (dados reais do seed).

## 6. Contrato — endpoints novos + tipos no front

**Endpoints novos (achado do DoR gate — superfície não estava declarada):**

- [ ] 6.0.1 `POST /api/v1/atletas/{atletaId}/onboarding` — submete/salva o formulário (parcial ou
      completo). **Corrigido (design.md Decisão 10):** escreve os 7 campos já existentes DIRETO em
      `Atleta` (objetivo, nivelExperiencia, diasDisponiveis, historicoLesoes/temLesao/
      descricaoLesao/dataUltimaLesao, volumeSemanalMax) e os 5 campos novos +
      `status=RASCUNHO`/`COMPLETO` (todos os 11 presentes) em `tb_perfil_onboarding_atleta` — mesma
      transação. `@RequireTenant`, papel ATLETA (dono) ou TECNICO/ADMIN (coach-como-proxy,
      Decisão 3). Retorna o perfil composto (campos de `Atleta` + tabela nova).
- [ ] 6.0.2 `GET /api/v1/atletas/{atletaId}/onboarding` — recupera o draft salvo (CA8, retomar
      onboarding interrompido); compõe os 7 campos já em `Atleta` + os 5 campos +
      `status` de `tb_perfil_onboarding_atleta`. `@RequireTenant`, mesmo controle de acesso do 6.0.1.
- [ ] 6.0.3 `POST /api/v1/atletas/{atletaId}/onboarding/concluir` — finaliza o onboarding: dispara
      `BaselineCalculator` + `ConfidenceScorer`, persiste `AthleteBaselineSnapshot`, cria/atualiza
      `Prova` a partir de `dataProva` (CA13, Decisão 8). Retorna `AthleteBaseline` (o record de
      leitura) + `confidenceScore`/`tier`. `@RequireTenant`.
- [ ] 6.0.4 `GET /api/v1/atletas/{atletaId}/calibracao` — retorna `CalibrationStatus` (phase, stage,
      weekNumber, confidenceScore) para o `CalibrationBanner` (task 8.2). `@RequireTenant`, papel
      ATLETA (próprio) ou TECNICO/ADMIN.
- [ ] 6.0.5 Campos de saúde (CA12, design.md Decisão 9, **corrigida no pre-mortem rodada 2** —
      "coach responsável" não existe como relação no modelo hoje): os endpoints acima usam
      `@RequireTenant` + papel ATLETA (dono) OU TECNICO/ADMIN do mesmo tenant (não um vínculo de
      coach designado, que exigiria modelagem nova fora de escopo). Documentar isso explicitamente
      no controller/Swagger — não deixar implícito.

- [ ] 6.1 Gerar referencia da API a partir dos endpoints 6.0.1-6.0.4; nao sobrescrever fachada.
- [ ] 6.2 Portar `AthleteOnboardingProfile` (11 campos obrigatorios + opcionais) para `types/`.
- [ ] 6.3 Portar `CalibrationStatus` (phase, stage, weekNumber, confidenceScore) para `types/`.
- [ ] 6.4 **verify:** `npm run build`.

## 7. Frontend — Onboarding form

- [ ] 7.1 TDD: `AthleteOnboardingPageTest` — renderiza 11 campos, validacao, estado intermediario salvo/restaurado. **verify:** testes vermelhos.
- [ ] 7.2 Implementar `AthleteOnboardingPage` — formulario multi-step (perfil -> objetivo -> disponibilidade -> saude), progresso salvo como draft. **verify:** `npm run test:run`.
- [ ] 7.3 Integrar com `POST /onboarding` (draft, task 6.0.1) a cada step e `POST /onboarding/concluir` (task 6.0.3) no final — recebe `AthleteBaseline` + score. **verify:** smoke manual.
- [ ] 7.4 Bonus coach-como-proxy — se usuario logado e treinador preenchendo perfil de atleta, UI mostra "Preenchendo como treinador" e envia flag `filledByCoach: true`.

## 8. Frontend — Calibracao UI

- [ ] 8.1 TDD: `CalibrationBannerTest` — renderiza por stage (OBSERVATION/CALIBRATION/STABILIZATION), mostra semana atual, progresso. **verify:** testes vermelhos.
- [ ] 8.2 Implementar `CalibrationBanner` na Home do atleta — consome `GET /calibracao` (task 6.0.4) retornando `CalibrationStatus`. **verify:** `npm run test:run`.
- [ ] 8.3 TDD: `PostWorkoutFeedbackExtrasTest` — durante CALIBRATION, campos extras (dor, fadiga, sono, recuperacao) visiveis; fora de CALIBRATION, apenas RPE. **verify:** testes vermelhos.
- [ ] 8.4 Implementar extensao do `PostWorkoutFeedback` — condicional em `CalibrationStatus != null`, campos adicionais. **verify:** `npm run test:run`.
- [ ] 8.5 Notificacao/banner quando o atleta sai de CALIBRATION (design.md Decisao 5) — reaproveita o `CalibrationBanner` (8.2), sem canal novo. **verify:** `npm run test:run`.

## 9. Verificacao de aceite (DoD)

- [ ] 9.0 Acesso a dado sensivel (CA12, design.md Decisao 9, corrigida rodada 2) — teste de
      integracao confirmando que o atleta dono e qualquer TECNICO/ADMIN do MESMO tenant leem campos
      de lesao/dor/fadiga/sono/recuperacao; um usuario de OUTRO tenant recebe 403/404 (isolamento de
      tenant, nao vinculo de coach individual — esse vinculo nao existe no modelo).
- [ ] 9.1 CA1-CA13 verificados ponta-a-ponta (backend + frontend).
- [ ] 9.2 Atleta legado: gerar plano para atleta do seed -> Cenario B, sem quebra.
- [ ] 9.3 Onboarding interrompido: fechar browser no step 2, reabrir -> retoma do step 2.
- [ ] 9.4 PR backend e PR front abertos (backend primeiro); CI verde nos dois.
