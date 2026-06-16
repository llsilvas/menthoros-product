## 1. Injeção do snapshot no prompt (`PlanoTreinoPromptBuilder`)

- [ ] 1.1 (TDD) Criar `PlanoTreinoPromptBuilderTest` cobrindo o novo overload `buildOptimizedPrompt(..., AthleteAnalysisSnapshot snapshot)`:
  - snapshot `null` → prompt **não** contém a seção `## Análise Fisiológica`
  - snapshot vazio (`results` vazio) → prompt **não** contém a seção
  - snapshot com resultados → prompt **contém** `snapshot.toPromptSummary()`
  - snapshot com `hasBlocker()`/`hasCritical()` → prompt contém o bloco de **constraints mandatórias** com marcação de prioridade
- [ ] 1.2 Adicionar o overload `buildOptimizedPrompt(atleta, metaDados, prova, inicioSemana, diasEfetivos, AthleteAnalysisSnapshot snapshot)`:
  - anexa a seção de skills apenas quando snapshot não-nulo e não-vazio
  - prefixa constraints mandatórias quando `hasBlocker()`/`hasCritical()`
  - a assinatura legada (sem snapshot) delega ao overload passando `null` (sem breaking change)
- [ ] 1.3 Validar `./mvnw clean test`

## 2. Montagem e execução das skills de plano

- [ ] 2.1 Confirmar a abordagem D1 (helper de execução direta vs. overload do orquestrador) — decisão sob supervisão `--step`
- [ ] 2.2 (TDD) Teste do componente que monta os inputs tipados das skills de plano a partir de `Atleta`/`PlanoMetaDados`/histórico (via mappers; **sem entidade JPA cruzando para a skill**) e executa o conjunto curado (D2), consolidando `AthleteAnalysisSnapshot`:
  - skill com dados suficientes → resultado presente no snapshot
  - skill com input insuficiente → omitida do snapshot (sem erro)
  - tenant correto propagado no `SkillContext`
- [ ] 2.3 Implementar o componente conforme D1/D2 (seleção curada via `SkillRegistry.findByKey` ou injeção direta dos beans)
- [ ] 2.4 Validar `./mvnw clean test`

## 3. Integração em `IaServiceImpl.geraPlanoSemanalAvancado`

- [ ] 3.1 (TDD) Teste verificando que `geraPlanoSemanalAvancado`:
  - monta `SkillContext` (atletaId, tenantId, `inicioSemana` como `dataReferencia`)
  - executa as skills **antes** da chamada ao LLM
  - passa o `AthleteAnalysisSnapshot` resultante ao `buildOptimizedPrompt`
- [ ] 3.2 Implementar a integração; atualizar o JavaDoc do método com **Side Effects: SkillExecution persists (best-effort via orquestrador)**
- [ ] 3.3 Garantir retrocompatibilidade: falha/snapshot vazio não impede a geração de plano
- [ ] 3.4 Validar `./mvnw clean test`

## 4. Validação Final

- [ ] 4.1 `./mvnw clean test` com a suíte completa verde (sem regressões)
- [ ] 4.2 Confirmar que nenhum controller, DTO, entidade ou migration foi alterado
- [ ] 4.3 Confirmar que a delegação legada (`IntervaladoElegibilidadeService`, `MetricasAlertaService`) segue intacta
- [ ] 4.4 Atualizar este `tasks.md` com os checkmarks das tasks concluídas
