# Design — refine-inbox-visual-hierarchy

## Contexto técnico

**Mapa real da tela (verificado em 2026-08-16 — a versão anterior deste documento descrevia outra
estrutura).** O inbox tem 3 colunas só a partir de `lg` (`CoachInboxPage.tsx:300-304`):

| Coluna | Módulo | Fonte |
|---|---|---|
| 1 | "Resumo rápido" (4 `MetricTile`) | agregados de `dashboard` |
| 1 | "Fila de atenção" — **preview de 3** (`.slice(0,3)`, linha 375) | `dashboard.attentionQueue` |
| 1 | "Roster do dashboard" — **preview de 3** (linha 387) | `dashboard.roster.items` |
| 2 | **Lista principal de atletas** (`QueueRow`, linha 449) | `dashboard.roster.items` (paginado, 10) |
| 3 | Painel de detalhe + CTA (linha 662) | `useAthleteProfile` |

Tudo vem de **uma requisição**: `GET /api/v1/coach/dashboard` → `{ roster, attentionQueue }`
(`src/types/Coach.ts:72-73`), via `useCoachDashboard`. **Não existe "Fila de revisão" nesta tela** —
é outra rota (`/coach/planos/revisao`), para onde o inbox apenas navega (linha 648).

Tela alvo: `src/features/coach/pages/CoachInboxPage.tsx` e componentes em
`src/features/coach/components/` (`AthleteRow`, `QueueRow`, `DashboardAttentionQueueRow`,
`DashboardRosterPreviewRow`, `PlanoDetalhePanel`, `MetricTile`, `DetailMetric`, `TrendCard`,
`SectionCard`, `panels/DiagnosisTabPanel` etc.). Tema em `src/theme/` (`activeTheme.ts`,
`theme.premium.ts`, `tokens.ts`) e tokens em `src/shared/design-tokens`.

Fato medido: `fontFamily: 'Syne'` está hardcoded via `sx` em ~10 arquivos do coach; `index.css`
declara Inter como base. A raiz do problema tipográfico é bypass do tema, não o tema em si.

## Decisão 1 — CTA contextual: seletor de ação por estado

Uma função pura `resolvePrimaryAction(athlete): PrimaryAction` (em
`coachInboxHelpers.ts`), testável isolada, com precedência:

1. `plano_pendente_revisao` → `{ kind: 'aprovar-plano' }`
2. `sinal_inatividade` (ou diagnóstico dominante de engajamento) → `{ kind: 'contatar-atleta' }`
3. default → `{ kind: 'abrir-plano' }` (navegação, estilo secundário — sem accent)

**Onde o CTA vive (corrigido em 2026-08-16).** O CTA do inbox está em `CoachInboxPage.tsx:662`, no
próprio arquivo da página — **não** em `PlanoDetalhePanel`/`DiagnosisTabPanel`, que pertencem ao
fluxo separado de revisão de planos (`/coach/planos/revisao`) e já têm `isActing` próprio
(`PlanoDetalhePanel.tsx:618`). Mexer no `PlanoDetalhePanel` está **fora** desta change.

Renderização: um único `Button variant="contained"` (accent sólido, `size="large"`, ≥40px,
fonte ≥14px) no **cabeçalho do painel do atleta** (não no rodapé), ao lado do nome. Ações
secundárias (Enviar mensagem, Ajustar plano, Mais ações) permanecem no rodapé como outline
neutro.

**Contradição resolvida (default do atleta saudável).** O default `abrir-plano` é navegação, estilo
secundário, **sem accent** — e portanto **não conta como CTA primário**. A regra "existe exatamente
um botão primário sólido" vale para os estados `aprovar-plano` e `contatar-atleta`; no estado
saudável a tela legitimamente não tem CTA em accent. O critério de aceite 1 se aplica só ao estado
com plano pendente.

**Aplicabilidade ≠ disponibilidade — duas funções separadas, não uma regra de estilo.**

