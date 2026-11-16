> Plano de execução refinado no `/implement init` (2026-11-15), depois do DoR (spec-reviewer + Codex).
> Ordem: migrations antes da entidade, para que os testes de repositório (Testcontainers + Flyway)
> rodem contra o schema real. Gate final é `./mvnw clean verify` — `clean test` não roda os `*IT`.

> **Identificadores em inglês (ADR-0007, decisão de 2026-11-15 no `run`).** O spec do épico usa nomes em
> PT; no código e no schema valem os nomes abaixo. Campos legados de `PlanoTreino` não são renomeados.
>
> | Spec (PT) | Código / schema |
> |---|---|
> | `MacrocicloStatus` (PROPOSTA, ATIVO, ARQUIVADO, CONCLUIDO) | `SeasonPlanStatus` (PROPOSED, ACTIVE, ARCHIVED, COMPLETED) |
> | `OrigemValorSemana` (MOTOR, COACH, IA_ACEITA) | `WeekValueSource` (ENGINE, COACH, AI_ACCEPTED) |
> | `SemanaPlanejada` / `tb_semana_planejada` | `SeasonWeek` / `tb_season_week` |
> | `macrocicloStatus`, `totalSemanas`, `versao`, `motivoVersao` | `seasonStatus`, `totalWeeks`, `version`, `versionReason` |
> | `ctlInicial`, `volumePicoKm`, `longaoMaximoKm`, `preparacaoCurta` | `initialCtl`, `peakVolumeKm`, `maxLongRunKm`, `shortPreparation` |
> | `aprovadoPor`, `aprovadoEm` | `approvedBy`, `approvedAt` |
> | semana: `ordem`, `semanaInicio`, `fase`, `volumeAlvoKm`, `tssAlvo` | `weekIndex`, `weekStart`, `phase`, `targetVolumeKm`, `targetTss` |
> | semana: `longaoKm`, `descarga`, `sessoesChave`, `origemValor`, `marcoProvaId` | `longRunKm`, `deload`, `keySessions`, `valueSource`, `milestoneRaceId` |
> | `SemanaPlanejadaRepository` | `SeasonWeekRepository` |
>
> O texto gravado em `versionReason` continua em PT ("prova cancelada") — é dado exibido, não identificador.

## 1. Migrations

- [x] 1.1 `V116__add_season_plan_to_plano_treino.sql`: colunas novas em `tb_plano_treino` (todas nulas; sem
  backfill de `season_status`), `prova_id` → `ON DELETE RESTRICT`, `tb_plano_semanal.plano_treino_id`
  → `ON DELETE SET NULL`, índice único parcial `(atleta_id) WHERE season_status = 'ACTIVE'` (épico 1.7).
  FKs da V1 sem nome: localizadas no `pg_constraint` por bloco `DO`.
  - verify: Flyway aplica no Testcontainers (contexto do `AssinaturaRepositoryTest` sobe, 8/8 verdes);
    homelab fica para o 4.2
- [x] 1.2 `V117__create_tb_season_week.sql`: `tenant_id` NOT NULL (sem FK, padrão do módulo), FK
  `season_plan_id ON DELETE CASCADE`, único (`season_plan_id`, `week_index`), índice
  (`tenant_id`, `season_plan_id`) (épico 1.8)
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
