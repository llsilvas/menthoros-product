# Tasks — athlete-onboarding-baseline

> Cross-repo. Ordem: spec (0) -> backend (1-5) -> **retrofit (10, novo — fazer ANTES de continuar
> pra 6-9)** -> contrato (6) -> frontend (7-9).
> Depende de `deterministic-planner-engine` merged (consome `PlannerEngine`, `OnboardingContext`, `TrainingPhase.CALIBRATION`) — **confirmado mergeado em `develop`, 2026-07-20**.
> Validacao: backend `./mvnw clean test`; frontend `npm run lint && npm run build && npm run test:run`.
> **Sessao de grilling/domain-modeling (2026-07-21):** 8 decisoes tomadas sobre o que ja esta
> implementado nas Secoes 1-5.7 (commits ate `b8892a7`). Nenhum codigo foi alterado ainda — ver
> Secao 10 (Retrofit). `apps/menthoros-backend/CONTEXT.md` (glossario) e
> `apps/menthoros-backend/docs/adr/0001-0003` documentam o raciocinio completo de cada decisao.

## 0. Spec (DoR)

- [x] 0.1 `specs/athlete-onboarding/spec.md` — cenarios Given/When/Then para CA1-CA13, espelhando o padrao de `deterministic-planner-engine/specs/planner-engine/spec.md`. **Pendente (ver 10.8):** CA14 (canal de integração + dispositivo) ainda não tem cenário — adicionado depois da sessão de grilling.

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
- [x] 0.2.3 ⚠️ **Retrofit pendente (10.3/10.6): tabela precisa dos 7 campos espelhados + `canalIntegracao`/`dispositivoMarca`/`dispositivoModelo` (migration nova, não editar esta).** `V61__create_tb_perfil_onboarding_atleta.sql` — nova tabela `tb_perfil_onboarding_atleta`
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
- [x] 2.3 ✅ **Retrofit aplicado (10.2): `AthleteBaselineSnapshot` renomeada para `AthleteBaselineState` + nova `AthleteBaselineHistory` (append-only).** Criar entidade JPA `AthleteBaselineSnapshot` mapeando `tb_athlete_baseline_snapshot`
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
- [x] 4.3 ⚠️ **Retrofit pendente (10.4): servico implementado e testado, mas nunca chamado em producao.** Implementar `CalibrationService` — gerencia `CalibrationStage`, recalcula baseline e score a cada semana (usando `getAdesaoSemana` da task 4.2.1 para a semana correta, nao `LocalDate.now()`), emite alerta ao treinador se preso em CALIBRATION alem da semana 4. **verify:** `./mvnw -Dtest=CalibrationServiceTest test` verde.
- [x] 4.4 TDD: `PlanningPolicyResolverTest` — derivar reviewMode/maxProgression/explanationRequired da faixa de score. **verify:** testes vermelhos.
- [x] 4.5 Implementar `PlanningPolicyResolver` — tabela de faixas (>=75, 45-74, <45) -> `PlanningPolicy`. **verify:** `./mvnw -Dtest=PlanningPolicyResolverTest test` verde.

## 5. Integracao com fluxo de geracao de plano

- [x] 5.1 TDD: `OnboardingServiceTest` — fluxo completo onboarding -> baseline -> score -> OnboardingContext. **verify:** testes vermelhos.
- [x] 5.2 Implementar `OnboardingService` — orquestra ActivityNormalizer -> BaselineCalculator -> ConfidenceScorer -> OnboardingContext. **verify:** `./mvnw -Dtest=OnboardingServiceTest test` verde (6 testes).
- [x] 5.3 Integrar no `PlanoServiceImpl` — `PlannerShadowService.aplicarShadow` ganhou uma sobrecarga
      que aceita `Optional<OnboardingContext>` (a original de 6 args delega para ela com
      `Optional.empty()`, preservando os 9 testes existentes de `PlannerShadowServiceTest`) e agora
      retorna `Optional<WeekPlanSkeleton>` em vez de `void` — necessario para o auto-approve (5.4)
      inspecionar `requiresCoachReview()`/`injuryRisk()` do ciclo corrente. `PlanoServiceImpl` chama
      `OnboardingService.montarContexto(...)` antes do shadow e repassa o contexto, que populam o
      campo `PlannerInputSnapshot.onboardingContext` (antes sempre `Optional.empty()`). **verify:**
      `./mvnw -Dtest=PlannerShadowServiceTest,PlanoServiceImplTest test` verde.
