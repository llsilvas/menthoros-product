## 1. Mover o recálculo para o caminho incremental

- [x] 1.1 Em `TsbServiceImpl.atualizarMetaDados` (`:312`), adicionar a chamada
      `recalcularSemanasProgressao(atletaId)` ao final do método (depois de
      `metaDados.aplicarAnalise(...)`/save existentes).
      **Verify:** `./mvnw clean compile` — OK.
- [x] 1.2 Remover a chamada explícita `recalcularSemanasProgressao(atletaId)` em
      `recalcularHistoricoCompleto` (`:468`) — passa a ser coberta pela chamada a
      `atualizarMetaDados` na linha 467, no mesmo bloco `consolidar`.
      **Verify:** `./mvnw clean compile` — OK; revisão manual confirma que não sobra chamada
      duplicada em nenhum caminho.

## 2. Testes

- [x] 2.1 `TsbServiceProgressaoContinuaIT` (novo) cobrindo CA1: atleta com 3 semanas de
      `MetricasDiarias` (volume crescente 10/20/30km) seguido de um `TreinoRealizado` novo (40km)
      registrado via `IngestaoTreinoRealizadoService.registrar` (caminho real, não `recalcularDesde`
      isolado) — `PlanoMetaDados.semanasProgressaoContinua` chega a 3, sem chamar
      `recalcularHistoricoCompleto`. Segundo teste cobre idempotência (repetir o mesmo registro com
      o mesmo `externalId` não muda o streak). **Decisão de escopo:** o cenário de rollback
      (falha forçada no recálculo do streak revertendo a ingestão) descrito no proposal.md fica
      coberto no nível de unidade (task 2.2b), não como `*IT` — forçar uma falha específica dentro
      de `recalcularSemanasProgressao` num contexto Spring completo exigiria mock de repositório
      compartilhado por outros colaboradores, desproporcional para uma change XS; a garantia real é
      a semântica padrão do Spring (`@Transactional` reverte em `RuntimeException` não capturada),
      e o teste de unidade prova que nada no código novo captura essa exceção silenciosamente.
      **Verify:** vermelho antes da task 1.1 (streak = 0, esperado 3) — confirmado rodando
      `./mvnw clean test-compile failsafe:integration-test failsafe:verify -Dit.test=TsbServiceProgressaoContinuaIT`;
      verde depois das tasks 1.1/1.2, mesmo comando, exit 0, 2/2 testes passando.
- [x] 2.2 `TsbServiceImplRecalculoSemanticaTest.recalcularHistorico_comHistorico_recalculaStreakUmaUnicaVez`
      (novo, reaproveita `construirServiceComPrimeiroTreino` com um `AtomicInteger` contando
      chamadas a `findByAtletaIdOrderByDataAsc`) cobre CA2: com histórico, o método roda exatamente
      1 vez — achado no caminho: a proxy de `metricasRepoComUltima` tinha DOIS branches para o
      mesmo método (o primeiro shadowing o de contagem); removido o duplicado. Caso sem histórico
      já coberto por `TsbServiceImplRecalculoHistoricoTest.deveZerarMetaDadosQuandoNaoHouverHistoricoRelevante`
      (pré-existente — `zerarMetaDadosSemHistorico` não chama `atualizarMetaDados`/
      `recalcularSemanasProgressao` de nenhuma forma).
      **Verify:** `./mvnw clean test -Dtest=TsbServiceImplRecalculoSemanticaTest,TsbServiceImplRecalculoHistoricoTest` — exit 0, 5 testes.
- [x] 2.2b `TsbServiceImplAtualizarMetaDadosFalhaPropagaTest` (novo) cobrindo a garantia de
      atomicidade citada em CA1/Riscos: `planoMetaDadosRepository.findByAtletaId` estubado para
      lançar `RuntimeException` (simulando falha dentro de `recalcularSemanasProgressao`) —
      `recalcularDesde` propaga a mesma exceção sem capturá-la/trocá-la. Prova que nada no código
      novo engole a falha silenciosamente (a reversão real da transação é responsabilidade do
      Spring, coberta no nível de integração por CA1/2.1).
      **Verify:** `./mvnw clean test -Dtest=TsbServiceImplAtualizarMetaDadosFalhaPropagaTest` — exit 0.
- [x] 2.3 Rodou a suíte completa (não só os arquivos citados) — `./mvnw clean test` (3716+ testes,
      0 erros) + `./mvnw clean test-compile failsafe:integration-test failsafe:verify` (todos os
      `*IT`, 0 erros). **Nota:** `./mvnw clean verify` puro falha localmente nesta máquina por um
      motivo alheio a esta change — o plugin `springdoc-openapi-maven-plugin` (fase
      `integration-test`) exige o app rodando via `docker compose up -d`, que aqui bateu num
      conflito de container órfão (`menthoros-keycloak` já em uso por outro container, fora deste
      compose) — infra não tocada, fora de escopo. Os goals diretos acima cobrem exatamente o que
      `verify` cobriria (surefire + failsafe), só pulando o passo de doc-gen.
      **Achado real durante a execução (CA3):** `TsbServiceImplSemanticaTest` (3º arquivo,
      não listado nas tasks originais) quebrou — 6 erros, `UnsupportedOperationException` no stub
      de `MetricasDiariasRepository` por não tratar `findByAtletaIdOrderByDataAsc`, agora
      alcançado via `atualizarTsbDia` → `atualizarMetaDados` →
      `recalcularSemanasProgressao`. Corrigido adicionando o branch no stub (retorna lista vazia,
      seguro — estes testes não exercitam o streak). Prova que o raio de alcance da mudança é
      maior que os 3 arquivos previstos: qualquer teste que chegue a `atualizarTsbDia`/
      `atualizarMetaDados` via stub manual precisa conhecer o método novo.
      **Verify:** ambos os comandos com exit 0, 0 ocorrências de `[ERROR]`/`FAILURE!` nos logs.

## 3. Fechar o pré-requisito na change dependente

- [x] 3.1 Atualizado `Status` de `remove-redundant-tsb-baseline-recalc/proposal.md`: pré-requisito
      2/3 (progressão) marcado fechado, referenciando esta change e os testes que provam.
      **Verify:** revisão manual do texto atualizado — feito.

## Definition of Done

- [x] CA1-CA3 verificados por teste (`TsbServiceProgressaoContinuaIT` para CA1;
      `TsbServiceImplRecalculoSemanticaTest`/`TsbServiceImplRecalculoHistoricoTest` para CA2;
      suíte completa para CA3).
- [x] Suíte completa verde: `./mvnw clean test` (3716+ testes) + failsafe `*IT` (goals diretos —
      `./mvnw clean verify` puro bloqueado por infra local não relacionada, ver task 2.3).
- [x] `tasks.md` com todos os itens `[x]` antes do arquivamento.
