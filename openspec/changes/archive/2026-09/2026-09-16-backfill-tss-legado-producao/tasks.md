## 1. Diagnóstico

- [x] 1.1 **Decisão do usuário (2026-09-16): apontar para o HomeLab (`192.168.15.24:5432`,
      database `menthoros-db`), não Railway — produção real ainda não tem dado relevante.**
      Query rodada via `docker run --rm postgres:17 psql` (cliente dockerizado, sem instalar
      `psql` local):
      `select count(*) from tb_treino_realizado where (status_sincronizacao is null or
      status_sincronizacao <> 'CANCELADO') and tss_calculado is null`
      **Resultado: 0.**
      **Verify:** resultado documentado (CA1) — feito.
- [x] 1.2 Contagem = 0 → pula para a seção 3 (fallback) e 4 (fecha pré-requisitos). Seção 2
      (backfill) não se aplica nesta rodada — **nota importante**: isso vale para o HomeLab
      consultado; quando produção real (Railway) tiver dado de treino real, reexecutar o
      diagnóstico lá antes de considerar a lacuna fechada de fato em produção. CA5 (task 3.3, já
      concluída) continua sendo o que garante que a lacuna não reabre.

## 2. Backfill (só se 1.1 encontrar treinos afetados)

**[~] Seção inteira pulada — contagem da task 1.1 foi 0.** Tasks abaixo continuam documentadas
para quando o diagnóstico rodar contra Railway (produção real) com dado de treino — não
executadas nesta rodada.

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

- [x] 3.1 Removido o bloco de fallback em `TsbServiceImpl.somarTssContabilizado` —
      `tssCalculado` nulo agora conta como 0 na soma do dia. O campo `tssCalculatorService`
      ficou sem nenhum outro uso na classe → removido junto (campo + import), correção direta
      da própria task, não limpeza oportunista fora de escopo. Isso encolheu o construtor
      `@RequiredArgsConstructor` de 9 para 8 parâmetros — 9 call sites diretos em 6 arquivos de
      teste precisaram remover o argumento posicional/nomeado correspondente (mecânico, sem
      mudança de comportamento).
      **Verify:** `./mvnw clean compile test-compile` — OK.
- [x] 3.2 **Achado real durante a implementação (regressão real, não hipotética):** 2 arquivos
      `*IT` (`TsbRecalculoEquivalenciaIT`, `TsbServiceRecalcularDesdeIT`) tinham fixtures que
      inseriam `TreinoRealizado` direto via `treinoRealizadoRepository.save(...)`, sem passar por
      `IngestaoTreinoRealizadoService.registrar` e **sem setar `tssCalculado`** — dependiam
      silenciosamente do fallback removido para calcular o valor na hora. Corrigido: as duas
      fixtures agora chamam `TssCalculatorService.calcularTss(treino)` explicitamente antes do
      save, simulando um treino já migrado/ingerido (mesmo cálculo que
      `aplicarTssSeNecessario` faria em produção) — não é mudança de comportamento de produção,
      é a fixture deixando de depender de um atalho incidental.
      **Verify:** `./mvnw clean test-compile failsafe:integration-test failsafe:verify` — exit 0
      (rodou vermelho antes da correção: 4 métodos de teste falhando com TSS/CTL/ATL=0 em vez do
      valor esperado, exatamente o sintoma do fallback removido).
- [x] 3.3 CA5 já coberto por teste existente — **decisão: não duplicar.**
      `IngestaoTreinoRealizadoServiceImpl.registrar` chama `aplicarTssSeNecessario` (`:83`)
      **incondicionalmente**, antes de salvar — único ponto de entrada, seja inserção nova ou
      re-sync (entidade gerenciada). `aplicarTssSeNecessario` (`:141-149`) sempre atribui
      `tssCalculado` via `TssCalculatorService.calcularTss` (retorna `int` primitivo, nunca nulo)
      quando o campo está nulo ou não veio de dispositivo — não há caminho de saída sem essa
      atribuição. `IngestaoTreinoRealizadoServiceRegistrarIT.TodaFonteGravaTss.gravaTssECarga`
      (`@ParameterizedTest @EnumSource(MANUAL, STRAVA, INTERVALS_ICU)`) já assere
      `tssCalculado` não-nulo após `registrar` para as 3 fontes reais em uso — é exatamente o
      teste de contrato que CA5 pedia, só que já existia. Escrever um segundo teste
      quase-idêntico seria duplicação sem ganho de cobertura. `reprocessar` (`:106-115`) só
      recalcula TSS quando `contaNaCarga(treino)` é verdadeiro — consistente com o escopo do
      fallback, que só soma treinos que contam (`findQueContamByAtletaIdAndDataTreino`).
      **Verify:** `./mvnw clean test-compile failsafe:integration-test failsafe:verify -Dit.test=IngestaoTreinoRealizadoServiceRegistrarIT` — exit 0, confirma a garantia antes de mexer no fallback.
- [x] 3.4 `TsbServiceImplSomarTssContabilizadoTest` (novo, TDD red→green): treino com
      `tssCalculado` nulo conta como 0 na soma do dia — todos os colaboradores passados como
      `null` de propósito, para que o teste falhe com `NullPointerException` se o fallback ainda
      existisse (em vez de só afirmar um número errado).
      **Verify:** vermelho antes da task 3.1 (NPE em `tssCalculatorService`), verde depois —
      `./mvnw clean test -Dtest=TsbServiceImplSomarTssContabilizadoTest`.

## 4. Fechar os pré-requisitos dependentes

- [x] 4.1 Task 8.2 de `ingestao-treino-realizado` (arquivada) marcada fechada, referenciando esta
      change.
      **Verify:** revisão manual — feito.
- [x] 4.2 `Status` de `remove-redundant-tsb-baseline-recalc/proposal.md` atualizado: pré-requisito
      3/3 (backfill) marcado fechado — os 3 pré-requisitos do Codex resolvidos, change liberada
      para reabertura (`/implement init remove-redundant-tsb-baseline-recalc`).
      **Verify:** revisão manual do texto atualizado — feito.
- [x] 4.3 Achado de segurança autônomo do pre-mortem (`recalcularMetricasAtleta` sem
      `@RequireTenant`) registrado em `SPRINTS.md` (seção Radar), mesmo padrão de
      `fix-tenant-validation-not-found` — não corrigido aqui, fora de escopo.
      **Verify:** revisão manual — feito.

## Definition of Done

- [x] CA1, CA3, CA4, CA5 verificados por teste/evidência. **CA2 não se aplica nesta rodada**
      (seção 2 pulada — contagem 0 no diagnóstico contra HomeLab; reavaliar contra Railway quando
      houver dado real, ver nota da task 1.2).
- [x] `./mvnw clean test` (3700+ testes) e suíte completa de `*IT` verdes.
- [x] `tasks.md` com todos os itens `[x]` (seção 2 explicitamente `[~]`, motivo documentado) —
      pronto para `/qa`.
