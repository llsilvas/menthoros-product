# Tasks: wire-coach-identity-and-attention-queue

> Refinado contra o código real em 2026-06-19. Stack: React 19 / TS / MUI; hook pattern `useState` + `useCallback`; testes: Vitest + Testing Library.

---

## 1. Tipos TypeScript

- [ ] 1.1 `src/types/Usuario.ts` (novo): contrato de `GET /api/v1/users/me`
  ```ts
  // Campo real: nome (não nomeCompleto); assessoria.dominio disponível mas irrelevante pro shell
  export type UserRole = 'TECNICO' | 'ADMIN' | 'ATLETA';
  export interface UsuarioAssessoria { id: string; nome: string; dominio?: string; }
  export interface UsuarioMeOutputDto { id: string; nome: string; email: string; role: UserRole; assessoria?: UsuarioAssessoria; atletaId?: string; }
  ```
  - verify: `npm run build` sem erros de tipo

- [ ] 1.2 `src/types/Coach.ts` (adições): contratos da fila de atenção
  ```ts
  export type AttentionSeverity = 'CRITICA' | 'ALTA' | 'MEDIA';
  export type AttentionReason = 'FADIGA' | 'SOBRECARGA' | 'SEM_PLANO' | 'ADERENCIA' | 'INATIVIDADE' | 'ZONAS_VENCIDAS';
  export type ExplanationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
  export interface RecommendationExplanation { rationale: string; sourceRules: string[]; confidence: ExplanationConfidence; }
  export interface AttentionEvidence { label: string; value: string; }
  export interface CoachAttentionItem { atletaId: string; athleteName: string; severity: AttentionSeverity; priorityScore: number; primaryReason: AttentionReason; suggestedAction: string; generatedAt: string; evidence: AttentionEvidence[]; explanation?: RecommendationExplanation; }
  ```
  - verify: `npm run build` verde

---

## 2. Camada de serviço (API client)

- [ ] 2.1 `src/api/services/UsuarioService.ts` (novo, curado à mão):
  ```ts
  // Seguir padrão de CoachDashboardService.ts (CancelablePromise, OpenAPI, request)
  import type { UsuarioMeOutputDto } from '../../types/Usuario';
  // método: static getMe(): CancelablePromise<UsuarioMeOutputDto> → GET /api/v1/users/me
  ```
  - verify: arquivo presente e importável

- [ ] 2.2 `CoachDashboardService.ts` (adição de método):
  ```ts
  // static getAttentionQueue(): CancelablePromise<Array<CoachAttentionItem>> → GET /api/v1/coach/attention-queue
  ```
  - verify: `npm run build` verde

- [ ] 2.3 `src/api/index.ts`: adicionar `export { UsuarioService } from './services/UsuarioService';`
  - verify: `npm run build` verde

---

## 3. Hook `useCurrentUser`

- [ ] 3.1 `src/hooks/useCurrentUser.ts` (novo): padrão `useState` + `useCallback` (igual a `useCoachRoster`)
  - Retorna `{ coach: { id: string; name: string; avatarUrl?: string }, tenant: { id: string; name: string; athleteCount: number }, loading: boolean, error: Error | null, fetchCurrentUser: () => Promise<void> }`
  - Mapeia `UsuarioMeOutputDto.nome → coach.name`, `assessoria.id → tenant.id`, `assessoria.nome → tenant.name`
  - **`athleteCount: 0`** (o campo não existe em `/users/me`; follow-up: derivar de `kpis.totalAtletas` na change `add-coach-suggestion-inbox`)
  - Fallback em loading/erro: `coach.name = ''`, `tenant.name = ''` — não quebra layout
  - verify: `npm run test:run` verde

- [ ] 3.2 `src/hooks/useCurrentUser.test.ts` (novo): padrão de `useCoachRoster.test.ts`
  - Caso feliz: mapeia `nome→name`, `assessoria.nome→tenant.name`, `assessoria.id→tenant.id`, `athleteCount=0`
  - Erro: `error` populado, `coach.name=''`
  - verify: `npm run test:run` verde

- [ ] 3.3 `src/hooks/useAttentionQueue.ts` (novo): padrão `useState` + `useCallback`
  - Retorna `{ queue: CoachAttentionItem[], loading, error, fetchQueue }`
  - verify: `npm run test:run` verde

