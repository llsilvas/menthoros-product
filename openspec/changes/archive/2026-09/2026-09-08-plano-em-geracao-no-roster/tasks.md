# Tasks: plano-em-geracao-no-roster

Repo: `apps/menthoros-front` · Branch: `feature/plano-em-geracao-no-roster`

**Pré-requisito:** `gerar-plano-individual-assincrono` (PR #117) mergeado em `develop` — feito.

## 0. Confirmar o contrato do job (antes de mexer)

- [x] 0.1 Ler `src/api/services/BatchPlanService.ts` (`gerarEmLote`, `consultarStatus(jobId)`) e
      `src/types/BatchPlanJob.ts`: confirmar os campos usados pelo poller do provider — `status`
      terminal (`CONCLUIDO`/`CONCLUIDO_COM_ERROS`), `geradosDetalhes[].planoId`,
      `errosDetalhes[].motivo`. Confirmar como o `planosDialog` obtém o `jobId` do disparo (retorno
      do `gerarLote`) para registrá-lo no provider.
      verify: relatório curto — assinatura de `consultarStatus`, shape do terminal, e de onde sai o
      `jobId` no disparo.

## 1. PlanGenerationProvider — store seletivo + poller próprio

- [x] 1.1 Criar o store em `features/coach/context/PlanGenerationProvider.tsx`: mapa em memória
      `atletaId → { jobId, status: 'gerando'|'concluido'|'erro', mensagem?, terminalEm? }` com
      assinatura **seletiva** (`useSyncExternalStore` sobre um store externo, ou equivalente) e um
      hook seletor `useAtletaPlanGeneration(atletaId)` que **não** re-renderiza consumidores de
      outros atletas. Sem persistência. O hook **tolera ausência do provider** (retorna estado
      vazio/no-op fora do `PlanGenerationProvider`, para o legado). Ações: `iniciar(atletaId)` (reserva ANTES do POST,
      `jobId` pendente), `anexarJob(atletaId, jobId)` (anexa o `jobId` do 202, mesmo com dialog
      fechado), `liberar(atletaId)` (falha do POST), leitura por id, limpeza por `atletaId`.
      verify: teste — dois atletas independentes; mudar a entrada de A não muda a referência de B;
      hook fora do provider não quebra; reserva sem `jobId` já bloqueia redisparo; `liberar` reabre.
- [x] 1.2 **Poller próprio** (NÃO reusar `useBatchPlanGeneration`): ao `anexarJob`, um poller por
      `jobId` chamando `BatchPlanService.consultarStatus(jobId)` até o terminal. Ao terminal:
      `concluido` (sucesso) ou `erro` (`CONCLUIDO_COM_ERROS`/`erros>0`, mensagem de `errosDetalhes`
      com fallback), setar `terminalEm` e agendar a limpeza da entrada após 5s. **Política de ciclo
      de vida (fixada):** falha de `consultarStatus` → uma consulta inicial + até 3 retentativas com
      backoff fixo; esgotado ou
      timeout de 5 min → `erro` + `liberar`. **StrictMode:** poller idempotente por `jobId` (não
      iniciar segundo poller para o mesmo `jobId`). **Corrida:** descartar respostas de `jobId`
      obsoleto; ao limpar por expiração, comparar o `jobId` (não apagar se um sucessor assumiu — AC8).
      Cleanup de todos os timers/pollers na desmontagem.
      verify: testes — terminal sucesso/erro; expiração após 5s; falha retenta até 3 e vira `erro`;
      timeout de 5 min vira `erro`; StrictMode não duplica poller; resposta tardia de jobId obsoleto
      ignorada; nova geração durante a janela terminal não é apagada pela expiração da anterior;
      nenhum timer/poller vazando na desmontagem.
- [x] 1.3 Bloqueio de redisparo **por reserva, antes do POST**: `iniciar(atletaId)` cria a reserva
      `gerando` (jobId pendente) e passa a bloquear novo disparo do mesmo atleta imediatamente;
      `liberar` reabre em falha do POST.
      verify: teste — dois `iniciar` do mesmo atleta em sequência (segundo antes de `anexarJob`) não
      criam segunda reserva/poller; `liberar` reabre o disparo (AC9).
- [x] 1.4 Recarga no terminal de sucesso, **independente do dialog**: o provider recebe um callback
      de recarga (ligado a `useCoachRoster.fetchRoster` no `CoachAthletesPage`) e o dispara ao
      terminal de sucesso, para o vencimento da linha vir do servidor.
      verify: teste — terminal de sucesso chama o callback de recarga uma vez.
- [x] 1.5 Montar o `PlanGenerationProvider` envolvendo o shell do coach (rota `/coach/athletes`).
      verify: `npm run lint && npm run build`.

## 2. Disparo — planosDialog delega ao provider (com fallback legado)

- [x] 2.1 `planosDialog.tsx`: **reservar antes do POST** (`iniciar(atletaId)`), chamar o
      `gerar-lote`, e no 202 `anexarJob(atletaId, jobId)`; em falha do POST, `liberar(atletaId)`.
      Fechar o dialog **não** cancela o polling nem impede o `anexarJob` de um `jobId` que volte
      depois. Onde o provider está presente, o dialog lê o progresso dele; onde ausente (legado
      `AtletasList`), mantém o `useBatchPlanGeneration` local como hoje.
      verify: com provider — dois cliques rápidos disparam um único `gerar-lote` (AC9); fechar o
      dialog durante a geração mantém o job acompanhado (AC4); sem provider — o fluxo legado gera sem
      erro (AC7).

## 3. Visual na linha do roster (Opção B)

- [x] 3.1 `CoachAthletesPage.tsx`: no `renderCell` da coluna do nome (`field: 'name'`, ~linha 367),
      ler `useAtletaPlanGeneration(row.id)` e aplicar o estado da Opção B: faixa lime na borda
      esquerda da linha + tint sutil + "Gerando plano…" com spinner sob o nome; **Status e métricas
      intactos**. Terminal sucesso: faixa/tint verde + "Plano gerado agora" + vencimento; terminal
      erro: aviso não-bloqueante. Tokens do design system (`primary[500]`, `semantic.success`,
      `semantic.danger`), sem hex hardcoded. (A faixa na borda da linha via
      `getRowClassName`/`sx`, já que o DataGrid não expõe `<tr>` diretamente.)
      verify: os três estados renderizam conforme o design; nenhuma cor hardcoded.
- [x] 3.2 Teste de contagem de render **com provider e DataGrid reais**: ao tick de um atleta em
      geração, as linhas **sem** geração não re-renderizam.
      verify: render count — só a(s) linha(s) em geração re-renderiza(m).

## 4. Testes

- [x] 4.1 Context/store: provider (reserva antes do POST + bloqueio + `liberar`, `anexarJob` tardio
      pós-fechamento, dois atletas em paralelo, terminal sucesso/erro, retentativa/backoff e timeout
      → `erro`, expiração da janela com comparação de jobId, limpeza de timers, StrictMode
      idempotente) e o hook seletor (isolamento e tolerância à ausência).
- [x] 4.2 Component: a linha do roster reflete `gerando`/`concluido`/`erro` lendo o provider mockado;
      vencimento atualiza no terminal de sucesso.
- [x] 4.3 **E2E Playwright** (coach-in-the-loop — fluxo crítico): coach dispara a geração de um
      atleta, **fecha o dialog**, e a **linha do roster** vira o terminal sozinha e o vencimento
      atualiza (mockar `gerar-lote` + `lote/{jobId}` como em `coach/gerar-plano-async.spec.ts`).
      Cobre AC4 + AC2.
- [x] 4.4 Regressão do legado: teste do `PlanosDialog` sob `AtletasList` (sem provider) gerando sem
      erro (AC7).
- [x] 4.5 Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`.

## 5. Geração em lote (mesma mecânica) + fonte única (fix de QA)

- [x] 5.1 Store centrado em `jobId` (1 ou N atletas por job); `iniciarLote`/`anexarJobLote`/
      `liberarLote`; no terminal, resolve cada atleta por `geradosDetalhes`/`errosDetalhes`;
      `getJobStatus(jobId)` expõe o agregado. Poller único por job.
      verify: teste do store — lote resolve por atleta; agregado exposto; um só poller (AC11).
- [x] 5.2 `PlanosDialog` e `BatchPlanDialog` leem do store quando há provider (fonte única, sem
      polling próprio); `useBatchPlanGeneration` fica só como fallback legado. `BatchPlanDialog`
      pode ser fechado durante a geração (progresso segue nas linhas).
      verify: um só poller por job (AC12); E2E de lote fecha o dialog e as duas linhas concluem.
- [x] 5.3 E2E de lote: seleciona 2 atletas, dispara, fecha o dialog, as duas linhas concluem sozinhas.

## 6. Entrega

- [x] 6.1 `/qa` (frontend-reviewer + clean-code) e PR `feature/plano-em-geracao-no-roster → develop`.
      QA em 2 rodadas (Critical de polling duplicado e Major de reabrir o lote resolvidos). PR #118
      mergeado em `develop` (2026-09-08).
