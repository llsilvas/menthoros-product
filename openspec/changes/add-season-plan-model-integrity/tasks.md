## 1. Modelo

- [ ] 1.1 Enums `MacrocicloStatus` e `OrigemValorSemana` (épico 1.1, 1.2)
- [ ] 1.2 Campos novos em `PlanoTreino` (épico 1.3)
- [ ] 1.3 Remapear `PlanoTreino`: `@ManyToOne prova`, `tenant_id`, sem `orphanRemoval` (épico 1.3a)
- [ ] 1.4 `PlanoTreinoRepository` filtrado por `tenant_id` (épico 1.3c)
- [ ] 1.5 Entidade `SemanaPlanejada` e `SemanaPlanejadaRepository` (épico 1.4, 1.6)

## 2. Migrations

- [ ] 2.1 Colunas novas em `tb_plano_treino`, troca das FKs para `RESTRICT`/`SET NULL`, índice único parcial de `ATIVO` (épico 1.7)
- [ ] 2.2 `tb_semana_planejada` com `tenant_id`, FK `CASCADE` e único por (`plano_treino_id`, `ordem`) (épico 1.8)

## 3. Regra de prova

- [ ] 3.1 Excluir prova referenciada responde 422; cancelar ou trocar arquiva a temporada `ATIVO` e preserva semanas e planos semanais (épico 1.11a)
- [ ] 3.2 Teste de integração: excluir prova com temporada e planos aprovados não apaga nada (épico 1.11b)
- [ ] 3.3 Teste: segunda `ATIVO` do mesmo atleta é recusada pelo banco

## 4. Fechamento

- [ ] 4.1 `CONTEXT.md`: Template de metodologia e Origem do valor (épico 1.11; Plano de temporada e Semana da temporada já entraram no PR #23 do `menthoros-infra`)
- [ ] 4.2 Validar: `./mvnw clean test` + migrations em banco limpo e com dados (épico 1.12)
