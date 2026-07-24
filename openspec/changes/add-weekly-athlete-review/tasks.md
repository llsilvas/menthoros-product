# Tasks — add-weekly-athlete-review (M · Full · v1 backend-only)

> Escopo v1: consolidação sobre log manual + PMC/TSB, sem métricas `.fit`. Cada bloco fecha com `./mvnw clean test` no `apps/menthoros-backend`. Rastreabilidade de CA entre colchetes.

## 0. Pré-requisitos de DoR (confirmados antes de `/implement init`)

- [x] 0.1 Aderência/criticidade ancorada — `MetricasAdesaoService` (count/TSS), proxy de criticidade `TipoTreino.getFatorImpacto()`; sem conceito de "treino-chave". Ver Code Anchors (design.md) — [A3]
- [x] 0.2 Ponto de integração ancorado — `IaService.geraPlanoSemanalAvancado` → `PlanoTreinoPromptBuilder.buildOptimizedPrompt` (`PromptGerado`); síncrono `@Transactional`. Ver Code Anchors — [CA4]
- [ ] 0.3 Gate de rollout (não bloqueia implementação): validar A1 (custo LLM/atleta/mês) em canary via `CostTrackingAdvisor`, com a narrativa atrás de flag — [A1, D8]

## 1. Modelo & migration

- [ ] 1.1 Migration aditiva `tb_revisao_semanal` com unicidade `(tenant_id, atleta_id, semana_inicio)` — [CA6, CA7]
- [ ] 1.2 Entidade + DTO: `semanaInicio`/`semanaFim`, `adherenceSummary` (status ALTA|MEDIA|BAIXA + %), `trainingLoadSummary`, `fatigueSummary`, `progressionSummary`, `nextWeekFocus`, `risks[]`, `confidence`, `focusOutcome`, `generatedAt` — [CA1]
- [ ] 1.3 Validação: `./mvnw clean test`

## 2. Consolidação determinística

- [ ] 2.1 Consolidar aderência via `MetricasAdesaoService` e carga (TSS realizado vs planejado) da janela — [CA1]
- [ ] 2.2 Consolidar fadiga (TSB final + delta) e evolução a partir do PMC já persistido — [CA1]
- [ ] 2.3 Calcular `recommendationType` determinístico (RECOVERY|MAINTAIN|PROGRESS): TSS realizado <60% do planejado OU ≥1 treino de alta criticidade (`TipoTreino.getFatorImpacto() ≥ 1.15`) não realizado OU `confidence = BAIXA` ⇒ nunca PROGRESS — [CA2]
- [ ] 2.4 Rebaixar `confidence = BAIXA` no limiar (<2 treinos realizados OU sem ponto PMC/TSB válido) — [CA3]
- [ ] 2.5 Validação: `./mvnw clean test`

## 3. Geração do foco (IA, atrás de flag) & persistência

- [ ] 3.1 Gerar `nextWeekFocus` via infra LLM sobre os sinais já consolidados, recebendo `recommendationType` como restrição (sem recalcular números no prompt) — [CA1, D4]
- [ ] 3.2 Feature flag da narrativa LLM (D8): desligada ⇒ `nextWeekFocus` template-based sobre `recommendationType`, sem chamar LLM — [D8]
- [ ] 3.3 Persistir idempotente por janela (upsert em `(tenant, atleta, semanaInicio)`); geração/consulta sob `TenantContext` — [CA6, CA7]
- [ ] 3.4 Validação: `./mvnw clean test`

## 4. Integração com a próxima prescrição & loop de aprendizado

- [ ] 4.1 Injetar a revisão mais recente (`nextWeekFocus` + `risks`) como insumo da geração do próximo plano, atrás de flag (D8) — [CA4]
- [ ] 4.2 Garantir coach-in-the-loop: revisão é insumo, não altera plano automaticamente nem é exposta ao atleta — [CA5]
- [ ] 4.3 Registrar `focusOutcome` (MANTIDO|EDITADO|DESCARTADO) ao gerar/aprovar o próximo plano — sinal de aprendizado — [CA8, D6]
- [ ] 4.4 Validação: `./mvnw clean test`

## 5. Métrica de sucesso & instrumentação

- [ ] 5.1 Emitir evento/log estruturado nomeado (ex.: `RevisaoConsumidaEvent{tenant, atleta, semanaInicio}`) quando a revisão entra no insumo da geração de plano — base do proxy consumidas/geradas
- [ ] 5.2 Expor `focusOutcome` agregável para acompanhar mantido vs. editado/rejeitado
- [ ] 5.3 Validação: `./mvnw clean test`

## 6. Testes (rastreados a CA)

- [ ] 6.1 Consolidação semanal — contrato mínimo completo [CA1]
- [ ] 6.2 Baixa aderência força `status = BAIXA` e `recommendationType ∈ {RECOVERY, MAINTAIN}` (nunca PROGRESS) [CA2]
- [ ] 6.3 Semana com <2 treinos ou sem PMC/TSB → `confidence = BAIXA` e `recommendationType ≠ PROGRESS` [CA3]
- [ ] 6.4 Geração do próximo plano consome a revisão como insumo (flag ligada) [CA4]
- [ ] 6.5 Revisão não vaza ao atleta nem altera plano sem ação do coach [CA5]
- [ ] 6.6 Idempotência por janela (regenerar não duplica) [CA6]
- [ ] 6.7 Isolamento multi-tenant em geração e consulta [CA7]
- [ ] 6.8 Registro de `focusOutcome` (MANTIDO|EDITADO|DESCARTADO) ao decidir o próximo plano [CA8]
- [ ] 6.9 Narrativa LLM desligada (flag D8) → revisão determinística completa, sem chamada LLM [D8]
- [ ] 6.10 Validação final: `./mvnw clean test`
