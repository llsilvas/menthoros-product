## Context

Tela `/#/coach/athletes/:atletaId`, React 19 + MUI 7, dark-only, tokens em `src/theme/tokens.ts` e
`src/shared/design-tokens`. Dados de um endpoint agregado (`AtletaPerfilCoachDto`) mais três hooks
auxiliares (`useCoachAthleteRaces`, `useAthleteContract`, `useSugestaoDecisao`). Esta change é só
de apresentação e composição: nenhum contrato muda.

Artboard de referência: https://claude.ai/artifact/WWKTwwKSwW42ZFap7dz4NC (`Sugestão`, 1440×1640;
`Sugestão — 1366×768`). Tudo que o artboard mostra está transcrito abaixo; em conflito, vale este
documento.

## Goals

- Primeira dobra = decisão: o treinador vê o que exige ação sem rolar, em 1440 e em 1366×768.
- Planejado × realizado na mesma linha, sem abrir diálogo.
- Uma hierarquia tipográfica (Inter + mono para números), um formato de data, enums em PT-BR.
- Reaproveitar `Card`, `CardHeader`, `StatusBadge`, `aiHighlight`, `glassSx`; nada de hex novo.

## Non-Goals

- Campo novo no backend (nem o veredito de reconciliação, nem sinal de dor).
- Redesenho do Inbox, do `TreinoPlanejadoCard` ou do diálogo "Ver realizado".
- Mobile < 600px além de "não quebrar" (coluna única, sem scroll horizontal).
- Light mode.

## Decisions

### D1 — Layout: duas colunas independentes, não um grid 3×N
`main` com `padding: 32px`, `max-width` do conteúdo 1087px em 1366 e 1120px em 1440
(sidebar fixa 200px). Abaixo da faixa de decisão, um grid `2fr 1fr` com `gap: 16px` cujas células
são **duas colunas flex** (`display:flex; flex-direction:column; gap:16px`), não linhas do grid.
Motivo: com grid 3×N, "Treinos recentes" só começava quando a coluna direita (mais alta) acabava.

### D2 — Faixa "Precisa de decisão": fontes, ordem, limite
`buildDecisionCardsFromProfile(profile, provasPendentes, contrato, isProprietario)` → `DecisionCard[]`,
puro, em `adapters/decisionCardsAdapter.ts`.

| Fonte | Condição | Card |
|---|---|---|
| `sugestoesRecentes[]` com `status = PENDING` | sempre | **card próprio por sugestão**, independente de sinal: `summary`, `confidence` e `tipo` vêm de `SugestaoService.detalhe(id)` (como `RecentSuggestionsPanel` faz hoje — `SugestaoRecenteDto` só traz `id/tipo/status/criadoEm`), carregados em paralelo por `useSugestaoDecisao`; título = rótulo do `tipo`; bloco IA = `summary`; ações Aceitar · Ajustar · Rejeitar |
| `sinaisRecentes[]` | sempre (o backend já cortou em `ALTA`) | título = rótulo do `motivo`; evidência = dados do sinal (ver D3), e para `FADIGA`/`SOBRECARGA` o TSB e o ATL do último ponto de `profile.pmc` ("TSB −18,4 · ATL 92") com link "Ver PMC" → Histórico. **`sugestaoId` chega `null` hoje** (`CoachAthleteProfileServiceImpl`, "match heurístico não implementado"); quando vier preenchido, o sinal e a sugestão fundem num card só (sinal como evidência, sugestão como bloco IA). Sem vínculo, são dois cards |
| provas pendentes (`listarPendentesRevisao`) | ≥ 1 | título "Prova alvo em N dias" / "Prova nova" / "Alvo trocada"; evidência = data, distância, "N de M semanas" e `motivoRevisao`; ação Revisar prova (`marcarCiente`). Sem link de taper (cortado, A8) |
| `billingStatus`/`nextDueDate` | `OVERDUE` e `isProprietario` | título "Mensalidade vencida"; ação Dar baixa (`markInvoicePaid`) · link Abrir contrato (aba Financeiro) |

