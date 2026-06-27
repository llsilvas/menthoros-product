# Tasks — migrate-frontend-color-system-premium-v2

Todas as tasks em `apps/menthoros-front`. Validação por bloco: `npm run lint && npm run build && npm run test:run`.

## 1. Fundação de tokens (v2.0)

- [ ] 1.1 Portar `theme.premium.ts` para a estrutura existente: regenerar `primary` em `src/shared/design-tokens/colors.ts` ancorado em `#BDDE5A` (50→900 + `contrastText: #0A1628`)
- [ ] 1.2 Adicionar a paleta `categorical` nomeada (`slate`, `teal`, `cyan`, `violet`, `magenta`, `coral`, `gold`, `sage`, `injuryResponse`) — substituindo `cat1..cat8`
- [ ] 1.3 Reescrever `readiness` como mapa nomeado (`critical`/`caution`/`good`/`optimal`) com `good = #2DD4BF`; expor `readinessColor(score)` determinístico em `src/theme/tokens.ts`
- [ ] 1.4 Atualizar `FORBIDDEN_RAW_COLORS` em `forbidden-uses.ts` para a v2.0 (`#D4FF3A` → "lime aposentado; use `primary[500]` = `#BDDE5A`")
- [ ] 1.5 Validar tipos: `npm run build`

## 2. Fase 1 — Mecânica (risco baixo, sem mudança de lógica visual)

- [ ] 2.1 Recalcular `sidebar.selectedBg` sobre o novo lime (`rgba(189,222,90,0.15)`) em `tokens.ts`
- [ ] 2.2 Renomear/mapear `WORKOUT_STATUS_COLORS` para os tokens `trainingStatus` semânticos (`success`/`text.secondary`/`danger`/`warning`)
- [ ] 2.3 Validar que o build e os snapshots de status não mudaram de cor (status já era semântico): `npm run test:run`
- [ ] 2.4 Commit isolado "phase-1 mechanical" (rollback = reverter valor do lime)

## 3. Fase 2 — Correção de colisão (risco médio)

- [ ] 3.1 Remapear `WORKOUT_TYPE_COLORS` para `categorical` (`FACIL→slate`, `LONGO→teal`, `TEMPO→coral`, `INTERVALADO→magenta`, `REGENERATIVO→sage`, `FARTLEK→violet`, `CONTINUO→gold`)
- [ ] 3.2 Remapear `WORKOUT_STAGE_COLORS` para `categorical` (`principal→teal` — remove lime; `esforco→coral`, `recuperacao→sage`, `desaquecimento→slate`, `aquecimento→gold`)
- [ ] 3.3 Trocar `zone.Z2.color` lime → `#34D399` (verde); manter Z1/Z3/Z4/Z5; adicionar comentário "intentional — só Z2 muda"
- [ ] 3.4 Refatorar `ReadinessCard.tsx` para consumir `readinessColor()` em vez da banda inline com `primary[500]`
- [ ] 3.5 Escrever teste de invariante (`*.test.ts`) sobre os mapas de token: nenhuma categoria compartilha hex com token `semantic` (exceto `injuryResponse = danger`)
- [ ] 3.6 Validar: `npm run lint && npm run build && npm run test:run`
- [ ] 3.7 Commit isolado "phase-2 collision fix"

## 4. Fase 3 — Premium polish (risco médio)

- [ ] 4.1 Revisar `glass`/`glassSx` em `tokens.ts`: substituir `blur(10px)` + white-alpha por material (`surfaceShift`) + hairline (1px) no coach cockpit denso
- [ ] 4.2 Rotear os `rgba(...)` crus restantes em componentes para tokens de `glass`/`surfaceShift`/`text`
- [ ] 4.3 Ajuste de densidade e espaço negativo nas telas do cockpit (`pages/home/**`, `features/coach/**`)
- [ ] 4.4 Validar: `npm run lint && npm run build && npm run test:run`
- [ ] 4.5 Commit isolado "phase-3 premium polish"

## 5. Erradicação de cor crua + gate de CI

- [ ] 5.1 Inventariar os 111 hex + 189 rgba (grep do proposal §3) e rotear cada um para um token via tabela de remap
- [ ] 5.2 Tratar os maiores ofensores: `WorkoutTimelineChart.tsx` (22), `LandingPage.tsx` (19), `App.tsx` (7), `types/PlanoSemanal.ts` (6), `LoginPage.tsx` (6), `types/TreinoRealizado.ts` (5)
- [ ] 5.3 Adicionar a regra ESLint `no-raw-color-literals` (`no-restricted-syntax`) em `eslint.config.js` com allowlist dos arquivos de token
- [ ] 5.4 Reduzir/realinhar o limite do `useLimeAudit` para a regra v2.0 (lime = marca/ação + 1 métrica-chave/view)
- [ ] 5.5 Validar gate: `npm run lint` falha quando se introduz um hex cru de teste, passa após reverter

## 6. Aceitação e entrega

- [ ] 6.1 AC-1: `npm run lint` passa com 0 literais crus em componentes
- [ ] 6.2 AC-2: `grep` por lime não encontra ocorrências em readiness/zone/stage/type
- [ ] 6.3 AC-3: teste de invariante (3.5) verde
- [ ] 6.4 AC-4: visual diff revisado em cockpit dashboard, athlete plan view, workout detail (anexar screenshots)
- [ ] 6.5 AC-5: `npm run build` e `npm run test:run` passam
- [ ] 6.6 Re-verificar contraste (texto ≥4.5:1, UI ≥3:1) no novo lime e nos chips categóricos contra as superfícies
- [ ] 6.7 Atualizar `adr/INDEX.md` e marcar ADR-0010 como `Aceito`
