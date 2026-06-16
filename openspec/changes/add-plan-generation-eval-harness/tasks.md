## 1. Fixtures de arquétipos de atleta

- [ ] 1.1 Criar builders/fixtures de teste para os arquétipos mínimos (`iniciante-sem-lesao`, `avancado-tsb-baixo`, `com-lesao-ativa`, `taper-semana-prova`, `sem-dados`), incluindo `Atleta`, `PlanoMetaDados`, `Prova` e histórico de treinos coerentes
- [ ] 1.2 Fixar a data de referência (clock/`TreinoHistoricoProvider` stubado) para tornar `buildOptimizedPrompt` reprodutível

## 2. Camada A — Golden-master do prompt

- [ ] 2.1 (TDD) Criar `PlanoTreinoPromptBuilderGoldenTest` que monta o prompt de cada arquétipo e compara com `src/test/resources/golden/plano-prompt/<arquetipo>.txt`
- [ ] 2.2 Implementar a captura inicial dos golden-masters via flag explícita (ex.: `-Dgolden.update=true`); commitar os arquivos gerados como baseline
- [ ] 2.3 Garantir mensagem de falha clara (arquivo + instrução de regeneração) quando o prompt divergir
- [ ] 2.4 Validar `./mvnw clean test` (golden verde com a baseline atual)

## 3. Camada B — `PlanQualityChecker`

- [ ] 3.1 Definir os tipos do contrato: `ViolacaoQualidade` (regra, severidade, evidência) e o input determinístico (`ContextoDeterministico` ou equivalente) — como records
- [ ] 3.2 (TDD) Criar `PlanQualityCheckerTest` cobrindo cada regra (intervalado proibido/degradado, teto de pace, TSS alvo, dias consecutivos, lesão), com casos "respeita" e "viola"
- [ ] 3.3 Implementar `PlanQualityChecker`, delegando a `TrainingPrescriptionGuardSkill` / `IntervaladoElegibilidadeService` / lógica de teto de pace existente sempre que possível (agregar, não reimplementar)
- [ ] 3.4 Validar `./mvnw clean test`

## 4. Eval offline (CI)

- [ ] 4.1 Criar fixtures de plano `PlanoSemanalLlmDto` "bom" e "alucinado" (JSON hand-authored) por arquétipo relevante
- [ ] 4.2 (TDD) Teste de eval offline: checker passa no plano "bom" e acusa as violações esperadas no "alucinado" — sem chamar o LLM
- [ ] 4.3 Validar `./mvnw clean test`

## 5. Eval ao vivo (opt-in, fora do CI unitário)

- [ ] 5.1 Criar teste de eval ao vivo marcado com tag/profile (ex.: `@Tag("llm-eval")`) que chama o LLM real para um atleta-fixture e roda o checker sobre a saída
- [ ] 5.2 Garantir que essa tag **não** entra no `./mvnw clean test` padrão (não-determinística, custa tokens)
- [ ] 5.3 Documentar como executar a eval ao vivo (comando + profile) em comentário no teste ou nota da change

## 6. Validação Final

- [ ] 6.1 `./mvnw clean test` verde, sem a eval ao vivo
- [ ] 6.2 Confirmar zero mudança de comportamento em `IaServiceImpl`/`PlanoTreinoPromptBuilder` (a change só observa/mede)
- [ ] 6.3 Confirmar nenhum controller, DTO, entidade ou migration alterado
- [ ] 6.4 Atualizar este `tasks.md` com os checkmarks das tasks concluídas