- [x] 5.4 TDD: auto-approve Cenario A (CA5, design.md Decisao 7 — **2 achados criticos do pre-mortem
      rodada 2, ambos corrigidos abaixo**):
      (a) apos `criarPlanoEntity`, se `PlanningPolicy.reviewMode == EXCEPTION_ONLY` E flag
      `onboarding.auto-approve.enabled` (nova, default true — kill-switch isolado, ver proposal.md
      "Rollback e Riscos") E `!weekPlanSkeleton.requiresCoachReview()` E
      `injuryRisk.level() != InjuryRiskLevel.HIGH_RISK` (checagem redundante por design, defesa em
      profundidade), chamar o metodo de transicao extraido (ver 5.4.1) para aprovar automaticamente;
      se qualquer condicao falhar, mantem `AGUARDANDO_REVISAO` padrao.
      (b) para `MANDATORY_NON_BLOCKING`/`MANDATORY_BLOCKING`, mantem `AGUARDANDO_REVISAO`
      (comportamento ja existente, sem alteracao — CA4).
      Implementado em `PlanoServiceImpl.aplicarAutoApproveSeElegivel`. **verify:**
      `PlanoServiceImplTest$AutoApproveCenarioA` (7 testes) cobre os 3 `reviewMode`, o caso "score
      alto mas requiresCoachReview=true", risco HIGH_RISK, flag desabilitada e shadow vazio.
- [x] 5.4.1 ✅ **Retrofit aplicado (10.1): `aprovarTransicao` grava `origemAprovacao`.** Extrair de `PlanoReviewServiceImpl.aprovarPlano` (linhas 67-78) um metodo interno
      reutilizavel (ex.: `aprovarTransicao(PlanoSemanal plano, UUID tenantId)`) com os mesmos 4
      efeitos: `setReviewStatus(APROVADO)`, `setReviewComment(null)`, `save` +
      `inicializarAssociacoes`, e **publicar `PlanoAprovadoEvent`** — chamado tanto pelo fluxo manual
      (`aprovarPlano`) quanto pelo auto-approve (5.4). Correcao do achado critico do pre-mortem
      rodada 2: a versao anterior desta task so setava o campo `reviewStatus`, sem publicar o
      evento que `IntervalsIcuPushListener` consome via `@TransactionalEventListener(AFTER_COMMIT)`
      para empurrar o treino ao relogio do atleta — sem isso, planos auto-aprovados nunca
      sincronizariam com integracoes externas. **verify:** teste de integracao confirma
      `PlanoAprovadoEvent` publicado nos dois caminhos (manual e auto-approve).
