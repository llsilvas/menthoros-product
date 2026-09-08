# Proposal: plano-em-geracao-no-roster

**Tamanho:** S · **Trilha:** Fast (só `apps/menthoros-front`; sem contrato novo, sem schema, sem
multi-tenancy — reusa o job assíncrono que já existe. Design aprovado com o founder, sem incerteza.
O ponto não-trivial — **onde e como** o estado da geração passa a viver — está resolvido nesta
revisão, após DoR.)

## Status

- Proposta inicial (2026-09-08).
- Design aprovado (Opção B "linha viva") no canvas de design:
  `https://claude.ai/code/artifact/eafc135d-273e-4a0d-8714-b6c03cd33262`.
- **Depende de** `gerar-plano-individual-assincrono` (PR #117, `menthoros-front`, mergeado em
  `develop` 2026-09-08): esta change **eleva** o polling que aquela introduziu no `planosDialog`.
- **DoR (2026-09-08): NOT READY na 1ª passada, corrigido nesta revisão.** spec-reviewer + Codex,
  achados convergentes folded aqui e nas tasks. Decisão central fechada: o provider **não** reusa o
  `useBatchPlanGeneration` (é estado singleton por instância) — tem poller próprio sobre
  `BatchPlanService.consultarStatus`.

## Why

Com a `gerar-plano-individual-assincrono`, o coach dispara a geração e o `planosDialog` mostra o
progresso — **enquanto o dialog está aberto**. O estado da geração vive dentro do
`useBatchPlanGeneration`, no próprio dialog, e é resetado ao fechar. Então, no roster
(`/coach/athletes`), a linha do atleta **não sabe** que há um job em andamento: o coach que fecha o
dialog perde o sinal e precisa reabri-lo para descobrir se o plano ficou pronto.

A geração leva ~35–70s. Prender o coach num dialog aberto durante esse tempo, ou obrigá-lo a
reabrir para checar, é atrito direto na rotina do treinador — sobretudo no lançamento, quando ele
gera planos de vários atletas em sequência. O roster é a tela onde o coach opera; o estado "gerando"
pertence a ele, não a um dialog efêmero.

## What Changes

Só `apps/menthoros-front`, no shell novo `features/coach`:

- **`PlanGenerationProvider` (novo, nível coach) com store próprio e poller próprio.** Mantém um
  mapa **em memória** `atletaId → { jobId, status, mensagem?, terminalEm? }`, com `status` em
  `'gerando' | 'concluido' | 'erro'`. Sem persistência (sessionStorage/banco) — de propósito.
  - **Decisão de arquitetura (DoR):** o provider **não** reusa `useBatchPlanGeneration` — esse hook
    é estado singleton por instância (`jobId`/`status` únicos, `geracaoRef` descarta geração
    concorrente) e não acompanha múltiplos jobs, o que o AC6 exige. O provider implementa seu
    **próprio poller** — um `jobId → timer` chamando `BatchPlanService.consultarStatus(jobId)`
    diretamente. O `useBatchPlanGeneration` permanece exclusivo do `BatchPlanDialog` (lote de N).
  - **Store seletivo (não Context ingênuo):** o valor é lido por `atletaId` via assinatura seletiva
    (`useSyncExternalStore` sobre o store, ou store externo ao Context), de forma que só as linhas
    em geração re-renderizem a cada tick — um Context cujo valor muda re-renderiza todos os
    consumidores.
  - **Contrato de corrida:** a **reserva é por atleta e acontece ANTES do POST** — `iniciar(atletaId)`
    cria a entrada em `gerando` com `jobId` ainda pendente e passa a bloquear novo disparo do mesmo
    atleta **antes** de o `gerar-lote` ser chamado (bloquear só no retorno do `jobId` deixa dois
    cliques rápidos criarem dois jobs no servidor). O `jobId` retornado pelo 202 é **anexado** à
    reserva (`anexarJob(atletaId, jobId)`), inclusive se o dialog já foi fechado ou o coach trocou
    A→B; falha do POST **libera** a reserva. Depois disso, identidade por `jobId`: respostas/timers
    de um `jobId` obsoleto são descartados; a expiração da janela terminal de um job **não** remove a
    entrada de um job sucessor (comparar `jobId` antes de limpar).
  - **Política de ciclo de vida (fixada):** falha de `consultarStatus` → uma consulta inicial + até
    3 retentativas com backoff fixo; esgotadas, marcar `erro` (não fica preso em `gerando`) e liberar
    a reserva.
    Timeout geral do acompanhamento = **5 min** (o mesmo que o front já usa) → marcar `erro` e
    encerrar. **StrictMode:** o poller é **idempotente por `jobId`** — remontar não inicia um segundo
    poller para o mesmo `jobId`. O provider é montado no shell do coach; **sair da área do coach
    (ou recarregar) descarta o estado em memória** — mesma limitação aceita do AC5.
