# Tasks — add-coach-suggestion-review-actions

Validação por bloco: frontend `npm run lint && npm run build && npm test`. Branch
`feature/add-coach-suggestion-review-actions` no `menthoros-front` antes de qualquer código.

## 1. Frontend — ações no dialog

- [x] 1.1 `RecentSuggestionsPanel.tsx`: adicionar botões "Aprovar"/"Rejeitar" no `CoachDialog`,
      visíveis só quando `status === 'PENDING'`; estado de loading por ação (desabilita os dois
      durante a chamada).
      *verify:* CA1, CA2, CA5. ✅ `RecentSuggestionsPanel.test.tsx`.
- [x] 1.2 Tratamento de erro/resultado incerto: em falha, reconsultar `detalhe(id)` antes de
      decidir o que exibir (nunca assumir PENDING às cegas); reconsulta também falhando ->
      mensagem "não foi possível confirmar — recarregue"; 422 (decisão já tomada por outra
      sessão) tratado como status informativo, não erro genérico.
      *verify:* CA3, CA3b. ✅ `RecentSuggestionsPanel.test.tsx`.
- [x] 1.3 `RecentSuggestionsPanel` recebe e chama, ao concluir com sucesso, um callback de
      refresh (o `fetchProfile` de `useAthleteProfile`, repassado por `CoachAthleteProfilePage`
      como nova prop) para recarregar `profile.sugestoesRecentes`; o dialog atualiza o `status`
      exibido a partir do retorno de `aprovar`/`rejeitar`, sem esperar o refetch do perfil.
      Sugestões APPROVED/REJECTED continuam sem botões.
      *verify:* CA1, CA2, CA4. ✅ `onDecisao={fetchProfile}` em `CoachAthleteProfilePage.tsx`.
- [x] 1.4 Testes RTL cobrindo os critérios de aceite (CA1–CA5, CA3b), incluindo o caso de
      resposta perdida (mock de rede falhando após mutação já ter comitado no servidor).
      *verify:* `npm run lint && npm run build && npm run test:run` verde — 210 arquivos /
      1693 testes passando, sem regressão.

## 2. Encerramento

- [x] 2.1 `/qa` no frontend (`frontend-reviewer` + `clean-code-reviewer` em paralelo). Achados
      aplicados: bug real (branch 422 não chamava `onDecisao`, lista do pai ficava
      desatualizada) corrigido unificando a checagem em `resolverMensagemDecisao`; lógica de
      decisão extraída para `useSugestaoDecisao` (hook, testável isoladamente); confirmação
      adicionada antes de rejeitar (`ConfirmDialog`, mesmo padrão de outras ações destrutivas do
      coach — achado do `frontend-reviewer`, não estava no proposal original). Gate completo
      (`lint && build && test:run`) verde: 211 arquivos / 1701 testes, sem regressão.
- [ ] 2.2 Validação manual em `develop` (Railway): abrir uma sugestão PENDING real, aprovar,
      confirmar que o status persiste ao reabrir a lista; testar rejeitar com e sem confirmar.
