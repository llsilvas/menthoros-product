# Tasks: wire-coach-identity-and-attention-queue

## 1. Tipos TypeScript

- [ ] 1.1 `src/types/Usuario.ts` (novo): `UsuarioMeOutputDto { id, email, nomeCompleto, papel, ativo, tenant: { id, nome, athleteCount? } }`
  - verify: arquivo presente e sem erros de compilação (`npm run build`)

- [ ] 1.2 `src/types/Coach.ts` (adição): `RecommendationExplanation { rationale: string; sourceRules: string[]; confidence: 'HIGH' | 'MEDIUM' | 'LOW' }` e `CoachAttentionItem { atletaId, athleteName, severity, priorityScore, primaryReason, suggestedAction, generatedAt, evidence: { label, value }[], explanation?: RecommendationExplanation }`
  - verify: `npm run build` continua verde

## 2. Camada de serviço (API client)

- [ ] 2.1 `src/api/services/UsuarioService.ts` (novo, manual): método `static getMe(): CancelablePromise<UsuarioMeOutputDto>` chamando `GET /api/v1/users/me`
  - Seguir o padrão de `CoachDashboardService.ts`

- [ ] 2.2 `CoachDashboardService.ts` (adição): método `static getAttentionQueue(): CancelablePromise<Array<CoachAttentionItem>>` chamando `GET /api/v1/coach/attention-queue`

- [ ] 2.3 `src/api/index.ts` (adição): exportar `UsuarioService`
  - verify: `npm run build` verde

## 3. Hook `useCurrentUser`

- [ ] 3.1 `src/hooks/useCurrentUser.ts` (novo):
  - Chama `UsuarioService.getMe()` via `useState` + `useEffect`
  - Retorna `{ coach: { id, name, avatarUrl? }, tenant: { id, name, athleteCount }, loading: boolean, error: Error | null }`
  - Em loading/erro, retorna valores de fallback (evita crash no layout)
  - verify: `npm run test:run` verde (existente) + build verde

## 4. Wiring de identidade em `CoachLayout.tsx`

- [ ] 4.1 Substituir `mockCoach`/`mockTenant` (linhas 8–9) por `useCurrentUser()`:
  - Passar `coach.name`, `coach.avatarUrl`, `tenant.name`, `tenant.id`, `tenant.athleteCount` ao `CoachSidebar`
  - Mostrar estado de carregamento gracioso (nome placeholder ou skeleton enquanto carrega)

- [ ] 4.2 Wiring do `inboxBadgeCount`: chamar `CoachDashboardService.getAttentionQueue()` no layout e passar `.length` como `inboxBadgeCount` ao `CoachSidebar`
  - verify: badge some quando fila vazia; exibe N quando fila tem N itens

## 5. `CoachAttentionQueuePage.tsx`

- [ ] 5.1 Criar `src/features/coach/pages/CoachAttentionQueuePage.tsx`:
  - Chama `CoachDashboardService.getAttentionQueue()` via hook ou useEffect
  - Renderiza cada `CoachAttentionItem` com: avatar do atleta (nome), chip de severidade (`CRITICA`/`ALTA`), motivo (`primaryReason`), ação sugerida (`suggestedAction`), evidências e `explanation.rationale`
  - Estado vazio: ícone + "Todos os atletas em dia"
  - Estado de carregamento: skeleton ou spinner
  - Estado de erro: mensagem não-bloqueante
  - Layout: lista simples (sem colunas — o design 3-colunas é do suggestion inbox)

- [ ] 5.2 Rota `/coach/inbox` aponta para `CoachAttentionQueuePage` (atualizar o roteador do app)
  - verify: navegar para `/coach/inbox` renderiza a nova página

- [ ] 5.3 `CoachInboxPage.tsx` substituída ou removida (será reescrita em `add-coach-suggestion-inbox`)

## 6. Verificar `hasPendingSuggestion` no calendário

- [ ] 6.1 Confirmar que `calendarAdapter.ts` já lê `t.hasPendingSuggestion` do DTO — sem alteração necessária
  - Adicionar comentário `// R3: hasPendingSuggestion vem do backend (TreinoAgendado)` se não existir
  - verify: `npm run test:run` verde (calendarAdapter.test.ts)

## 7. QA e validação final

- [ ] 7.1 `npm run lint && npm run build && npm run test:run` — 0 falhas, 0 erros de TypeScript
- [ ] 7.2 Verificar manualmente no browser: identidade real, fila real, badge, estado vazio, loading/erro
