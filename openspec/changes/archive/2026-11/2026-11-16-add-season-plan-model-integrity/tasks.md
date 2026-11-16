> **Entregue em 2026-11-16:** backend PR #239 (squash `51cf493` em `develop`), 18/18 tasks. Glossário
> (4.1) no PR #24 do `menthoros-infra`, ainda aberto. Adiados para o ticket 2: índice `(tenant_id, prova_id)`
> e o caso "desmarcar a alvo sem substituta" (ver as notas das seções 3 e 5).
>
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

- [x] 2.1 Enums `SeasonPlanStatus` e `WeekValueSource` (épico 1.1, 1.2)
  - verify: compila; sem teste (enum sem comportamento)
- [x] 2.2 `PlanoTreino`: campos novos (épico 1.3); `@ManyToOne prova`; `tenant_id` mapeado como
  `Assessoria assessoria` (padrão de `PlanoSemanal`); `planoSemanalList` com `cascade = {PERSIST, MERGE}`
  e sem `orphanRemoval` (épico 1.3a)
  - verify: `PlanoTreinoRepositoryTest` — remover pelo JPA deixa o plano semanal com `planoTreino` nulo;
    legado lido com `seasonStatus` nulo. Regressão: `PlanoServiceImplTest` (73), `PlanoServiceTenantTest`,
    `BatchPlanProcessorTest`, `PlanoSemanalOrigemEncerramentoTest` verdes
- [x] 2.3 `PlanoTreinoRepository.findByIdAndAssessoriaId` (épico 1.3c)
  - verify: `PlanoTreinoRepositoryTest` — temporada de outro tenant não aparece
- [x] 2.4 `SeasonWeek` (`tenant_id` como `UUID`, sem FK — padrão de tabela do módulo) e
  `SeasonWeekRepository.findBySeasonPlanIdAndTenantIdOrderByWeekIndexAsc` (épico 1.4, 1.6)
  - verify: `SeasonWeekRepositoryTest` (3) — ordem, outro tenant vazio, `week_index` repetido recusado
- [x] 2.5 Índice parcial: segunda `ACTIVE` do mesmo atleta recusada; legados (nulo) e `PROPOSED` aceitos
  - verify: `PlanoTreinoRepositoryTest` espera `DataIntegrityViolationException` só no caso `ACTIVE`

## 3. Regra de prova

- [x] 3.1 `deletarProva` (ADMIN): prova referenciada por `prova_id` ou `prova_alvo_id`
  (`PlanoTreinoRepository.existsReferencingRace`) → `DomainRuleViolationException` (422) orientando a
  cancelar; sem referência → apaga como hoje (épico 1.11a)
  - verify: `ProvaServiceImplTest` ("temporada da prova") cobre recusa e exclusão sem referência;
    `PlanoTreinoRepositoryTest` cobre `prova_id`, `prova_alvo_id`, sem referência e outro tenant
- [x] 3.2 Arquivamento: `cancelarProva`, `atualizarProva` com `CANCELADA` e troca de alvo em
  `garantirAlvoUnica` (vale também para `criarProva` com alvo nova) levam as temporadas `ACTIVE` e
  `PROPOSED` da prova (`prova_id`) a `ARCHIVED` com `versionReason` = "prova cancelada", por um `UPDATE`
  (`archiveOpenSeasons`); idempotente pelo filtro; nunca `DELETE` (épico 1.11a)
  - verify: `ProvaServiceImplTest` cobre os três caminhos e o caso sem arquivamento;
    `PlanoTreinoRepositoryTest` cobre o filtro (COMPLETED e legado intocados), a repetição e o tenant
- [x] 3.3 `ProvaTemporadaIT`: excluir (ADMIN) e cancelar (treinador) prova com temporada, semanas e plano
  aprovado não apaga nenhuma linha de `tb_plano_treino`, `tb_season_week` ou `tb_plano_semanal`; ADMIN
  com `prova_alvo_id` legado recebe `DomainRuleViolationException`, não erro de constraint (épico 1.11b)
  - verify: 3/3 no failsafe (`./mvnw verify -Dit.test=ProvaTemporadaIT`); gate completo no 4.2

