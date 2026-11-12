## Context

Tela `/#/coach/athletes/:atletaId`, React 19 + MUI 7, dark-only, tokens em `src/theme/tokens.ts` e
`src/shared/design-tokens`. Dados de um endpoint agregado (`AtletaPerfilCoachDto`). Hoje a página
usa `useCoachAthleteRaces` e `useSugestaoDecisao` (este só com `decidir`/`editar`; o fetch de
`detalhe` mora em `RecentSuggestionsPanel.tsx:229-258`), e `useAthleteContract` é usado só por
`CobrancaAtletaSection`. Esta change é de apresentação e composição; contrato muda só se DP1 ou
DP2 (proposal, "Decisões pendentes") forem pela opção de backend.

Artboard de referência: https://claude.ai/artifact/WWKTwwKSwW42ZFap7dz4NC (`Sugestão`, 1440×1640;
`Sugestão — 1366×768`). Tudo que o artboard mostra está transcrito abaixo; em conflito, vale este
documento. **O artboard de notebook usa 1366×768, mas a área útil real é 1366×625** (medição de
`coach-inbox-notebook-height`); as medidas de primeira dobra abaixo valem para 1366×625 e precisam
ser remedidas no artboard (task 0.3).

## Goals

- Primeira dobra = decisão: o treinador vê o que exige ação sem rolar, em 1440 e nos viewports de
  notebook 1366×625, 1280×600 e 1093×500.
- Planejado × realizado na mesma linha, sem abrir diálogo.
- Uma hierarquia tipográfica (Inter + mono para números), um formato de data, enums em PT-BR.
- Reaproveitar `Card`, `CardHeader`, `StatusBadge`, `aiHighlight`, `glassSx`; nada de hex novo.

## Non-Goals

- Campo novo no backend além de `evidencias` no sinal, se DP1 for pela opção (a) — nem o
  veredito de reconciliação, nem sinal de dor.
- Redesenho do Inbox, do `TreinoPlanejadoCard` ou do diálogo "Ver realizado".
- Mobile < 600px além de "não quebrar" (coluna única, sem scroll horizontal).
- Light mode.

## Decisions

### D1 — Layout: duas colunas independentes, não um grid 3×N
`main` com `padding: 32px`. A sidebar do coach **não é fixa**: 240px expandida e 64px recolhida
(`CoachSidebar.tsx:89-90`), e nasce recolhida abaixo de `lg` (1200px, `useCompactViewport`). Em
1366 e 1440 (≥ `lg`) vale a preferência do treinador, então o layout SHALL funcionar nos dois
casos. Largura útil do conteúdo (viewport − sidebar − 64px de padding): **1062px** em 1366 e
**1136px** em 1440 com a sidebar expandida; 1238px e 1312px com ela recolhida. O pior caso
(expandida) é o de referência para as contas de D8. Abaixo da faixa de decisão, um grid `2fr 1fr` com `gap: 16px` cujas células
são **duas colunas flex** (`display:flex; flex-direction:column; gap:16px`), não linhas do grid.
Motivo: com grid 3×N, "Treinos recentes" só começava quando a coluna direita (mais alta) acabava.

### D2 — Faixa "Precisa de decisão": fontes, ordem, limite
`buildDecisionCardsFromProfile(profile, detalhes, provasPendentes, contrato, isProprietario)` →
`DecisionCardVm[]`, puro, em `adapters/decisionCardsAdapter.ts`.

