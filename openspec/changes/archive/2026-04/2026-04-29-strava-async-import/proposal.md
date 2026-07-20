# OpenSpec Proposal: Strava Sync Manual (90 Dias)

## Context

**Related PRD Section:** [Strava Integration PRD → Journey 1 (Gabriel)](../../planning-artifacts/prd.md)
**Persona:** Gabriel (Atleta Novo) + Anderson (Professor)
**User Story:** 

> "Como professor, após atleta conectar ao Strava, vejo um botão 'Sincronizar 90 Dias' disponível. Clico nele e vejo o progresso (23/90 atividades) enquanto o sistema importa o histórico. Depois que completa, posso gerar o plano automático com dados reais."

---

## Problem Statement

**Current State:**
- ✅ OAuth2 funciona: atleta conecta, token é salvo
- ✅ `syncActivities()` existe: importa 90 dias via API Strava (paginado)
- ✅ `PlanoService` usa histórico: gera plano baseado em treinos salvos
- ❌ **Falta gatilho:** Não há forma de disparar sync após OAuth
- ❌ **Falta UI:** Professor não vê botão "Sincronizar"
- ❌ **Falta status:** Frontend não mostra progresso de importação

**Gap:**
1. Atleta conecta → callback salva token → redireciona ✅
2. **[FALTA AÇÃO]** Professor não tem como iniciar sync
3. Professor clica "Gerar Plano" → sem dados = plano genérico

**Impact:**
- Professor precisa de forma explícita para importar 90 dias
- Sem progresso visual, não sabe se está funcionando

---

## Solution Overview

### What

Adicionar **botão "Sincronizar 90 Dias"** na UI (após Strava conectado), permitindo professor disparar sync manualmente com feedback de progresso.

### How

```
FLUXO:
┌─ Frontend ─────────────────────────────────────────┐
│                                                     │
│  [Strava: Desconectado]                             │
│  ├─ Button "Conectar Strava" → OAuth               │
│                                                     │
│  [Strava: Conectado ✅]                             │
│  ├─ Button "Sincronizar 90 Dias" ← NEW             │
│  │  └─ POST /api/strava/sync/{atletaId}            │
│                                                     │
│  [Sincronizando...] (enquanto syn cing)            │
│  ├─ Polling: GET /api/strava/sync-status           │
│  │  └─ Shows: syncing=true, imported=23/90         │
│  │                                                 │
│  [Sincronização Completa ✅]                        │
│  └─ Button "Gerar Plano" → now has 90-day history │
│                                                     │
└─────────────────────────────────────────────────────┘
      ↓ (POST/GET calls)
┌─ Backend ──────────────────────────────────────────┐
│                                                     │
│  POST /api/strava/sync/{atletaId}                   │
│  └─ stravaActivityService.syncActivities()          │
│     ├─ Fetch 30/página até fim                     │
│     └─ Save TreinoRealizado + EtapaRealizada       │
│                                                     │
│  GET /api/strava/sync-status/{atletaId}            │
│  └─ Return: {syncing, imported, error}             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Why (Rationale)

**Manual (não automático):**
- Professor tem controle: sabe quando syncroniza, quanto tempo leva
- Sem surpresas: não bloqueia callback HTTP inesperadamente
- Previsível: sync acontece quando professor quer, não "mágico"

**Simples (sem evento):**
- Sem necessidade de ApplicationEvent pattern
- Sem listener assíncrono
- Sem TenantContext em thread
- Cód igo mais legível e testável

**UI clara:**
- Botão visível no status Strava
- Progresso real (23/90 atividades importadas)
- Disable "Gerar Plano" até sync completar
- Erro visível se falhar

---

## Scope (MVP)

### Included ✅

- Backend: Endpoint `POST /api/strava/sync/{atletaId}` (já existe, apenas validações)
- Backend: Endpoint `GET /api/strava/sync-status/{atletaId}` (novo)
- Frontend: Componente `SyncStravaButton` com progresso
- Frontend: Hook `useStravaSync` com polling
- Frontend: Integração em `AtletasList` (mostra botão se conectado)
- Error handling: marca `ativo=false` se sync falhar persistentemente
- Idempotência: ignora múltiplas chamadas simultâneas

### Not Included ❌

- Automático no callback (manual por botão)
- Event/listener async (desnecessário para manual)
- Dashboard visual (semáforo é post-MVP)
- Webhooks (post-MVP)

---

## Success Criteria

### User-Level

- ✅ Professor vê "Conectado ✅" quando atleta autoriza Strava
- ✅ Professor clica "Sincronizar 90 Dias"
- ✅ Vê progresso em tempo real (23/90 atividades)
- ✅ Após conclusão, pode clicar "Gerar Plano" com histórico real

### Technical

| Critério | Target |
|----------|--------|
| Latência POST /sync | Retorna imediatamente (< 100ms) |
| Latência import | < 30 seg (90 dias) |
| Polling interval | 2s (status updates) |
| Rate limit handling | Graceful (shows error, can retry) |
| Multi-tenant isolation | Zero cross-tenant leaks |

### Testing

- [ ] Unit: Service calls, status calculation
- [ ] Integration: Full flow (click button → sync → DB update)
- [ ] Multi-tenant: Athlete A sync doesn't touch B

---

## Dependencies

### Existing (já implementado)

- ✅ `StravaActivityService.syncActivities()` — logic completa
- ✅ `StravaActivityController.sync()` — endpoint `POST /api/strava/sync/{atletaId}` já existe
- ✅ `TenantContext` — multi-tenant isolamento
- ✅ `IntegracaoExternaRepository` — para consultar/atualizar status

### New (será criado)

- `StravaActivityController.getSyncStatus()` (1 método novo)
- `StravaService.ts` (TypeScript service para API calls)
- `useStravaSync` hook (React hook para polling)
- `SyncStravaButton` component (React component)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Rate limit Strava (600/15min) | syncActivities já trata, throws StravaRateLimitException → frontend mostra erro |
| Duplicate syncs (2 clicks) | Lock no backend: valida `syncing` flag antes de iniciar nova sync |
| User doesn't know it's syncing | Polling a cada 2s mostra `imported: 23/90` em tempo real |
| Sync fails silently | Mark `ativo=false`, set `lastSyncError` → frontend mostra mensagem clara |
| Long-running sync blocks UI | Operação em background, frontend faz polling (não bloqueia) |

---

## Rollout Plan

### Phase 1: Backend Event Infrastructure (this change)
- Deploy event + listener
- Monitor logs for successful async execution
- Verify DB has 90-day activities

### Phase 2: Frontend UI (separate PR)
- Add StravaService + useStravaSync hook
- Add StravaConnectButton component
- Add polling to show sync progress

### Phase 3: QA & Launch
- End-to-end testing: OAuth → import → plano
- Load testing: concurrent connects
- Rollout to staging, then production

---

## Open Questions

1. **Retry strategy:** If sync fails due to rate limit, should it auto-retry?
   - Proposal: Manual retry (professor clicks "Sincronizar Novamente")

2. **Sync timestamp tracking:** How to distinguish "syncing" vs "completed"?
   - Proposal: Use new field `syncStartedAt` + `ultimaSincronizacao` logic

3. **Notification persistence:** Should failed syncs be logged somewhere?
   - Proposal: Field `lastSyncError` in IntegracaoExterna

---

**Status:** Ready for Design Phase
**Owner:** Backend Team
**Estimated Effort:** 3-4 hours (backend) + 2-3 hours (frontend)
