**Tamanho:** M · **Trilha:** Full

> **Ticket 1** do épico `add-season-plan-macrocycle` — prefactor: deixa o modelo pronto e a integridade
> garantida antes do tracer (ticket 2). Proposal, design (Decisão 1) e decisões vivem no épico.

## Status

- ready-for-agent (2026-11-15): sem bloqueio. Antes do merge em `main`, rodar a contagem da task 0.4 do
  épico no banco de produção.

## Why

O plano de temporada vai usar `PlanoTreino` como raiz, e hoje ele não comporta isso: `@OneToOne prova`,
`tenant_id` sem mapeamento, sem repositório, e FKs `ON DELETE CASCADE` que apagariam a temporada e
todos os planos semanais aprovados se a prova-alvo fosse excluída. Esta fatia corrige o modelo e a
integridade antes de qualquer comportamento novo.

## What Changes

Tasks do épico: **1.1–1.3a, 1.3c, 1.4, 1.6 (só `SemanaPlanejadaRepository`), 1.7, 1.8, 1.11 (termos que
faltam no `CONTEXT.md`), 1.11a, 1.11b, 1.12 (só V116 e a de `tb_semana_planejada`; a V119 é da S8)**.

- Enums `MacrocicloStatus` e `OrigemValorSemana`; campos novos em `PlanoTreino`
- Remapeamento de `PlanoTreino`: `@ManyToOne prova`, `tenant_id` mapeado, e `planoSemanalList` com
  `cascade = {PERSIST, MERGE}` — sai o `REMOVE` (do `cascade = ALL`) e sai o `orphanRemoval`, senão o JPA
  apaga os planos semanais mesmo com a FK em `SET NULL`
- `PlanoTreinoRepository` e `SemanaPlanejadaRepository` com consultas filtradas por `tenant_id`
- Entidade `SemanaPlanejada` e `tb_semana_planejada`
- Migrations: V116 (colunas, FKs `RESTRICT`/`SET NULL`, índice parcial) e V117 (`tb_semana_planejada`)
- Regra de prova com temporada no `ProvaServiceImpl` (contrato abaixo)

### Contrato da regra de prova (fechado no DoR de 2026-11-15)

- **Quem exclui de fato:** só o ADMIN. `removerProva` já manda treinador e atleta para `cancelarProva`
  (comportamento existente, mantido). O 422 vale para o caminho `deletarProva`.
- **Referência que bloqueia a exclusão:** qualquer `PlanoTreino` que aponte para a prova por `prova_id`
  **ou** `prova_alvo_id`, em qualquer `macrocicloStatus`, inclusive legado (nulo). Resposta 422 via
  `DomainRuleViolationException`, mensagem orientando a cancelar. Sem isso, `prova_alvo_id` (FK sem ação
  de delete desde a V1) ou o novo `RESTRICT` estouram como 500.
- **Quem governa a temporada:** `prova_id`. Arquivar olha só `prova_id`.
- **Caminhos que arquivam:** `cancelarProva`, `atualizarProva` com status `CANCELADA`, e troca de
  prova-alvo em `garantirAlvoUnica` (criação ou edição). Cada um leva a temporada `ATIVO` da prova a
  `ARQUIVADO` com `motivoVersao` = "prova cancelada". Idempotente: temporada já `ARQUIVADO` não muda.
- **Propostas:** temporadas `PROPOSTA` da prova também vão a `ARQUIVADO`. Nunca `DELETE` — apagar a
  temporada apagaria as semanas por `CASCADE`.
- **"Preservar" é preservar linhas:** nenhuma linha de `tb_plano_treino`, `tb_semana_planejada` ou
  `tb_plano_semanal` some. O efeito existente do `ProvaNoPlanoService` (tirar o treino PROVA, recalcular
  volume, reabrir a aprovação da semana) continua acontecendo.

## Critérios de aceite

- **Dado** uma prova com temporada e planos semanais aprovados, **quando** o ADMIN a exclui, **então** a
  resposta é 422 e nenhuma linha de `tb_plano_treino`, `tb_semana_planejada` ou `tb_plano_semanal` é
  apagada.
- **Dado** uma prova referenciada só como `prova_alvo_id` de um `PlanoTreino` legado, **quando** o ADMIN
  a exclui, **então** a resposta é 422 (não 500).
- **Dado** uma prova sem nenhum `PlanoTreino`, **quando** o ADMIN a exclui, **então** ela é apagada como
  hoje.
- **Dado** um `PlanoTreino` com planos semanais, **quando** a entidade é removida pelo JPA, **então** os
  planos semanais ficam com `plano_treino_id` nulo.
- **Dado** um atleta com temporada `ATIVO`, **quando** uma segunda é gravada como `ATIVO`, **então** o
  banco recusa (índice parcial). Vários `PlanoTreino` legados (`macrociclo_status` nulo) do mesmo atleta
  continuam aceitos.
- **Dado** uma prova-alvo com temporada `ATIVO` e outra `PROPOSTA`, **quando** o treinador a cancela pelo
  DELETE, **então** as duas viram `ARQUIVADO` com `motivoVersao` = "prova cancelada", e semanas e planos
  semanais ficam.
- **Dado** o mesmo cenário, **quando** a prova é cancelada por edição (status `CANCELADA`) ou trocada como
  alvo, **então** o resultado é o mesmo; repetir o cancelamento não altera nada.
- **Dado** um `PlanoTreino` legado sem semanas, **quando** é lido, **então** `macrocicloStatus` é nulo e
  o comportamento atual não muda.
- **Dado** uma temporada de outro tenant, **quando** os repositórios consultam pelo tenant corrente,
  **então** ela não aparece.
- As migrations aplicam em banco limpo (Testcontainers no `./mvnw clean verify`) e em banco com dados
  (homelab, cópia com linhas em `tb_plano_treino` e `tb_plano_semanal`).

## Métrica de sucesso

Zero linhas apagadas em cascata a partir da prova-alvo (teste de integração). É o que garante ao
treinador que excluir ou cancelar uma prova nunca leva junto o histórico de semanas aprovadas do atleta.

## Open Questions & Assumptions

- `tb_plano_treino` tem 0 linhas no homelab (2026-11-15); produção não conferida.

## Bloqueado por

- Nada (pode começar).

## Dependências e rollout

- Gate 0.4 do épico: conferir `tb_plano_treino` em produção antes da migration ir para `main`.
- Flag: nenhuma. A troca das FKs é correção de integridade e fica mesmo com a temporada desligada.
- Numeração: V116 e V117 — revalidar contra `develop` no PR (`add-pain-attention-signal` também cria
  migration; quem mergear depois renumera).
- Rollback: as migrations são forward-only. Desfazer é uma V nova que recria as FKs com `CASCADE`, remove
  o índice parcial, `tb_semana_planejada` e as colunas novas. Sem perda de dado legado, porque nenhuma
  coluna existente muda.
  - **Depois que existir temporada, esse rollback de schema apaga dado** (as semanas, e o `CASCADE` volta a
    permitir exclusão destrutiva). Daí em diante, o rollback padrão é só da aplicação (versão anterior do
    backend sobre o schema novo, que é compatível: colunas nulas, tabela nova ignorada). Reverter o schema
    exige exportar `tb_season_week` e as colunas de temporada antes. (QA de 2026-11-16, Codex.)
- Se o gate 0.4 achar linhas em produção: a V116 continua válida (só adiciona colunas nulas e troca FKs);
  conferir antes se alguma prova referenciada já está marcada para exclusão.