> Fora do escopo, registrado: desmarcar a prova-alvo sem pôr outra no lugar (edição com `provaAlvo = false`)
> não arquiva a temporada — o spec cobre cancelar e trocar. Reavaliar no ticket 2, quando a temporada
> passar a ser lida.

## 4. Fechamento

- [x] 4.1 `CONTEXT.md`: Template de metodologia e Origem do valor (épico 1.11; Plano de temporada e Semana
  da temporada já entraram no PR #23 do `menthoros-infra`)
  - verify: termos presentes, sem detalhe de implementação — PR #24 do `menthoros-infra`
- [x] 4.2 Validar: `./mvnw clean verify` + aplicação sobe contra o homelab com dados (épico 1.12)
  - verify: build verde (6620 unitários, 1 skip; 330 IT; 0 falhas). Homelab (`.env`, PostgreSQL 17.6):
    Flyway de 115 para 117, "Successfully applied 2 migrations", e a aplicação sobe (`ddl-auto: validate`)

## 5. Ajustes do `/qa` (2026-11-16)

Gate com code-reviewer, security-reviewer, clean-code-reviewer e Codex (review + adversarial). Nenhum
Critical; os quatro Important abaixo foram confirmados no código e corrigidos com TDD.

- [x] 5.1 Prova `CANCELADA` não disputa o alvo: `garantirAlvoUnica` sai cedo. Antes, reeditar uma prova
  cancelada ainda marcada como alvo desmarcava a alvo atual e arquivava a temporada dela (Codex)
  - verify: `ProvaServiceImplTest` (cancelada reeditada não rouba alvo; `@EnumSource` dos status não
    cancelados troca e arquiva; duas alvos legadas arquivam cada uma); `ProvaTemporadaIT` com a sequência
    cancelar A → B vira alvo com temporada → reeditar A como cancelada alvo: temporada de B segue `ACTIVE`
- [x] 5.2 Quarto caminho de troca de alvo: `OnboardingServiceImpl.criarOuAtualizarProvaAlvo` desmarcava a
  alvo anterior direto no repositório, sem arquivar. Agora arquiva com o mesmo motivo (Codex adversarial)
  - verify: `OnboardingServiceTest` — troca arquiva a anterior e não a nova; mesma prova, primeira alvo e
    legado com duas alvos (arquiva só a perdedora)
- [x] 5.3 `archiveOpenSeasons` deixa de ser UPDATE em massa: carrega as temporadas abertas e altera as
  entidades (`saveAllAndFlush`). O bulk deixava desatualizada uma temporada já carregada na transação, e
  `clearAutomatically` destacaria a `Prova` que `atualizarProva` ainda usa depois do arquivamento (3
  revisores Claude)
  - verify: `PlanoTreinoRepositoryTest` — entidade carregada é relida `ARCHIVED`; alteração pendente não
    se perde
- [x] 5.4 Motivo da troca separado do cancelamento: "prova-alvo substituída" vs "prova cancelada"
  (`PlanoTreinoRepository.REASON_*`), porque o texto chega ao treinador (clean-code)
  - verify: testes de troca e de cancelamento afirmam cada motivo

Registrado, sem correção neste ticket:

- Índice `(tenant_id, prova_id)` em `tb_plano_treino` (padrão do módulo para tabela por tenant): a tabela
  é pequena hoje; entra com a primeira migration do ticket 2.
- O bloco `DO` da V116 pega uma FK que contenha a coluna; sem duplicata nas migrations versionadas, só
  quebraria com drift de schema — já aplicada no homelab sem incidente.
- `PlanoTreino.version` lê como `@Version` de lock otimista; o nome está decidido, vale a ressalva para
  quem implementar o versionamento (ticket de aprovação).
- Rollback: depois que houver temporada, só da aplicação (nota no `proposal.md`).
