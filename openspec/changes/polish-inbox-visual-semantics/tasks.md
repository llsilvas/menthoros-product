# Tasks — polish-inbox-visual-semantics

Repo: `apps/menthoros-front`. Validação padrão: `npm run lint && npm run build`
(+ `npm run test` quando a task toca lógica).

- [ ] 1.1 Migrar os secundários do rodapé do painel (Enviar mensagem / Ajustar plano / Mais ações)
      de lime outline para outline neutro; migrar o estado selecionado do toggle do PMC
      (Simples/Avançado + período) de lime sólido para neutro. Validação: lint+build + inspeção
      confirmando accent só em CTA primário e nav ativa.
- [ ] 1.2 Unificar a semântica do status: badge "Alerta" na paleta `error` (vermelho) em fila,
      cabeçalho do painel e sinais de atenção; "Atenção" permanece `warning`. Atualizar testes de
      componente que assertem cor/variante. Validação: `npm run test` + lint+build.
- [ ] 1.3 Strip de KPIs do cabeçalho: aplicar a flag "sem dados na janela" (adapter) — KPI sem dado
      renderiza valor neutro ("—" ou mensagem curta) sem ícone/cor de estado positivo; zero
      legítimo continua numérico. Derivar flag no adapter para KPIs que não a tenham (sem mudança
      de API), com testes do adapter cobrindo zero legítimo vs. ausência. Validação:
      `npm run test -- coachInboxAdapters` + lint+build.
- [ ] 1.4 Adicionar `errorElement` às rotas do router: componente de erro no tema (mensagem PT-BR +
      botão "Voltar ao inbox"), cobrindo rota inexistente e erro de render; teste de página para a
      rota 404. Validação: `npm run test` + lint+build + navegação manual em
      `/#/coach/rota-que-nao-existe`.
- [ ] 1.5 Encerramento: atualizar este `tasks.md` (entregue vs. adiado) e abrir o PR.