- [x] 5.5 Badge de baixa confianca na fila de revisao do coach (Cenario B, `MANDATORY_NON_BLOCKING`) — reaproveita `listarPlanosPendentes`/`PlanoReviewServiceImpl`, sem endpoint novo. Adicionado campo `confidenceTier` (nullable) em `PlanoSemanalOutputDto`, populado em `PlanoReviewServiceImpl.enriquecerComConfidenceTier` a partir do `AthleteBaselineSnapshotRepository` (null quando o atleta ainda nao passou pelo onboarding). **verify:** `./mvnw -Dtest=PlanoReviewServiceImplTest test` verde (3 novos testes de enriquecimento).
- [x] 5.6 `dataProva` do onboarding cria/atualiza `Prova` (CA13, design.md Decisao 8) — reaproveita o
      CRUD de `Prova` existente. **Na mesma transacao, desmarcar `provaAlvo=false` de qualquer outra
      `Prova` ativa do atleta antes de marcar a nova/atualizada como `provaAlvo=true`** (correcao do
      pre-mortem rodada 2 — `ProvaRepository.findByAtletaAndProvaAlvoTrue` nao garante unicidade e
      `PeriodizationPlanner.findFirst()` nao tem ordenacao determinada; sem essa correcao, o planner
      pode escolher uma prova diferente da que o onboarding acabou de criar). Implementado como
      `OnboardingService.criarOuAtualizarProvaAlvo(atletaId, tenantId, dataProva, tipoProva,
      distancia, distanciaKm, nomeProva)` — so o `dataProva` e obrigatorio nos 11 campos do
      onboarding (proposal.md); `tipoProva`/`distancia` ficam para o controller de `/onboarding/concluir`
      (task 6.0.3) prover. Atualiza a `Prova` existente quando `dataProva`+`distancia` coincidem com
      a prova-alvo atual; caso contrario cria uma nova e desmarca qualquer outra. **verify:**
      `./mvnw -Dtest=OnboardingServiceTest test` verde (5 novos testes, incluindo o caso de
      desmarcar a prova-alvo antiga).
- [x] 5.7 Migracao de atletas existentes — flag `onboarding.migrate-existing.enabled` (default true)
      que calcula baseline + score para atletas sem `AthleteBaseline`. Implementado em
      `PlanoServiceImpl.resolverOnboardingContext`: atletas SEM `AthleteBaselineSnapshot`
      (`OnboardingService.possuiBaseline`) so tem o contexto calculado quando a flag esta ligada;
      atletas que JA possuem snapshot continuam recalculando incondicionalmente (necessario para
      o re-baseline da calibracao, CA3). **verify:** `./mvnw -Dtest=PlanoServiceImplTest,OnboardingServiceTest test` verde (3 novos testes cobrindo legado+flag on/off e ja-migrado+flag off).

## 6. Contrato — endpoints novos + tipos no front

**Endpoints novos (achado do DoR gate — superfície não estava declarada):**

- [ ] 6.0.1 `POST /api/v1/atletas/{atletaId}/onboarding` — submete/salva o formulário (parcial ou
      completo). **Decisão final revisitada na sessão de grilling 2026-07-21 (substitui a
      "Corrigida Decisão 10" anterior, que mandava escrever direto em `Atleta` a cada step — ver
      Seção 10, task 10.3, e `apps/menthoros-backend/docs/adr/0002-*.md`):** durante `RASCUNHO`,
      **todos os 13 campos obrigatórios** (os 7 que também existem em `Atleta` + os 5 novos +
      `canalIntegracao`/`dispositivoMarca`, mais `dispositivoModelo` opcional) ficam SÓ em
      `tb_perfil_onboarding_atleta` — nada é escrito em `Atleta` neste endpoint. `@RequireTenant`,
      papel ATLETA (dono) ou TECNICO/ADMIN (coach-como-proxy, Decisão 3). Retorna o perfil
      (só a tabela nova, não composto com `Atleta` — composição só acontece após `COMPLETO`).
- [ ] 6.0.2 `GET /api/v1/atletas/{atletaId}/onboarding` — recupera o draft salvo (CA8, retomar
      onboarding interrompido); lê os 13 campos direto de `tb_perfil_onboarding_atleta` (durante
      `RASCUNHO`, é a única fonte — não compõe com `Atleta` ainda). `@RequireTenant`, mesmo
      controle de acesso do 6.0.1.
- [ ] 6.0.3 `POST /api/v1/atletas/{atletaId}/onboarding/concluir` — finaliza o onboarding.
      **Ordem (ver Seção 10, task 10.3):** (1) checar conflito — se `Atleta.atualizadoEm` for
      posterior ao `criadoEm` do rascunho, retornar `DomainConflictException` (409) em vez de
      migrar; (2) migrar os 7 campos espelhados de `tb_perfil_onboarding_atleta` para `Atleta`; (3)
      `status -> COMPLETO`; tudo na mesma transação. Depois: dispara `BaselineCalculator` +
      `ConfidenceScorer` (usando `dispositivoMarca` como prior via `FontePriority`), persiste
      `AthleteBaselineState` + primeira linha em `AthleteBaselineHistory`, cria/atualiza `Prova` a
      partir de `dataProva` (CA13, Decisão 8). Retorna `AthleteBaseline` (o record de leitura) +
      `confidenceScore`/`tier`. `@RequireTenant`.
