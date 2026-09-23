# Tasks — add-coach-suggestion-review-actions

Validação por bloco: frontend `npm run lint && npm run build && npm test`. Branch
`feature/add-coach-suggestion-review-actions` no `menthoros-front` antes de qualquer código.

## 1. Frontend — ações no dialog

- [ ] 1.1 `RecentSuggestionsPanel.tsx`: adicionar botões "Aprovar"/"Rejeitar" no `CoachDialog`,
      visíveis só quando `status === 'PENDING'`; estado de loading por ação (desabilita os dois
      durante a chamada).
      *verify:* CA1, CA2, CA5.
- [ ] 1.2 Tratamento de erro/resultado incerto: em falha, reconsultar `detalhe(id)` antes de
      decidir o que exibir (nunca assumir PENDING às cegas); reconsulta também falhando ->
      mensagem "não foi possível confirmar — recarregue"; 422 (decisão já tomada por outra
      sessão) tratado como status informativo, não erro genérico.
      *verify:* CA3, CA3b.
- [ ] 1.3 `RecentSuggestionsPanel` recebe e chama, ao concluir com sucesso, um callback de
      refresh (o `fetchProfile` de `useAthleteProfile`, repassado por `CoachAthleteProfilePage`
      como nova prop) para recarregar `profile.sugestoesRecentes`; o dialog atualiza o `status`
      exibido a partir do retorno de `aprovar`/`rejeitar`, sem esperar o refetch do perfil.
      Sugestões APPROVED/REJECTED continuam sem botões.
      *verify:* CA1, CA2, CA4.
- [ ] 1.4 Testes RTL cobrindo os critérios de aceite (CA1–CA5, CA3b), incluindo o caso de
      resposta perdida (mock de rede falhando após mutação já ter comitado no servidor).
      *verify:* `npm run lint && npm run build && npm run test:run` verde.

## 2. Encerramento

- [ ] 2.1 `/qa` no frontend.
- [ ] 2.2 Validação manual em `develop` (Railway): abrir uma sugestão PENDING real, aprovar,
      confirmar que o status persiste ao reabrir a lista.
