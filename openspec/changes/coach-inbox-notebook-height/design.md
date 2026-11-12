# Design — coach-inbox-notebook-height

## Contexto

`CoachInboxPage.tsx` é uma coluna flex com `height: 100%` e `overflow: hidden`. De cima para baixo, em
`develop` (2026-11-12):

- barra única `inbox-barra` (≤ 56px): título, resumo em linha (`inbox-resumo`, um `Typography` por
  segmento de `buildInboxSummaryLine`, em `adapters/inboxSummaryKpis.ts`) e legenda dos atalhos
  (só a partir de `lg`);
- `Alert` de erro do dashboard e `LinearProgress`, condicionais;
- grade lista/detalhe. No detalhe: cabeçalho do atleta (nome, `AthleteNextRace`, CTA, "Rejeitar",
  "Ajustar plano"), `AthleteKpiStrip` (sempre `dense`, ≤ 40px), aviso `inbox-kpi-aviso` quando falta
  dado, abas e a área rolável `inbox-detalhe-conteudo` (`flex: 1; overflow: auto`). Não há mais barra
  de ações no rodapé.

Tudo que não é a área rolável tem altura fixa. Logo, a área rolável é a altura da janela menos a soma
dessas faixas, e cada pixel tirado de uma faixa vira pixel de conteúdo.

A versão de 2026-11-05 deste design propunha D2 a D5 sobre um layout que tinha cabeçalho de 57px,
faixa de KPIs globais de 85px, KPIs do atleta de 91px e rodapé de 46px. As changes
`inbox-barra-unica-sem-rodape`, `inbox-kpis-atleta-sem-dado` e `inbox-lista-triagem` (arquivadas em
2026-11-07) resolveram isso, em geral em todas as alturas e não só em `TELA_BAIXA`. As seções abaixo
registram o que cada decisão virou.

## D1 — Faixas por altura, em CSS

`TELA_BAIXA = '@media (max-height: 800px)'` existe em `src/features/coach/theme/mediaQueries.ts`.

`TELA_MUITO_BAIXA = '@media (max-height: 600px)'` **só é criada se a task 0.2 mostrar necessidade**
(ver D2). Se for, fica no mesmo arquivo, com o comentário do porquê.

As faixas ficam em media query no `sx`, e não em `useMediaQuery`. Assim não há re-render ao
redimensionar, nem um primeiro render no layout errado. Se CA8 exigir `Tooltip` só quando a legenda
estiver oculta, a legenda hoje é oculta em todas as alturas (o `AthleteKpiStrip` é sempre `dense`),
então não há condição de altura a consultar e o `useMediaQuery` não é necessário.

Precedente de `useMediaQuery` por altura no código, para referência: `TreinoEditDialog.tsx` usa
`'(max-height: 700px)'` (constante local `TELA_BAIXA_QUERY`), um valor diferente de `TELA_BAIXA`. Não
é "a mesma string", como dizia a versão anterior deste design.

A largura não entra. Os breakpoints de largura do MUI seguem como estão.

## D2 — Barra do topo: entregue; `TELA_MUITO_BAIXA` condicional

**Entregue por `inbox-barra-unica-sem-rodape`**, em todas as alturas e de outra forma que a proposta
original: a faixa de KPIs globais saiu e virou um resumo em linha na barra. O `KpiStrip` não é usado
no topo. A prop `dense` existe, mas no `KpiStrip`/`KpiCell` do atleta (D3), não aqui.

O que sobra é `TELA_MUITO_BAIXA`. A proposta original escondia três dos quatro KPIs de uma faixa de
85px. Hoje os segmentos são inline numa barra de uma linha, e escondê-los só devolve altura se a barra
estiver quebrando em duas linhas. Em 1093×500 a sidebar nasce recolhida e `inbox-resumo-treinos` e
`inbox-atalhos` já somem abaixo de `lg`, então a expectativa é que a barra já seja uma linha.

Regra: a task 0.2 mede a altura de `inbox-barra` em 1093×500 e a fração do detalhe. Se a barra tiver
uma linha e a fração for ≥ 45%, `TELA_MUITO_BAIXA` não é criada e a task 2.1 é cancelada com a
medição registrada. Se não, `TELA_MUITO_BAIXA` aplica `display: none` aos spans
`inbox-resumo-ativos` e `inbox-resumo-treinos` (no `sx` do `Typography` de segmento, junto da regra
de `lg` que já existe para `treinos`). "Em atenção" fica (Q3). A árvore continua uma só.

## D3 — KPIs do atleta compactos: entregue; foco por teclado pendente

**Entregue por `inbox-kpis-atleta-sem-dado`**, em todas as alturas: `AthleteKpiStrip` renderiza
`KpiStrip` com `dense`; `KpiCell` com `dense` põe rótulo e valor numa linha, a legenda no `title`
nativo e num texto visualmente oculto (padrão `visuallyHidden`). A faixa tem ≤ 40px (medido pelo e2e).

**Decisão pendente (CA8):** o `title` nativo não abre no foco por teclado, e o tile não é focável. A
versão anterior pedia `Tooltip` no hover e no foco, com `tabIndex={0}`. Se a decisão for manter esse
requisito, a mudança é no `KpiCell` (o `AthleteKpiStrip` não muda): trocar o `title` por `Tooltip` do
MUI e `tabIndex={0}` quando `dense && kpi.detail`. Se não, o requisito sai da spec.

## D4 — Rodapé sai, "Ajustar plano" sobe para o cabeçalho: entregue

