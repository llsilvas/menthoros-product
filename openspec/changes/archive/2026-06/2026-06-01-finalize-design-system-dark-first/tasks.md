# Tasks

## 1. Validação prévia (não-código)

- [ ] 1.1 Aprovar as 4 telas geradas com Carlos Mendes (treinador-piloto) em sessão de 30min
- [ ] 1.2 Coletar feedback estruturado: o que vê primeiro? consegue identificar atleta em risco em <5s? smart filter faz sentido?
- [ ] 1.3 Aprovar tokens finais (lime + navy) ou pivotar antes de codar

## 2. Design Tokens — Substituição completa

- [x] 2.1 Criar `src/shared/design-tokens/colors.ts` com escalas completas (primary, surface, danger, warning, success, info, categorical)
- [ ] 2.2 Gerar escalas com ferramenta validada (Tailwind palette generator, Radix Colors) — não improvisar
- [ ] 2.3 Validar todas as combinações texto/bg com Stark plugin — todas WCAG AA
- [ ] 2.4 Validar com simulador de daltonismo (Sim Daltonism) — primary vs success distinguíveis
- [x] 2.5 Criar `src/shared/design-tokens/typography.ts` com escala canônica fechada
- [x] 2.6 Criar `src/shared/design-tokens/elevation.ts` (4 níveis, dark-mode via bg-shift)
- [x] 2.7 Criar `src/shared/design-tokens/density.ts` (compact/comfortable/spacious)

## 3. Convenções formalizadas em código

- [x] 3.1 Criar `src/shared/design-tokens/forbidden-uses.ts` — mapa de cores proibidas + `auditRawColors()` helper
- [x] 3.2 Criar hook `src/shared/hooks/useLimeAudit.ts` em dev mode — conta elementos lime e emite warning se > 8
- [x] 3.3 Criar `src/features/coach/types/AvatarStatus.ts` enum canônico (sem lime, 5 estados com mapa de cor)
- [x] 3.4 Criar `src/features/coach/types/AthleteForm.ts` enum fechado (5 níveis + `formFromTSB()`)

## 4. Aplicar tokens nos componentes existentes

- [x] 4.1 `AtletaStatusRow`: cores cruas substituídas por `semantic.success`, `semantic.danger`, `categorical.cat1`
- [x] 4.2 `AtletasList`: cores de nível substituídas por `categorical.cat1`, `semantic.warning`, `semantic.success`
- [x] 4.3 Auditoria e fix do restante: `ProvasProximasWidget`, `GraficoAdesaoWidget`, `AtletasFiltros`,
       `StravaStatusWidget`, `AssessmentInfoCard`, `TaxaAdesaoWidget`, `ResumoSemanalWidget`,
       `LoginPage`, `ProjecaoEvolutionChart`, `GerarProjecaoDialog`, `ProjecaoResultadoDialog`
       — lime não-canônico `#b1e92d` e rgba(177,233,45) substituídos por `primary[500]`

## 5. Athlete Shell — Alinhamento

- [x] 5.1 Auditoria concluída — telas do atleta (home, plan, reconciliação) corrigidas junto com seção 4.3
- [x] 5.2 Cores hardcoded `#b1e92d` (lime não-canônico) substituídas em todos os componentes do athlete shell
- [ ] 5.3 Validar coesão visual: alternar entre coach view e athlete view deve "parecer o mesmo produto"

---

> **Deferred para `standardize-coach-shell-ux`**: componentes `CoachAthleteAvatar`,
> `StatusBadge`, `WorkoutBlock` (calendar), telas `/coach/athletes`,
> `/coach/insights`, `/coach/calendar`, setup do Storybook, stories de edge
> cases e visual regression tests (Chromatic). Essas tasks dependem do coach
> shell que será construído naquela change.
