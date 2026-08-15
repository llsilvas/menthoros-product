# Tasks — refine-inbox-visual-hierarchy

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build`
(+ `npm run test` quando a task toca lógica; E2E onde indicado).

## Fase 1 — Hierarquia de ação e foco

- [ ] 1.1 **GATE — bloqueia 1.4/1.5.** (a) Provar o contrato de dados: todo atleta presente na
      `CoachAttentionQueue` tem representação na fila de revisão? Verificar as fontes reais
      (sinais vs. sugestões/planos pendentes em `/api/v1/coach/sugestoes`) no adapter e no
      backend; se o contrato não fechar, incluir a fonte de sinais na composição da fila de
      revisão nesta change. (b) Mapear grep/testes/deep-links que referenciam
      `DashboardAttentionQueueRow`, `DashboardRosterPreviewRow` e a "Fila de atenção". Saída:
      nota neste arquivo com a prova (ou o ajuste de escopo). Validação: nota revisada +
      cenário "atleta com sinal e sem sugestão pendente" documentado.
- [ ] 1.2 Confirmar com o founder a ação default do atleta saudável (proposta: "Abrir plano"
      neutro) e criar `resolvePrimaryAction` em `coachInboxHelpers.ts` (precedência: plano
      pendente → inatividade → default; estender para "sugestão pendente" → "Revisar sugestão" e
      "prova próxima" → "Ver prova" se o founder aprovar na Q10) com testes unitários cobrindo os
      estados + ausência de dados. Validação: `npm run test -- coachInboxHelpers`.
- [ ] 1.3 Renderizar o CTA contextual no cabeçalho do painel (`PlanoDetalhePanel` /
      `DiagnosisTabPanel`): `contained`, ≥40px, fonte ≥14px; remover o `Aprovar plano` disabled do
      rodapé; secundárias permanecem outline neutro no rodapé. **Guardas operacionais:** estados
      de loading (mutação em voo), plano já processado e ação não autorizada com testes de página
      dedicados. Validação: lint+build + testes de página.
- [ ] 1.3a Co-localizar o par decisório: "Rejeitar plano" sai do menu "Mais ações" e renderiza como
      ação secundária (outline neutro) ao lado do CTA primário; o menu preserva só ações raras
      (marcar prioridade, abrir editor). Aplicar a cor do CTA decidida na Q7 (aprovar → `success`;
      contatar → `accent`). Validação: lint+build + teste de página cobrindo aprovar+rejeitar
      visíveis juntos no estado de plano pendente.
- [ ] 1.3b "Contato assistido": quando o CTA resolve "Contatar atleta", gerar rascunho pré-composto
      (motivo + recência + ação sugerida) e abrir `wa.me/` (ou copiar para a área de transferência
      se não houver telefone — Q8). Sem toast vazio. Validação: `npm run test -- coachInboxHelpers`
      + teste de página do fluxo de contato.
- [ ] 1.4 Enriquecer `QueueRow` com motivo + recência ("Inatividade · 14d") e variante visual por
      status (borda/fundo `error` ~8% para Alerta, `warning` para Atenção); fonte mínima 11px.
      Validação: lint+build + testes do componente.
- [ ] 1.5 (após gate 1.1 fechado) Remover "Fila de atenção" e "Roster do dashboard" da coluna 1;
      converter "Resumo rápido" em linha horizontal compacta sob o cabeçalho; layout passa a 2
      colunas. Atualizar E2E mapeados na 1.1 e adicionar E2E do critério 4b (atleta com sinal e
      sem sugestão pendente permanece visível com motivo/recência). Validação: lint+build + E2E
      do coach verdes.
- [ ] 1.6 Racionar o accent: eyebrow, chips informativos ("No prazo", "Prioridade alta") e tabs
      migram para neutros; título da página reduz para ~16px; nome do atleta vira o maior texto.
      Validação: lint+build; inspeção manual em 1440×900 confirmando accent só em CTA + nav ativa.

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

## Encerramento

- [ ] 4.1 Rodar o teste dos 5 segundos com o founder-coach (identificar atleta em risco + motivo);
      registrar resultado no proposal (métrica de sucesso). Validação: registro feito.
- [ ] 4.2 Atualizar este `tasks.md` (entregue vs. adiado) e preparar PR único ou por fase conforme
      decidido no `/implement init`.
