# Tasks: notify-athlete-week-closed

**Status:** Concluída (mergeada em develop 2026-07-07, PR front#35)
**Tamanho:** XS · Trilha: Fast
**Repos:** menthoros-front (apenas)
**Dependências:** `coach-encerrar-semana` ✅ (produz o status `PERDIDO` + `CONCLUIDO`), `wire-athlete-shell-to-endpoints` ✅ (`useAthletePlan`)

---

## 1. Seletor de treinos perdidos (adapter puro)

- [x] 1.1 Criar `features/athlete/adapters/selectWeekClosedInfo.ts` — função pura que recebe `PlanoSemanal | null` e retorna `{ semanaEncerrada: boolean; treinosPerdidos: number }`:
  - `semanaEncerrada = getSafeValue(plano?.status) === 'CONCLUIDO'` — **`getSafeValue` obrigatório**: `PlanoStatus` é `@JsonFormat(OBJECT)` no backend, chega como `{value,label,...}` em runtime (mesmo padrão de `buildWeeklyPlan.ts:31` para `statusTreino`).
  - `treinosPerdidos = (plano?.treinosPlanejados ?? []).filter(t => getSafeValue(t.statusTreino) === 'PERDIDO').length`.
  - `plano == null` → `{ semanaEncerrada: false, treinosPerdidos: 0 }`.
  - `getSafeValue` de `src/utils/safeValues.ts` (`(value: unknown) => string | number`).
  - `verify:` teste unitário (abaixo) verde.
- [x] 1.2 Teste `selectWeekClosedInfo.test.ts` (Vitest puro): plano CONCLUIDO com N PERDIDO → conta N; plano sem PERDIDO → 0; plano não-CONCLUIDO → semanaEncerrada false; `null` → zeros; `statusTreino` como object-enum e como string (ambos normalizados).
- [x] 1.3 Validação: `npm run test:run` do arquivo.

## 2. Componente `WeekClosedBanner`

- [x] 2.1 Criar `features/athlete/components/WeekClosedBanner.tsx` (presentacional):
  - Props: `{ treinosPerdidos: number; onDismiss?: () => void }`.
  - MUI `Alert` (severity `info` ou `warning` — sem hex hardcoded, usar tokens/severity), dispensável (`onClose`).
  - Copy PT-BR de retenção (positivo): ex.: "Sua semana foi encerrada — {N} treino(s) ficaram para trás. A próxima semana é uma nova chance."
  - `verify:` teste de componente.
- [x] 2.2 Teste `WeekClosedBanner.test.tsx` (Testing Library): renderiza a contagem; aciona `onDismiss` ao fechar.
- [x] 2.3 Validação: `npm run lint && npm run build`.

## 3. Integração na `AthleteHomePage`

- [x] 3.1 Consumir `useAthletePlan` na `AthleteHomePage` (ainda não usado lá); estado local `bannerDispensado` (default false).
- [x] 3.2 Derivar `selectWeekClosedInfo(plano)`; renderizar `<WeekClosedBanner>` acima do conteúdo **apenas** quando `!loading && !error && semanaEncerrada && treinosPerdidos > 0 && !bannerDispensado`. `onDismiss` seta `bannerDispensado = true`.
  - Garantir que loading/erro/sem-plano **não** renderizam o banner (CA3) — não quebrar a Home.
- [x] 3.3 Teste na `AthleteHomePage` (mockando `useAthletePlan`): banner aparece com plano CONCLUIDO + PERDIDO; não aparece sem PERDIDO / sem plano / em erro.
- [x] 3.4 Validação: `npm run lint && npm run build && npm run test:run`.

## 4. QA e entrega

- [x] 4.1 `npm run lint && npm run build && npm run test:run` — tudo verde.
- [x] 4.2 QA (Fast track): `frontend-reviewer` + `clean-code-reviewer` sobre o diff; opcional `/codex:review`.
- [x] 4.3 PR `llsilvas/menthoros-front#35` mergeado em `develop` (2026-07-07, merge `bc76f4c`).