- [ ] 6.0.4 `GET /api/v1/atletas/{atletaId}/calibracao` — retorna `CalibrationStatus` (phase, stage,
      weekNumber, confidenceScore) para o `CalibrationBanner` (task 8.2). `@RequireTenant`, papel
      ATLETA (próprio) ou TECNICO/ADMIN.
- [ ] 6.0.5 Campos de saúde (CA12, design.md Decisão 9, **corrigida no pre-mortem rodada 2** —
      "coach responsável" não existe como relação no modelo hoje): os endpoints acima usam
      `@RequireTenant` + papel ATLETA (dono) OU TECNICO/ADMIN do mesmo tenant (não um vínculo de
      coach designado, que exigiria modelagem nova fora de escopo). Documentar isso explicitamente
      no controller/Swagger — não deixar implícito.

- [ ] 6.1 Gerar referencia da API a partir dos endpoints 6.0.1-6.0.4; nao sobrescrever fachada.
- [ ] 6.2 Portar `AthleteOnboardingProfile` (13 campos obrigatorios — inclui `canalIntegracao`/
      `dispositivoMarca` — + opcionais, incluindo `dispositivoModelo`) para `types/`.
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

## 10. Retrofit — sessão de grilling/domain-modeling (2026-07-21)

> Faz ANTES de continuar para a Seção 6+ — as decisões abaixo mudam o schema e o comportamento de
> código já commitado (Seções 1-5.7, `develop`..`b8892a7`). Migrations novas (V63+; V59-V62 já
> aplicadas, não editar). Contexto completo: `apps/menthoros-backend/CONTEXT.md` +
> `apps/menthoros-backend/docs/adr/0001-0003`.

- [x] 10.1 `origemAprovacao` em `PlanoSemanal` (`COACH`/`AUTO_CONFIANCA_ALTA`) — migration nova
      (`ALTER TABLE tb_plano_semanal ADD COLUMN origem_aprovacao VARCHAR(30) NULL`).
      `PlanoReviewServiceImpl.aprovarTransicao` (task 5.4.1) passa a receber a origem como
      parâmetro e setar o campo; `aprovarPlano` (fluxo manual) passa `COACH`,
      `PlanoServiceImpl.aplicarAutoApproveSeElegivel` (task 5.4) passa `AUTO_CONFIANCA_ALTA`.
      **verify:** teste de integração confirmando os dois caminhos gravam a origem correta;
      `PlanoReviewServiceImplTest`/`PlanoServiceImplTest` existentes continuam verdes.
- [x] 10.2 Renomear `AthleteBaselineSnapshot` -> `AthleteBaselineState` (classe, repository,
      referências em `OnboardingServiceImpl`/`PlanoReviewServiceImpl`/`PlannerShadowService`) + nova
      entidade/tabela `AthleteBaselineHistory`/`tb_athlete_baseline_history` (append-only: mesmas
      colunas de `tb_athlete_baseline_snapshot` menos a `UNIQUE(atleta_id, tenant_id)`, mais
      `evento VARCHAR(30)` — ex. `ONBOARDING_CONCLUIDO`/`RE_BASELINE_SEMANAL`). `OnboardingService`
      grava nas duas tabelas no mesmo `save` (estado atual + uma linha de histórico), toda vez que
      recalcula. **verify:** teste confirmando que 3 recálculos seguidos do mesmo atleta produzem 1
      linha em `AthleteBaselineState` (sobrescrita) e 3 linhas em `AthleteBaselineHistory`.
