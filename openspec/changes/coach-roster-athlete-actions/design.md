# Design — coach-roster-athlete-actions

## Contexto

`CoachAthletesPage` (`src/features/coach/pages/CoachAthletesPage.tsx`) renderiza um `DataGrid` de `AthleteRow`
(derivado de `CoachAtletaResumo` via `useCoachRoster`), com colunas Atleta/Fase/Status/CTL/ATL/TSB/ACWR/Volume/
Última atividade, KPIs (`deriveRosterKpis`), filtros e busca. É **somente leitura**.

Os dialogs legados a reaproveitar (props já verificadas no código):

| Componente | Props | Precisa de |
|---|---|---|
| `PlanosDialog` | `{ open, onClose, atletaNome, atletaId }` | só `atletaId` + nome |
| `SyncStravaButton` | `{ atletaId, connected, onSyncComplete? }` | `atletaId` (estado real vem de `useStravaSync(atletaId)`) |
| `GerarProjecaoDialog` | `{ open, onClose, atletaId, atletaNome, preSelectedProvaId? }` | só `atletaId` + nome |
| `AtletaDialog` | `{ open, onClose, onSave, atleta? }` | **`Atleta` completo** para editar; `undefined` para criar |

## Decisão 1 — Exposição das ações: coluna de ações (kebab) + botão "Novo atleta"

Adicionar ao `columns` do DataGrid uma **coluna final "Ações"** (`sortable:false`, largura fixa) com um
botão `IconButton` (`MoreVert`) que abre um `Menu` (MUI) com os itens: **Plano · Gerar plano · Sincronizar
Strava · Projeção · Editar · Excluir**. No cabeçalho do roster, um botão **"Novo atleta"** (`PersonAdd`).

Por que kebab e não botões soltos na linha: o grid já tem 8 colunas; botões inline poluem e quebram em telas
menores. O menu kebab é o padrão de "ações de linha" do MUI DataGrid e mantém a densidade do roster.

> "Gerar plano" é um atalho que abre o `PlanosDialog` já na ação de geração (o dialog cobre ver+gerar+excluir);
> mantê-lo como item separado dá um caminho de 1 clique para a ação mais frequente. Pode ser consolidado em
> "Plano" se o `PlanosDialog` já expõe o botão Gerar com destaque — decidir na implementação.

## Decisão 2 — Estado de ação na página

Um único estado de alvo + dialog ativo, em vez de um boolean por dialog:

```ts
type RosterAction = 'plano' | 'projecao' | 'atleta-edit' | 'atleta-new' | null;
const [action, setAction] = useState<RosterAction>(null);
const [actionTarget, setActionTarget] = useState<{ atletaId: string; nome: string } | null>(null);
const [atletaParaEditar, setAtletaParaEditar] = useState<Atleta | null>(null);
```

Strava não usa dialog: o item do menu renderiza/aciona o `SyncStravaButton` (ou chama `triggerSync` via
`useStravaSync`) — ver Decisão 4.

## Decisão 3 — Gap de dados resumo × completo (Editar atleta)

O roster só tem `CoachAtletaResumo` (id, nome, status, PMC, volume). `AtletaDialog` em modo edição precisa do
`Atleta` completo. Fluxo ao clicar **Editar**:

1. `AtletasService.buscarAtletaPorId(atletaId)` (com loading) → `Atleta`.
2. `setAtletaParaEditar(atleta)` + abrir o dialog.
3. `onSave` → `AtletasService.atualizarAtleta` (ou `useCrud.updateAtleta`) → fechar → `fetchRoster()`.

Criar/Excluir não precisam buscar: criar abre o dialog com `atleta=undefined`; excluir usa `atletaId` + um
`ConfirmDialog` antes de `deletarAtleta`.

## Decisão 4 — Strava sem dialog

`SyncStravaButton` já encapsula estado via `useStravaSync(atletaId)` (`connected`, `syncing`, `imported`,
`error`, `triggerSync`) e chama `onSyncComplete` quando importa. Como o roster não sabe o `connected` por
atleta, passamos `connected={false}` (o hook resolve o estado real) e usamos `onSyncComplete={fetchRoster}`.
Opção de implementação: renderizar o `SyncStravaButton` dentro do item de menu, ou extrair `useStravaSync`
para um pequeno wrapper de linha. Decidir na implementação conforme ergonomia do `Menu`.

## Decisão 5 — Reuso as-is dos dialogs legados

Importar os dialogs de `src/components/features/**` **sem reescrevê-los** (estão estáveis e validados). Não
migrá-los fisicamente para `features/coach/components` nesta change — isso é follow-up de organização, fora do
escopo (e arriscaria regressão no `/atletas` legado, que ainda os usa). Respeita o princípio do CLAUDE.md de
não refatorar fora do escopo.

## Decisão 6 — Recarregamento do roster

Toda ação que muda dados (gerar/excluir plano, sync, CRUD atleta) recebe `onSuccess`/`onSyncComplete`/`onSave`
que chama `fetchRoster()` (de `useCoachRoster`) — o roster reflete sem reload manual. Projeção é read-only
(não recarrega o roster).

## Não-objetivos de design

- Não tocar na lógica interna dos dialogs/hooks legados.
- Não unificar o roster com o `CoachInboxPage` (são telas distintas).
- Não criar `features/coach/hooks` novos quando o hook legado já serve (`usePlanoSemanal`, `useStravaSync`,
  `useRaceProjection`, `AtletasService`).

## Open Questions

| # | Questão | Resolução |
|---|---|---|
| Q1 | "Gerar plano" é item separado ou só dentro do `PlanosDialog`? | Decidir na implementação conforme o destaque do botão Gerar no dialog. |
| Q2 | `SyncStravaButton` dentro do `Menu` ou wrapper de linha? | Decidir na implementação pela ergonomia (Menu fecha ao clicar). |