Ordem: severidade (`CRITICA` > `ALTA`) e depois peso do motivo (`MotivoAtencao.peso`, replicado
em `enumLabels.ts`: FADIGA 50, PROVA_ATLETA 45, SOBRECARGA 40, SEM_PLANO 35, ADERENCIA 30,
INATIVIDADE 20, ZONAS_VENCIDAS 10; motivo desconhecido = 0, rótulo = valor cru em
`toLowerCase` capitalizado — nunca lançar). Limite **3 cards**; o resto vira "+N" no título da
faixa com link para Histórico. Sem item **e sem aviso**: a faixa não renderiza (nem título vazio).

**Falha não é ausência.** `profile.avisos` contendo `"sinaisRecentes"` ou `"sugestoesRecentes"`
(o agregador devolve lista vazia e registra o aviso quando a consulta falha), ou erro ao buscar
`detalhe` de uma sugestão, SHALL manter a faixa visível com o estado "Não foi possível carregar as
decisões · Tentar de novo" (botão que refaz `fetchProfile`/`detalhe`), ao lado dos cards que
carregaram. A faixa nunca afirma "nada a decidir" quando uma fonte falhou.

### D3 — Anatomia do `DecisionCard`
`Card variant="flat"`, `padding: 20px`, `gap: 12px`, `display:flex; flex-direction:column`,
borda `semantic.danger` a 55% quando `CRITICA`. Ordem fixa dos blocos, do topo:

1. **Cabeçalho**: ícone 20px (SVG inline do set do app, nunca emoji) + `h3` 15px/600 + chip de
   severidade à direita ("Risco alto" = `CRITICA` em `danger`; `ALTA` sem chip). O card de prova usa
   `h3` em Space Grotesk 20px/26px — é o único com título display, por ser o único card que não é
   um alerta.
2. **Evidência**: 1–2 linhas 13px `text.secondary` com prefixo mono `text.muted`
   (`Seg 09/11 · RPE 4 — "Senti um pouco a lombar"`; `Sem 02/11 — 1 de 4 treinos · perdeu Qua, Sex e Dom`).
   Comentário do atleta entre aspas tipográficas, truncado em 80 caracteres.
3. **Chips de contexto**: `flex-wrap`, `gap: 6px`, chip outline (`border: 1px solid surface[600]`,
   `color: text.secondary`, 11px/500, `padding: 2px 8px`, raio `pill`). Máximo 3.
4. **Bloco "Sugestão da IA"** (`AiSuggestionBlock`): fundo `aiHighlight.bg`, borda
   `aiHighlight.border`, raio 8px, `padding: 12px`; eyebrow 11px/600 maiúsculo `primary` com ícone
   sparkle 14px: `Sugestão da IA · confiança {alta|média}`; corpo 13px `text.primary` = `summary`;
   link opcional 12px abaixo (ex.: "Perguntar ao atleta antes de decidir"). Só quando há sugestão
   `PENDING`.
5. **Ações** (`margin-top: auto`, uma linha, nunca quebra): primário `Aceitar` (`b1`: fundo
   `primary`, texto `surface[900]`), secundário `Ajustar` (`b2`: outline `surface[600]`), e
   `Rejeitar` como botão texto `primary` encostado à direita (`margin-left: auto`). Card de prova:
   `Revisar prova` (b2) + link `Ver provas` (Histórico). Card de cobrança: `Dar baixa` (b2) + link
   `Abrir contrato`. Botões `min-height: 40px`, `padding: 0 16px`, raio 6px, 13px/600.

Altura dos três cards é a da linha (grid `align-items: stretch`); o bloco de ações fica no rodapé
de todos. Para que os cards de aderência e prova não fiquem com rodapé vazio, ambos têm evidência
+ chips (D2) — medido: folga antes das ações cai de 184/167px para 59/12px em 1366.

### D4 — Plano da semana: linha por dia
`buildWeekPlanRowsFromProfile(planoVigente, realizadosRecentes, hoje)` → `WeekPlanRow[]` (7 linhas,
Seg–Dom da semana do plano), puro, em `adapters/weekPlanRowsAdapter.ts`.

Grid por linha: `84px minmax(0,1.5fr) minmax(0,1fr) 40px`, `gap: 16px`, `padding: 12px 0`,
`border-top: 1px solid surface[700]`, `align-items: center`. Cabeçalho de colunas em eyebrow
(`Dia · Planejado · Realizado`).