| Fonte | Condição | Card |
|---|---|---|
| `sugestoesRecentes[]` com `status = PENDING` | sempre | **card próprio por sugestão** (`kind: 'SUGESTAO'`), independente de sinal: `summary` e `confidence` vêm de `SugestaoService.detalhe(id)` (`SugestaoRecenteDto` só traz `id/tipo/status/criadoEm`), carregados por `useSugestoesDetalhe` com `Promise.allSettled` — o fetch atual de `RecentSuggestionsPanel` usa `Promise.all` e uma falha derruba todos; aqui a falha de um `detalhe` afeta só aquele card. Título = rótulo do `tipo` (`PLAN_ADJUST`/`RECOVERY`/`NEW_PLAN`, mapa existente — D9); bloco IA = `summary`; ações Aceitar · Ajustar · Rejeitar |
| `sinaisRecentes[]` | sempre (o backend já cortou em `ALTA`) | **no máximo 1** (a fila agrega por atleta, A3). Título = rótulo do `motivo`; evidência conforme DP1 (D3), e para `FADIGA`/`SOBRECARGA` o TSB e o ATL do último ponto de `profile.pmc` ("TSB −18,4 · ATL 92") com link "Ver PMC" → Histórico. **`sugestaoId` chega `null` hoje** (`CoachAthleteProfileServiceImpl.java:154-159`, "match heurístico não implementado"); quando vier preenchido, o sinal e a sugestão fundem num card só (sinal como evidência, sugestão como bloco IA). Sem vínculo, são dois cards. **Descartado** quando o motivo é `PROVA_ATLETA` e há card de prova, ou `MENSALIDADE_VENCIDA` (`add-aviso-mensalidade`) e há card de cobrança — mesmo fato, um card só. Ação conforme DP3 |
| provas pendentes (`listarPendentesRevisao`) | ≥ 1 | um card por prova. Título "Prova alvo em N dias" / "Prova nova" / "Alvo trocada"; evidência = data, distância, "N de M semanas" e `motivoRevisao`; ação Revisar prova (`marcarCiente`). Sem link de taper (cortado, A8) |
| `billingStatus`/`nextDueDate` | `OVERDUE` e `isProprietario` | título "Mensalidade vencida"; ação Dar baixa (`markInvoicePaid(invoiceId)`, com o id da mensalidade vindo da instância de `useAthleteContract` da página — o perfil não traz o id) · link Abrir contrato (aba Financeiro) |

**Ordem — rank por `kind`, sem cópia de pesos no front.** Com a fila agregada há no máximo 1
sinal, então não há dois sinais a ordenar entre si. A ordem entre cards é: (1) sinal `CRITICA`;
(2) prova com `preparacaoCurta` ou `ALVO_TROCADA`; (3) sugestão `PENDING` (mais recente primeiro);
(4) sinal `ALTA`; (5) demais provas (data mais próxima primeiro); (6) cobrança. Só o sinal tem
`severidade`; sugestão, prova e cobrança não têm, por isso o rank é por tipo. Motivo
desconhecido (ex.: `SEM_SINCRONIZACAO`, `DOR_RECORRENTE` antes do rótulo existir) usa o rank da sua
severidade e rótulo = valor cru em `toLowerCase` capitalizado — nunca lança. Limite **3 cards**; o
resto vira "+N" no título da faixa, que expande a faixa no lugar (a aba Histórico não lista
decisões). Sem item **e sem aviso**: a faixa não renderiza (nem título vazio).

**Falha não é ausência.** `profile.avisos` contendo `"sinaisRecentes"` ou `"sugestoesRecentes"`
(o agregador devolve lista vazia e registra o aviso quando a consulta falha), ou erro ao buscar
`detalhe` de uma sugestão, SHALL manter a faixa visível com o estado "Não foi possível carregar as
decisões · Tentar de novo" (botão que refaz `fetchProfile`/`detalhe`), ao lado dos cards que
carregaram. `avisos ∋ "cobranca"` (`CoachAthleteProfileServiceImpl.java:174`) entra no mesmo
estado para o proprietário. A faixa nunca afirma "nada a decidir" quando uma fonte falhou.

**Depois de cada ação** (aprovar, rejeitar, ajustar, dar ciência, dar baixa) com sucesso: o card
sai da faixa sem reload, `refetchQueue` do `CoachLayout` é chamado (a fila do Inbox é cacheada lá)
e, para "Dar baixa", o perfil é recarregado — `billingStatus` vem do perfil, e sem isso o card de
cobrança não some.

### D3 — Anatomia do `DecisionCard`
`Card variant="flat"`, `padding: 20px`, `gap: 12px`, `display:flex; flex-direction:column`,
borda `semantic.danger` a 55% quando `CRITICA`. Ordem fixa dos blocos, do topo:

1. **Cabeçalho**: ícone 20px (SVG inline do set do app, nunca emoji) + `h3` 15px/600 + chip de
   severidade à direita ("Atenção alta" = `CRITICA` em `danger` — mesmo rótulo de
   `add-pain-attention-signal`, que evita "Risco" por sugerir diagnóstico; `ALTA` sem chip). O card de prova usa
   `h3` em Space Grotesk 20px/26px — é o único com título display, por ser o único card que não é
   um alerta.
