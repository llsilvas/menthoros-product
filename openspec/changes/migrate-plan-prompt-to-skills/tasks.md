> **Pré-requisitos:** `add-plan-generation-eval-harness` (golden-master) + `introduce-plan-constraints` (seam `Constraint`, bloco [1] e `PlanQualityChecker` já de pé, alimentados por formatters). Esta change só troca a **fonte** das `Constraint` e seções de formatter→skill. Cada incremento fecha com golden-master verde (ou divergência revisada) e sem nova `ViolacaoQualidade` no checker. O checker NÃO é construído aqui.

## 1. Snapshot prompt-capable (D1)

- [ ] 1.1 (TDD) `SnapshotPromptRendererTest`: renderer de 3 camadas (constraints/advisory/dados) sobre `(snapshot, inputs)`; o bloco [1] (de `introduce-plan-constraints`) passa a ler `Constraint` do snapshot
- [ ] 1.2 Implementar/evoluir `SnapshotPromptRenderer` (unidade isolada e testável; mantém o record `AthleteAnalysisSnapshot` limpo)
- [ ] 1.3 Validar `./mvnw clean test`

## 2. Inputs reais + runner de skills do plano (D2)

- [ ] 2.1 Criar mappers entidade→input para as skills do plano (`Atleta`/`PlanoMetaDados`/histórico → `*Input`), sem JPA cruzando para a skill
- [ ] 2.2 (TDD) Teste do runner: monta `SkillContext` com `atletaId`/`tenantId` reais + `dataReferencia`, executa o conjunto curado com inputs construídos, consolida `AthleteAnalysisSnapshot`, persiste `SkillExecution`; skill com input insuficiente é omitida sem erro
- [ ] 2.3 Implementar o runner dedicado (sem alterar o contrato já testado do `SkillOrchestratorService`)
- [ ] 2.4 Validar `./mvnw clean test`

## 3. Strangler — interval-eligibility (skill existe)

- [ ] 3.1 Caracterizar `formatarDecisaoIntervalado` (teste) antes de remover
- [ ] 3.2 `IntervaladoElegibilidadeSkill` **declara as `Constraint`** (`INTERVALADO_PROIBIDO`/`INTERVALADO_MAX_CATEGORIA`) que o formatter emitia; renderizar via snapshot; remover `formatarDecisaoIntervalado` do `PromptBuilder`
- [ ] 3.3 Remover a execução-sombra (`UUID.randomUUID()`) de `IntervaladoElegibilidadeService`; o caminho real passa pelo runner
- [ ] 3.4 Confirmar que o `PlanQualityChecker` (de `introduce-plan-constraints`) recebe a `Constraint` da skill sem mudança — a regra de intervalado já existe lá
- [ ] 3.5 Golden-master: revisar e regenerar diff intencional; checker sem nova violação; `./mvnw clean test`

## 4. Strangler — load/recovery (skill existe)

- [ ] 4.1 Caracterizar `AlertasPromptFormatter.gerarAlertasObrigatorios`/`gerarHierarquiaDecisao` antes de remover
- [ ] 4.2 `RecoveryCargaSkill` vira a fonte (assessments + `Constraint` aplicáveis); renderizar via snapshot; remover as chamadas no `PromptBuilder`
- [ ] 4.3 Remover a execução-sombra em `MetricasAlertaService`
- [ ] 4.4 Golden-master + checker sem nova violação + `./mvnw clean test`

## 5. Strangler — periodization (nova skill)

- [ ] 5.1 Caracterizar `PeriodizacaoPromptFormatter` (provas, evento competitivo, periodização, TSS alvo, tipo de semana)
- [ ] 5.2 (TDD) Criar skill de periodização (input record + payload + `*SkillTest`); declara `Constraint` de TSS alvo se aplicável
- [ ] 5.3 Renderizar via snapshot; retrair `PeriodizacaoPromptFormatter` (decisão → skill; dado → helper [3])
- [ ] 5.4 Golden-master + checker + `./mvnw clean test`

## 6. Strangler — variability (nova skill)

- [ ] 6.1 Caracterizar `VariabilidadePromptFormatter` (estímulos recentes, matriz, alertas)
- [ ] 6.2 (TDD) Criar skill de variabilidade
- [ ] 6.3 Renderizar via snapshot; retrair o formatter (dado → helper [3])
- [ ] 6.4 Golden-master + checker + `./mvnw clean test`

## 7. Strangler — recovery-detail, pace-ceiling, availability

- [ ] 7.1 Absorver `RecuperacaoPromptFormatter` (em `RecoveryCargaSkill` ou nova skill); retrair o formatter
- [ ] 7.2 (TDD) Criar skill de teto de pace a partir de `PaceHistoricoFormatter.calcularTetoPorTipo`; **declara `Constraint(PACE_TETO)`** (que o formatter emitia em `introduce-plan-constraints`); usa `dataReferencia` do contexto (fim do `LocalDate.now()`); retrair
- [ ] 7.3 (TDD) Migrar regras de `DisponibilidadePromptFormatter` para skill/regra; declara `Constraint(DIAS_PERMITIDOS`/`MAX_CONSECUTIVOS)`; renderizar via snapshot; retrair
- [ ] 7.4 Golden-master + checker sem nova violação + `./mvnw clean test`

## 8. PromptBuilder como montador fino (D4)

- [ ] 8.1 Reescrever `buildOptimizedPrompt`: `SkillContext` → runner → snapshot → `SnapshotPromptRenderer(snapshot, inputs)` → concatena com template
- [ ] 8.2 Deletar os formatters migrados que ficaram sem caller; dado-residual permanece como helper [3]
- [ ] 8.3 Confirmar que `IaServiceImpl.geraPlanoSemanalAvancado` segue funcionando (mesma assinatura pública)
- [ ] 8.4 Golden-master final revisado + checker + `./mvnw clean test`

## 9. Validação Final

- [ ] 9.1 `./mvnw clean test` verde (suíte completa, sem regressão)
- [ ] 9.2 `PlanQualityChecker` sem novas `ViolacaoQualidade` vs. baseline
- [ ] 9.3 Confirmar nenhum controller, DTO de API, entidade ou migration alterado
- [ ] 9.4 Confirmar que a decisão determinística agora vive em skills testadas (com `Constraint` declaradas) e que os formatters de decisão migrados foram removidos
- [ ] 9.5 Atualizar este `tasks.md` com os checkmarks
