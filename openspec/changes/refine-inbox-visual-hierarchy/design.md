# Design — refine-inbox-visual-hierarchy

## Contexto técnico

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

Renderização: um único `Button variant="contained"` (accent sólido, `size="large"`, ≥40px,
fonte ≥14px) no **cabeçalho do painel do atleta** (não no rodapé), ao lado do nome. Ações
secundárias (Enviar mensagem, Ajustar plano, Mais ações) permanecem no rodapé como outline
neutro.

**Aplicabilidade ≠ disponibilidade (ajuste do pre-mortem).** O seletor resolve *qual* ação é a
primária; ele não decide se ela está *operacionalmente* disponível. Quando a ação não se aplica
ao estado do atleta, o seletor devolve outra (nunca um botão morto por design). Mas mutação em
voo (loading), plano já processado por outra requisição (stale), falta de permissão e falha de
dependência continuam produzindo estados explícitos de loading/disabled/erro no botão — com
testes de página cobrindo mutação pendente, plano já processado e ação não autorizada.

**Tradeoff:** mover o CTA para o topo tira a proximidade com o conteúdo do plano; aceito porque o
job da tela é triagem (decidir rápido), não edição — e o rodapé a y=863 provou ser invisível.

## Decisão 2 — Fusão dos módulos de atenção

Coluna 1 hoje: Resumo rápido (4 KPIs) + Fila de atenção + Roster do dashboard. Passa a:

- **Resumo rápido** → linha horizontal compacta de 4 stats sob o cabeçalho da página (uma linha,
  sem cards), liberando a coluna.
- **Fila de atenção e Roster** → removidos. A informação (motivo + severidade) migra para o card
  da **Fila de revisão**: `QueueRow` ganha linha secundária "motivo · recência" e variante visual
  por status (`alerta`: borda 1px + fundo `error.main` a ~8%; `atencao`: idem com `warning`).
- A coluna 1 inteira deixa de existir → layout passa de 3 para 2 colunas (fila ~360px + detalhe
  flexível), devolvendo largura ao painel do atleta.

**Tradeoff:** perde-se o "atalho" da fila de atenção separada; aceito **condicionado ao gate de
contrato de dados** — o pre-mortem mostrou que a premissa "mesma fonte" é frágil:
`CoachAttentionQueue` (sinais) e a fila de revisão (sugestões/planos pendentes) podem ser fontes
distintas, e um atleta com sinal ativo e sem sugestão pendente sumiria do inbox.

**Gate duro (task 1.1):** antes de qualquer remoção, provar que todo item da fila de atenção tem
representação na fila de revisão (com motivo + recência) — ou, se o contrato não fechar, mesclar
a fonte de sinais na composição da fila de revisão como parte desta change. Teste de aceite
dedicado: atleta com sinal e sem plano/sugestão pendente permanece visível (critério 4b do
proposal). Risco secundário: deep-links/E2E que referenciam os módulos removidos — mapeados na
mesma task.

## Decisão 3 — Tokens de accent e semântica de cor

No tema (não em `sx`):

- `accent` (lime): permitido somente em `Button variant="contained"` primário e indicador de nav
  ativa. Eyebrow, chips informativos e tabs migram para `text.secondary` / neutros.
- Semântica de estado: `error` (vermelho) = requer ação; `warning` (âmbar) = observar; `success`
  (verde) = ok. Proibido reutilizar essas cores para ornamento. Chips de estado com fonte ≥11px e
  contraste AA sobre o fundo do card.
- Adicionar teste de tema (padrão já existente em `theme.premium.test.ts`) que valide os tokens.

## Decisão 4 — Escala tipográfica via tema

`theme.typography`: display (Syne) apenas em `h1–h4`; Inter em `body*`, `caption`, `overline`,
`button`. Escala alvo: 11 (caption/overline) · 13 (body2) · 16 (body1/valores) · 20 (nome do
atleta, h4) · 24–28 (h3, uso raro). Título da página vira `h6`-equivalente (~16px) com o eyebrow
incorporado ou removido. Remoção mecânica de todos os `fontFamily: 'Syne'` em `sx` no escopo do
coach; nenhum `fontSize` computado <11px (inclui os labels de 7,2px da strip de KPIs, que sobem
para caption 11px ou são fundidos ao valor via tooltip).

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
- O inbox vira **duas telas**: lista (fila de revisão + resumo compacto) e detalhe do atleta
  (rota própria ou estado com `Back`). Sem tentativa de manter colunas lado a lado.
- Tabs do detalhe viram scrolláveis; barra de ação secundária vira menu; CTA primário fixo
  visível no topo do detalhe.
- Critério mecânico: `document.documentElement.scrollWidth === innerWidth` em 390px, verificado
  em teste Playwright com viewport mobile.

**Alternativa rejeitada:** bottom-nav. Drawer é o caminho de menor mudança estrutural no MUI e
não conflita com a barra de ações do detalhe; bottom-nav fica para quando houver métricas de uso
mobile reais.

## Sequência e costura

Fase 1 → 2 → 3, cada uma mergeável de forma independente (PRs separados na mesma branch ou
branches encadeadas, a decidir no `/implement init`). A Fase 3 é a costura natural para virar
change própria se o escopo estourar.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| E2E/screenshot tests quebram com a remoção de módulos | Mapear referências (task 1.1) antes de remover; atualizar E2E na mesma task |
| `resolvePrimaryAction` divergir do estado real do plano | Função pura + testes unitários por estado; reusar os mesmos seletores do painel |
| Remoção de `sx` Syne alterar telas fora do escopo | Grep restrito a `src/features/coach`; snapshot visual das demais telas do coach no QA |
| Drawer mobile esconder o badge de inbox (contador) | Badge replicado no ícone do hambúrguer |
| Tema compartilhado com telas do atleta | Mudanças de `typography` globais validadas com build + smoke nas telas do atleta |