2. **Evidência**: 1–2 linhas 13px `text.secondary` com prefixo mono `text.muted`
   (`Seg 09/11 · RPE 4 — "Senti um pouco a lombar"`; `Sem 02/11 — 1 de 4 treinos · perdeu Qua, Sex e Dom`).
   Comentário do atleta entre aspas tipográficas, truncado em 80 caracteres. **Fonte do card de
   sinal depende de DP1:** (a) `evidencias` do item da fila, se o backend as expuser; (b) derivada
   de `pmc`, `aderenciaSemanal` e `realizadosRecentes`. Hoje `SinalRecenteDto` não traz evidência
   nenhuma. O card de prova usa os campos da prova; o de sugestão não tem evidência própria.
3. **Chips de contexto**: `flex-wrap`, `gap: 6px`, chip outline (`border: 1px solid surface[600]`,
   `color: text.secondary`, 11px/500, `padding: 2px 8px`, raio `pill`). Máximo 3.
4. **Bloco "Sugestão da IA"** (`AiSuggestionBlock`): fundo `aiHighlight.bg`, borda
   `aiHighlight.border`, raio 8px, `padding: 12px`; eyebrow 11px/600 maiúsculo `primary` com ícone
   sparkle 14px: `Sugestão da IA · confiança {alta|média|baixa}` (`HIGH`/`MEDIUM`/`LOW`);
   corpo 13px `text.primary` = `summary`;
   link opcional 12px abaixo (ex.: "Perguntar ao atleta antes de decidir"). Só quando há sugestão
   `PENDING`.
5. **Ações** (`margin-top: auto`, uma linha, nunca quebra): primário `Aceitar` (`b1`: fundo
   `primary`, texto `surface[900]`), secundário `Ajustar` (`b2`: outline `surface[600]`), e
   `Rejeitar` como botão texto `primary` encostado à direita (`margin-left: auto`). `Rejeitar`
   **abre o `RejeitarSugestaoModal` atual** (`RecentSuggestionsPanel.tsx:165-215`, motivo
   opcional) — não é clique direto, porque o `rejectionReason` alimenta a métrica-guarda.
   `Ajustar` edita o `summary` (`useSugestaoDecisao.editar`), exceto em sugestão com
   `acaoProposta` (`add-pain-attention-signal`), onde abre o `TreinoEditDialog` no treino-alvo e
   `Aceitar` mostra o diff antes de confirmar. Card de prova:
   `Revisar prova` (b2) + link `Ver provas` (Histórico). Card de cobrança: `Dar baixa` (b2) + link
   `Abrir contrato`. Card de sinal sem sugestão: ação conforme DP3 (recomendado: `Ajustar plano`,
   o mesmo do cabeçalho). Botões `min-height: 40px`, `padding: 0 16px`, raio 6px, 13px/600.

Altura dos três cards é a da linha (grid `align-items: stretch`); o bloco de ações fica no rodapé
de todos. Para que os cards de aderência e prova não fiquem com rodapé vazio, ambos têm evidência
+ chips (D2) — medido no artboard de 1366×768: folga antes das ações cai de 184/167px para
59/12px. Remedir em 1366×625 (task 0.3).

### D4 — Plano da semana: linha por dia
`buildWeekPlanRowsFromProfile(planoVigente, realizadosRecentes, hoje)` → `WeekPlanRow[]` (7 linhas,
Seg–Dom da semana do plano), puro, em `adapters/weekPlanRowsAdapter.ts`.

Grid por linha: `84px minmax(0,1.5fr) minmax(0,1fr) 88px` (coluna Ação comporta "Ver realizado"
+ cadeado/lápis), `gap: 16px`, `padding: 12px 0`,
`border-top: 1px solid surface[700]`, `align-items: center`. Cabeçalho de colunas em eyebrow
(`Dia · Planejado · Realizado`).