```ts
resolvePrimaryAction(athlete): PrimaryAction        // QUAL ação aparece — nunca devolve "nenhuma"
resolveActionAvailability(action, state): Availability  // 'ready' | 'loading' | 'blocked' | 'error'
```

O seletor decide *qual* ação é a primária; nunca um botão morto por design. A disponibilidade decide
se ela está clicável **agora**. A regra "sem disabled" vale só para a primeira.

**Estado atual que isso precisa corrigir (verificado):** o CTA de hoje desabilita por estado de plano
(`CoachInboxPage.tsx:691`); o `isActing` global existe no `CoachLayout.tsx:35` mas **o inbox não o
consome** (`CoachInboxPage.tsx:79` só pega `reviewAprovar`/`reviewRejeitar`/`reviewFetchPendentes`);
e `usePlanReview.ts:23` aprova **sem trava local contra duplo clique**.

**O status HTTP não chega ao componente hoje — isso é replumbing, não lógica de UI.** Cadeia atual:
`useCoachPlanReview.ts:41-54` captura a exceção, guarda em `actionError: Error | null` (sem status) e
devolve **`Promise<boolean>`**; `usePlanReview.ts:23` descarta a causa (`if (!ok) return`); e o inbox
nem consome `reviewActionError` (`CoachInboxPage.tsx:79`). Sem mudar isso, `resolveActionAvailability`
não tem como distinguir 409 de 403, e a task 1.3 entrega "loading + erro genérico" — menos do que o
critério 4c promete.

Escopo mínimo do replumbing (parte da task 1.3):
`CoachPlanoReviewService` preserva o `status` do erro → `useCoachPlanReview` expõe resultado tipado
(`{ ok: false; status?: number }` em vez de `boolean` cru) → `CoachLayoutOutletContext` propaga →
o inbox consome. Sem trocar contrato de API do backend.

Testes obrigatórios da task 1.3: mutação em voo (botão em loading e não reenvia), duplo clique
(**uma** chamada), plano já processado (409/422 → mensagem de stale, não erro genérico), sem permissão
(403 → estado explícito).

**Tradeoff:** mover o CTA para o topo tira a proximidade com o conteúdo do plano; aceito porque o
job da tela é triagem (decidir rápido), não edição — e o rodapé a y=863 provou ser invisível.

**Par decisório co-localizado.** "Rejeitar plano" deixa o menu "Mais ações" e renderiza como ação
secundária (outline neutro) ao lado do CTA primário no cabeçalho. Aprovar e rejeitar são a mesma
decisão com dois sentidos; co-localizar mantém o rejeitar visível e próximo do motivo escrito
(dialog). O menu "Mais ações" preserva apenas ações raras (marcar prioridade, abrir editor).

**"Contato assistido" (contra o stub) — DECIDIDA (Q8).** Quando `resolvePrimaryAction` resolve
"Contatar atleta", o botão não dispara o toast vazio atual (`setFeedback('Mensagem preparada…')`).
Gera um rascunho pré-composto (motivo + recência + ação sugerida — os mesmos campos do card) e copia
para a área de transferência. O `Atleta` não tem `telefone`/`email` no DTO coach, então não há
`wa.me/`/`mailto:` hoje — ficam como follow-up quando o campo de contato for exposto. Sem backend de
mensagem novo — o coach ainda cola/confirma o envio manualmente.

**Fallback obrigatório.** `navigator.clipboard.writeText` falha em contexto não-seguro e quando o
usuário nega a permissão. Sem fallback, o botão troca um stub silencioso (o toast vazio de
`CoachInboxPage.tsx:673`) por outro. Na rejeição, abrir dialog com o rascunho **selecionável** e erro
visível. Teste obrigatório: clipboard rejeitado → dialog aparece com o texto.

## Decisão 2 — Fusão dos módulos de atenção (REESCRITA em 2026-08-16)