| Coluna | Conteúdo |
|---|---|
| Dia | mono 12px `text.muted`: `Seg 09/11`; hoje em `primary` |
| Planejado | ponto 8px na cor categórica do tipo (`categorical.sage` Regenerativo, `gold` Contínuo, `violet` Fartlek, `semantic.danger` Intervalado, `text.muted` Descanso) + rótulo PT-BR 14px/600; linha 2 mono 12px `text.muted`: `6.4 km · 50 min · Z1 123–139 bpm · TSS 30` (zona por `useAthleteTrainingZones`, como hoje) |
| Realizado | **com realizado vinculado**: ponto + rótulo PT-BR do `tipoTreino` + mono `42 min · TSS 41` (+ `RPE 6` se houver); linha 2 chips: `Tipo diferente do planejado` **informativo** (outline `surface[600]`, texto `text.secondary` — não é alerta, ver A1) só quando **ambos** os tipos são conhecidos e diferem (`tipoTreino` do realizado é opcional no DTO; ausente → sem chip, e ausência de chip não significa conformidade), `Dor relatada` (`danger`) se `sensacoes ∋ DOR`. O rótulo "Diferente do prescrito" fica reservado ao veredito da reconciliação, quando o backend o expuser. **Perdido**: texto `danger`. **Pendente**: `Pendente` + `SyncStatusChip` (`No relógio` etc.). **Hoje sem realizado**: `Hoje`. **Descanso**: vazio |
| Ação | `.ico` 40×40 outline: cadeado (`aria-label` = `buildLockLabelFromRejection`) quando `!isAguardando && editable === false`; lápis abre `TreinoEditDialog` quando editável |

Linha de hoje: fundo `rgba(189,222,90,0.06)`. Rodapé do card: 12px `text.muted`
`Pendentes podem ser editados; realizados ficam travados.` + nota de edição pós-aprovação quando
houver `editedAfterApprovalAt`. Cabeçalho do card: eyebrow `Plano da semana · 09–15/11`, chip de
status do plano (`Aprovado` em `success`, `Aguardando revisão` em `warning` com botão Revisar),
e à direita mono `TSS 85 / 143 planejado` (soma de `tssCalculado` dos realizados vinculados ÷
soma de `tssPlanejado`). **Total parcial não vira zero:** se algum `treinoRealizadoId` da semana
não está em `realizadosRecentes`, ou `avisos ∋ "realizadosRecentes"`, ou um realizado vinculado
não tem TSS, o numerador mostra `TSS ≥ 85` com tooltip "N treinos sem carga carregada" — e
nunca `TSS 0` com treinos concluídos. A coluna Realizado continua mostrando "Realizado" para o
vínculo sem detalhe.

Banners existentes (`AGUARDANDO_REVISAO`, `ReenvioRelogio`) continuam, acima da lista.

### D5 — Cabeçalho e abas
```
[←] Atletas                                              (link, chevron SVG 16px)
[LS] Leandro Silva (h1, Space Grotesk 24px/600)              [Ajustar plano] [⋯]
     Intermediário · Melhorar meu tempo  [● Garmin Forerunner 970 · conectado · última atividade ontem ⓘ]
     [Relógio em validação]                       (chip só quando relogio.status = VALIDANDO)
Visão geral | Financeiro [1 vencida] | Histórico        (role=tablist, min-height 44px)
```
- Avatar 48px (`CoachAthleteAvatar`). `h1` é o único `h1` da página.
- Chip do canal: `CoachWatchLine` vira chip 36px de altura com ícone ⓘ que abre `Popover` com o
  texto completo da linha atual (modelo, status, última atividade, link de reenvio).
- Sem botão `Mensagem` (cortado no review de produto; entra com `add-athlete-coach-messaging`).
  `KudosDialog`, "Preencher onboarding" e "Atualizar" ficam no menu `⋯`.
- `Ajustar plano` rola até o card do plano e foca o primeiro lápis habilitado (sem rota nova).
- Abas: MUI `Tabs` com `aria-controls`; Financeiro só para `isProprietario`; rótulo recebe
  `StatusBadge` `danger` com `N vencida` quando `billingStatus = OVERDUE`. Aba ativa persiste na
  query `?tab=` para deep link e para os E2E.