| Coluna | Conteúdo |
|---|---|
| Dia | mono 12px `text.muted`: `Seg 09/11`; hoje em `primary` |
| Planejado | ponto 8px na cor do tipo via `workoutTypeColor(tipo)` (`theme/activeTheme.ts`), que lê o mapa existente `trainingType` (`theme.premium.ts:100-110`: Regenerativo `sage`, Contínuo `gold`, Fartlek `violet`, Intervalado `magenta` etc.; não criar mapa novo). Não existe tipo `DESCANSO`: dia sem treino planejado é "Descanso", com ponto `text.muted` + rótulo PT-BR 14px/600 (`tipoTreinoLabel`); linha 2 mono 12px `text.muted`: `6.4 km · 50 min · Z1 123–139 bpm · TSS 30` (zona por `useAthleteTrainingZones`, como hoje) |
| Realizado | **com realizado vinculado**: ponto + rótulo PT-BR do `tipoTreino` + mono `42 min · TSS 41` (+ `RPE 6` se houver); linha 2 chips: `Tipo diferente do planejado` **informativo** (outline `surface[600]`, texto `text.secondary` — não é alerta, ver A1) só quando **ambos** os tipos são conhecidos e diferem (`tipoTreino` do realizado é opcional no DTO; ausente → sem chip, e ausência de chip não significa conformidade), `Dor relatada` (`danger`) se `sensacoes ∋ DOR`. O rótulo "Diferente do prescrito" fica reservado ao veredito da reconciliação, quando o backend o expuser. **Perdido**: texto `danger`. **Cancelado** (`statusExecucao = CANCELADO`): `Cancelado` em `text.secondary`, sem chip. **Pendente**: `Pendente` + `SyncStatusChip` (`No relógio` etc.). **Hoje sem realizado**: `Hoje`. **Descanso**: vazio. O chip de sincronização **também** aparece em dia realizado quando o envio falhou (hoje o erro de sync aparece em qualquer dia; restringir a "Pendente" esconderia a falha) |
| Ação | `.ico` 40×40 outline: cadeado (`aria-label` = `buildLockLabelFromRejection`) quando `!isAguardando && editable === false`; lápis abre `TreinoEditDialog` quando editável; **"Ver realizado"** (`VerRealizadoAcao`, como em `CurrentWeekPlan.tsx:127-131`) em dia com realizado vinculado — ícone 40×40 ao lado do cadeado |

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
     Intermediário · Melhorar meu tempo  [● Garmin Forerunner 970 · <estado de conexaoCanal> ⓘ]
