# Tasks — coach-inbox-notebook-height

Repo: `apps/menthoros-front`. Validação padrão de cada bloco: `npm run lint && npm run build && npm run test:run`.

Rebaseline de 2026-11-12: tasks marcadas como entregues por changes arquivadas em 2026-11-07 trazem a
change de origem. As notas de handoff dessas changes pediam marcar "3.1–3.3b"; a 3.3 e a 3.3b **não**
foram entregues (`inbox-barra-unica-sem-rodape` deixou o `Alert` de erro "sem mudança" e
`TELA_MUITO_BAIXA` para esta change), e continuam abertas abaixo.

## 0. Validação antes de implementar

- [ ] 0.1 **Bloqueante.** Confirmar com quem reportou: o sintoma é tela apertada (Q1), não erro ou
      tela em branco. Registrar SO, escala do sistema, navegador, zoom e barra de favoritos (A1).
- [x] 0.1b Confirmar Q2 com o dono do produto. Decidido em 2026-11-07: tirar da tela as ações
      simuladas (registrado em `inbox-barra-unica-sem-rodape`).
- [ ] 0.1c Reexecutar o pre-mortem com Codex (não rodou na criação da change) e incorporar os achados
      ao design.
- [ ] 0.1d Decidir CA8 com o dono do produto: a legenda dos KPIs do atleta precisa abrir também no
      foco por teclado? Sim → task 4.1b. Não → remover CA8 do proposal e o requisito "Legenda dos
      KPIs do atleta continua acessível no modo compacto" da spec, deixando só o leitor de tela.
- [ ] 0.2 Baseline em `develop`: screenshots do inbox com atleta selecionado em 1366×625, 1280×600 e
      1093×500, anexados ao PR. Registrar aqui a altura de `inbox-barra` e a fração de
      `inbox-detalhe-conteudo` nos três viewports. Essa medição decide a task 2.1 (design, D2).

## 1. Testes

- [x] 1.1 `data-testid="inbox-detalhe-conteudo"` na área rolável do detalhe e
      `data-testid="inbox-lista"` no contêiner da lista. Entregue por `inbox-barra-unica-sem-rodape`
      e `inbox-lista-triagem`.
- [ ] 1.2 `tests/e2e/coach/inbox.spec.ts`: **laço novo, complementar** ao laço antigo (1366×768,
      1280×720, 1024×640, que fica porque cobre o comportamento por largura). O novo usa 1366×625,
      1280×600 e 1093×500, com as asserções de D6: lado a lado, CTA visível, sem rolagem horizontal e
      fração do detalhe (≥ 0,55 em 1366×625 e 1280×600; ≥ 0,45 em 1093×500). 1366×595 em
      `expect.soft`. 1093×500 **já tem teste** (nome longo, três ações inteiras): nele, só subir o
      limiar de 0,40 para 0,45 (CA2), sem duplicar o caso.
- [ ] 1.2b E2E do caminho de decisão em 1366×625 e 1093×500: aprovar pelo CTA, e rejeitar com motivo
      (CA9). Mock de plano aguardando revisão no padrão do teste de 1093×500 existente e de
      `plan-review-edicao.spec.ts`.
- [ ] 1.2c E2E do `Alert` de erro do dashboard em 1366×625: uma linha e fração ≥ 0,55 (CA10). Deve
      falhar antes da task 3.3b se o `Alert` padrão quebrar o gate; registrar o resultado.
- [ ] 1.3 Validação: `npm run test:e2e -- tests/e2e/coach/inbox.spec.ts`.

## 2. Faixa de altura

- [ ] 2.1 **Condicional à task 0.2.** Se em 1093×500 a barra tiver duas linhas ou o detalhe ficar
      abaixo de 45%: `TELA_MUITO_BAIXA` em `src/features/coach/theme/mediaQueries.ts`, com o
      comentário do porquê, aplicada aos spans `inbox-resumo-ativos` e `inbox-resumo-treinos` no
      `CoachInboxPage` (design, D2). Decidir junto se `inbox-resumo-atualizado` fica (Q3). Se a
      condição não ocorrer, cancelar esta task com a medição registrada.
- [ ] 2.2 Validação: lint e build.

## 3. Barra do topo

- [x] 3.1 ~~`KpiStrip`: prop `dense`~~. Superada: a barra do topo não usa `KpiStrip` (entregue como
      resumo em linha por `inbox-barra-unica-sem-rodape`), e `dense` já existe no `KpiStrip`/`KpiCell`,
      entregue por `inbox-kpis-atleta-sem-dado`.
- [x] 3.2 Cabeçalho e KPIs na mesma linha, horário de atualização à direita. Entregue por
      `inbox-barra-unica-sem-rodape`, em todas as alturas.
- [ ] 3.3 Ver task 2.1 (só "em atenção" visível abaixo de 600px, condicional).
- [ ] 3.3b `Alert` de erro do dashboard compacto em `TELA_BAIXA`, numa linha só (CA10).
- [ ] 3.4 Validação: lint, build, test:run.

## 4. Detalhe do atleta

- [x] 4.1 `AthleteKpiStrip` compacto, legenda visualmente oculta e no `title`. Entregue por
      `inbox-kpis-atleta-sem-dado`, em todas as alturas (sem `Tooltip` nem `tabIndex`; ver 4.1b).
- [ ] 4.1b **Só se 0.1d decidir que sim.** `KpiCell` com `dense && kpi.detail`: trocar o `title`
      nativo por `Tooltip` e pôr `tabIndex={0}` (design, D3, CA8). Teste de componente: foco abre a
      legenda.
- [x] 4.2 Remover a barra de ações do rodapé, as ações simuladas e o menu; "Ajustar plano" visível no
      cabeçalho do atleta (CA5). Entregue por `inbox-barra-unica-sem-rodape`.
- [ ] 4.3 Validação: lint, build, test:run (se 4.1b entrar).

## 5. Lista

- [x] 5.1 Linha da lista compacta (≤ 52px). Entregue por `inbox-lista-triagem`, em todas as alturas.
- [x] 5.2 `TablePagination` só com mais de uma página e `labelDisplayedRows` em PT-BR (CA6). Entregue
      por `inbox-lista-triagem`.

## 6. Fechamento

- [ ] 6.1 `npm run test:e2e`: suíte inteira verde, inclusive os testes das tasks 1.2, 1.2b e 1.2c e os
      de 1440×900 (CA4, CA7, CA9, CA10).
- [ ] 6.2 Registrar aqui a fração medida em 1093×500. Se ficou abaixo da meta de 50% (o gate é 45%),
      abrir o follow-up do plano B (design, D7). Não implementar o plano B nesta change.
- [ ] 6.3 Verificação manual com dados reais em 1366×625: as três abas (Diagnóstico, Plano, Provas e
      sugestões), aprovar e rejeitar plano pelo CTA, "Ajustar plano". Screenshots depois, no PR.
- [ ] 6.4 **Gate de arquivamento.** O treinador que reportou, no próprio notebook e sem zoom out,
      revisa um atleta (lê o diagnóstico e decide o plano) com no máximo 3 rolagens no detalhe.

## Follow-ups (fora desta change)

- Implementar de verdade "Enviar mensagem" e "Marcar como prioridade" (Q2).
- Plano B (design, D7), se a meta de 50% em 1093×500 não for atingida.
- Avaliar o mesmo orçamento de altura em Atletas, Calendário e Revisão de planos.
- Atualizar `refine-inbox-mobile-breakpoint`, que ainda cita a barra de ações do detalhe e o menu de
  ações secundárias.
