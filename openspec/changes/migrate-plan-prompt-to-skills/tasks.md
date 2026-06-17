> **Pré-requisito:** `add-plan-generation-eval-harness` mergeado (golden-master é a rede desta migração). O **`PlanQualityChecker` é construído AQUI**, por domínio (movido da eval-harness pelo reescopo product-lens). Cada incremento de domínio (seções 3+) só fecha com o golden-master verde (ou divergência revisada) e sem nova `ViolacaoQualidade`.

## 1. Snapshot prompt-capable (D1)

- [ ] 1.1 (TDD) `SnapshotPromptRendererTest`: serialização em seções ordenadas por prioridade; bloco de constraints mandatórias a partir de resultados `BLOCKER`/`CRITICAL` com marcação de não-sobrescrita; seções de análise e de apoio
- [ ] 1.2 Implementar `SnapshotPromptRenderer` (unidade isolada e testável; mantém o record `AthleteAnalysisSnapshot` limpo)
- [ ] 1.3 Validar `./mvnw clean test`

## 2. Inputs reais + runner de skills do plano (D2)

- [ ] 2.1 Criar mappers entidade→input para as skills do plano (`Atleta`/`PlanoMetaDados`/histórico → `*Input`), sem JPA cruzando para a skill
- [ ] 2.2 (TDD) Teste do runner: monta `SkillContext` com `atletaId`/`tenantId` reais + `dataReferencia`, executa o conjunto curado com inputs construídos, consolida `AthleteAnalysisSnapshot`, persiste `SkillExecution`; skill com input insuficiente é omitida sem erro
- [ ] 2.3 Implementar o runner dedicado (sem alterar o contrato já testado do `SkillOrchestratorService`)
- [ ] 2.4 Validar `./mvnw clean test`

## 3. Strangler — interval-eligibility (skill existe)

- [ ] 3.1 Caracterizar `formatarDecisaoIntervalado` (teste) antes de remover
- [ ] 3.2 Renderizar a decisão de intervalado a partir do snapshot (`IntervaladoElegibilidadeSkill`); remover `formatarDecisaoIntervalado` do `PromptBuilder`
- [ ] 3.3 Remover a execução-sombra (`UUID.randomUUID()`) de `IntervaladoElegibilidadeService`; o caminho real passa pelo runner
- [ ] 3.4 (TDD) Criar o contrato `PlanQualityChecker` (`ViolacaoQualidade` record) + 1ª regra (intervalado proibido/degradado) + teste offline com fixtures de plano "bom"/"alucinado" (sem LLM)
- [ ] 3.5 Golden-master: revisar e regenerar diff intencional; eval sem nova violação; `./mvnw clean test`

## 4. Strangler — load/recovery (skill existe)

- [ ] 4.1 Caracterizar `AlertasPromptFormatter.gerarAlertasObrigatorios`/`gerarHierarquiaDecisao` antes de remover
- [ ] 4.2 Renderizar alertas/hierarquia a partir do snapshot (`RecoveryCargaSkill`); remover as chamadas no `PromptBuilder`
- [ ] 4.3 Remover a execução-sombra em `MetricasAlertaService`
- [ ] 4.4 (TDD) Regra do checker para o domínio: dias consecutivos + restrições de lesão respeitadas no plano
- [ ] 4.5 Golden-master + eval + `./mvnw clean test`

## 5. Strangler — periodization (nova skill)

- [ ] 5.1 Caracterizar `PeriodizacaoPromptFormatter` (provas, evento competitivo, periodização, TSS alvo, tipo de semana)
- [ ] 5.2 (TDD) Criar skill de periodização (input record + payload + `*SkillTest`)
- [ ] 5.3 Renderizar via snapshot; remover/retrair `PeriodizacaoPromptFormatter` no `PromptBuilder`
- [ ] 5.4 (TDD) Regra do checker para o domínio: TSS alvo semanal respeitado (dentro da tolerância)
- [ ] 5.5 Golden-master + eval + `./mvnw clean test`