- [ ] 10.3 Draft do onboarding em staging (substitui o comportamento atual de `tb_perfil_onboarding_atleta`
      só guardar os 5 campos novos — ver 6.0.1/6.0.2/6.0.3 acima e ADR-0002): adicionar os 7 campos
      espelhados de `Atleta` como colunas nullable em `tb_perfil_onboarding_atleta` (migration
      nova). Endpoint de conclusão (6.0.3) migra para `Atleta` só na conclusão, com a checagem de
      conflito por `atualizadoEm` (`DomainConflictException` se `Atleta` foi editada depois do
      início do rascunho). **verify:** teste cobrindo save-parcial sem tocar `Atleta`, conclusão
      migrando tudo numa transação, e o caso de conflito (edição concorrente) bloqueando com erro.
- [ ] 10.4 Ligar `CalibrationService.avaliarSemana` — hoje implementado e testado isoladamente, mas
      não chamado de lugar nenhum. Chamar de dentro de `PlanoServiceImpl.persistirPlanoCompleto`
      (mesmo ponto onde o shadow do `PlannerEngine` e o auto-approve já rodam, passo 4.5/4.6) —
      "uma semana de calibração" = um ciclo de `gerarPlanoTreino`, sem scheduler novo. **verify:**
      teste de integração confirmando que gerar um plano para um atleta em `CALIBRATION` dispara
      `avaliarSemana` e persiste o resultado (10.2).
- [ ] 10.5 Acesso a dado de saúde — já implementado corretamente como TECNICO/ADMIN do tenant
      (task 6.0.5/9.0 abaixo); sem mudança de código, só de documentação (ADR-0001 já registra o
      "técnico responsável" como débito para change futura — não construir aqui).
- [ ] 10.6 `CanalIntegracao` (`INTERVALS_ICU`/`MANUAL`) e `dispositivoMarca`/`dispositivoModelo` —
      2 colunas novas (enum) + 1 opcional (texto livre) em `tb_perfil_onboarding_atleta` (mesma
      migration da 10.3, ou separada). `ConfidenceScorer` ganha `dispositivoMarca` como input,
      usando `FontePriority` (já existente, reusado) como prior de "Fonte confiável" antes de
      qualquer atividade real existir — peso exato ainda em aberto (ver proposal.md Open
      Questions), usar o mesmo peso do critério "Fonte confiável" (15) como placeholder. Onboarding
      form não oferece `STRAVA` como opção de canal (ADR-0003). **verify:** teste do
      `ConfidenceScorer` cobrindo o prior por `dispositivoMarca` isolado (sem histórico de
      atividade) e o caso onde dado real substitui o prior.
- [ ] 10.7 **verify final da Seção 10:** `./mvnw clean test` verde; `tasks.md` Seções 1-5.7 revisadas
      para confirmar que nenhuma outra descrição ficou incompatível com as decisões acima.
- [ ] 10.8 Adicionar cenário Given/When/Then para CA14 em `specs/athlete-onboarding/spec.md` (0.1) —
      canal de integração + dispositivo declarados, incluindo o cenário de Strava não aparecer como
      opção para atleta novo (ADR-0003).

## 9. Verificacao de aceite (DoD)

- [ ] 9.0 Acesso a dado sensivel (CA12, design.md Decisao 9, corrigida rodada 2) — teste de
      integracao confirmando que o atleta dono e qualquer TECNICO/ADMIN do MESMO tenant leem campos
      de lesao/dor/fadiga/sono/recuperacao; um usuario de OUTRO tenant recebe 403/404 (isolamento de
      tenant, nao vinculo de coach individual — esse vinculo nao existe no modelo).
- [ ] 9.1 CA1-CA14 verificados ponta-a-ponta (backend + frontend).
- [ ] 9.2 Atleta legado: gerar plano para atleta do seed -> Cenario B, sem quebra.
- [ ] 9.3 Onboarding interrompido: fechar browser no step 2, reabrir -> retoma do step 2.
- [ ] 9.4 PR backend e PR front abertos (backend primeiro); CI verde nos dois.
