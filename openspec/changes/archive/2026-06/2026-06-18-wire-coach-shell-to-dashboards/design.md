# Design: wire-coach-shell-to-dashboards

## Contexto

As 3 telas do coach já têm UI pronta (construída em `standardize-coach-shell-ux`), mas servem mock.
Os 3 endpoints já estão em `develop`. O desafio de design **não é UI nem fetch** — é a **lacuna
entre os campos que o mock exibe e os que os DTOs reais fornecem**. Decidir, campo a campo:
mapear direto / derivar client-side / adiar com placeholder.

## Contrato real dos DTOs (fonte: backend em develop)

```
CoachAtletaResumoDto   { atletaId, nome, ctl, atl, tsb, fase, status, lastActivity, weeklyVolume }
                         status ∈ { active, warning, danger, paused }

CoachCalendarioDto     { semanaInicio, semanaFim, treinos[] }
  treinos[]            { atletaId, nomeAtleta, data, tipoTreino, isKeyWorkout, hasAlert, hasPendingSuggestion }

CoachInsightsDto       { kpis, tendenciaCargaSemanal[], topAtletas[] }
  kpis                 { totalAtletas, ativos, emAtencao, pausados, treinosPlanejadosSemana }
  tendenciaCargaSemanal[] { semana, volumeTotalKm, tssTotal }
  topAtletas[]         { atletaId, nome, volumeKm }
```

## D1 — Estratégia de reconciliação (decisão central)

Três tratamentos, nesta ordem de preferência:

1. **Mapear** — o DTO tem o campo → ligar direto.
2. **Derivar** — não está no DTO mas é cálculo trivial e correto a partir do que o DTO entrega
   (ex.: "Em taper" = `fase === 'TAPER'`; "Sem atividade 7d" = `lastActivity` > 7 dias). Derivação
   só quando o resultado é **exato**, nunca uma estimativa que finge ser dado do backend.
3. **Adiar** — campo sem fonte real e não-derivável → **placeholder "em breve"** ligado à change que
   o entregará. Nunca fabricar número.

**Regra de ouro:** nenhum valor inventado chega à tela. Um número errado mina a confiança do
treinador mais do que um "em breve" honesto.

### Matriz — CoachAthletesPage

| Campo mock | Tratamento | Origem |
|---|---|---|
| `ctl/atl/tsb/phase/status/lastActivity/weeklyVolume` | **Mapear** | DTO direto |
| KPI "Total" | **Mapear** | `roster.length` |
| KPI "Em risco" | **Derivar** | `status ∈ {warning, danger}` |
| KPI "Em taper" | **Derivar** | `fase === 'TAPER'` |
| KPI "Sem atividade 7d" | **Derivar** | `hoje − lastActivity > 7d` |
| `sport` (running/cycling) | **Adiar/fixar** | sem fonte → fixar `running` (plataforma running-only) ou remover coluna/filtro de esporte |

### Matriz — CoachCalendarPage

| Campo mock | Tratamento | Origem |
|---|---|---|
| treinos por dia/atleta | **Mapear** (agrupar) | `treinos[]` agrupado por `atletaId` na semana |
| `type` do tile | **Mapear** | `tipoTreino` (mapear enum backend → `WorkoutType` da UI) |
| `isKeyWorkout/hasAlert/hasPendingSuggestion` | **Mapear** | DTO direto |
| `phase/status` por atleta na linha | **Ocultar** (decisão D6) | o DTO do calendário não traz; **ocultar a coluna** em vez de fazer fetch extra do roster (evita render em dois estágios) |
| `distanceKm/durationMin` no tile | **Adiar** | ausente no DTO → tile mostra só tipo + flags |
| `isInFocus` (filtro "Em foco") | **Adiar** | sem fonte → manter toggle só client-side ou ocultar até existir conceito de foco |

### Matriz — CoachInsightsPage

| Campo mock | Tratamento | Origem / change-fonte |
|---|---|---|
| KPIs `totalAtletas/ativos/emAtencao/pausados/treinosPlanejadosSemana` | **Mapear** | `kpis` |
| `weeklyLoad.totalKm` (BarChart) | **Mapear** | `tendenciaCargaSemanal[].volumeTotalKm` |
| `weeklyLoad.tss` | **Mapear** | `tendenciaCargaSemanal[].tssTotal` |
| `topAtletas` (nome + volume) | **Mapear** | `topAtletas[]` |
| `weeklyLoad.avgCTL/avgATL` (LineChart) | **Adiar** | DTO traz TSS, não CTL/ATL por semana → ajustar gráfico p/ volume+TSS, ou placeholder |
| `avgCTL/avgTSB/totalVolumeKm` (KPI cards) | **Derivar** (opcional) | média/soma do roster — **derivar só se trivial**, senão adiar |
| `adherenceRate` | **Adiar** | `add-weekly-athlete-review` |
| `pendingValidations` | **Adiar** | `add-coach-suggestion-inbox` |
| `alertsCount` | **Adiar** | `add-coach-attention-queue` |
| `sparklineData` | **Adiar** | sem série pronta → remover sparklines ou placeholder |
| abas Performance/Saúde/Comparativos | **Adiar** | já são placeholder hoje — mantêm |

## D2 — Padrão de hook (segue o repo, sem React Query)

Um hook por endpoint em `src/hooks/`, espelhando `useAtletas`/`useRaceProjection`:
`useState` para `data/loading/error` + `useCallback` para a ação; a página dispara no `useEffect` de
mount. Sem `@tanstack/react-query` (proibido no `CLAUDE.md` frontend). O `from/to` dos hooks de
calendário/insights são parâmetros da ação, não da assinatura do hook.