## 6. Strangler — variability (nova skill)

- [ ] 6.1 Caracterizar `VariabilidadePromptFormatter` (estímulos recentes, matriz, alertas)
- [ ] 6.2 (TDD) Criar skill de variabilidade
- [ ] 6.3 Renderizar via snapshot; retrair o formatter
- [ ] 6.4 Golden-master + eval + `./mvnw clean test`

## 7. Strangler — recovery-detail, pace-ceiling, availability

- [ ] 7.1 Absorver `RecuperacaoPromptFormatter` (em `RecoveryCargaSkill` ou nova skill); retrair o formatter
- [ ] 7.2 (TDD) Criar skill de teto de pace a partir de `PaceHistoricoFormatter.calcularTetoPorTipo`; renderizar via snapshot; retrair
- [ ] 7.3 (TDD) Migrar regras de `DisponibilidadePromptFormatter` (máx. dias consecutivos, distribuição semanal) para skill/regra; renderizar via snapshot; retrair
- [ ] 7.4 (TDD) Regra do checker para o domínio: teto de pace respeitado (nenhuma sessão mais rápida que o teto por tipo)
- [ ] 7.5 Golden-master + eval + `./mvnw clean test`

## 8. PromptBuilder como montador fino (D4)

- [ ] 8.1 Reescrever `buildOptimizedPrompt`: `SkillContext` → runner → snapshot → `SnapshotPromptRenderer` → concatena com dados do atleta + template
- [ ] 8.2 Deletar os formatters migrados que ficaram sem caller
- [ ] 8.3 Confirmar que `IaServiceImpl.geraPlanoSemanalAvancado` segue funcionando (mesma assinatura pública)
- [ ] 8.4 Golden-master final revisado + eval + `./mvnw clean test`

## 9. Resiliência estrutural da geração (D6 — folded de `harden-plan-generation-resilience`)

- [ ] 9.1 Unificar os 4 validadores idênticos (`REGENERATIVO`/`LONGO`/`CONTINUO`/`TEMPO_RUN`) em um `validarEstrutura3Etapas(tipo)` + ponto único de reparo (remove duplicação)
- [ ] 9.2 (TDD) Reparo determinístico: aquecimento/desaquecimento faltante → sintetizar etapa formulaica (zona fácil); ordem trocada com os 3 tipos presentes → reordenar. Casos: "2 etapas (falta desaq)" → 3 válidas; ordem invertida → canônica
- [ ] 9.3 (TDD) Reparo de `repeticoes != 1` por expansão (reaproveitar `expandirEtapasAgregadas`)
- [ ] 9.4 (TDD) Retry único com feedback: quando o reparo não se aplica (ex.: falta PRINCIPAL, regras de intervalado), re-chamar o LLM 1x injetando o motivo da rejeição; cobrir "falha → retry → sucesso" e "falha → retry falha → erro de domínio claro"
- [ ] 9.5 Extrair a orquestração reparo+retry para um colaborador dedicado (não inflar `IaServiceImpl`; coordenar com `refactor-iaservice-decomposition`)
- [ ] 9.6 Telemetria Micrometer: violações por tipo, reparos aplicados, retries, falhas finais
- [ ] 9.7 Golden-master + eval + `./mvnw clean test`

## 10. Validação Final

- [ ] 10.1 `./mvnw clean test` verde (suíte completa, sem regressão)
- [ ] 10.2 Eval determinística sem novas `ViolacaoQualidade` vs. baseline
- [ ] 10.3 Confirmar nenhum controller, DTO de API, entidade ou migration alterado
- [ ] 10.4 Confirmar que a lógica determinística agora vive em skills testadas e que os formatters migrados foram removidos
- [ ] 10.5 (MANUAL) Reproduzir o cenário `REGENERATIVO` inválido e confirmar recuperação (reparo ou retry) em vez de 503; regras de validação inalteradas
- [ ] 10.6 Atualizar este `tasks.md` com os checkmarks
