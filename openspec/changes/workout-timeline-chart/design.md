## Context

Menthoros is a React + TypeScript frontend (Vite, Tailwind CSS) for a coaching/training platform. Workout plans currently display steps as a vertical list. Coaches and athletes need a visual timeline to quickly read training structure, intensity distribution, and session load — the standard in tools like TrainingPeaks and intervals.icu.

The change introduces `WorkoutTimelineChart`, a pure-frontend component. No backend changes are required: all data is available via existing workout step structures; the component normalises it client-side.

**Design system reference:** The component lives inside the Menthoros dashboard layout (light `#e8eaed` main content area). It must use the same card styling, typography, and zone color palette already established in the dashboard — not a standalone dark/glassmorphism style. Key tokens:

| Token | Value | Usage |
|---|---|---|
| `--m-bg` | `#0d1b2a` | Sidebar / topbar only |
| `--m-content` | `#e8eaed` | Main content background |
| `--m-card` | `#ffffff` | Card background |
| `--m-border` | `#d1d5db` | Card borders |
| `--m-green` | `#b3ff00` | Primary accent (Z2) |
| `--m-warn` | `#f39c12` | Warning / Z4 |
| `--m-red` | `#e74c3c` | Danger / Z5 |
| `--m-blue` | `#3498db` | Info / Z3 |
| `--m-muted` | `#6b7a8d` | Secondary text |

Fonts: **Syne** (card titles/headings), **Space Mono** (numbers/monospace), **Inter** (body).

## Goals / Non-Goals

**Goals:**
- Render workout blocks as a horizontal bar chart where width = duration and color = intensity zone (Z1–Z5)
- Support tooltips with block detail (label, duration, zone) on hover
- Add a zone legend below the chart
- Define and apply zone color tokens consistently across the design system
- Integrate the chart into the existing workout detail / plan view

**Non-Goals:**
- Drag-to-edit interaction (future iteration)
- Zoom / pan (future iteration)
- AI-generated workout summary overlay (future iteration)
- Backend or API changes
- Support for non-zone-based intensity (e.g. raw watts display) in this iteration

## Decisions

### 1. No charting library — pure CSS/Flexbox

**Decision:** Implement the timeline as a `display: flex` container with proportionally-sized `div` bars, not a library like Recharts or Victory.

**Rationale:** The chart is conceptually simple (adjacent rectangles on a single axis). A library would add bundle weight, extra abstraction, and styling friction. Flexbox + Tailwind gives full control and matches the existing stack.

**Alternative considered:** Recharts `BarChart` — rejected due to over-engineering for a single-axis layout with no axes/ticks needed.

---

### 2. Data model: WorkoutBlock normalisation in the component

**Decision:** The parent page passes raw workout steps; `WorkoutTimelineChart` accepts a `steps` prop and normalises internally via a `toWorkoutBlocks()` utility.

**Rationale:** Keeps the data transformation co-located with the visual concern and avoids polluting the data layer with a UI-specific type. The `WorkoutBlock` type is local to the component folder.

```ts
type WorkoutBlock = {
  id: string;
  start: number;      // seconds from session start
  duration: number;   // seconds
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
};
```

---

### 3. Zone colors aligned with the Menthoros dashboard palette

**Decision:** Zone colors reuse the CSS variables and values already defined in the dashboard design system — not a generic fitness palette:

```
Z1 Recuperação  → #c8cdd4  (muted gray   — rest/recovery)
Z2 Base         → #b3ff00  (--m-green     — easy/aerobic)
Z3 Tempo        → #3498db  (--m-blue      — threshold/aerobic power)
Z4 Limiar       → #f39c12  (--m-warn      — lactate threshold)
Z5 VO2          → #e74c3c  (--m-red       — max effort)
```

Bar backgrounds use 18% opacity fills (`rgba(color, 0.18)`) with a solid `1.5px` border — exactly as done in `barChart` inside the dashboard. Zone pill badges reuse the `chip` pattern (`chip-g`, `chip-b`, `chip-a`, `chip-r`).

**Rationale:** Visual consistency with the existing zone distribution bars already visible on the athlete dashboard. A coach who understands Z2 = green on the load chart will immediately read the same color on the timeline.

---

### 4. Tooltip: CSS + state, no third-party tooltip library

**Decision:** Implement hover tooltip via local `useState` for hovered block ID + absolute-positioned `div`. No Radix/Floating UI for this component.

**Rationale:** Single use case; avoids portal complexity. Can be upgraded to Radix Tooltip later if needed.

## Risks / Trade-offs

- **Very short blocks (< 2% total)** → bar too narrow to display label. Mitigation: hide label text below a width threshold; show only on tooltip.
- **Missing zone data on some steps** → default to Z1 (lowest intensity) and log a warning. Mitigation: `toWorkoutBlocks()` validates and falls back gracefully.
- **Tailwind config change** → any existing classes named `zone-*` would conflict. Mitigation: audit config before merging; the palette key `zone` is unlikely to already exist.

## Migration Plan

1. Add zone tokens to `tailwind.config.ts`
2. Create `WorkoutTimelineChart` component and utility under `src/components/features/planos/` (or a shared `workout/` subfolder)
3. Integrate into the existing workout detail page (conditional render alongside or replacing the list)
4. No rollback complexity — feature is purely additive; old list can be toggled back via a prop if needed

## Open Questions

- Should the chart replace the step list entirely, or live as a tab/toggle alongside it? (Recommendation: start as a section above the list; hide list on mobile.)
- Is zone inferred from `%FTP`, `HR zone`, or an explicit `zone` field on workout steps? Clarify from API contract before implementing `toWorkoutBlocks()`.