> A versão anterior desta decisão dizia "a informação migra para o card da **Fila de revisão**, que
> já ordena por prioridade". Essa fila **não existe nesta tela** (ver mapa acima), e o alvo real — a
> lista principal — é **paginada**. A decisão inteira dependia de uma premissa falsa.

Coluna 1 hoje: Resumo rápido + preview da Fila de atenção (3 itens) + preview do Roster (3 itens).
Passa a:

- **Resumo rápido** → linha horizontal compacta de 4 stats sob o cabeçalho, liberando a coluna.
- **Previews de Fila de atenção e Roster** → removidos. Motivo + severidade migram para o card da
  **lista principal de atletas** (`QueueRow`): linha secundária "motivo · recência" e variante
  visual por status (`alerta`: borda 1px + fundo `error.main` ~8%; `atencao`: idem com `warning`).
- Layout passa de 3 para 2 colunas (lista ~360px + detalhe flexível).

### O problema que essa remoção cria — e a solução exigida

A lista principal é `dashboard.roster.items`: **paginada em 10** (`ROSTER_PAGE_SIZE`), com filtro de
status e ordenação aplicados server-side (`useDashboardFilters.ts:76-82`). `attentionQueue` **não é
paginada**. Hoje o preview da Fila de atenção é o que garante que um atleta em alerta apareça
independentemente de página, busca e filtro.

Removê-lo sem mais nada significa: **atleta em alerta na página 2, ou fora do filtro ativo, some do
inbox.** O sintoma é invisível — a tela não fica quebrada, só deixa de mostrar quem precisa de
atenção, que é exatamente o job dela.

**Exigência (task 1.1, gate duro): composer puro e testado, com contrato FECHADO.** A versão
anterior desta seção devolvia `InboxQueueRow[]` e ainda assim exigia sinalizar "N em atenção fora do
filtro" — não havia onde pôr esse número, e três implementações diferentes satisfariam o texto.

```ts
// features/coach/adapters/coachInboxAdapters.ts
type InboxQueueRow =
  | { source: 'roster';         atletaId: string; row: RosterRowViewModel; attention?: AttentionInfo }
  | { source: 'attention-only'; atletaId: string; athleteName: string;     attention: AttentionInfo };

type AttentionInfo = { severity: AttentionSeverity; reason: AttentionReason; recencyDays: number | null };

buildInboxQueue(
  roster: CoachDashboardRosterPage,
  attentionQueue: CoachAttentionItem[],
  filters: { status: DashboardStatusFilter; search: string },
): { rows: InboxQueueRow[]; pinnedCount: number; hiddenAttentionCount: number }
```

**Por que a união é obrigatória:** `CoachAttentionItem` tem apenas `atletaId`, `athleteName`,
`severity`, `priorityScore`, `primaryReason`, `suggestedAction`, `generatedAt`, `evidence`
(`src/types/Coach.ts`) — **não tem** as métricas que `QueueRow` renderiza para uma linha de roster.
Tratar os dois como o mesmo tipo produziria linha com dados falsos (zeros travestidos de medição) ou
que não abre o detalhe. A linha `attention-only` renderiza **só** nome + motivo + recência + ação
sugerida, e a seleção passa a ser por `atletaId` (não por índice no `rosterItems`).

Regras, cada uma com teste unitário:
1. **Fixação:** todo item de `attentionQueue` aparece no topo de **todas** as páginas do roster,
   marcado como fixado — não é conteúdo da página, é uma seção fixa acima dela. (A leitura
   alternativa — aparecer só na página onde "caberia" — anula o propósito, já que o problema é
   justamente o atleta que não está em página nenhuma.)
2. **Sem duplicata:** atleta nas duas fontes aparece **uma vez**, como `source: 'roster'` com
   `attention` preenchido — não duas linhas.
