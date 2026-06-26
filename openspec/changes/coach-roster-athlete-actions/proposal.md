# Proposal — coach-roster-athlete-actions

**Tamanho · Trilha:** M · Full (frontend-only; sem mudança de API/DB — endpoints já existem)

## Why

O roster novo do coach (`coach/atletas` = `CoachAthletesPage`) hoje é **somente leitura**: grade com KPIs, colunas PMC (CTL/ATL/TSB/ACWR), volume e última atividade, filtros e busca. Nenhuma **ação** por atleta.

Por isso o coach ainda depende do **shell legado `/atletas`** (`AtletasList`) para operar o dia a dia: gerar plano, sincronizar Strava, gerar projeção de prova e gerenciar o cadastro do atleta. Ter duas telas de atletas — uma nova (leitura) e uma velha (ações) — fragmenta a rotina e contraria a migração para os feature shells.

Migrar essas ações para o roster novo dá ao coach **um ponto único de operação** sobre seus atletas e nos aproxima de descomissionar o `/atletas` legado. As funcionalidades já são estáveis e validadas em produção — a migração é majoritariamente **wiring** de componentes e hooks que já existem.

## What Changes

**Somente `apps/menthoros-front`.** Adicionar ações por-atleta ao `CoachAthletesPage`, reaproveitando os componentes/hooks legados (sem reescrevê-los):

| Ação | Componente/hook reusado | Origem (legado) |
|---|---|---|
| **Plano** — ver / gerar / excluir plano semanal | `PlanosDialog` + `usePlanoSemanal` | `AtletasList` |
| **Sincronizar Strava** | `SyncStravaButton` + `useStravaSync` | `AtletasList` |
| **Projeção de performance** (PMC) | `GerarProjecaoDialog` + `useRaceProjection` | `AtletasList` |
| **CRUD de atleta** — criar / editar / excluir | `AtletaDialog` + `AtletasService`/`useCrud` | `AtletasList` |

**Fora desta change:** Provas (`ProvasDialog`) — adiada; o shell do atleta (`features/athlete`); e a **remoção** do `/atletas` legado (descomissionamento é follow-up, após validar paridade).

### Forma de exposição (detalhe em `design.md`)
Coluna de **ações por linha** no DataGrid (menu kebab) + botão **"Novo atleta"** no cabeçalho do roster.

## Acceptance Criteria

- **CA1** — Cada linha do roster tem um menu de ações com: Plano, Gerar plano, Sincronizar Strava, Projeção, Editar, Excluir.
- **CA2** — "Plano" abre o `PlanosDialog` do atleta da linha (lista planos; permite gerar e excluir) usando `usePlanoSemanal`.
- **CA3** — "Sincronizar Strava" dispara `useStravaSync` para o atleta e reflete estado (sincronizando/concluído/erro).
- **CA4** — "Projeção" abre `GerarProjecaoDialog` → `ProjecaoResultadoDialog` para o atleta.
- **CA5** — "Novo atleta" abre `AtletaDialog` em modo criação; "Editar" abre em modo edição com os dados do atleta carregados; "Excluir" remove com confirmação. O roster recarrega após cada operação.
- **CA6** — Nenhuma regressão na grade de leitura existente (KPIs, colunas, filtros, busca, navegação para o perfil).
- **CA7** — `npm run lint && npm run build && npm run test:run` verdes; comportamento das ações coberto por testes.

## Success Metric

O coach consegue executar Plano, Strava, Projeção e CRUD de atleta **sem sair do roster `coach/atletas`** — eliminando a necessidade de abrir o `/atletas` legado para a operação diária.

## Non-Goals

- Migrar Provas (fica para uma próxima leva).
- Remover/ocultar o `/atletas` legado (descomissionar após validação de paridade — follow-up).
- Reescrever os dialogs legados no padrão `features/coach/components` (reuso as-is agora; migração física é follow-up).
- Qualquer mudança de backend, contrato de API ou schema.

## Riscos e mitigações

- **Descasamento de tipos resumo × completo:** o roster traz `CoachAtletaResumo` (id, nome, status, PMC, volume), mas `AtletaDialog` (editar) precisa do `Atleta` completo (nascimento, peso, objetivo, dias…). **Mitigação:** ao abrir "Editar", buscar o atleta completo via `AtletasService.buscarAtletaPorId(atletaId)`; as demais ações precisam só de `atletaId` (+ nome).
- **Multi-tenancy:** os endpoints legados de atleta já são tenant-scoped (headers centrais em `main.tsx`); reuso no contexto coach não muda isso. Validar que o coach enxerga apenas seus atletas (já garantido pelo roster).
- **Coexistência com o legado:** `/atletas` continua existindo durante a transição — sem conflito; só não será mais a via primária.
- **Recarregamento de estado:** após gerar plano / CRUD / sync, o roster (`useCoachRoster`) precisa refletir. **Mitigação:** expor `fetchRoster` como callback de sucesso dos dialogs.
