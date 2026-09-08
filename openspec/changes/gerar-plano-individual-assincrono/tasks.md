# Tasks: gerar-plano-individual-assincrono

Repo: `apps/menthoros-front` · Branch: `feature/gerar-plano-individual-assincrono`

## 1. Ligar o gerar-de-um ao fluxo assíncrono

- [ ] 1.1 Mapear os pontos de disparo em `planosDialog.tsx` (hoje `gerarPlanoSemanal` via
      `usePlanoSemanal`, ~linhas 203 e 518) e confirmar que ambos são geração de um atleta.
      verify: leitura do arquivo; listar cada chamada e o modo passado.
- [ ] 1.2 Trocar o disparo por `useBatchPlanGeneration.gerarLote([atletaId], modo)` + consumo do
      `status`/`jobId`/`loading`/`error` do hook; ao estado terminal de sucesso, relistar o plano
      do atleta (o dialog já tem o fetch). Preservar o `modo` (SEMANA_ATUAL/PROXIMA_SEMANA).
      verify: geração de um atleta não chama mais `PlanoSemanalService.gerarPlanoSemanal`.
- [ ] 1.3 Estados loading/erro/terminal na UI do dialog (reusar o padrão do `BatchPlanDialog`);
      cleanup do polling no unmount/fechar (`reset`).
      verify: fechar o dialog durante a geração não deixa polling em voo.
- [ ] 1.4 Se `usePlanoSemanal.gerarPlanoSemanal` ficar sem consumidores, remover (ou anotar como
      débito se ainda usado em outro lugar). Não tocar no endpoint síncrono do backend.
      verify: `grep gerarPlanoSemanal` sem referências de produção, ou justificativa registrada.

## 2. Testes

- [ ] 2.1 Teste de componente do `planosDialog`: disparo → chama `gerarLote([atletaId])` (não o
      síncrono); job em andamento mostra progresso; terminal de sucesso relista o plano; terminal
      de erro mostra mensagem.
- [ ] 2.2 **E2E Playwright** (fluxo crítico coach-in-the-loop — geração de plano): coach dispara a
      geração de um atleta, a chamada volta 202 (mockar `gerar-lote` + `lote/{jobId}` com um job
      que vira terminal), e a UI conclui sem travar. Cobre o que o unit não vê: nenhum caminho cai
      no endpoint síncrono.
- [ ] 2.3 Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`.

## 3. Entrega

- [ ] 3.1 `/qa` (frontend-reviewer + clean-code) e PR `feature/... → develop`.
- [ ] 3.2 Smoke em develop: gerar plano de um atleta cold-start real e confirmar **zero 504** com a
      geração passando de 60s (é o caso que motivou a change).