**Entregue por `inbox-barra-unica-sem-rodape`**: sem barra de ações no rodapé, "Ajustar plano" visível
no cabeçalho do atleta, ações simuladas removidas (Q2, decidida pelo dono do produto em 2026-11-07) e
sem menu "Mais ações". O raciocínio original continua valendo: aprovar, rejeitar e ajustar ficam os
três visíveis, para o "Aprovar" não enviesar a decisão.

O teste de 1093×500 confere que os três botões cabem inteiros com nome longo. O que falta é clicar
neles em notebook (D6, CA9).

## D5 — Lista densa e paginação: entregue

**Entregue por `inbox-lista-triagem`**, em todas as alturas: linha de ≤ 52px, paginação só com
`rosterPageCount > 1` e `labelDisplayedRows` em PT-BR. O e2e cobra ≥ 6 linhas inteiras em 1366×625 e
a ausência do rodapé com uma página só.

## D6 — Testes com viewport real

No `inbox.spec.ts`:

- **O laço antigo fica** (1366×768, 1280×720, 1024×640). Ele cobre o comportamento por largura —
  sidebar recolhida abaixo de 1200px, lado a lado, sem rolagem horizontal — e esse comportamento não
  depende da altura.
- **Laço novo, complementar**, em 1366×625, 1280×600 e 1093×500: lado a lado, CTA visível, sem
  rolagem horizontal e a fração `boundingBox(inbox-detalhe-conteudo).height / innerHeight`. Gate 0,55
  em 1366×625 e 1280×600, 0,45 em 1093×500. 1366×625 já tem ≥ 0,62 noutro teste; o laço repete o
  gate mais baixo por simplicidade.
- **Teste de 1093×500 existente:** o limiar sobe de 0,40 para 0,45 (CA2). O caso de nome longo e três
  ações inteiras já existe e não é duplicado.
- **Caminho de decisão** em 1366×625 e 1093×500: aprovar pelo CTA e rejeitar com motivo, com o mock de
  plano aguardando revisão no padrão do teste de 1093×500 e de `plan-review-edicao.spec.ts` (CA9).
- **`Alert` de erro** em 1366×625: dashboard com falha, `Alert` em uma linha e fração ≥ 0,55 (CA10).
- **Pior caso de A1**, 1366×595 (barra de favoritos): mesma fração, com `expect.soft`. Serve de
  alerta e não bloqueia.

A fração é medida depois de `networkidle` e com o atleta já carregado. Medir durante o
`LinearProgress` daria a altura errada.

O teste de 1440×900 continua como está e cobre o desktop. O
`tests/e2e/coach/notebook-viewport.spec.ts` (1024×640) cobre Atletas, Revisão de planos e Calendário,
não o inbox, e não muda.

Diferente da versão anterior, os testes novos **podem passar contra o código atual**: a maior parte
do layout já foi entregue. O que deve falhar antes da mudança é só o caso do `Alert` de erro (CA10),
se o `Alert` padrão quebrar o gate. A task 0.2 registra o estado antes.

## D7 — Plano B: cabeçalho do atleta rola com o conteúdo (follow-up, fora desta change)

Registrado para não se perder. Não é implementado aqui. Vira change própria se a área do detalhe em
1093×500 ficar abaixo da meta de 50%.

Abaixo de 600px de altura, o cabeçalho do atleta e o `AthleteKpiStrip` entram na área rolável. As
abas ficam `position: sticky; top: 0`, e o CTA passa a ser renderizado também na linha das abas, para
a decisão continuar a um clique.

Fica como plano B porque muda a estrutura do detalhe e põe o CTA em dois lugares. Se for acionado,
precisa de revisão de produto.

## Riscos e mitigações

O pre-mortem com Codex não rodou (limite de uso). Os riscos marcados *(pre-mortem Claude)* vêm de uma
passada própria.

- **Faixas condicionais acima da grade comem a altura conquistada** *(pre-mortem Claude)*. O `Alert`
  de erro do dashboard e o `LinearProgress` entram entre a barra e a grade. Os avisos "O plano mudou
  em outra sessão" e "Você não tem permissão" entram no detalhe. O e2e mede o estado limpo.
  Mitigação: o `Alert` de erro em `TELA_BAIXA` fica numa linha, com padding compacto; o e2e ganha o
  caso CA10.
- **Zoom intermediário cai em faixa inesperada** *(pre-mortem Claude)*. 1366 com zoom de 110% dá
  ~1242×568. Se `TELA_MUITO_BAIXA` for criada, essa janela já cai nela. Não há faixa morta, porque as
  faixas são aninhadas. Mitigação: testar 1093×500, o pior caso.
- **Estimativa de 1093×500 otimista.** A fração estimada (≥ 47%) é conta, não medição. Mitigação: a
  task 0.2 mede antes de qualquer código; o e2e protege o resultado.
- **Barra quebra entre 1200 e 1366px**, com a sidebar aberta. Mitigação: viewport 1280×600 no laço
  novo, sem recolher a sidebar (acima de `lg` ela segue a preferência do treinador).
- **Aprovar sem editar.** Mitigação já entregue: aprovar, rejeitar e ajustar visíveis no cabeçalho
  (D4).
- **Conflito com outra change no mesmo arquivo.** `CoachInboxPage.tsx` tem 1048 linhas e muda com
  frequência; `refine-inbox-mobile-breakpoint` também mexe nele e no `inbox.spec.ts`. Mitigação: esta
  change entra primeiro, com commits pequenos por seção.

## Rollback

Só front, sem dados nem contrato. Reverter o PR volta o layout anterior.
