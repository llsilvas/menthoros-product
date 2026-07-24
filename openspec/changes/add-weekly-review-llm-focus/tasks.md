# Tasks — add-weekly-review-llm-focus (M · Full · backend, IA + loop)

> Fatia 2 de 3. Depende de `add-weekly-review-consolidation`. Cada bloco fecha com `./mvnw clean test`. CA entre colchetes.

## 0. Pré-requisitos (ancorados)

- [x] 0.1 Integração ancorada — `IaService.geraPlanoSemanalAvancado` → `PlanoTreinoPromptBuilder.buildOptimizedPrompt` (`PromptGerado`), síncrono `@Transactional`. Ver Code Anchors — [CA4]
- [ ] 0.2 Gate de rollout (não bloqueia implementação): validar A1 (custo LLM/atleta/mês) em canary via `CostTrackingAdvisor`, narrativa atrás de flag — [A1, D5]

## 1. Narrativa LLM atrás de flag

- [ ] 1.1 Gerar `nextWeekFocus` via infra LLM sobre os sinais consolidados, recebendo `recommendationType` como restrição — [CA-LLM]
- [ ] 1.2 Flag `menthoros.weekly-review.llm.enabled`: desligada ⇒ template determinístico da Fatia 1, sem chamada LLM — [CA-LLM, D5]
- [ ] 1.3 Validação: `./mvnw clean test`

## 2. Insumo na geração do próximo plano

- [ ] 2.1 Injetar a revisão mais recente (`nextWeekFocus` + `risks`) no `PlanoTreinoPromptBuilder`, atrás de flag — [CA4]
- [ ] 2.2 Coach-in-the-loop: não altera plano automaticamente nem expõe ao atleta — [CA5]
- [ ] 2.3 Emitir `RevisaoConsumidaEvent{tenant, atleta, semanaInicio}` quando a revisão entra no insumo — proxy de adoção
- [ ] 2.4 Validação: `./mvnw clean test`

## 3. Loop de aprendizado

- [ ] 3.1 Migration aditiva do campo `focusOutcome`
- [ ] 3.2 Registrar `focusOutcome` (MANTIDO|EDITADO|DESCARTADO) ao gerar/aprovar o próximo plano — [CA8, D7]
- [ ] 3.3 Expor `focusOutcome` agregável — sinal de aprendizado
- [ ] 3.4 Validação: `./mvnw clean test`

## 4. Testes (rastreados a CA)

- [ ] 4.1 Geração do próximo plano consome a revisão (flag ligada) [CA4]
- [ ] 4.2 Revisão não vaza ao atleta nem altera plano sem ação do coach [CA5]
- [ ] 4.3 Registro de `focusOutcome` ao decidir o próximo plano [CA8]
- [ ] 4.4 Flag desligada → `nextWeekFocus` template, sem chamada LLM; flag ligada → narrativa consistente com `recommendationType` [CA-LLM]
- [ ] 4.5 Validação final: `./mvnw clean test`
