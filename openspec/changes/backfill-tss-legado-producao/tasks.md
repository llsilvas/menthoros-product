## 1. Diagnóstico

- [ ] 1.1 Rodar a query de diagnóstico contra produção (read-only, via console SQL do Railway ou
      `psql` com a connection string de produção — o usuário fornece acesso na hora, nunca
      embutido em código):
      `select count(*) from tb_treino_realizado where (status_sincronizacao is null or
      status_sincronizacao <> 'CANCELADO') and tss_calculado is null`
      — **requer confirmação explícita do usuário para esta etapa especificamente.**
      **Verify:** resultado documentado nesta task antes de prosseguir (CA1).
- [ ] 1.2 Se a contagem for 0: pular para a seção 3.3 (teste de contrato, CA5) e depois seção 4 —
      nenhum backfill necessário, mas o teste de contrato continua obrigatório antes de remover o
      fallback (achado do pre-mortem — 0 hoje não garante 0 amanhã sem o teste travando).
      Se a contagem for pequena (dezenas): seguir seção 2 (backfill manual por atleta).
      Se for grande: parar e reportar ao usuário antes de prosseguir — decidir mecanismo batch
      fora do escopo original desta change.

## 2. Backfill (só se 1.1 encontrar treinos afetados)

- [ ] 2.1 Identificar os atletas afetados (mesmo acesso da task 1.1):
      `select distinct t.atleta_id, a.nome, a.tenant_id from tb_treino_realizado t
      join tb_atleta a on a.id = t.atleta_id
      where (t.status_sincronizacao is null or t.status_sincronizacao <> 'CANCELADO')
      and t.tss_calculado is null`
      **Verify:** lista de `atleta_id` (com tenant/assessoria) documentada.
- [ ] 2.2 Dump de **`tb_metricas_diarias` E `tb_treino_realizado`** de produção antes de rodar
      (`pg_dump` das duas tabelas, ou `pg_dump -t tb_metricas_diarias -t tb_treino_realizado`),
      salvo localmente com timestamp no nome (padrão de `ingestao-treino-realizado`,
      `~/menthoros-backup/`) — achado do pre-mortem: dump só de `tb_metricas_diarias` não bastava,
      é `tb_treino_realizado.tss_calculado` que o recálculo também escreve. **Requer confirmação
      explícita do usuário para esta etapa especificamente.**
      **Verify:** dump das 2 tabelas salvo e local documentado.
- [ ] 2.3 Rodar `POST /api/v1/atletas/{id}/recalcular-metricas` para cada atleta afetado, **com
      credencial `ADMIN` de plataforma** (não um token `TECNICO` de assessoria — achado do
      pre-mortem: o endpoint não tem `@RequireTenant`, então o token usado deve ser o mais
      restrito operacionalmente possível, mesmo que a checagem em si não exija). **Requer
      confirmação explícita do usuário para esta etapa especificamente.** Critério de abortar: se
      qualquer chamada falhar, parar o loop (não continuar para os atletas seguintes) e reportar
      antes de decidir restaurar o dump ou investigar a causa.
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
- [ ] 3.3 Teste de contrato novo (CA5, achado do pre-mortem): dado um `TreinoRealizado` registrado
      via `IngestaoTreinoRealizadoService.registrar` para cada fonte
      (MANUAL/STRAVA/INTERVALS_ICU/FIT), `tssCalculado` nunca fica nulo — trava a garantia que
      justifica remover o fallback, para que uma regressão futura no pipeline de ingestão seja
      pega pela suíte. Roda **antes** da task 3.1 (vermelho pré-existente esperado: hoje o
      comportamento já deveria valer, então o teste nasce verde — não é TDD red→green, é um teste
      de caracterização travando um invariante existente).
      **Verify:** `./mvnw clean test` — verde já na criação, confirma a premissa antes de mexer no
      fallback.
- [ ] 3.4 Adicionar/confirmar teste cobrindo CA3: treino com `tssCalculado` nulo conta como 0 na
      soma do dia (não deveria ocorrer em produção pós-backfill + CA5, mas o comportamento precisa
      ser determinístico e testado).
      **Verify:** `./mvnw clean test`.

## 4. Fechar os pré-requisitos dependentes

- [ ] 4.1 Marcar task 8.2 de `ingestao-treino-realizado` (arquivada) como fechada, referenciando
      esta change — nota no `tasks.md` arquivado ou changelog do `SPRINTS.md`.
      **Verify:** revisão manual.
- [ ] 4.2 Atualizar `Status` de `remove-redundant-tsb-baseline-recalc/proposal.md`: marcar
      pré-requisito 3/3 (backfill) como fechado — os 3 pré-requisitos do Codex ficam resolvidos,
      change liberada para reabertura.
      **Verify:** revisão manual do texto atualizado.
- [ ] 4.3 Registrar o achado de segurança autônomo do pre-mortem (`recalcularMetricasAtleta` sem
      `@RequireTenant`) como follow-up — não corrigir aqui, só documentar (ex.: nota em
      `SPRINTS.md` Radar, mesmo padrão de `fix-tenant-validation-not-found`).
      **Verify:** revisão manual.

## Definition of Done

- [ ] CA1-CA5 verificados (CA1/CA2 com evidência de execução real contra produção, sob
      confirmação explícita por etapa; CA5 antes de CA3).
- [ ] `./mvnw clean test` verde.
- [ ] `tasks.md` com todos os itens `[x]` (ou `[~]` com motivo, se o diagnóstico levar a pular
      etapas) antes do arquivamento.
