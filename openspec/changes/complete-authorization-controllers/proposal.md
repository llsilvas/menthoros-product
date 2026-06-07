# Proposal: Complete Authorization on Remaining Controllers

## Problem
5 of 12 controllers in menthoros-backend lack @PreAuthorize annotations, leaving endpoints accessible without proper authorization checks. This creates security gaps and inconsistent API behavior.

## Controllers Affected
1. **MetricasController** — Athlete metrics (GET /api/v1/atletas/{id}/metricas/*)
2. **ProvasProximasController** — Upcoming races (GET /api/v1/provas/proximas)
3. **StravaActivityController** — Strava manual sync (POST/GET /api/v1/strava/sync/*)
4. **StravaAuthController** — OAuth flow (GET /api/v1/strava/auth, /api/v1/strava/auth/url/*)
5. **StravaWebhookController** — Webhook receiver (GET/POST /api/v1/strava/webhook) — **EXCEPTION: must remain public**

## Goals
- Add @PreAuthorize annotations to all protected endpoints
- Follow established pattern from 7 already-protected controllers
- Maintain backward compatibility with Strava webhooks
- Add authorization tests for each controller

## Non-Goals
- Change API contracts or request/response DTOs
- Implement new authorization roles (use existing)
- Add rate limiting (separate task)

## Success Criteria
- ✅ All 12 controllers have consistent authorization guards
- ✅ Authorization tests passing for each controller
- ✅ Strava webhook endpoints remain public (no auth required)
- ✅ Build passes cleanly
- ✅ Zero security warnings
