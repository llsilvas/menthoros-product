## Why

The current workout plan view presents training steps as a flat list, making it impossible to grasp pacing, intensity distribution, and overall load at a glance. A timeline-based bar chart visualization — standard in premium fitness tools like TrainingPeaks and intervals.icu — gives coaches and athletes an immediate, intuitive reading of workout structure and intensity zones.

## What Changes

- Introduce a new `WorkoutTimelineChart` component that renders workout blocks as horizontal bars on a time axis
- Each bar's width maps to duration; color maps to training zone (Z1–Z5)
- Replace (or augment) the current step-list view in workout/plan detail screens with the timeline chart
- Add a `WorkoutBlock` data model normalizing step data into `{ start, duration, zone, label }` entries
- Add zone color tokens to the design system (Z1 purple → Z5 red)

## Capabilities

### New Capabilities

- `workout-timeline-chart`: Interactive horizontal timeline chart showing workout blocks by duration and intensity zone, with tooltips and zone legend

### Modified Capabilities

<!-- none -->

## Impact

- **Components**: New `WorkoutTimelineChart` component; existing workout detail/plan pages updated to render it
- **Data**: Requires mapping existing workout step data to `WorkoutBlock[]` format
- **Design tokens**: New zone palette (5 colors) added to Tailwind config
- **Dependencies**: No new external libraries required (pure React + CSS)
