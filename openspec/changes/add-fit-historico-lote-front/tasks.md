# Tasks — add-fit-historico-lote-front

Rascunho adiado: ver o gatilho em `proposal.md`. Validação: `npm run lint && npm run build &&
npm run test:run`; `npm run test:e2e` na 5.

- [ ] 1. Portar à mão o método novo para `src/api` (cliente curado; `generate:api` só como
  referência), preservando nomes e tipos estreitados.
- [ ] 2. Adapter `buildFitImportSummary` (função pura em `features/coach/adapters/`): desfechos por
  arquivo → contagens, erros e período coberto (data mais antiga, mais recente e semanas); teste puro.
- [ ] 3. Hook `useImportarHistoricoFit`: fila sequencial, progresso `n de N`, erro por arquivo sem
  interromper (422 → "Arquivo .fit inválido", 404 → "Atleta não encontrado", rede → "Falha de
  conexão"), teto de 200 arquivos, cancelar a fila; teste do hook (ordem, falha no meio, cancelamento).
- [ ] 4. Seção "Importar histórico" em `CoachAthleteProfilePage`: seleção, progresso, aviso de
  autorização, orientação de como obter os arquivos, resumo final com período coberto e nota de que
  não há desfazer; estados vazio, carregando e erro; teste de componente.
- [ ] 5. E2E (Playwright): abre o perfil, seleciona 2 `.fit` de fixture, vê o resumo; reenvia e vê
  "já existentes". Se o ambiente não permitir, registrar o motivo como item adiado.
