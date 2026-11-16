> Plano de execução refinado no `/implement init` (2026-11-15), depois do DoR (spec-reviewer + Codex).
> Ordem: migrations antes da entidade, para que os testes de repositório (Testcontainers + Flyway)
> rodem contra o schema real. Gate final é `./mvnw clean verify` — `clean test` não roda os `*IT`.

## 1. Migrations

- [ ] 1.1 `V116__add_macrociclo_plano_treino.sql`: colunas novas em `tb_plano_treino` (todas nulas; sem
  backfill de `macrociclo_status`), `prova_id` → `ON DELETE RESTRICT`, `tb_plano_semanal.plano_treino_id`
  → `ON DELETE SET NULL`, índice único parcial `(atleta_id) WHERE macrociclo_status = 'ATIVO'` (épico 1.7)
  - verify: Flyway aplica no Testcontainers do `./mvnw clean verify`; `\d tb_plano_treino` no homelab mostra
    as FKs novas
- [ ] 1.2 `V117__create_tb_semana_planejada.sql`: `tenant_id` NOT NULL, FK `plano_treino_id ON DELETE
  CASCADE`, único (`plano_treino_id`, `ordem`) (épico 1.8)
  - verify: idem 1.1

## 2. Modelo

- [ ] 2.1 Enums `MacrocicloStatus` e `OrigemValorSemana` (épico 1.1, 1.2)
  - verify: compila; sem teste (enum sem comportamento)
- [ ] 2.2 `PlanoTreino`: campos novos (épico 1.3); `@ManyToOne prova`; `tenant_id` mapeado;
  `planoSemanalList` com `cascade = {PERSIST, MERGE}` e sem `orphanRemoval` (épico 1.3a)
  - verify: teste de repositório — remover um `PlanoTreino` com planos semanais deixa os planos com
    `plano_treino_id` nulo; legado lido com `macrocicloStatus` nulo
- [ ] 2.3 `PlanoTreinoRepository` com consultas filtradas por `tenant_id` (épico 1.3c)
  - verify: teste de repositório — temporada de outro tenant não aparece
- [ ] 2.4 `SemanaPlanejada` e `SemanaPlanejadaRepository` filtrado por `tenant_id` (épico 1.4, 1.6)
  - verify: teste de repositório — salva e lê semanas por temporada; outro tenant não aparece; `ordem`
    repetida na mesma temporada é recusada
- [ ] 2.5 Índice parcial: segunda `ATIVO` do mesmo atleta recusada; vários legados (nulo) aceitos
  - verify: teste de repositório espera `DataIntegrityViolationException` só no caso `ATIVO`

## 3. Regra de prova

- [ ] 3.1 `deletarProva` (ADMIN): prova referenciada por `prova_id` ou `prova_alvo_id` → 
  `DomainRuleViolationException` (422) orientando a cancelar; sem referência → apaga como hoje (épico 1.11a)
  - verify: `ProvaServiceImplTest` (unit) cobre os três casos
- [ ] 3.2 Arquivamento: `cancelarProva`, `atualizarProva` com `CANCELADA` e troca de alvo em
  `garantirAlvoUnica` levam as temporadas `ATIVO` e `PROPOSTA` da prova (`prova_id`) a `ARQUIVADO` com
  `motivoVersao` = "prova cancelada"; idempotente; nunca `DELETE` (épico 1.11a)
  - verify: `ProvaServiceImplTest` cobre os três caminhos e a repetição
- [ ] 3.3 IT: excluir (ADMIN) e cancelar (treinador) prova com temporada, semanas e planos aprovados não
  apaga nenhuma linha de `tb_plano_treino`, `tb_semana_planejada` ou `tb_plano_semanal`; ADMIN com
  `prova_alvo_id` legado recebe 422, não 500 (épico 1.11b)
  - verify: novo `*IT` passa no `./mvnw clean verify`

## 4. Fechamento

- [ ] 4.1 `CONTEXT.md`: Template de metodologia e Origem do valor (épico 1.11; Plano de temporada e Semana
  da temporada já entraram no PR #23 do `menthoros-infra`)
  - verify: termos presentes, sem detalhe de implementação
- [ ] 4.2 Validar: `./mvnw clean verify` + aplicação sobe contra o homelab com dados (épico 1.12)
  - verify: build verde; log do Flyway mostra V116 e V117 aplicadas no homelab
