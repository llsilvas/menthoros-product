# Tasks — add-fit-historico-lote-front

Rascunho adiado: ver o gatilho em `proposal.md`. Validação: `npm run lint && npm run build &&
npm run test:run`; `npm run test:e2e` na 6.

- [ ] 1. Portar à mão o método novo para `src/api` (cliente curado; `generate:api` só como
  referência), preservando nomes e tipos estreitados.
- [ ] 2. Adapter `buildFitImportSummary` (função pura em `features/coach/adapters/`): desfechos por
  arquivo → contagens, erros e período coberto (data mais antiga, mais recente e semanas); teste puro.
- [ ] 3. Hook `useImportarHistoricoFit`: fila sequencial, progresso `n de N`, tempo restante
  estimado pela média dos enviados, erro por arquivo sem interromper (422 → "Arquivo .fit inválido",
  404 → "Atleta não encontrado", rede → "Falha de conexão"), teto de 200 arquivos, cancelar após o
  arquivo atual, reenviar só os com erro; teste do hook (ordem, falha no meio, cancelamento,
  retentativa parcial).
- [ ] 4. `FitHistoricoDialog` sobre `CoachDialog` (`features/coach/components/`), três estados
  (canvas no `proposal.md`): antes de enviar (aviso de autorização e sem desfazer acima do seletor,
  link de como obter os arquivos, lista com ignorados e período estimado, botão com contagem e
  desabilitado sem arquivo válido); enviando (progresso, arquivo atual, contadores parciais, lista
  com status por texto e cor, `disableClose`, cancelar restante); resumo (contadores, período coberto
  com selo ≥ 6 semanas, erros com motivo, nota de reenvio seguro, lembrete de sem desfazer, "Tentar
  os N com erro", "Ver treinos do atleta"); estados vazio, carregando e erro; teste de componente.
- [ ] 5. Pontos de entrada: item "Importar histórico .fit" no menu "Ações" de `CoachAthletesPage`
  (`RosterActionType` `'fit-historico'`, entre "Sincronizar Strava" e "Projeção de prova", recarrega
  o roster ao fechar) e botão no cabeçalho de `CoachAthleteProfilePage` ao lado de "Preencher
  onboarding" (recarrega o perfil ao fechar); teste de componente de cada entrada.
- [ ] 6. E2E (Playwright): da lista, abre o menu de ações, seleciona 2 `.fit` de fixture, vê o
  resumo; reenvia e vê "já existentes". Se o ambiente não permitir, registrar o motivo como item
  adiado.