- [ ] 3.4 `src/hooks/useAttentionQueue.test.ts` (novo): caso feliz (array de itens) + erro
  - verify: `npm run test:run` verde

---

## 4. Wiring de identidade em `CoachLayout.tsx`

- [ ] 4.1 Substituir `mockCoach`/`mockTenant` por `useCurrentUser()`:
  - Remover constantes `mockCoach`, `mockTenant` (linhas 8–9)
  - Chamar `useCurrentUser()` e `useAttentionQueue()` no componente
  - Chamar `fetchCurrentUser()` + `fetchQueue()` no `useEffect([])`
  - Passar `coach` e `tenant` reais ao `CoachSidebar`
  - Passar `inboxBadgeCount={queue.length}` ao `CoachSidebar`
  - verify: `npm run build` verde; zero referências a `mockCoach`/`mockTenant` no arquivo

---

## 5. `CoachAttentionQueuePage.tsx`

- [ ] 5.1 Criar `src/features/coach/pages/CoachAttentionQueuePage.tsx`:
  - Hook `useAttentionQueue()` + `fetchQueue()` no `useEffect([])`
  - Loading: `CircularProgress` centralizado
  - Erro: `Typography` de erro não-bloqueante
  - Vazio: ícone `CheckCircleIcon` + "Todos os atletas em dia" (mesmo padrão do `EmptyState` em `CoachInboxPage`)
  - Lista de items: `CoachAttentionQueueItem` sub-componente (interno ao arquivo) com:
    - Chip de severidade (`CRITICA`→danger, `ALTA`→warning) usando tokens de cor
    - `primaryReason` legível (ex.: "FADIGA" → "Fadiga") — mapeamento estático no componente
    - `suggestedAction` como texto
    - `explanation.rationale` se presente (tipografia `caption`)
    - Evidências compactas (`evidence[].label: evidence[].value`)
  - verify: `npm run build` verde (sem erros TS, sem any)

- [ ] 5.2 Atualizar `App.tsx`:
  - Substituir `import CoachInboxPage` por `import CoachAttentionQueuePage`
  - Rota `inbox` → `element: <CoachAttentionQueuePage />`
  - verify: `npm run build` verde

- [ ] 5.3 Remover `src/features/coach/pages/CoachInboxPage.tsx`:
  - Será recriada do zero em `add-coach-suggestion-inbox` como inbox real de sugestões
  - verify: `npm run build` verde (sem import morto)

---

## 6. Confirmar `hasPendingSuggestion` no calendário

- [ ] 6.1 Leitura defensiva: `calendarAdapter.ts` já lê `t.hasPendingSuggestion` via `TreinoAgendado` — sem alteração de código
  - Confirmar que `calendarAdapter.test.ts` cobre o campo
  - Se não cobrir: adicionar caso de teste `hasAlert/hasPendingSuggestion propagados`
  - verify: `npm run test:run` verde (calendarAdapter.test.ts)

---

## 7. QA e validação final

- [ ] 7.1 `npm run lint && npm run build && npm run test:run` — 0 falhas, 0 erros TS, 0 warnings de lint
- [ ] 7.2 Cheklist manual (sem servidor real, usar `npm run dev` + backend local ou inspecionar estado):
  - `mockCoach`/`mockTenant` não aparecem mais no código
  - Badge Inbox exibe count correto quando `queue.length > 0`
  - `/coach/inbox` renderiza `CoachAttentionQueuePage` (não a inbox de sugestões)

---

## Notas de implementação

- **`athleteCount`:** `GET /api/v1/users/me` retorna `assessoria: { id, nome, dominio }` sem contagem de atletas. Fixar em `0` e documentar follow-up em `add-coach-suggestion-inbox` (derivar de `GET /api/v1/coach/insights kpis.totalAtletas`).
- **Sem `any`:** `UsuarioMeOutputDto.atletaId` é `UUID` no backend → `string` no front (UUIDs viajam como string em JSON). Idem `atletaId` em `CoachAttentionItem`.
- **`CoachInboxPage.tsx`** fica deletado nesta change. O arquivo será recriado do zero em `add-coach-suggestion-inbox` usando dados reais da API de sugestões.
