> **Escopo reduzido (product-lens):** só o golden-master (Camada A). `PlanQualityChecker` está em `migrate-plan-prompt-to-skills`; eval ao vivo está no Pós-MVP. Ver `PRODUCT-BRIEF.md`.
>
> **Status (2026-06-16):** implementada. 5 golden-masters versionados; suíte completa 707/707; zero mudança de código de produção (apenas `src/test/`).

## 1. Fixtures de arquétipos de atleta

- [x] 1.1 Criar builders/fixtures de teste para os arquétipos mínimos (`iniciante-sem-lesao`, `avancado-tsb-baixo`, `com-lesao-ativa`, `taper-semana-prova`, `sem-dados`), com `Atleta`, `PlanoMetaDados`, `Prova` e histórico coerentes — `PlanoPromptArquetipos`
- [x] 1.2 Fixar a data de referência (clock/`TreinoHistoricoProvider` stubado) para tornar `buildOptimizedPrompt` reprodutível — `TreinoHistoricoProvider` mockado + `LocalDate.now()` congelado via `MockedStatic(CALLS_REAL_METHODS)` no escopo do build (sem alterar produção)

## 2. Golden-master do prompt

- [x] 2.1 (TDD) Criar `PlanoTreinoPromptBuilderGoldenTest` que monta o prompt de cada arquétipo e compara com `src/test/resources/golden/plano-prompt/<arquetipo>.txt` (`@ParameterizedTest`)
- [x] 2.2 Implementar a captura inicial dos golden-masters (via flag explícita `-Dgolden.update=true` ou criação automática quando ausente); baseline commitada (5 arquivos)
- [x] 2.3 Garantir mensagem de falha clara (arquivo divergente + instrução de regeneração)
- [x] 2.4 Validar `./mvnw clean test` (golden verde com a baseline atual)

## 3. Validação Final

- [x] 3.1 `./mvnw clean test` verde — 707 testes, 0 falhas
- [x] 3.2 Confirmar zero mudança de comportamento em `IaServiceImpl`/`PlanoTreinoPromptBuilder` (só observa — nenhum arquivo de produção tocado)
- [x] 3.3 Confirmar nenhum controller, DTO, entidade ou migration alterado (diff só em `src/test/`)
- [x] 3.4 Atualizar este `tasks.md` com os checkmarks