- **Disparo:** o `planosDialog`, ao disparar, **reserva no provider ANTES do POST**
  (`iniciar(atletaId)`), chama o `gerar-lote` e, no 202, **anexa o `jobId`** (`anexarJob`); em falha
  do POST, libera a reserva. Fechar o dialog **não** cancela o polling — quem acompanha é o provider,
  e um `jobId` que volta após o fechamento ainda é anexado ao atleta reservado.
  - **Compatibilidade com o legado (DoR):** o `PlanosDialog` é usado também pela tela legada
    `pages/atletas/AtletasList.tsx`, que não tem o provider. O dialog usa o provider **quando
    presente** (hook que tolera ausência — retorna no-op fora do `PlanGenerationProvider`) e, na
    ausência, mantém o comportamento atual (estado local do `useBatchPlanGeneration`). A geração
    legada **não** pode quebrar.
- **Recarga no terminal (DoR):** ao atingir o terminal de sucesso, o provider dispara a recarga do
  roster **independente do dialog** (via callback do roster / `useCoachRoster.fetchRoster`), para o
  vencimento da linha refletir o valor do servidor — hoje o `fetchRoster()` só roda ao fechar o
  dialog, potencialmente antes da conclusão.
- **Geração em lote (N atletas) usa o mesmo mecanismo.** O `BatchPlanDialog` ("Gerar planos (N)")
  reserva todos os atletas, faz o POST e anexa o **mesmo `jobId`** a todos; o store é centrado em
  `jobId` (um poller por job) e, no terminal, resolve cada atleta pelos
  `geradosDetalhes`/`errosDetalhes`. O coach pode **fechar o dialog do lote durante a geração** e ver
  cada linha do roster progredir sozinha. O dialog lê o **agregado** do job (progresso N/total) do
  próprio store.
- **Fonte única de verdade / um só poller (fix de QA).** Onde há provider, os dois dialogs
  (`PlanosDialog` e `BatchPlanDialog`) **leem do store** em vez de manter o `useBatchPlanGeneration`
  polando em paralelo — elimina o polling duplicado do mesmo `jobId` e a divergência de classificação
  sucesso/erro. O `useBatchPlanGeneration` permanece só como fallback da tela legada (sem provider).
- **A linha do roster lê o store** por `atletaId` e aplica o visual aprovado (Opção B): faixa lime
  na borda esquerda + tint sutil + "Gerando plano…" com spinner sob o nome; **Status e métricas
  intactos**. Terminal sucesso: faixa/tint verde + "Plano gerado agora" + a nova data de vencimento;
  terminal erro: aviso não-bloqueante. Ambos os terminais somem da linha após uma janela curta
  (5s), controlada pelo provider (`terminalEm` + timer), sem persistir.

## Non-goals

- **Persistir o estado** (sessionStorage, banco, URL). É explicitamente em memória — recarregar a
  página zera o sinal (a geração continua no servidor). Ver AC5.
- **Sinalizar na tela legada `/#/atletas` (`pages/atletas/AtletasList.tsx`)**. O shell legado está
  em migração; a compatibilidade acima garante que ela **não quebre**, mas o sinal visual novo é só
  no roster novo. Incluir o sinal no legado é follow-up se o founder quiser.
- **Mudar o backend ou o contrato do job.** (O fluxo de lote, que antes era non-goal, entrou no
  escopo: agora também sinaliza por atleta na linha e pode ser fechado durante a geração — mesma
  mecânica do provider, sem mudar o endpoint.)
- **Recovery de job órfão** (reinício do servidor, job disparado em outra aba) — fora de escopo,
  segue no radar `batch-plan-recovery-by-state`.

## Critérios de aceite

1. **Given** o coach dispara a geração de um atleta pelo `planosDialog`, **when** o job está em
   andamento, **then** a linha daquele atleta em `/coach/athletes` mostra o estado "gerando" (faixa
   lime + tint + "Gerando plano…" com spinner), **mesmo com o dialog fechado**.
2. **Given** o job conclui com sucesso, **when** o provider detecta o terminal, **then** ele dispara
   a recarga do roster (independente do dialog) e a linha mostra "Plano gerado agora" (verde) com a
   nova data de vencimento vinda do servidor; após a janela curta (5s) a linha volta ao normal
   **mantendo** o vencimento atualizado.
3. **Given** o job termina em `CONCLUIDO_COM_ERROS`/`erros>0`, **when** o terminal é atingido,
   **then** a linha comunica o erro de forma não-bloqueante (mensagem de `errosDetalhes`, com
   fallback) e volta ao normal — **não** fica presa em "gerando".
4. **Given** o coach fecha o `planosDialog` durante a geração, **when** o job segue no servidor,
   **then** o polling continua no provider e a linha reflete o terminal — o sinal **não** se perde
   ao fechar (diferença central em relação ao estado atual).
5. **Given** o coach recarrega a página durante a geração, **then** o mapa em memória se perde e a
   linha volta ao normal (limitação aceita e documentada); a geração continua no servidor.
6. **Given** dois atletas gerando em paralelo (jobs distintos), **when** ambos rodam, **then** cada
   linha reflete o **seu próprio** estado, independentemente (poller por `jobId`, store por
   `atletaId`) — e só as linhas em geração re-renderizam a cada tick.