### D6 — Coluna direita (Visão geral)
1. **Cobrança** (proprietário; só quando vencida ou vence em ≤ 7 dias): eyebrow + chip `Vencida`
   (`danger`) / `Vence em N dias` (`warning`); valor mono 24px/600 `R$ 150,00` + `venceu 10/11`;
   linha `Próxima: 10/12 · mensal`; ações `Dar baixa` (b2) + link `Abrir contrato` (aba Financeiro).
2. **Carga diária (TSS)** (`DailyLoadChart`, Recharts como `PMCChart`): barras por dia, realizado
   sólido `primary`, planejado tracejado `surface[600]` (dias futuros da semana vigente), rótulo
   mono 10px no topo de cada barra, eixo X só com início de semana (`02/11 · 09/11 · 15/11`),
   altura 126px; seletor segmentado `2 sem · 4 sem · 12 sem` (36px de altura, `role=radiogroup`),
   default **4 sem** (A7); legenda `■ Realizado · ▢ Planejado` + link `PMC completo` (aba Histórico).
   `role="img"` com `aria-label` resumindo (`Carga diária dos últimos 14 dias, realizado e planejado`).
   `avisos ∋ "pmc"` → `Dado indisponível`.
3. **Aderência semanal**: duas linhas `02/11 ▬▬▬ 25%` (barra 6px, cor pela escala de
   `coach-athlete-diagnosis`: ≥90 verde, 70–89 neutro, 40–69 âmbar, <40 vermelho), nota 12px
   `N semanas com dados` + link `Ver 8 semanas` → Histórico (onde `AdherenceChart` continua com a
   série completa); com ≥ 4 semanas, mostra 4. `avisos ∋ "aderenciaSemanal"` → `Dado indisponível`.
4. **Sem dados ainda**: um card com uma linha por recurso vazio
   (`Melhores esforços — indisponível no canal Garmin` / `Revisão semanal — após fechar a semana`),
   14px/600 + 13px `text.muted`. Some quando os dois têm dado (eles vivem em Histórico).

### D7 — Tipografia, cor, interação
- Família: Inter; números e datas em `font.mono` (JetBrains Mono); `h1` e título do card de prova
  em Space Grotesk (já carregada pelo tema).