Visão geral | Financeiro [1 vencida] | Histórico        (role=tablist, min-height 44px)
```
- Avatar 48px (`CoachAthleteAvatar`). `h1` é o único `h1` da página.
- Chip do canal: `CoachWatchLine` vira chip 36px de altura com ícone ⓘ que abre `Popover`. O chip
  mostra só o que o contrato tem: `relogio` é `{ marca, modelo? }` (informado no onboarding, não
  confirmado) e `conexaoCanal` dá o estado da conexão. **Não existe** `relogio.status`/`VALIDANDO`
  nem "última atividade" no contrato — o chip "Relógio em validação" do artboard sai. O popover
  contém o que `CoachWatchLine.tsx:69-125` já exibe: o texto da linha, o `Alert` de compatibilidade
  quando o treino não chega direto ao relógio e o botão que abre o diálogo "O que pedir ao atleta".
  **Não há ação de reenvio** no `CoachWatchLine`; o reenvio continua no banner `ReenvioRelogio`
  do plano.
- O `Alert` atual que imprime as chaves cruas de `avisos` ("Alguns blocos não carregaram: pmc,
  cobranca", `CoachAthleteProfilePage.tsx:248-252`) sai: cada bloco mostra o seu "Dado
  indisponível"; chave sem bloco dono vira rótulo PT-BR, nunca a chave crua.
- Sem botão `Mensagem` (cortado no review de produto; entra com `add-athlete-coach-messaging`).
  `KudosDialog`, "Preencher onboarding" e "Atualizar" ficam no menu `⋯`.
- `Ajustar plano` rola até o card do plano e foca o primeiro lápis habilitado (sem rota nova).
- Abas: MUI `Tabs` com `aria-controls`; Financeiro só para `isProprietario`; rótulo recebe
  `StatusBadge` `danger` com `N vencida` quando `billingStatus = OVERDUE`. Aba ativa persiste na
  query `?tab=` para deep link e para os E2E.

### D6 — Coluna direita (Visão geral)
1. **Cobrança** (proprietário; só com `billingStatus` `OVERDUE` ou `DUE_SOON` — o limiar de "a
   vencer" é do backend, o front não recalcula dias): eyebrow + chip `Vencida` (`danger`) /
   `Vence em N dias` (`warning`, N a partir de `nextDueDate`); valor mono 24px/600 `R$ 150,00` +
   `venceu 10/11`; linha `Próxima: 10/12 · mensal`; ações `Dar baixa` (b2) + link `Abrir contrato`
   (aba Financeiro). **Valor, id da mensalidade e "Próxima" vêm do contrato**, não do perfil (o
   perfil "nunca carrega valor", `AtletaPerfilCoach.ts:159-162`): a página mantém **uma**
   instância de `useAthleteContract`, passada ao resumo, ao card da faixa e a
   `CobrancaAtletaSection` — duas instâncias não sincronizam. Depois de `markInvoicePaid`, a
   página recarrega o contrato e o perfil. `avisos ∋ "cobranca"` ou falha do contrato → `Dado
   indisponível`.
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
  maiúsculo com `letter-spacing: .06em` — eyebrow sempre em `text.secondary` (`surface[400]`,
  #94A3B8, `tokens.ts:25`: 7,1:1 sobre `surface[900]` e 5,7:1 sobre `surface[700]`) ou `primary`;
  **nunca** `text.muted` (#64748B, 3,8:1 sobre `surface[900]`) a 11px.
- Cores: só tokens. `primary` (#BDDE5A) para ação/seleção/IA; `semantic.danger/warning/success`;
  `trainingType` por tipo de treino (D4); superfícies `surface[900]` fundo, `content.cardBg`
  (o fundo que `shared/components/Card` já usa) no card, `surface[700]` borda. Não existe
  `surface[800]`.
- Estados: `button, a { transition: background-color .2s, border-color .2s, color .2s }`,
  `:focus-visible { outline: 2px solid primary; outline-offset: 2px }`, hover `b1` →
  `primary[400]` (#C7E373, já existe em `theme.premium.ts`; não criar `primary.hover`), hover
  `b2/.ico` → `rgba(255,255,255,0.06)` +
  borda `surface[600]`; `@media (prefers-reduced-motion: reduce) { transition: none }`.
- Alvos: botões 40px, `.ico` 40×40, abas 44px, segmentado 36px (dentro de área de 44px).

### D8 — Breakpoints
| Largura | Regra |
|---|---|
| ≥ 1440 | referência; conteúdo 1136px com sidebar expandida (D1); cards de decisão `(1136 − 2×16) / 3 ≈ 368px`; linha do plano `84px 1.5fr 1fr 88px` |
| ≤ 1400 (1366×625) | conteúdo 1062px com sidebar expandida; coluna do plano `2fr` ≈ 697px, área útil da linha ≈ 657px (padding 20px). Com Dia 76 + Ação 88 + 3 gaps de 12 = 200px, sobram ≈ 457px para Planejado + Realizado; dois chips pedem 221px, então Planejado fica com ≈ 236px — **menos** que os 295px da linha mono mais longa. Regra: `76px minmax(0,1fr) minmax(221px,auto) 88px`, `gap: 12px`; a linha mono do Planejado trunca com reticências e `title` com o texto completo; chips nunca quebram. Faixa de decisão termina em ≤ 625px (primeira dobra); se a remedição (task 0.3) mostrar que não cabe, o bloco IA mostra `summary` em 2 linhas com "ver mais" antes de qualquer outro corte |
| 1280×600 · 1093×500 | mesmas regras; faixa inteira na primeira dobra é critério de E2E (sidebar recolhida em 1093, `< lg`) |
| ≤ 900 | sidebar vira barra superior; grid de decisão e das colunas em `1fr`; `main` padding 16px |
| ≤ 600 | linha do plano `72px 1fr 88px`, Realizado abaixo de Planejado |

Os breakpoints de `.row` ficam **depois** da regra base no CSS (bug encontrado no artboard: regra
de 600px antes da base nunca aplicava).

### D9 — Rótulos de enum em um só lugar
`features/coach/adapters/enumLabels.ts` exporta `labelNivel`, `labelObjetivo`, `labelTipoTreino`,
`labelMotivoAtencao`, `labelSeveridade`, `labelConfianca`, `labelStatusSugestao`,
`labelTipoSugestao`, cada um com fallback para o valor cru capitalizado (nunca `undefined`).
Os que já têm mapa no código **reexportam**, não copiam:
- `labelTipoTreino` → `tipoTreinoLabel` de `features/coach/components/tiposTreino.ts:9-27`
  (o mapa não está em `TreinoPlanejadoCard`);
- `labelMotivoAtencao` → `REASON_LABEL` de `coachInboxHelpers.ts` (tipado de forma exaustiva;
  motivos novos entram lá pela change que os cria) com fallback para motivo desconhecido;
- `labelTipoSugestao` → mapa de `SuggestionTypeBadge.tsx` (chaves em minúsculas: `plan_adjust`,
  `recovery`, `new_plan`) ou `TIPO_LABELS` de `RecentSuggestionsPanel.tsx:28` — extrair um só e
  apontar os dois para ele. Datas: `formatDiaSemana`
(`Seg 09/11`) e `formatIntervaloSemana` (`09–15/11`) em `utils/dateLabels.ts` com `date-fns` e
`ptBR`.

## Architecture

```
CoachAthleteProfilePage
├─ useAthleteProfile · useUserInfo · useCoachAthleteRaces · useAthleteContract (1 instância)
│  · useSugestaoDecisao · useSugestoesDetalhe (allSettled) · layoutContext.refetchQueue
├─ AthleteProfileHeader (h1, chips, ações)        ← profile, relogio, conexaoCanal
├─ AthleteProfileTabs (?tab=)
│  ├─ Visão geral
│  │  ├─ DecisionStrip ← buildDecisionCardsFromProfile(...)
│  │  │   └─ DecisionCard ×≤3 (AiSuggestionBlock, ações → useSugestaoDecisao + RejeitarSugestaoModal / marcarCiente / markInvoicePaid; depois refetchQueue)
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
  kind: 'SINAL' | 'SUGESTAO' | 'PROVA' | 'COBRANCA';
  rank: number;                          // D2: ordem por kind; menor primeiro
  severity?: 'CRITICA' | 'ALTA';         // só SINAL tem severidade
  title: string;                         // já em PT-BR
  evidence: { prefix: string; text: string }[];   // ≤ 2
  chips: string[];                        // ≤ 3
  ai?: { confidence: 'alta' | 'média' | 'baixa'; summary: string; sugestaoId: string; askLink?: string };
  detalheFalhou?: boolean;                // SUGESTAO cujo detalhe falhou (allSettled)
  actions: { primary?: DecisionAction; secondary?: DecisionAction; reject?: DecisionAction; link?: DecisionAction };
}
export type DecisionAction = { label: string; onClick: () => void; disabled?: boolean };