## D3 — Tipos e cliente (revisado no init: cliente curado, não gerado)

O `src/api/` do repo é **curado à mão**, não saída de `generate:api` (ver A1): serviços com nomes
limpos importam tipos de `src/types/` (ex.: `AtletasService` → `import { Atleta } from '../../types/Atleta'`),
e **não existe `src/api/models/`**. Seguimos esse padrão:

- **`src/types/Coach.ts`** — tipos de domínio dos DTOs (`CoachAtletaResumo`, `CoachCalendario` +
  `TreinoAgendado`, `CoachInsights` + `Kpis`/`PontoCargaSemanal`/`TopAtleta`), espelhando os campos do
  contrato real (seção "Contrato real dos DTOs"). `status` como union `'active'|'warning'|'danger'|'paused'`.
- **`src/api/services/CoachDashboardService.ts`** — nome limpo (padrão `AtletasService`); métodos
  `getRoster()`, `getCalendario(from?)`, `getInsights(from?, to?)` usando `__request(OpenAPI, {...})`
  contra os paths `/api/v1/coach/**`; importa os tipos de `src/types/Coach.ts`.
- Export em `src/api/index.ts`.
- View-models de UI (`WorkoutType`, `FormVariant`) permanecem em `src/features/coach/types/`;
  adaptadores DTO→view-model junto do hook ou em `src/features/coach/adapters/`.

**Não rodar `generate:api`** nesta change — é destrutivo contra o cliente curado. Tornar a geração
determinística é tech-debt para change própria (ver handoff).

## D4 — Mapeamento de enums

`tipoTreino` (enum backend, ex.: `INTERVALADO/TIRO/LONGO/TEMPO_RUN/REGENERATIVO/...`) → `WorkoutType`
da UI (`easy_run/long_run/tempo/intervals/recovery/rest/strength`). Tabela de mapeamento explícita e
testada; tipo desconhecido cai num default seguro (ex.: `easy_run`) sem quebrar o render.

## D5 — Fidelidade do placeholder (produto-review)

Para campos **Adiados**: se já existir um componente de placeholder no front (`PlaceholderCard` ou
similar), **reusar** com texto datado pela change-fonte ("Adesão chega com a revisão semanal"). Se
**não** existir, **ocultar a seção** em vez de construir componente novo só para esta change (escopo).
Nunca deixar card vazio / `-` genérico — isso lê como "produto quebrado" (R2). A escolha por widget
está na coluna "Tratamento" da matriz de Insights.

## D6 — `phase/status` no calendário: ocultar (não fetch extra) (produto-review)

O `CoachCalendarioDto` não traz fase/status por atleta. Decisão fechada: **ocultar** esses campos na
linha do calendário, **não** disparar um fetch extra do roster. Render em dois estágios (calendário
carrega, depois fase/status aparecem com atraso) é pior de UX e dobra requests; menos dado exibido na
hora certa supera dado correto que pisca depois.

## Riscos e mitigações (inclui pré-mortem)

> Pré-mortem — "a change foi entregue e deu errado. Por quê?"

- **R1 — `generate:api` não captura os endpoints** (backend não no ar, `/api-docs` desatualizado).
  *Mitigação:* o `init` sobe o backend local e confirma os 3 serviços no diff de `src/api/` ANTES de
  tocar telas. Se faltar, a change para no init (não improvisar cliente manual).
- **R2 — "Em breve" silencioso vira buraco de produto**: o treinador abre Insights e metade está
  vazia, parece quebrado. *Mitigação:* placeholders explícitos, datados pela change-fonte ("Adesão
  chega com a revisão semanal"), não cards em branco. CA6 cobre isto.
- **R3 — Derivação client-side diverge do backend** (ex.: "Em risco" com regra diferente do
  `deriveStatus`). *Mitigação:* só derivar de campos que o DTO já entrega (filtrar por `status`/`fase`
  que o backend computou), nunca recomputar a heurística no front.
- **R4 — Mapa de `tipoTreino` incompleto** → tiles em branco/erro. *Mitigação:* default seguro +
  teste cobrindo todos os enums do backend; logar tipo desconhecido em dev.
- **R5 — Regeneração do cliente quebra outras telas** (mudança em DTO compartilhado). *Mitigação:*
  `npm run build` (tsc) no init logo após regenerar — pega breaking types antes de implementar.
- **R6 — Mock removido mas fetch falha → tela morta.** *Mitigação:* estados error/empty obrigatórios
  (CA4) com retry; nunca remover mock sem o caminho de erro pronto.
- **R7 — Escopo escorrega para "fazer adesão/alertas funcionarem"** (as fontes não existem).
  *Mitigação:* anti-goals no proposal; tudo sem fonte é placeholder, ponto.
- **RP1 — Tenant novo lê como bug** (produto): KPIs legítimos porém zerados ("0 em atenção", "0
  treinos") parecem erro. *Mitigação:* empty states informativos por contexto (tenant novo vs. semana
  vazia), não `-` genérico. Ver A5.
- **RP2 — Strava dessincronizado mina o Roster** (produto): `ctl/atl/tsb` antigos ou `lastActivity`
  nulo lidos como "dado errado". *Mitigação:* distinguir "sem dado/sem sync" de "zero" (badge/idade do
  dado); nunca fabricar. Sinalização exata é open question Q2.

## Fora de escopo

Endpoints novos; fontes de adesão/atenção/inbox; abas Performance/Saúde/Comparativos; introdução de
React Query; `distanceKm/durationMin` no calendário (precisaria o backend expor).
