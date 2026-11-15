## 1. Modelo

- [ ] 1.1 Migration `semana_planejada_id` e `desvio_alvo_percentual` em `tb_plano_semanal` (épico 1.10)

## 2. Contexto e fase

- [ ] 2.1 `SemanaPlanejadaSnapshot` (épico 5.1)
- [ ] 2.2 Carregar a semana da temporada no contexto de geração e no snapshot do planner (épico 5.2, 5.3)
- [ ] 2.3 Fase pela ordem lesão > pós-prova > temporada > heurística (épico 5.4)
- [ ] 2.4 Métrica `macrociclo.phase.divergence.count` em shadow (épico 5.5)

## 3. Prompt

- [ ] 3.1 Bloco de posição no ciclo no `PeriodizacaoPromptFormatter`, substituindo a fase legada e o "TSS Alvo Semanal" (épico 5.10)
- [ ] 3.2 Teste do prompt com e sem temporada (épico 5.10a)

## 4. Persistência e regressão

- [ ] 4.1 Gravar `semanaPlanejadaId` e `desvioAlvoPercentual` no plano semanal (épico 5.12)
- [ ] 4.2 Teste de regressão: atleta sem temporada gera plano idêntico ao atual (épico 5.16)
- [ ] 4.3 Validar: `./mvnw clean test` (épico 5.17)
