# Tasks: gerar-plano-individual-assincrono

Repo: `apps/menthoros-front` · Branch: `feature/gerar-plano-individual-assincrono`

## 0. Corrigir a corrida do hook (BLOCKER do DoR — antes de reusar)

- [x] 0.1 `useBatchPlanGeneration`: capturar `geracao` **antes** do `await` do POST (hoje é depois,
      linha ~74); descartar respostas E erros obsoletos por geração; no cleanup/reset, garantir que
      um 202 tardio não reinicie o polling. Teste de corrida (reset/unmount entre o POST e o 202;
      dois disparos em sequência).
      verify: teste de corrida verde; o `BatchPlanDialog` existente segue passando (o hook é
      compartilhado).

## 1. Ligar o gerar-de-um ao fluxo assíncrono

- [x] 1.1 Mapear os DOIS pontos de disparo em `planosDialog.tsx`: `handleGerarPlano` (~linha 203,
      usa o `modo` do select) e o callback `onGerarProximaSemana` do `EncerrarSemanaButton`
      (~linha 518, hardcoded `PROXIMA_SEMANA`, fire-and-forget SEM estado próprio). São UIs
      diferentes — decidir o contêiner de progresso de cada uma.
      verify: as duas chamadas listadas com seu modo e sua UI de estado.
- [x] 1.2 Trocar os disparos por `useBatchPlanGeneration.gerarLote([atletaId], modo)`; ao terminal
      de sucesso, relistar o plano do atleta pelo `planoId` do relatório. Preservar o `modo`.
      **Nota de tipos:** `MetodoGeracaoPlano` (types/PlanoSemanal) e `ModoGeracaoPlano`
      (types/BatchPlanJob) têm os mesmos literais — usar um alias/cast local, não criar um terceiro.
      verify: geração de um atleta não chama mais `PlanoSemanalService.gerarPlanoSemanal`.
- [x] 1.3 `EncerrarSemanaButton`/`onGerarProximaSemana`: reestruturar a prop para expor
      loading/estado (hoje é `() => void`), reusando o mesmo progresso do disparo principal.
      verify: o disparo pela quarta-feira (encerrar semana) mostra progresso, não fica mudo.
- [x] 1.4 Bloquear redisparo enquanto o job está em acompanhamento (AC5) e cleanup do polling ao
      fechar (reuso do `reset`).
      verify: botão desabilitado durante o job; fechar o dialog não deixa polling em voo.
- [x] 1.5 Tratar o terminal: sucesso relista; `CONCLUIDO_COM_ERROS`/`erros>0` mostra mensagem de
      `errosDetalhes` (com fallback quando vazio) — incluindo `MOTIVO_PLANO_JA_EXISTE` (AC6).
      verify: job com erro mostra mensagem acionável, não trava em "gerando".
- [x] 1.6 Se `usePlanoSemanal.gerarPlanoSemanal` ficar sem consumidores, remover (ou anotar débito).
      Não tocar no endpoint síncrono do backend.
      verify: `grep gerarPlanoSemanal` sem referências de produção, ou justificativa registrada.

## 2. Testes

- [x] 2.1 Teste de componente do `planosDialog`: disparo → chama `gerarLote([atletaId])` (não o
      síncrono); job em andamento mostra progresso; terminal de sucesso relista o plano; terminal
      de erro mostra mensagem.
- [x] 2.2 **E2E Playwright** (fluxo crítico coach-in-the-loop — geração de plano): coach dispara a
      geração de um atleta, a chamada volta 202 (mockar `gerar-lote` + `lote/{jobId}` com um job
      que vira terminal), e a UI conclui sem travar. Cobre o que o unit não vê: nenhum caminho cai
      no endpoint síncrono.
- [x] 2.3 Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`.

## 3. Entrega

- [ ] 3.1 `/qa` (frontend-reviewer + clean-code) e PR `feature/... → develop`.
- [ ] 3.2 Smoke em develop: gerar plano de um atleta cold-start real e confirmar **zero 504** com a
      geração passando de 60s (é o caso que motivou a change).
