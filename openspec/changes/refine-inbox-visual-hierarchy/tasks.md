# Tasks — refine-inbox-visual-hierarchy

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build`
(+ `npm run test` quando a task toca lógica; E2E onde indicado).

## Fase 1 — Hierarquia de ação e foco

> **Reescrita do gate em 2026-08-16.** A 1.1 anterior mandava provar um contrato entre endpoints que
> não existe (ver "Correção de premissa" no proposal). O contrato já está provado: `roster` e
> `attentionQueue` vêm da **mesma** resposta (`GET /api/v1/coach/dashboard`). O que não está
> resolvido é **paginação e filtro** — e é isso que o gate passa a cobrar. Aceitar "nota + cenário
> documentado" como saída era fraco demais para um gate: agora a saída é **código com teste**.

- [x] 1.1 **GATE — bloqueia 1.5.** Implementar `buildInboxQueue(roster, attentionQueue, filters)`
      em `features/coach/adapters/coachInboxAdapters.ts` (função pura) com o **contrato fechado no
      `design.md`**: retorna `{ rows, pinnedCount, hiddenAttentionCount }`, e `InboxQueueRow` é união
      `{source:'roster'|'attention-only'}` — `CoachAttentionItem` não tem as métricas que a linha de
      roster renderiza, então tratá-los como o mesmo tipo produz linha com dados falsos. Seleção
      passa a ser por `atletaId`. Testes unitários: (a) fixado aparece no topo de **todas** as
      páginas, inclusive quando o atleta não está em `roster.items` — caso explícito com 2 páginas;
      (b) atleta nas duas fontes aparece **uma vez** (`source:'roster'` com `attention` preenchido);
      (c) item de atenção fora do filtro **não** entra em `rows` e conta em `hiddenAttentionCount`;
      (d) ordem = severidade/priorityScore, depois roster na ordem do backend; (e) `TablePagination`
      `count` **não** soma `pinnedCount` (senão "1 de N páginas" mente); (f) `recencyDays` vem de
      `lastActivity` para inatividade e de `generatedAt` nos demais, com clock fixo.
      **Alternativas aceitáveis:** manter o preview da Fila de atenção, ou filtro "só atenção" com
      contador — desde que (a) fique coberto. Validação: `npm run test -- coachInboxAdapters`.
- [x] 1.1b Mapear **nominalmente** os testes que a remoção afeta, antes de remover. Já identificados:
      `CoachInboxPage.test.tsx:190` (espera o texto "Fila de atenção") e `:270` (abre rejeição pelo
      menu "Mais ações" — quebra com a 1.3a). Verificar também deep-links para
      `DashboardAttentionQueueRow` / `DashboardRosterPreviewRow`. **Atenção ao falso verde:**
      `useCoachDashboard.test.ts` e `coachInboxAdapters.test.ts` continuam passando com o inbox
      regredido, e os E2E de coach mockam `**/api/v1/coach/**` como `[]`
      (`assessoria-settings.spec.ts:49`, `welcome-wizard.spec.ts:74`) — nenhum deles enxerga a perda.
      Saída: lista nominal neste arquivo. Validação: lista revisada.
- [x] 1.1c Criar `tests/e2e/coach/inbox.spec.ts` **antes** da remoção (task 1.5), com dashboard
      mockado de verdade (não `[]`). Matriz mínima — um cenário só não cobre o risco:
      (1) atleta em `attentionQueue` fora da página 1 continua alcançável com motivo e recência;
      (2) atleta em atenção fora do **filtro** ativo aparece no contador "N fora do filtro";
      (3) atleta nas duas fontes não duplica; (4) navegar para a página 2 mantém o fixado e **não**
      altera o total de páginas; (5) clicar numa linha `attention-only` abre o detalhe do atleta
      certo. Validação: E2E verde antes e depois da 1.5.
- [ ] 1.2 (bloqueada pela decisão do founder — **não bloqueia 1.1/1.4/1.6/1.7**) Confirmar a ação
      default do atleta saudável (proposta: "Abrir plano" neutro, sem accent, que **não conta como
      CTA primário**) e criar `resolvePrimaryAction` em `coachInboxHelpers.ts` (precedência: plano
      pendente → inatividade → default; estender para "sugestão pendente" → "Revisar sugestão" e
      "prova próxima" → "Ver prova" se o founder aprovar na Q10) com testes unitários cobrindo os
      estados + ausência de dados. Validação: `npm run test -- coachInboxHelpers`.
- [ ] 1.3 Renderizar o CTA contextual no cabeçalho do painel **em `CoachInboxPage.tsx`** (o CTA vive
      na linha 662 da própria página — `PlanoDetalhePanel`/`DiagnosisTabPanel` pertencem ao fluxo
      `/coach/planos/revisao` e estão **fora** desta change): `contained`, ≥40px, fonte ≥14px; remover
      o `Aprovar plano` disabled do rodapé (linha 691); secundárias permanecem outline neutro.
      **Guardas operacionais** via `resolveActionAvailability` separada do seletor de ação — o inbox
      hoje nem consome o `isActing` do `CoachLayout.tsx:35`, e `usePlanReview.ts:23` não tem trava
      contra duplo clique. Testes de página obrigatórios: mutação em voo, **duplo clique = uma
      chamada**, plano já processado (409/422), sem permissão (403). Validação: lint+build + testes.
- [ ] 1.3a Co-localizar o par decisório: "Rejeitar plano" sai do menu "Mais ações" e renderiza como
      ação secundária (outline neutro) ao lado do CTA primário; o menu preserva só ações raras
      (marcar prioridade, abrir editor). Cor do CTA (Q7 resolvida, padrão Premium): ação primária →
      `PRIMARY_BTN_SX` (lime), sempre — verde (`SUCCESS_BTN_SX`) é só confirmação de estado.
      Validação: lint+build + teste de página cobrindo aprovar+rejeitar visíveis juntos no estado de
      plano pendente.
- [ ] 1.3b "Contato assistido" (Q8 resolvida): quando o CTA resolve "Contatar atleta", gerar
      rascunho pré-composto (motivo + recência + ação sugerida) e copiar para a área de
      transferência (sem `wa.me/` — o `Atleta` não tem telefone no DTO). Sem toast vazio.
      **Fallback obrigatório:** `navigator.clipboard.writeText` rejeitado → dialog com o rascunho
      selecionável e erro visível; sem isso o botão só troca um stub por outro. Validação:
      `npm run test -- coachInboxHelpers` + teste de página do fluxo, **incluindo clipboard rejeitado**.
- [x] 1.4 Enriquecer `QueueRow` com motivo + recência ("Inatividade · 14d") e variante visual por
      status (borda/fundo `error` ~8% para Alerta, `warning` para Atenção); fonte mínima 11px.
      Validação: lint+build + testes do componente.
- [ ] 1.5 (após 1.1, 1.1b e 1.1c fechadas) Remover os previews "Fila de atenção" e "Roster do
      dashboard" da coluna 1;
      converter "Resumo rápido" em linha horizontal compacta sob o cabeçalho; layout passa a 2
      colunas. Atualizar E2E mapeados na 1.1 e adicionar E2E do critério 4b (atleta com sinal e
      sem sugestão pendente permanece visível com motivo/recência). Validação: lint+build + E2E
      do coach verdes.
- [x] 1.6 Racionar o accent: eyebrow, chips informativos ("No prazo", "Prioridade alta") e tabs
      migram para neutros; título da página reduz para ~16px; nome do atleta vira o maior texto.
      Validação: lint+build; inspeção manual em 1440×900 confirmando accent só em CTA + nav ativa.
- [x] 1.7 Elevar o insight da IA ao topo do painel de detalhe (UX-002): reordenar `DiagnosisTabPanel`
      para que "Sinais de atenção" (motivo + ações sugeridas) venha antes das métricas/charts — o
      coach decide pelo "porquê", não pelo número cru; métricas viram evidência do insight.
      Validação: lint+build + snapshot do painel confirmando a ordem.

### Nota da task 1.1b — mapa nominal (preenchido em 2026-08-16, PR do gate)

**Referenciam os módulos que a task 1.5 vai remover:**

| Arquivo | O que referencia | Ação na 1.5 |
|---|---|---|
| `CoachInboxPage.tsx:375` | `dashboardAttentionQueue.slice(0,3)` + `DashboardAttentionQueueRow` | remover o bloco |
| `CoachInboxPage.tsx:387` | `dashboardRoster.slice(0,3)` + `DashboardRosterPreviewRow` | remover o bloco |
| `CoachInboxPage.test.tsx:190` | `it('mostra a fila de atenção do dashboard no resumo')` | **quebra** — reescrever para a lista composta |
| `CoachInboxPage.test.tsx:270` | abre rejeição pelo menu "Mais ações" | **quebra na 1.3a**, não na 1.5 |
| `DashboardAttentionQueueRow.tsx`, `DashboardRosterPreviewRow.tsx` | componentes | apagar se ninguém mais usar |

Nenhum deep-link depende dos módulos: eles não têm rota nem âncora própria.

**Os que ficam VERDES com o inbox regredido** — o motivo de a 1.1c existir:
`useCoachDashboard.test.ts` (só popula payload), `coachInboxAdapters.test.ts` (só métricas, antes
deste PR), `CoachLayout.test.tsx`, e todos os E2E de coach existentes, que mockam a rota coringa
`coach/**` como lista vazia e portanto **nunca renderizam a lista**.

### Achados do PR do gate (2026-08-16)

- **Bug real encontrado pelo E2E, não previsto na spec:** o efeito de seleção
  (`CoachInboxPage.tsx`) comparava `selectedId` apenas com `rosterItems` e revertia para o primeiro
  do roster quando o id não estava lá. Com o atleta fixado pela fila de atenção, o coach clicava
  nele e abria o detalhe **de outro atleta**, no mesmo clique. Corrigido: a seleção acompanha a
  lista composta. Isso valida a exigência do pre-mortem ("alterar seleção/fetch por `atletaId`") —
  era defeito concreto, não hipótese.
- `AttentionOnlyRow` renderiza deliberadamente **menos** que `QueueRow` (sem métricas), e diz por
  quê na própria linha. O DTO da fila de atenção não traz aderência/volume/forma; preencher com zero
  exibiria ausência de dado como medição.
- O `Select` de status **não tem label associado** (o texto "Status" é um `Typography` solto), o que
  forçou o E2E a buscar por `combobox`. Corrigir é escopo da fase 2 (a11y), registrado aqui.
- `TablePagination` não é localizado: o rótulo sai em inglês ("1–10 of 15"). Fora do escopo deste PR.

## Fase 2 — Design system e estados

- [ ] 2.1 Consolidar `theme.typography`: Syne apenas em headings; Inter em body/caption/button;
      escala 11/13/16/20/28; teste de tema no padrão de `theme.premium.test.ts`. **Escopo (Q9):**
      aplicar via override do coach (não global) ou cobrir o impacto nas telas do atleta com smoke
      explícito, conforme decidido. Validação: `npm run test -- theme`.
- [ ] 2.2 Remover todo `fontFamily: 'Syne'` hardcoded em `src/features/coach/**` (usar variantes do
      tema). Validação: `grep -rn "fontFamily.*Syne" src/features/coach` vazio + lint+build.
- [ ] 2.3 Elevar todo texto funcional do inbox para ≥11px (labels da strip de KPIs, badges,
      captions); onde não couber, fundir label ao valor ou usar tooltip. Validação: lint+build +
      verificação de `font-size` computado na tela.
- [ ] 2.4 Fixar semântica de cor (error=agir, warning=observar, success=ok) nos chips e badges do
      coach; remover usos ornamentais dessas cores; garantir contraste AA dos cinzas sobre o fundo.
      **Diferenciação não-cor:** estado de risco não pode depender só de cor — parear com ícone/forma
      ou manter o label textual ("Alerta"/"Atenção") sempre visível, para daltônicos. Validação:
      lint+build + teste de tokens.
- [ ] 2.5 Estados vazios: criar/reusar `EmptyMetricState`; adapter (`coachInboxAdapters`) expõe flag
      "sem dados na janela" vs "zero legítimo"; grade de métricas zeradas vira mensagem única.
      Testes do adapter cobrindo os dois casos. Validação: `npm run test -- coachInboxAdapters` +
      lint+build.
- [ ] 2.6 Estados de lista vazia, carregamento e erro nas colunas do inbox (fila e painel).
      Validação: lint+build + testes de página.
- [ ] 2.7 `AIInsightCard` (UX-003): componente com 4 seções fixas — Ocorrência / Por que importa /
      Evidência / Ação sugerida — consumindo `rationale`, `sourceRules` e `suggestedAction` do DTO da
      fila de atenção (já existem, só não são renderizados estruturados). Validação: lint+build +
      teste do componente.
- [ ] 2.8 Remover/derivar faixas "ideal" hardcoded (UX-005): "Ideal: 110-150 km" (carga aguda) e
      "Ideal: < 2.0" (monotonia) em `DiagnosisTabPanel` são fixos e não-específicos ao atleta.
      Derivar do baseline do atleta (`AthleteBaselineState`/nível de experiência) ou remover o
      "ideal" até haver referência real. Validação: lint+build + teste do adapter.
- [ ] 2.9 Guard-rail de papel de botão: ação nunca usa cor semântica inline — só via `PRIMARY_BTN_SX`/
      `SUCCESS_BTN_SX`/`DANGER_BTN_SX`/`GHOST_BTN_SX` (`shared/components/actionButtonSx.ts`). Regra:
      `semantic.*` = estado (chip/badge/dot); `_BTN_SX` = ação. Migrar o drift conhecido
      (`ConfirmDialog.tsx` reimplementa PRIMARY/DANGER inline com hover divergente `primary[600]` vs
      `primary[400]`). Validação: `grep -rn "bgcolor: semantic\." src` não casa com `Button`/
      `variant="contained"`; lint+build.

## Fase 3 — Breakpoint mobile

- [ ] 3.1 Sidebar colapsável: `Drawer` temporário abaixo de `md` com hambúrguer no header; badge do
      inbox replicado no ícone; largura fixa de 240px eliminada em <900px. Validação: lint+build.
- [ ] 3.1a Alinhar breakpoints: o grid do inbox colapsa em `lg` (1200px) mas o drawer em `md` (900px);
      decidir se o empilhamento do grid desce para `md` (ou o drawer sobe para `lg`) para não deixar
      a faixa 900–1200px subprojetada. Validação: inspeção em ~1000px.
- [ ] 3.2 Inbox em fluxo empilhado <md: tela de lista (resumo compacto + fila) e tela de detalhe
      com navegação de volta; tabs scrolláveis; ações secundárias em menu; CTA primário visível
      sem scroll no topo do detalhe. Validação: lint+build + testes de página.
- [ ] 3.3 Teste Playwright viewport 390×844: sem scroll horizontal
      (`scrollWidth === innerWidth` no documento e nos painéis), drawer funcional, seleção de
      atleta abre detalhe com CTA visível. Validação: E2E verde.
- [ ] 3.4 Smoke visual das demais telas do coach (Atletas, Insights, Revisão de planos) em 390px —
      herdam o drawer; corrigir estouros óbvios introduzidos pela mudança de layout base (sem
      redesenho). Validação: inspeção manual + E2E existentes.

- [ ] 3.5 Teste mecânico de hierarquia (Playwright, no lugar de parte da inspeção manual): em
      1440×900 e 390×844, medir via `getComputedStyle` que (a) existe **um** botão primário sólido no
      painel quando há plano pendente, com altura ≥40px e fonte ≥14px; (b) nenhum texto funcional do
      inbox tem `font-size` < 11px; (c) o card de alerta exibe motivo e recência;
      (d) `document.documentElement.scrollWidth === innerWidth`. **Viewports: 1440×900, 1024×768 e
      390×844** — a faixa 900–1200px é a que a própria spec identifica como subprojetada, e medir só
      nos extremos a deixaria passar verde. Para (b), marcar o root do inbox com `data-testid` e
      percorrer os nós de texto visíveis — verificar só alguns nós deixa fonte <11px escondida em
      `Chip`/`Tab`. Sem isso, regressão de hierarquia passa com `npm run test` verde.
      Validação: E2E verde.

## Attention Management (UX-012) — costura candidata a change própria

> ⚠️ **Não implementar nesta change.** A fila hoje é uma lista flat ordenável; o alvo é um
> "Attention Management System" com seções **Needs Attention / On Track / Upcoming** (ou header
> "🔴 N precisam de ação") e sort default = prioridade. Registrar aqui como rastro do audit;
> promover para change própria (`add-coach-inbox-attention-sections`) exige gate do founder.

## Encerramento

- [ ] 4.1 Rodar o teste dos 5 segundos com o founder-coach (identificar atleta em risco + motivo);
      registrar resultado no proposal (métrica de sucesso). Validação: registro feito.
- [ ] 4.2 Atualizar este `tasks.md` (entregue vs. adiado) e preparar PR único ou por fase conforme
      decidido no `/implement init`.