export interface WeekPlanRowVm {
  dia: string;              // 'Seg 09/11'
  isHoje: boolean;
  planejado?: { tipo: string; cor: string; meta: string; treinoId: string };
  realizado:
    | { kind: 'FEITO'; tipo: string; cor: string; meta: string; diferente: boolean; dor: boolean; realizadoId: string }
    | { kind: 'PERDIDO' } | { kind: 'CANCELADO' } | { kind: 'PENDENTE'; sync?: SyncStatus }
    | { kind: 'HOJE' } | { kind: 'DESCANSO' };
  sync?: SyncStatus;        // também em FEITO, para mostrar falha de envio
  acao: { kind: 'EDITAR' } | { kind: 'TRAVADO'; label: string } | { kind: 'NENHUMA' };
  verRealizado?: { treinoRealizadoId: string };   // VerRealizadoAcao, independente de acao
}
```

## Migration Path

0. Fechar DP1–DP3; remedir o artboard em 1366×625. Se DP2 escolher um canal, instrumentar a tela
   **atual** com `coach_profile_first_action_ms` (abrir → primeira ação) e medir ≥ 1 semana —
   baseline da métrica. Se DP1 = (a), o PR de backend (`evidencias` em `SinalRecenteDto`) entra
   antes da Fase 3.
1. Adapters + `enumLabels` + `AiSuggestionBlock` (sem tocar a página) — mergeável sozinho.
2. Header + abas, movendo `CobrancaAtletaSection` para Financeiro e os cards de histórico para
   Histórico — a Visão geral ainda com os cards antigos.
3. Faixa de decisão substitui `RecentSignalsPanel` + `RecentSuggestionsPanel`.
4. `WeekPlanList` substitui o grid de `TreinoPlanejadoCard` dentro de `CurrentWeekPlan`.
5. Coluna direita (`DailyLoadChart`, aderência mini, cobrança resumo, sem dados).
6. Breakpoints + a11y + E2E.

Rollback: cada passo é um PR; reverter o PR devolve a tela anterior sem migração de dado.
