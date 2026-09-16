## 1. Diagnóstico

- [ ] 1.1 Rodar a query de diagnóstico contra produção (read-only):
      `select count(*) from tb_treino_realizado where (status_sincronizacao is null or
      status_sincronizacao <> 'CANCELADO') and tss_calculado is null` — **requer acesso/confirmação
      do usuário para rodar contra o banco de produção (Railway)**.
      **Verify:** resultado documentado nesta task antes de prosseguir (CA1).
- [ ] 1.2 Se a contagem for 0: pular para a seção 3 (remoção do fallback) — nenhum backfill
      necessário.
      Se a contagem for pequena (dezenas): seguir seção 2 (backfill manual por atleta).
      Se for grande: parar e reportar ao usuário antes de prosseguir — decidir mecanismo batch
      fora do escopo original desta change.

## 2. Backfill (só se 1.1 encontrar treinos afetados)

- [ ] 2.1 Identificar os atletas afetados (join da query de 1.1 com `tb_atleta`).
      **Verify:** lista de `atleta_id` documentada.
- [ ] 2.2 Dump de `tb_metricas_diarias` de produção antes de rodar (mesmo protocolo de
      `ingestao-treino-realizado` task 6.2) — **requer confirmação explícita do usuário**.
      **Verify:** dump salvo e local documentado.
- [ ] 2.3 Rodar `POST` no endpoint admin de recálculo (`AtletaController` →
      `recalcularMetricasAtleta`) para cada atleta afetado — **requer confirmação explícita do
      usuário por ser produção**.
      **Verify:** log de cada chamada (sucesso/atleta).
- [ ] 2.4 Reexecutar a query de diagnóstico (1.1) — deve retornar 0.
      **Verify:** resultado documentado (CA2).

## 3. Remover o fallback

- [ ] 3.1 Remover o bloco de fallback em `TsbServiceImpl.somarTssContabilizado`
      (`TsbServiceImpl.java:151-165`) — `tssCalculado` nulo passa a contar como 0 na soma do dia,
      sem calcular/persistir on-the-fly.
      **Verify:** `./mvnw clean compile`.
- [ ] 3.2 Atualizar/remover testes que dependem do comportamento de fallback (buscar por
      "fallback D3" nos testes de `TsbServiceImpl*`).
      **Verify:** `./mvnw clean test`.
- [ ] 3.3 Adicionar/confirmar teste cobrindo CA3: treino com `tssCalculado` nulo conta como 0 na
      soma do dia (não deveria ocorrer em produção pós-backfill, mas o comportamento precisa ser
      determinístico e testado).
      **Verify:** `./mvnw clean test`.

## 4. Fechar os pré-requisitos dependentes

- [ ] 4.1 Marcar task 8.2 de `ingestao-treino-realizado` (arquivada) como fechada, referenciando
      esta change — nota no `tasks.md` arquivado ou changelog do `SPRINTS.md`.
      **Verify:** revisão manual.
- [ ] 4.2 Atualizar `Status` de `remove-redundant-tsb-baseline-recalc/proposal.md`: marcar
      pré-requisito 3/3 (backfill) como fechado — os 3 pré-requisitos do Codex ficam resolvidos,
      change liberada para reabertura.
      **Verify:** revisão manual do texto atualizado.

## Definition of Done

- [ ] CA1-CA4 verificados (CA1/CA2 com evidência de execução real contra produção, sob
      confirmação explícita).
- [ ] `./mvnw clean test` verde.
- [ ] `tasks.md` com todos os itens `[x]` (ou `[~]` com motivo, se o diagnóstico levar a pular
      etapas) antes do arquivamento.
