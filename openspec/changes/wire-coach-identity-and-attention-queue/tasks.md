# Tasks: wire-coach-identity-and-attention-queue

> Refinado contra o código real em 2026-06-19. Stack: React 19 / TS / MUI; hook pattern `useState` + `useCallback`; testes: Vitest + Testing Library.

---

## 1. Tipos TypeScript

- [x] 1.1 `src/types/Usuario.ts` (novo): contrato de `GET /api/v1/users/me`
  ```ts
  // Campo real: nome (não nomeCompleto); assessoria.dominio disponível mas irrelevante pro shell
  export type UserRole = 'TECNICO' | 'ADMIN' | 'ATLETA';
  export interface UsuarioAssessoria { id: string; nome: string; dominio?: string; }
  export interface UsuarioMeOutputDto { id: string; nome: string; email: string; role: UserRole; assessoria?: UsuarioAssessoria; atletaId?: string; }
  ```
  - verify: `npm run build` sem erros de tipo ✓

- [x] 1.2 `src/types/Coach.ts` (adições): contratos da fila de atenção
  ```ts
  export type AttentionSeverity = 'CRITICA' | 'ALTA' | 'MEDIA';
  export type AttentionReason = 'FADIGA' | 'SOBRECARGA' | 'SEM_PLANO' | 'ADERENCIA' | 'INATIVIDADE' | 'ZONAS_VENCIDAS';
  export type ExplanationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
  export interface RecommendationExplanation { rationale: string; sourceRules: string[]; confidence: ExplanationConfidence; }
  export interface AttentionEvidence { label: string; value: string; }
  export interface CoachAttentionItem { atletaId: string; athleteName: string; severity: AttentionSeverity; priorityScore: number; primaryReason: AttentionReason; suggestedAction: string; generatedAt: string; evidence: AttentionEvidence[]; explanation?: RecommendationExplanation; }
  ```
  - verify: `npm run build` verde ✓

---

## 2. Camada de serviço (API client)

- [x] 2.1 `src/api/services/UsuarioService.ts` (novo, curado à mão): `getMe()` → `GET /api/v1/users/me`
  - verify: arquivo presente e importável ✓

- [x] 2.2 `CoachDashboardService.ts`: `getAttentionQueue()` → `GET /api/v1/coach/attention-queue`
  - verify: `npm run build` verde ✓

- [x] 2.3 `src/api/index.ts`: `export { UsuarioService }` adicionado
  - verify: `npm run build` verde ✓

---

## 3. Hook `useCurrentUser`

- [x] 3.1 `src/hooks/useCurrentUser.ts`: `useState` + `useCallback`, mapeia `nome→name`, `assessoria→tenant`; `athleteCount=0` (follow-up em `add-coach-suggestion-inbox`)
  - verify: `npm run test:run` verde ✓ (4 testes)

- [x] 3.2 `src/hooks/useCurrentUser.test.ts`: feliz, fallback sem assessoria, erro, loading
  - verify: `npm run test:run` verde ✓

- [x] 3.3 `src/hooks/useAttentionQueue.ts`: `useState` + `useCallback`, retorna `{ queue, loading, error, fetchQueue }`
  - verify: `npm run test:run` verde ✓ (4 testes)

- [x] 3.4 `src/hooks/useAttentionQueue.test.ts`: feliz, lista vazia, erro, loading
  - verify: `npm run test:run` verde ✓

---

## 4. Wiring de identidade em `CoachLayout.tsx`

- [x] 4.1 Remove `mockCoach`/`mockTenant`; usa `useCurrentUser()` + `useAttentionQueue()`; `inboxBadgeCount={queue.length}`
  - verify: `npm run build` verde; zero referências a `mockCoach`/`mockTenant` ✓

---

## 5. `CoachAttentionQueuePage.tsx`

- [x] 5.1 `src/features/coach/pages/CoachAttentionQueuePage.tsx`: loading (CircularProgress), erro, vazio (CheckCircle), lista com `SeverityChip` (danger/warning), `REASON_LABEL` map, `suggestedAction`, `explanation.rationale`, evidências
  - verify: `npm run build` verde, sem `any` ✓

- [x] 5.2 `App.tsx`: rota `inbox` → `<CoachAttentionQueuePage />`
  - verify: `npm run build` verde ✓

- [x] 5.3 `CoachInboxPage.tsx` removido via `git rm`
  - verify: `npm run build` verde ✓

---

## 6. Confirmar `hasPendingSuggestion` no calendário

- [x] 6.1 `calendarAdapter.test.ts` linha 54–63 já cobre `hasPendingSuggestion: true` — sem alteração necessária
  - verify: `npm run test:run` verde ✓ (calendarAdapter: 5 testes)

---

## 7. QA e validação final

- [x] 7.1 `npm run build && npm run test:run` — 44 testes passando, 0 falhas, 0 erros TS
  - Lint: 27 erros pré-existentes em arquivos fora do escopo desta change; zero erros nos 8 arquivos novos/modificados.
- [ ] 7.2 Verificação manual no browser (pendente — requer backend local)

---

## Notas de implementação

- **`athleteCount`:** `GET /api/v1/users/me` retorna `assessoria: { id, nome, dominio }` sem contagem de atletas. Fixado em `0`; follow-up em `add-coach-suggestion-inbox` (derivar de `GET /api/v1/coach/insights kpis.totalAtletas`).
- **Sem `any`:** todos os tipos são `string` (UUIDs viajam como string em JSON); zero `any` nos arquivos desta change.
- **`CoachInboxPage.tsx`** deletado nesta change. Será recriado do zero em `add-coach-suggestion-inbox`.
- **Lint pré-existente:** 27 erros/warnings em arquivos do legacy shell (`api/core`, `hooks/features`, `services`, `components/features`). Fora do escopo — sem regressão desta change.
