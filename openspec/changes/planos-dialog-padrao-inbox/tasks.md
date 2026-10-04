# Tasks — planos-dialog-padrao-inbox

Repo: `apps/menthoros-front`, branch `refactor/planos-dialog-padrao-inbox`. Validação padrão:
`npm run lint && npm run build` (+ `npm run test:run` quando a task toca lógica/componente).

> Seção 1 foi implementada **antes** da change existir (processo pulado — ver nota no `proposal.md`) e
> está marcada como feita retroativamente. `tsc` e `eslint` rodaram; **`vitest` não rodou** no ambiente
> da sessão (binário nativo do rollup é de macOS) — a validação com testes está na Seção 3.

## 1. Dialog de planos (feito retroativamente)

- [x] 1.1 `planoSemanaUtils.ts` — ordem por dia da semana, volume realizado, formatação de km e
      período (via `parseISO`), `planoKey`. *verify:* tsc + eslint.
- [x] 1.2 `PlanoSemanaPanel.tsx` — cabeçalho da semana, `KpiStrip` (planejado/realizado/alvo/treinos),
      progresso, objetivo/observações, "Encerrar semana", grade de treinos, TSB.
- [x] 1.3 `PlanosToolbar.tsx` — modo de geração neutro, recalcular, excluir, "Gerar plano" (lime) com
      motivo visível quando bloqueado.
- [x] 1.4 `SemanaTabs.tsx` + ordenação mais recente primeiro em `planosDialog.tsx`.
- [x] 1.5 `planosDialog.tsx` — seleção derivada, estado do modal de conclusão separado da seleção,
      `ConfirmDialog` antes de excluir, remoção dos `console.log`, skeleton/alertas no padrão do inbox.
- [x] 1.6 `EncerrarSemanaButton` com `SECONDARY_OUTLINE_SX`; `TreinoCard` com ajustes **mínimos**
      (chip neutro, botões por papel, `flat`) — o redesign completo é a Seção 2.

## 2. `TreinoCard` no padrão do inbox

- [x] 2.1 Helpers em `planoSemanaUtils.ts`: `formatarDiaCurto` (`TER`), `formatarDataCurta` (`29/09`),
      `rotuloTipoTreino` (PT-BR, para o coach; mapa próprio — o `tipoTreinoLabel` da Home do atleta chama `CONTINUO` de "Corrida Fácil" e `TIPO_TREINO_LABELS` usa outras chaves).
      *verify:* teste unitário dos helpers.
- [x] 2.2 Cabeçalho do card: chip `DIA · dd/MM` mono + estado (ícone **e** texto: Realizado / Perdido /
      Pendente).
- [x] 2.3 Linha do tipo com marcador na cor da categoria (`workoutTypeColor`) e rótulo PT-BR.
- [x] 2.4 Métricas em 3 colunas mono (Distância · Duração · Esforço esp.); ritmo alvo e RPE realizado
      mantidos como linhas extras quando existirem.
- [x] 2.5 Estado do card por borda 1px + tinta suave (`success`/`danger`), no lugar de `stateColor` 2px.
- [~] 2.6 Ações: Detalhes neutro; "Realizado" verde; RPE e "Perdido" como hoje. Insight de IA e diálogo
      de RPE intocados. *verify:* `npm run test:run -- TreinoCard` (testes existentes verdes).


## 4. Abas de semana = planos (revisado em 2026-10-04)

Primeiro desenho tinha abas "Em andamento" / "Concluídos"; o founder corrigiu: as abas de semana já são
os planos anteriores, sem aba de situação. `PlanosAbas.tsx`, `particionarPlanos`, `abaPadrao` e `AbaPlanos`
foram removidos.

- [x] 4.1 `ordenarPlanosPorSemana` em `planoSemanaUtils.ts` (mais recente primeiro, sem mutar a lista).
- [x] 4.2 `planosDialog.tsx` — uma só fileira `SemanaTabs` (quando há mais de um plano); seleção derivada
      (plano ATIVO ou o mais recente).
- [x] 4.3 Artboard com 5 abas de semana (atual + 4 concluídas), sem aba de situação.
      *verify:* `tsc` + `eslint`; conferência visual na Seção 3.

## 5. Histórico de concluídos — backend e ligação no front (incluída em 2026-10-04)

Repos: `apps/menthoros-backend` (worktree `.worktrees/backend-planos-dialog-padrao-inbox`, branch
`refactor/planos-dialog-padrao-inbox`) e `apps/menthoros-front`. O working tree principal do backend
estava em `refactor/extract-adherence-calculator` com alterações de outra sessão — por isso o worktree.

- [x] 5.1 `PlanoSemanalRepository.findConcluidosPorAtleta(atletaId, tenantId, Pageable)` — `CONCLUIDO`,
      sem `REJEITADO`, `order by semanaInicio desc`; limite pelo `Pageable`.
- [x] 5.2 `PlanoService.listarSemanasDoAtleta` + impl (em andamento + 4 últimas concluídas);
      `montarOutputDto` extraído de `buscarPlanoPorAtleta`; constante `LIMITE_SEMANAS_CONCLUIDAS = 4`.
- [x] 5.3 `PlanoTreinoController`: `GET /api/v1/planos/atletas/{atletaId}/semanas`, TECNICO/ADMIN.
- [x] 5.4 Testes unitários em `PlanoServiceImplTest` (`ListarSemanasDoAtleta`: limite de 4 pedido ao
      repositório; atleta sem plano → lista vazia). **Compilados e executados em 2026-10-04** (sessão com
      Java 21): 64/64 verdes na classe, incluindo os 2 novos. Ainda faltam: teste de repositório (IT) do
      limite com 6 concluídas e teste de 403 do controller — não bloqueantes, registrados como débito.
