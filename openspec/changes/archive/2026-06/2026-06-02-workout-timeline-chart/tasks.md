## 1. Design System — Zone Tokens

- [x] 1.1 Add `zone` color palette to `tailwind.config.ts` using the Menthoros dashboard palette: Z1 `#c8cdd4` (gray), Z2 `#b3ff00` (green), Z3 `#3498db` (blue), Z4 `#f39c12` (orange), Z5 `#e74c3c` (red)

## 2. Data Model & Utilities

- [x] 2.1 Define `WorkoutBlock` type in `src/components/features/planos/WorkoutTimelineChart/types.ts` with fields: `id`, `label`, `shortLabel?`, `durationMin`, `zone` (Z1–Z5), `colorClass`, `description?`, `icon?`
- [x] 2.2 Create `toWorkoutBlocks()` utility that maps existing workout step data to `WorkoutBlock[]`, defaulting missing zone to Z1

## 3. WorkoutTimelineChart Component

- [x] 3.1 Create `src/components/features/planos/WorkoutTimelineChart/WorkoutTimelineChart.tsx` as a white dashboard card (`bg-white border border-[#d1d5db] rounded-[10px] p-4`) on the `#e8eaed` content background — no dark backgrounds or gradient overlays
- [x] 3.2 Render card header using the `.card-hdr` pattern: uppercase 11px Syne title on the left, zone chip badge on the right
- [x] 3.3 Implement `zoneHeight` mapping (Z1 `h-12` → Z5 `h-32`) so bar height reflects intensity within the card
- [x] 3.4 Implement `zoneFill` and `zoneBorder` color maps using the dashboard palette (Z1 gray, Z2 `#b3ff00`, Z3 `#3498db`, Z4 `#f39c12`, Z5 `#e74c3c`) with 18% opacity fills and 1.5px solid borders
- [x] 3.5 Implement `zoneChip` badge class map reusing the dashboard chip pattern (`chip-g` for Z2, `chip-b` for Z3, `chip-a` for Z4, `chip-r` for Z5, gray for Z1)
- [x] 3.6 Implement `getIcon()` helper returning MUI icons (LocalFireDepartment/warmup, DirectionsRun/main, AcUnit/cooldown, Bolt/default)
- [x] 3.7 Implement `formatDuration()` utility using Space Mono rendering (e.g. `70` → `"1h10"`, `10` → `"10 min"`)
- [x] 3.8 Implement bar width calculation: `(block.durationMin / totalDurationMin) * 100` percent
- [x] 3.9 Implement label visibility rule: hide label text when bar width < 8% of container
- [x] 3.10 Implement tooltip on hover (useState for hovered block ID, absolute-positioned div with label, duration formatted with Space Mono, zone name)
- [x] 3.11 Render zone legend row below the timeline (same style as `.zone-bars` in the dashboard: `grid-cols-[64px_1fr_36px]`, muted labels, colored fills, percentage or duration on right)
- [x] 3.12 Render empty state placeholder when `blocks` is empty or total duration is 0 (muted text, matching `.page-sub` style)
- [x] 3.13 Export component from `src/components/features/planos/WorkoutTimelineChart/index.ts`

## 4. Integration

- [x] 4.1 Identify the existing workout detail / plan detail page that renders the step list
- [x] 4.2 Import `WorkoutTimelineChart` and render it above the existing step list, passing workout blocks derived from `toWorkoutBlocks()`
- [x] 4.3 Verify chart renders correctly with real workout data (including edge cases: single block, very short blocks)
