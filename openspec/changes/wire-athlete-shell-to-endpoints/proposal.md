# Proposal: wire-athlete-shell-to-endpoints

**Tamanho:** M · **Trilha:** Full (backend pequeno + frontend)

## Status

Proposed (aprovado pelo founder em sessão 2026-07-03 — priorizado sobre `add-llm-tool-use`/RAG
para fechar o loop coach→atleta antes da demo).

## Why

O coach hoje aprova plano, registra dado do atleta e vê o roster real — mas o **shell do atleta
inteiro roda em cima de mock**: `AthleteHomePage` (`MOCK_TODAY`), `AthletePlanPage`
(`buildMockWeek`/`MOCK_TSS`), `AthleteProgressPage` (`MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS`),
`AthleteCoachPage`/`CoachChatPanel` (`MOCK_MESSAGES`/`mockCoach`). `AthleteProfilePage` é um
placeholder "em construção".

Isso quebra o critério 4 do North Star ("o que chega ao atleta depois que o coach aprova") e o
passo 4/5 do momento de valor do coach (`personas.md`): o coach pode aprovar um plano e editar
treinos, mas **o atleta nunca vê o resultado real** — a demo para cliente para exatamente aqui.

O custo é baixo: os endpoints de dado (`add-athlete-progress-endpoints` já em develop) e o plano
aprovado (`PlanoTreinoController.buscarPlanoSemanal`, já filtra `APROVADO` para role ATLETA) já
existem em `develop`. Falta (a) 3 endpoints `/me/*` pequenos no backend para os dados hoje só
expostos via `{id}` para TECNICO/ADMIN, e (b) o wiring de frontend — mesmo padrão já aplicado no
coach em `wire-coach-shell-to-dashboards`.

**Fora de escopo:** chat coach<->atleta real (`CoachChatPanel`/`AthleteCoachPage`) — depende de
`add-athlete-coach-messaging` (Sprint 25, mensageria ainda não construída no backend). Esta
change troca o mock por um placeholder "em breve" nessa tela, sem inventar dado.
`AthleteProfilePage` segue como placeholder "em construção" (fora do momento de valor do coach).

## What Changes

### Backend (pequeno, `AtletaProgressController`)

- `GET /me/metricas/historico` (PMC, ATLETA) — espelha `/{id}/metricas/historico`, resolve
  `atletaId` via `resolverAtletaIdAtual()`, reusa `AtletaProgressService.getHistoricoPmc`.
- `GET /me/metricas/zonas` (ATLETA) — idem para `getDistribuicaoZonas`.
- `GET /me/recordes` (ATLETA) — idem para `getRecordes`.
- Sem migration, sem mudança de contrato dos endpoints `{id}` existentes (permanecem
  TECNICO/ADMIN). Reuso total da camada de serviço — apenas 3 métodos de controller novos.

### Frontend (`apps/menthoros-front`, `features/athlete`)

- Cliente curado `AthleteProgressService.ts` (padrão `CoachDashboardService`) + hooks
  `useAthleteHome`, `useAthletePlan`, `useAthletePmc`, `useAthleteZones`, `useAthleteRecordes`.
- `AthleteHomePage`: troca `MOCK_TODAY` por `GET /me/home` (já existe) + `GET /me/readiness`
  (já existe). Botão "Iniciar treino" e check-in seguem como estão (fora de escopo — dependem de
  `add-daily-readiness-checkin`, Sprint 9k, ainda em progresso).
- `AthletePlanPage`: troca `buildMockWeek`/`MOCK_TSS` pelo plano semanal real
  (`GET /api/v1/planos/{id}` com `id=atletaId`, já filtra `APROVADO` para ATLETA); estado vazio
  explícito quando não há plano aprovado (ainda não chegou do coach).
- `AthleteProgressPage`: troca `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS` pelos 3 endpoints
  `/me/*` novos; tab "Provas" sem fonte de PR real muda mensagem para "em breve" se `recordes`
  vier vazio (não fabrica valor).
- `AthleteCoachPage`: mock do chat vira placeholder "Mensagens chegam em breve" (change-fonte:
  `add-athlete-coach-messaging`), sem simular conversa fake.
- `AthleteProfilePage`: sem mudança (já é placeholder honesto).

## Critérios de aceite

- **CA1 — Home real:** atleta autenticado abre `/athlete/home` e vê seu treino de hoje + métricas
  reais de `GET /me/home` + `GET /me/readiness`, zero `MOCK_TODAY`.
- **CA2 — Plano real:** `/athlete/plan` mostra o plano semanal **aprovado** real do atleta (ou
  estado vazio "seu coach ainda não aprovou o plano desta semana" quando não houver), zero
  `buildMockWeek`.
- **CA3 — Progresso real:** `/athlete/progress` consome os 3 endpoints `/me/*` novos para
  PMC/zonas/recordes, zero `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS`.
- **CA4 — Chat honesto:** `/athlete/coach` não simula mensagens fake; mostra placeholder claro
  "em breve" linkado à change-fonte.
- **CA5 — Estados explícitos** (loading/error/empty) nas 3 telas de dado, mesmo padrão do
  `wire-coach-shell-to-dashboards`.
- **CA6 — Sem regressão:** `npm run lint && npm run build && npm run test:run` (front) e suíte
  backend verdes; os 3 endpoints novos têm teste de controller/service.
- **CA7 — Sem dado inventado:** nenhum widget mostra número fabricado quando o backend não tem
  fonte (ex. PRs vazios -> "ainda sem recordes", não um valor mock).

## Métrica de sucesso

Zero referências a `MOCK_TODAY`/`buildMockWeek`/`MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS`/
`MOCK_MESSAGES`/`mockCoach` no bundle das páginas do atleta. Proxy demonstrável: logar como
ATLETA de um tenant com plano aprovado e dado manual registrado (via 9d) e ver os números
baterem com o que o coach vê no perfil dele (`athlete-profile-drilldown`).

## Impact

- **Depende de:** `add-athlete-progress-endpoints`, `manual-training-entry-lightweight`,
  `coach-plan-review-workflow` (todas já em `develop`).
- **Repos:** `apps/menthoros-backend` (3 endpoints novos, sem migration) + `apps/menthoros-front`.
- **Não bloqueia nem altera:** `add-llm-tool-use`, RAG, `add-daily-readiness-checkin` (9k, em
  progresso) — mensageria e check-in diário seguem como estão, apenas isolados via placeholder
  honesto onde tocam esta change.
- **Reordenação de roadmap:** inserida antes do Sprint 10-11 (`add-llm-tool-use`) em `SPRINTS.md`,
  como intercalação de feature visível (mesmo padrão de `6b`, `9b`).