- [x] 5.5 Front: `services/PlanoSemanasService.ts` (wrapper não gerado) e `usePlanoSemanal` consumindo o
      endpoint novo (e sem os `console.log` de debug). *verify:* tsc + eslint.
- [~] 5.6 `./mvnw clean compile` limpo (883 arquivos) e `PlanoServiceImplTest` verde em 2026-10-04.
      **`./mvnw clean verify` completo não fechou nesta sessão** — sandbox sem Docker, as 244 falhas são
      todas Testcontainers (`Could not find a valid Docker environment`), nenhuma nos arquivos deste
      commit. Rodar o verify completo (com Docker) na máquina do dev antes do merge, junto com a
      conferência manual: atleta com >4 concluídas mostra só 4.
- [ ] 5.7 Reviews da trilha Full: `product-reviewer` e pré-mortem cross-model antes do merge.

## 3. Validação e fechamento

- [~] 3.1 Testes novos: `planoSemanaUtils` (período sem recuo de dia, ordenação, volume realizado) e
      `planosDialog` (abas mais recente primeiro; excluir só após confirmar; seleção sobrevive ao
      fechar o modal de conclusão).
- [x] 3.2 `npm run lint && npm run build && npm run test:run` na máquina do dev — rodado no `/qa` de
      2026-10-04 (1941 testes, 229 arquivos, zero falhas).
- [ ] 3.3 Conferir no navegador autenticado: Atletas → Planos de um atleta com histórico.
- [x] 3.4 Card no Kanban: criado em **🏃 Fazendo** (`menthoros-brain`).

## Notas de execução (2026-10-04)

- **2.1–2.5 feitas.** `tsc` e `eslint` limpos. Layout conforme o artboard "Dialog · planos semanais".
  O bloco "Esforço realizado" deixou de ter ícone/texto clicáveis (não acessíveis por teclado): editar o
  RPE continua pelo botão "RPE" do rodapé do card, que já existia.
- **2.6 parcial:** o código das ações não mudou de comportamento, mas `TreinoCard.test.tsx` **não foi
  executado** (vitest não roda no ambiente da sessão). Rodar na máquina do dev.
- **3.1 parcial:** `planoSemanaUtils.test.ts` escrito e **executado** isolado (8/8). O teste achou um
  bug que já existia no código original: o mapa de dias não tinha `segundafeira`, então "Segunda-feira"
  ia para o fim da lista — corrigido em `planoSemanaUtils.ts`. Faltam os testes do `planosDialog`
  (abas, confirmação de exclusão, seleção ao fechar o modal de conclusão).

## `/qa` (2026-10-04) — commit `36ae329`

Gate rodado com `frontend-reviewer` + `clean-code-reviewer` (Claude) e `codex exec` (cross-model).
Validação completa: `npm run lint && npm run build && npm run test:run` verdes (1941 testes, 229
arquivos). Achados corrigidos no mesmo commit:

- **Critical (Codex):** `handleConfirmarExclusao` lia o plano selecionado no momento da confirmação,
  não da abertura do `ConfirmDialog`; uma recarga em background (job de geração terminando) podia
  trocar a seleção enquanto o modal estava aberto e excluir o plano errado. Corrigido: o id alvo é
  capturado em `handleAbrirExclusao`.
- **Important (Codex):** RPE salvo em `TreinoCard` só atualizava estado local; como `SemanaTabs`
  desmonta o card ao trocar de semana, voltar à aba mostrava o valor antigo. Corrigido com
  `onRpeSalvo` propagado até `recarregar()`.
- **Important (convergência frontend-reviewer + clean-code-reviewer):** `handleConfirmarExclusao`,
  `handleRecalcularMetricas` e `handleMarcarPerdido` só logavam erro no console, sem feedback visível;
  o `finally` de exclusão fechava o dialog mesmo em falha. Corrigido com `Alert`/`errorMessage` visíveis
  e o `ConfirmDialog` permanecendo aberto em caso de erro.
- **Minor (frontend-reviewer):** `formatarPeriodoSemana` morta removida, regex de diacríticos
  padronizada, cores de tema MUI trocadas por tokens (`WARNING_OUTLINE_SX` novo em `actionButtonSx.ts`),
  `getDiaSemanaOrder` deixou de ser exportado, double-scan de índice eliminado em `planosDialog.tsx`,
  `LinhaMetrica` renomeado para `MetricRow`.

Pendente (débito registrado, não bloqueante): god component de orquestração em `planosDialog.tsx`
(5 fluxos no mesmo componente) — clean-code-reviewer sugeriu extrair ao menos exclusão/seleção para
um hook próprio antes do próximo fluxo ser adicionado.

## Backend: commit `bacd04a` e recuperação do worktree (2026-10-04)

A Seção 5 (endpoint de semanas) foi commitada nesta sessão a partir de `.worktrees/backend-planos-dialog-padrao-inbox` — o worktree estava **locked** e registrado com um path de sandbox de uma sessão anterior (`/sessions/rcw-.../mnt/...`), inacessível neste ambiente. `git worktree repair` corrigiu o `gitdir`; três locks (`index.lock`, `HEAD.lock`, `refs/heads/.../lock`) ficaram órfãos da mesma sessão interrompida (todos com timestamp ~10:18–10:20, 2h30 antes da remoção) — confirmada a ausência de processo `git` ativo antes de cada remoção, conforme a seção "Duas sessões no mesmo repositório" do `CLAUDE.md` raiz.

Validação do commit `bacd04a`: `./mvnw clean compile` limpo; `PlanoServiceImplTest` 64/64. `./mvnw clean verify` não fecha nesta sessão — sandbox sem Docker (Testcontainers não sobe Postgres). Rodar o verify completo e a conferência manual (5.6) na máquina do dev antes do merge.
