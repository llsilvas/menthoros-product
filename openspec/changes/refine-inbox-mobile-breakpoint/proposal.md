**Tamanho:** M · **Trilha:** Full

## Why

A auditoria de hierarquia visual do Coach Inbox (2026-08-11) mediu **desktop 5,5/10 e mobile 1/10**.
Em 390px a tela é inutilizável: a sidebar mantém 240px fixos (64% do viewport), o conteúdo espreme
em ~135px, o título trunca e as colunas viram faixas com scroll interno.

Esta change nasceu como **Fase 3 de `refine-inbox-visual-hierarchy`** e foi destacada em 2026-08-16,
por decisão do founder: **o coach não vai usar o inbox à beira de pista por enquanto**. A premissa
"coach usa mobile em campo" era a única justificativa para priorizar mobile junto das Fases 1 e 2 —
caiu por decisão de uso, não por falta de dado.

O trabalho continua válido e o diagnóstico não mudou; muda o **momento**. Enquanto isto não rodar, o
inbox segue inutilizável em telefone e a faixa 900–1200px continua subprojetada.

## What Changes

Somente `apps/menthoros-front`. Escopo idêntico ao da Fase 3 original:

- Sidebar colapsa em `Drawer` temporário (hambúrguer) abaixo de `md`; a largura fixa de 240px
  (`CoachSidebar.tsx:75`, `SIDEBAR_EXPANDED`) deixa de existir em viewport < 900px. Badge do inbox
  replicado no ícone.
- As colunas viram fluxo de navegação empilhado: lista → detalhe do atleta, com volta explícita.
  Sem scroll horizontal em 390px.
- CTA contextual visível sem scroll no detalhe em 390×844.
- Alinhar breakpoints: hoje o grid do inbox colapsa em `lg` (1200px) e o drawer usaria `md` (900px),
  deixando a faixa 900–1200px com sidebar expandida **e** grid já empilhado.
- Smoke das demais telas do coach em 390px (Atletas, Insights, Revisão de planos) — elas herdam o
  drawer.

## Non-Goals

- Não muda contrato de API nem backend.
- Não redesenha o conteúdo do inbox: hierarquia, tipografia, estados e CTA foram entregues nas Fases
  1 e 2 da change de origem.
- Não implementa bottom-nav (alternativa rejeitada no design original: drawer é a menor mudança
  estrutural no MUI e não conflita com a barra de ações do detalhe).

## Critérios de aceite

1. **Sem scroll horizontal** — Given viewport 390×844, When o inbox carrega,
   Then `document.documentElement.scrollWidth === innerWidth`, e nenhum painel interno rola na
   horizontal.
2. **Sidebar colapsada** — Given viewport < 900px, When a tela renderiza, Then a navegação está num
   drawer acionado por hambúrguer, e o badge de inbox continua visível no ícone.
3. **Fluxo empilhado** — Given 390px, When um atleta é selecionado, Then o detalhe abre em tela
   própria com navegação de volta, e o CTA primário está visível sem scroll.
4. **Faixa intermediária** — Given viewport ~1000px, When a tela renderiza, Then não há sidebar
   expandida de 240px somada a grid empilhado.
5. **Regressão** — `npm run lint && npm run build && npm run test:run` passam; E2E do coach verdes,
   incluindo `tests/e2e/coach/inbox.spec.ts`, que já cobre desktop.

## Métrica de sucesso

- Proxy mecânico: E2E em 390×844 e ~1000px verdes, com as asserções dos critérios 1–4.
- O teste dos 5 segundos (métrica da change de origem) **não se aplica aqui** — mobile não é o
  contexto de triagem declarado hoje.

## Open Questions & Assumptions

- **Premissa que caiu:** "o coach usa mobile à beira de pista". Reavaliar antes de priorizar; o
  gatilho natural é uso real de mobile no piloto, não opinião.
- **Premissa:** o breakpoint `md` (900px) do MUI é o corte adequado — a decidir junto com o
  alinhamento do grid (que hoje colapsa em `lg`).
