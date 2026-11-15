**Tamanho:** M · **Trilha:** Full

> Fatia **S1** do épico `add-season-plan-macrocycle`. Proposal, design (Decisão 1) e decisões vivem lá;
> esta change só delimita o escopo e os cenários que a fecham.

## Why

O plano de temporada vai usar `PlanoTreino` como raiz, e hoje ele não comporta isso: `@OneToOne prova`,
`tenant_id` sem mapeamento, sem repositório, e FKs `ON DELETE CASCADE` que apagariam a temporada e
todos os planos semanais aprovados se a prova-alvo fosse excluída. Esta fatia corrige o modelo e a
integridade antes de qualquer comportamento novo.

## What Changes

Tasks do épico: **1.1–1.3a, 1.3c, 1.4, 1.6 (só `SemanaPlanejadaRepository`), 1.7, 1.8, 1.11 (termos que
faltam no `CONTEXT.md`), 1.11a, 1.11b, 1.12 (só V116 e a de `tb_semana_planejada`; a V119 é da S8)**.

- Enums `MacrocicloStatus` e `OrigemValorSemana`; campos novos em `PlanoTreino`
- Remapeamento de `PlanoTreino` (`@ManyToOne prova`, `tenant_id`, sem `orphanRemoval`) e `PlanoTreinoRepository`
- Entidade `SemanaPlanejada` e `tb_semana_planejada`
- Migration das FKs (`RESTRICT` / `SET NULL`) e índice único parcial de `ATIVO` por atleta
- Regra de prova com temporada no `ProvaServiceImpl`: excluir responde 422; cancelar arquiva

## Critérios de aceite

- **Dado** uma prova-alvo com temporada e planos semanais aprovados, **quando** alguém tenta excluí-la,
  **então** a resposta é 422 e nenhuma linha de `tb_plano_treino`, `tb_semana_planejada` ou
  `tb_plano_semanal` é apagada.
- **Dado** um atleta com temporada `ATIVO`, **quando** uma segunda é gravada como `ATIVO`, **então** o
  banco recusa (índice parcial).
- **Dado** uma prova-alvo com temporada `ATIVO`, **quando** é cancelada, **então** a temporada vira
  `ARQUIVADO` com `motivoVersao` = "prova cancelada", e semanas e planos semanais ficam.
- **Dado** um `PlanoTreino` legado sem semanas, **quando** é lido, **então** `macrocicloStatus` é nulo e
  o comportamento atual não muda.
- As migrations aplicam em banco limpo e em banco com dados.

## Dependências e rollout

- Depende de: nada além do gate 0 do épico (0.4: conferir `tb_plano_treino` em produção antes da
  migration ir para `main`).
- Flag: nenhuma. A troca das FKs é correção de integridade e fica mesmo com a temporada desligada.
- Numeração: V116+ — revalidar contra `develop` no PR (`add-pain-attention-signal` também cria migration).