7. **Given** o `PlanosDialog` aberto pela tela legada `AtletasList` (sem provider), **when** o coach
   gera um plano, **then** o fluxo legado funciona como antes (sem provider, estado local), sem erro
   nem regressão.
8. **Given** um job em janela terminal para o atleta, **when** o coach dispara uma **nova** geração
   do mesmo atleta antes de a janela expirar, **then** o novo `jobId` assume e a expiração do job
   anterior **não** apaga o acompanhamento do novo.
9. **Given** o coach clica **duas vezes** em gerar para o mesmo atleta em sequência rápida, **when**
   o segundo clique ocorre antes do 202 do primeiro, **then** a reserva feita **antes do POST**
   bloqueia o segundo disparo — só **um** `gerar-lote` é enviado ao servidor. **And given** o POST
   falha, **then** a reserva é liberada (o atleta pode ser disparado de novo).
10. **Given** uma falha transitória de `consultarStatus`, **when** o poller reconsulta, **then** ele
    retenta com backoff (uma consulta inicial + até 3 retentativas) e, se esgotar (ou passar dos 5
    min de timeout), marca `erro` e
    libera a reserva — nunca fica preso em `gerando`. **And** em StrictMode, remontar não inicia um
    segundo poller para o mesmo `jobId`.
11. **Given** o coach dispara a geração **em lote** de N atletas e **fecha o `BatchPlanDialog`**,
    **when** o job progride, **then** cada atleta do lote mostra o estado na SUA linha do roster e
    conclui sozinho — resolvido por `geradosDetalhes`/`errosDetalhes` (um pode concluir com sucesso
    enquanto outro do mesmo lote falha).
12. **Given** o provider está presente, **when** um dialog acompanha um job, **then** há **um único**
    poller para aquele `jobId` (o do provider) — o dialog lê o estado do store, sem polling próprio.

## Métrica de sucesso

- **Binária/comportamental, por decisão consciente** (Tamanho S, sem instrumentação de telemetria
  nesta change): o coach **não precisa reabrir o `planosDialog`** para saber se um plano ficou
  pronto — o desfecho aparece na linha do roster. Verificável por E2E (dispara → fecha o dialog → a
  linha vira terminal e o vencimento atualiza sozinho) e observável na rotina do lançamento.

## Open Questions & Assumptions

- **Decidido (era open):** janela do "concluído agora" = **5s**; escopo do sinal visual = **só o
  roster novo** (`CoachAthletesPage`). Ambos alinhados ao design aprovado (Opção B) com o founder.
- **Assumido:** o `renderCell` da coluna do nome lendo o store por `atletaId` (assinatura seletiva)
  não degrada o DataGrid. Coberto e obrigatório no teste de contagem de render (tasks 1.3/3.2).
- **Assumido:** `BatchPlanService.consultarStatus(jobId)` e `BatchPlanJobStatus`
  (`geradosDetalhes[].planoId`, `errosDetalhes[].motivo`, `status` terminal) bastam para o poller do
  provider — confirmar os campos no `/implement init 0.1`.

## Rollback

Reverter o PR. Feature **aditiva**: sem migração, sem mudança de contrato, sem schema, sem estado
persistido para limpar. O `PlanosDialog` volta ao estado local (a compatibilidade legado já é esse
caminho), e a `gerar-plano-individual-assincrono` segue funcionando como antes desta change.

## Riscos e mitigações

- **Re-render do DataGrid a cada tick.** Um Context cujo valor muda re-renderiza **todos** os
  consumidores — devolver a mesma referência de uma entrada não impede isso. **Mitigação:**
  assinatura seletiva (`useSyncExternalStore`/store externo) por `atletaId`; teste de contagem de
  render **com provider e grade reais**, incluindo linhas inativas (task 3.2, obrigatória).
- **Poller no provider — ciclo de vida.** O `useBatchPlanGeneration` acompanha um job por instância;
  o provider precisa de pollers isolados por `jobId`, com descarte de respostas em voo após
  desmontagem, comportamento definido em StrictMode, falha de `consultarStatus` e timeout.
  **Mitigação:** poller por `jobId` com cleanup; testes de desmontagem, StrictMode, navegação de
  rota e falha/timeout.
- **Corridas.** Fechar antes do 202, troca de atleta A→B, resposta tardia de `jobId` obsoleto, nova
  geração durante a janela terminal. **Mitigação:** identidade por `jobId`, bloqueio de redisparo do
  mesmo atleta, descarte por `jobId`, comparação de `jobId` antes de expirar (AC8); testes dedicados.
- **Estado em memória perde no reload (AC5).** Sinal some, job segue no servidor. **Aceito e
  documentado**; recovery é follow-up (`batch-plan-recovery-by-state`).
- **Regressão no legado.** `AtletasList` usa o mesmo `PlanosDialog`. **Mitigação:** provider opcional
  (hook tolera ausência); teste do fluxo legado gerando sem provider (AC7). Não confiar só em "os
  testes anteriores seguem verdes" — eles verificam o reset local, que esta change altera.
- **Vazamento de timers** ("concluído agora" e polling) ao desmontar/trocar de rota. **Mitigação:**
  limpar no cleanup; teste cobrindo desmontagem no meio.
