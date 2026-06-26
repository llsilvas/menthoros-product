# Proposal — coach-roster-operational-actions

**Tamanho · Trilha:** S · Fast (frontend-only; sem mudança de API/DB)

> Parte 1 de 2 da migração das ações do `/atletas` legado para o roster do coach.
> Esta change entrega a **infra de ações** + as 3 ações **operacionais** (homogêneas, baixo risco).
> O CRUD de atleta (gestão de cadastro, com gap de dados e operação destrutiva) é a change irmã
> `coach-roster-athlete-crud`, que depende desta.

## Why

O roster novo do coach (`coach/atletas` = `CoachAthletesPage`) é **somente leitura**: grade com KPIs e
colunas PMC, filtros e busca, mas nenhuma **ação** por atleta. Por isso o coach ainda depende do shell
legado `/atletas` para operar — gerar plano, sincronizar Strava, gerar projeção de prova.

Trazer essas ações operacionais para o roster dá ao coach um ponto único de operação e estabelece o
**padrão de ações por linha** que a change de CRUD reutiliza. As funcionalidades já são estáveis em
produção — a migração é majoritariamente **wiring** de dialogs/hooks existentes.

## What Changes

**Somente `apps/menthoros-front`.** Adicionar ao `CoachAthletesPage`:

1. **Infra de ações por linha** — coluna "Ações" com menu kebab (`MoreVert`) + estado de dialog/alvo.
2. **Plano** (ver/gerar/excluir plano semanal) — `PlanosDialog` + `usePlanoSemanal`.
3. **Sincronizar Strava** — `SyncStravaButton` + `useStravaSync`.
4. **Projeção de performance** (PMC) — `GerarProjecaoDialog` → `ProjecaoResultadoDialog` + `useRaceProjection`.

Reuso dos componentes/hooks legados **as-is** (sem reescrevê-los).

## Acceptance Criteria

- **CA1** — Cada linha do roster tem um menu de ações com: Plano, Gerar plano, Sincronizar Strava, Projeção.
- **CA2** — "Plano" abre o `PlanosDialog` do atleta da linha (lista/gera/exclui) via `usePlanoSemanal`; ao
  gerar/excluir, o roster recarrega (`fetchRoster`).
- **CA3** — "Sincronizar Strava" dispara `useStravaSync` para o atleta e reflete estado; ao importar, recarrega o roster.
- **CA4** — "Projeção" abre `GerarProjecaoDialog` → `ProjecaoResultadoDialog` para o atleta da linha.
- **CA5** — Nenhuma regressão na grade de leitura (KPIs, colunas, filtros, busca, navegação ao perfil).
- **CA6** — `npm run lint && npm run build && npm run test:run` verdes; ações cobertas por testes.

## Success Metric

O coach executa Plano, Strava e Projeção **sem sair do roster `coach/atletas`**.

## Design / Abordagem

- **Exposição:** coluna final "Ações" (`sortable:false`, largura fixa) com `IconButton(MoreVert)` → `Menu`.
  Kebab em vez de botões inline para preservar a densidade do grid (já são 8 colunas).
- **Estado:** alvo + dialog ativo em vez de boolean por dialog:
  ```ts
  type RosterAction = 'plano' | 'projecao' | null;
  const [action, setAction] = useState<RosterAction>(null);
  const [actionTarget, setActionTarget] = useState<{ atletaId: string; nome: string } | null>(null);
  ```
- **Props confirmadas:** `PlanosDialog {open,onClose,atletaNome,atletaId}`,
  `GerarProjecaoDialog {open,onClose,atletaId,atletaNome,preSelectedProvaId?}`,
  `SyncStravaButton {atletaId,connected,onSyncComplete?}` (estado real vem de `useStravaSync(atletaId)`;
  passar `connected={false}`, `onSyncComplete={fetchRoster}`).
- **Strava sem dialog:** acionado pelo item de menu; ergonomia (Menu fecha ao clicar) decidida na implementação.

## Non-Goals

- CRUD de atleta (change irmã `coach-roster-athlete-crud`).
- Provas (`ProvasDialog`) — adiada.
- Remover o `/atletas` legado; reescrever os dialogs no padrão `features/coach/components` — follow-ups.
- Qualquer mudança de backend/contrato/schema.

## Riscos e mitigações

- **Multi-tenancy:** endpoints legados já tenant-scoped (headers centrais em `main.tsx`); o roster já limita aos atletas do coach.
- **Coexistência com o legado:** `/atletas` continua existindo; sem conflito.
- **Recarregamento:** `fetchRoster` (de `useCoachRoster`) como callback de sucesso de gerar/excluir/sync.

## Dependência

Nenhuma. É a fundação; a change `coach-roster-athlete-crud` depende desta (reusa a infra de ações).