- Escala: `h1` 24, `h3` 15/600 (20 no card de prova), corpo 13–14, meta mono 12, eyebrow 11/600
  maiúsculo com `letter-spacing: .06em` — eyebrow sempre em `text.secondary` (#CBD5E1, 9,9:1)
  ou `primary`; **nunca** `text.muted` a 11px.
- Cores: só tokens. `primary` (#BDDE5A) para ação/seleção/IA; `semantic.danger/warning/success`;
  `categorical.sage/gold/violet` por tipo de treino; superfícies `surface[900]` fundo,
  `surface[800]` card, `surface[700]` borda.
- Estados: `button, a { transition: background-color .2s, border-color .2s, color .2s }`,
  `:focus-visible { outline: 2px solid primary; outline-offset: 2px }`, hover `b1` → `#C7E373`
  (token `primary.hover`, criar se não existir), hover `b2/.ico` → `rgba(255,255,255,0.06)` +
  borda `surface[600]`; `@media (prefers-reduced-motion: reduce) { transition: none }`.
- Alvos: botões 40px, `.ico` 40×40, abas 44px, segmentado 36px (dentro de área de 44px).

### D8 — Breakpoints
| Largura | Regra |
|---|---|
| ≥ 1440 | referência; cards de decisão 376px; linha do plano `84px 1.5fr 1fr 40px` |
| ≤ 1400 (1366×768) | linha do plano `76px 296px minmax(0,1fr) 40px`, `gap: 12px` — Planejado precisa de 295px (linha mono mais longa) e dois chips de 221px; sem isso a linha vai de 72 para 100px. Faixa de decisão termina em ≤ 680px (primeira dobra) |
| ≤ 900 | sidebar vira barra superior; grid de decisão e das colunas em `1fr`; `main` padding 16px |
| ≤ 600 | linha do plano `72px 1fr 40px`, Realizado abaixo de Planejado |

Os breakpoints de `.row` ficam **depois** da regra base no CSS (bug encontrado no artboard: regra
de 600px antes da base nunca aplicava).

### D9 — Rótulos de enum em um só lugar
`features/coach/adapters/enumLabels.ts` exporta `labelNivel`, `labelObjetivo`, `labelTipoTreino`,
`labelMotivoAtencao`, `labelSeveridade`, `labelConfianca`, `labelStatusSugestao`, cada um com
fallback para o valor cru capitalizado (nunca `undefined`). `labelTipoTreino` reusa o mapa já
existente em `TreinoPlanejadoCard` (extrair, não duplicar). Datas: `formatDiaSemana`
(`Seg 09/11`) e `formatIntervaloSemana` (`09–15/11`) em `utils/dateLabels.ts` com `date-fns` e
`ptBR`.

## Architecture

```
CoachAthleteProfilePage
├─ useAthleteProfile · useUserInfo · useCoachAthleteRaces · useAthleteContract · useSugestaoDecisao
├─ AthleteProfileHeader (h1, chips, ações)        ← profile, relogio, conexaoCanal
├─ AthleteProfileTabs (?tab=)
│  ├─ Visão geral
│  │  ├─ DecisionStrip ← buildDecisionCardsFromProfile(...)
│  │  │   └─ DecisionCard ×≤3 (AiSuggestionBlock, ações → useSugestaoDecisao / marcarCiente / markInvoicePaid)
│  │  ├─ coluna 2fr: WeekPlanList ← buildWeekPlanRowsFromProfile(...) · RecentTrainingsPanel
│  │  └─ coluna 1fr: CobrancaResumo · DailyLoadChart · AdherenceMini · SemDadosAinda
│  ├─ Financeiro (proprietário): CobrancaAtletaSection
│  └─ Histórico: PMCChart · MelhoresEsforcosPanel · WeeklyReviewCard · AthleteRacesPanel
└─ KudosDialog · TreinoEditDialog (como hoje)
```

Adapters puros, testados com `*.test.ts`; componentes recebem view models e callbacks.

## Key Interfaces (view models, `features/coach/types/`)

```ts
export interface DecisionCardVm {
  id: string;
  kind: 'SINAL' | 'PROVA' | 'COBRANCA';
  severity: 'CRITICA' | 'ALTA';
  title: string;                         // já em PT-BR
  evidence: { prefix: string; text: string }[];   // ≤ 2
  chips: string[];                        // ≤ 3
  ai?: { confidence: 'alta' | 'média'; summary: string; sugestaoId: string; askLink?: string };
  actions: { primary?: DecisionAction; secondary?: DecisionAction; reject?: DecisionAction; link?: DecisionAction };
}
export type DecisionAction = { label: string; onClick: () => void; disabled?: boolean };

export interface WeekPlanRowVm {
  dia: string;              // 'Seg 09/11'
  isHoje: boolean;
  planejado?: { tipo: string; cor: string; meta: string; treinoId: string };
  realizado:
    | { kind: 'FEITO'; tipo: string; cor: string; meta: string; diferente: boolean; dor: boolean; realizadoId: string }
    | { kind: 'PERDIDO' } | { kind: 'PENDENTE'; sync?: SyncStatus } | { kind: 'HOJE' } | { kind: 'DESCANSO' };
  acao: { kind: 'EDITAR' } | { kind: 'TRAVADO'; label: string } | { kind: 'NENHUMA' };
}
```

## Migration Path

0. Instrumentar a tela **atual** com `coach_profile_first_action_ms` (abrir → primeira ação) e
   medir ≥ 1 semana — baseline da métrica.
1. Adapters + `enumLabels` + `AiSuggestionBlock` (sem tocar a página) — mergeável sozinho.
2. Header + abas, movendo `CobrancaAtletaSection` para Financeiro e os cards de histórico para
   Histórico — a Visão geral ainda com os cards antigos.
3. Faixa de decisão substitui `RecentSignalsPanel` + `RecentSuggestionsPanel`.
4. `WeekPlanList` substitui o grid de `TreinoPlanejadoCard` dentro de `CurrentWeekPlan`.
5. Coluna direita (`DailyLoadChart`, aderência mini, cobrança resumo, sem dados).
6. Breakpoints + a11y + E2E.

Rollback: cada passo é um PR; reverter o PR devolve a tela anterior sem migração de dado.