3. **Filtro não esconde em silêncio:** itens de atenção excluídos pelo filtro/busca ativos **não**
   entram em `rows`, mas contam em `hiddenAttentionCount`, que a UI exibe ("3 em atenção fora do
   filtro atual"). Fixar é para paginação; sinalizar é para filtro — são mecanismos distintos e o
   retorno separa os dois.
4. **Ordem:** fixados primeiro por `severity` e `priorityScore`, depois o roster na ordem do backend.

**Paginação (achado do pre-mortem).** `TablePagination` usa `count={rosterTotal}`
(`CoachInboxPage.tsx:466`, `rosterTotal = roster.totalElements`). Como os fixados **não** são
conteúdo da página, o `count` continua sendo o total do roster — não somar `pinnedCount` nele, sob
pena de "1 de 3 páginas" mentir e a última página vir curta. Teste obrigatório: com 2 páginas e um
atleta `attention-only`, o `count` não muda e o fixado aparece nas duas páginas.

**Recência.** `recencyDays` vem de `lastActivity` do roster quando o motivo é inatividade (é a
pergunta que o coach faz: "há quantos dias não treina"); nos demais motivos, de `generatedAt` (idade
do alerta). Formatter puro, testado com clock fixo — `generatedAt` como "dias sem treinar" seria
número errado com cara de certo.

**Alternativas aceitáveis** se o composer não couber: manter o preview da Fila de atenção (não
remover) ou introduzir filtro "só atenção" com contador. **Não é aceitável** remover os previews sem
nenhum dos três — é isso que o critério 4b trava.

**Sem mudança de backend.** Tudo acima usa campos que a resposta atual já traz. Se a análise concluir
que só o backend resolve (ex.: `attentionQueue` também paginada), isso vira change própria e a task
1.5 sai desta — ver Non-Goal "não muda contrato de API".

## Decisão 3 — Tokens de accent e semântica de cor

No tema (não em `sx`):

- `accent` (lime): permitido somente em `Button variant="contained"` primário e indicador de nav
  ativa. Eyebrow, chips informativos e tabs migram para `text.secondary` / neutros.
- Semântica de estado: `error` (vermelho) = requer ação; `warning` (âmbar) = observar; `success`
  (verde) = ok. Proibido reutilizar essas cores para ornamento. Chips de estado com fonte ≥11px e
  contraste AA sobre o fundo do card.
- Adicionar teste de tema (padrão já existente em `theme.premium.test.ts`) que valide os tokens.

**Cor do CTA — DECIDIDA (Q7), padrão Premium.** A ação primária é sempre lime (`PRIMARY_BTN_SX`/
`primary[500]`), seja "Aprovar plano" ou "Contatar atleta" — Lime Discipline do
`refactor-color-system-premium-v2` (lime = marca + primary-action). Verde (`SUCCESS_BTN_SX`) é
reservado a "confirmação de estado" (ex.: "marcar oficial") e a chips de estado — nunca ao CTA
principal. Regra de papéis: PRIMARY=lime (ação), SUCCESS=verde (estado/confirmação),
DANGER=vermelho (destrutivo), GHOST=neutro (secundário).

## Decisão 4 — Escala tipográfica via tema

`theme.typography`: display (Syne) apenas em `h1–h4`; Inter em `body*`, `caption`, `overline`,
`button`. Escala alvo: 11 (caption/overline) · 13 (body2) · 16 (body1/valores) · 20 (nome do
atleta, h4) · 24–28 (h3, uso raro). Título da página vira `h6`-equivalente (~16px) com o eyebrow
incorporado ou removido. Remoção mecânica de todos os `fontFamily: 'Syne'` em `sx` no escopo do
coach; nenhum `fontSize` computado <11px (inclui os labels de 7,2px da strip de KPIs, que sobem
para caption 11px ou são fundidos ao valor via tooltip).

**Escopo do tema — Q9 DECIDIDA (2026-08-16): `ThemeProvider` aninhado no `CoachLayout`, e só isso.**
O "ou" anterior era frouxo demais para virar código. O `ThemeProvider` global envolve todas as rotas
(`App.tsx:261`) e `typography.fontFamily` é Syne global ali (`App.tsx:72`); `AthleteLayout` não tem
provider próprio (`AthleteLayout.tsx:18`), então **qualquer alteração em `App.tsx` vaza para o
atleta** e viola o Non-Goal. No MUI 7 um `ThemeProvider` aninhado herda e sobrepõe o tema pai — é o
mecanismo correto. **Proibido nesta change:** editar `typography` em `App.tsx`. A remoção de
`fontFamily: 'Syne'` hardcoded fica restrita a `src/features/coach/**`.

## Decisão 5 — Estados vazios como mensagem

Componente pequeno `EmptyMetricState` (ou uso do padrão existente de empty state, se houver):
quando a janela de dados do atleta está vazia, a grade de métricas zeradas é substituída por uma
única mensagem contextual ("Sem treinos registrados nos últimos 14 dias — os indicadores aparecem
com o primeiro treino sincronizado."). Regra: **zero legítimo** (ex.: monotonia 1.00) renderiza;
**zero por ausência de dado** vira mensagem. A distinção vem dos campos de disponibilidade que o
adapter já expõe (`coachInboxAdapters`) — se não expõe, adicionar flag derivada no adapter (sem
mudança de API).

## Decisão 6 — Mobile: navegação empilhada, não colunas espremidas

- `< md` (900px): sidebar vira `Drawer` temporário (hambúrguer no header); some a largura fixa.
- O inbox vira **duas telas**: lista (lista principal do inbox + resumo compacto) e detalhe do atleta
  (rota própria ou estado com `Back`). Sem tentativa de manter colunas lado a lado.
- Tabs do detalhe viram scrolláveis; barra de ação secundária vira menu; CTA primário fixo
  visível no topo do detalhe.
- Critério mecânico: `document.documentElement.scrollWidth === innerWidth` em 390px, verificado
  em teste Playwright com viewport mobile.

**Alternativa rejeitada:** bottom-nav. Drawer é o caminho de menor mudança estrutural no MUI e
não conflita com a barra de ações do detalhe; bottom-nav fica para quando houver métricas de uso
mobile reais.

**Risco aceito se a Fase 3 for destacada.** Enquanto ela não rodar, a faixa 900–1200px continua com
o defeito atual (sidebar 240px fixa — `CoachSidebar.tsx:75` — somada ao grid já empilhado abaixo de
`lg`). Não é regressão introduzida por esta change, mas também não é resolvida por ela.

**Consistência de breakpoint.** O grid do inbox colapsa em `lg` (1200px) hoje, mas o drawer da
sidebar usa `md` (900px) — a faixa 900–1200px fica subprojetada (sidebar expandida 240px + conteúdo
já empilhado). Decidir na task 3.1a se o empilhamento do grid desce para `md` (ou o drawer sobe para
`lg`).

## Sequência e costura

Fase 1 → 2 → 3, cada uma mergeável de forma independente (PRs separados na mesma branch ou
branches encadeadas, a decidir no `/implement init`). A Fase 3 é a costura natural para virar
change própria se o escopo estourar.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| E2E/screenshot tests quebram com a remoção de módulos | Mapa **nominal** na task 1.1b (já identificados `CoachInboxPage.test.tsx:190` e `:270`) e E2E novo na 1.1c **antes** da remoção — o risco maior não é o teste que quebra, é o que fica verde |
| `resolvePrimaryAction` divergir do estado real do plano | Função pura + testes unitários por estado; reusar os mesmos seletores do painel |
| Remoção de `sx` Syne alterar telas fora do escopo | Grep restrito a `src/features/coach`; snapshot visual das demais telas do coach no QA |
| Drawer mobile esconder o badge de inbox (contador) | Badge replicado no ícone do hambúrguer |
| Tema compartilhado com telas do atleta | `ThemeProvider` **aninhado no `CoachLayout`** (que hoje não tem nenhum); `App.tsx` não é tocado — verificável por diff |
