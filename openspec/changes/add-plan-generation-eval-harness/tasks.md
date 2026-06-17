> **Escopo reduzido (product-lens):** só o golden-master (Camada A). `PlanQualityChecker` está em `migrate-plan-prompt-to-skills`; eval ao vivo está no Pós-MVP. Ver `PRODUCT-BRIEF.md`.

## 1. Fixtures de arquétipos de atleta

- [ ] 1.1 Criar builders/fixtures de teste para os arquétipos mínimos (`iniciante-sem-lesao`, `avancado-tsb-baixo`, `com-lesao-ativa`, `taper-semana-prova`, `sem-dados`), com `Atleta`, `PlanoMetaDados`, `Prova` e histórico coerentes
- [ ] 1.2 Fixar a data de referência (clock/`TreinoHistoricoProvider` stubado) para tornar `buildOptimizedPrompt` reprodutível

## 2. Golden-master do prompt

- [ ] 2.1 (TDD) Criar `PlanoTreinoPromptBuilderGoldenTest` que monta o prompt de cada arquétipo e compara com `src/test/resources/golden/plano-prompt/<arquetipo>.txt`
- [ ] 2.2 Implementar a captura inicial dos golden-masters via flag explícita (ex.: `-Dgolden.update=true`); commitar os arquivos como baseline
- [ ] 2.3 Garantir mensagem de falha clara (arquivo divergente + instrução de regeneração)
- [ ] 2.4 Validar `./mvnw clean test` (golden verde com a baseline atual)

## 3. Validação Final

- [ ] 3.1 `./mvnw clean test` verde
- [ ] 3.2 Confirmar zero mudança de comportamento em `IaServiceImpl`/`PlanoTreinoPromptBuilder` (só observa)
- [ ] 3.3 Confirmar nenhum controller, DTO, entidade ou migration alterado
- [ ] 3.4 Atualizar este `tasks.md` com os checkmarks
