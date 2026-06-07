## ADDED Requirements

### Requirement: Render workout blocks as a horizontal timeline
The system SHALL render a `WorkoutTimelineChart` component that displays workout steps as contiguous horizontal bars on a single time axis, where each bar's width is proportional to its duration relative to the total session duration.

#### Scenario: Bars fill the full timeline width
- **WHEN** the component receives a list of workout steps covering a total session duration
- **THEN** all bars together MUST span exactly 100% of the chart container width with no gaps or overlaps

#### Scenario: Bar width reflects duration
- **WHEN** two blocks have durations of 10 min and 20 min in a 30-min session
- **THEN** the first bar MUST occupy 33% of the container width and the second 67%

---

### Requirement: Color-code bars by intensity zone
The system SHALL color each bar using the Menthoros zone palette (Z1–Z5), where Z1 is muted gray (#c8cdd4), Z2 is Menthoros green (#b3ff00), Z3 is blue (#3498db), Z4 is orange/warning (#f39c12), and Z5 is red (#e74c3c). Bar fills MUST use 18% opacity with a 1.5px solid border matching the dashboard bar chart pattern.

#### Scenario: Zone color applied correctly
- **WHEN** a block has `zone: 3`
- **THEN** the bar MUST render with the Z3 green token

#### Scenario: Missing zone defaults to Z1
- **WHEN** a block has no zone information
- **THEN** the bar MUST render with the Z1 violet token

---

### Requirement: Display block label inside the bar
The system SHALL render the block's label text inside its bar when the bar is wide enough to contain it legibly.

#### Scenario: Label shown when bar is wide
- **WHEN** a bar occupies more than 8% of the total chart width
- **THEN** the label text MUST be visible inside the bar

#### Scenario: Label hidden on narrow bars
- **WHEN** a bar occupies 8% or less of the total chart width
- **THEN** the label text MUST be hidden (not truncated, not overflowing)

---

### Requirement: Show block detail tooltip on hover
The system SHALL display a tooltip when the user hovers over a bar, containing: block label, duration (formatted as mm:ss or h:mm), and zone name.

#### Scenario: Tooltip appears on hover
- **WHEN** the user hovers the mouse over a bar
- **THEN** a tooltip MUST appear with the block label, duration, and zone (e.g. "Zone 3 — Aerobic")

#### Scenario: Tooltip disappears on mouse-out
- **WHEN** the user moves the mouse away from the bar
- **THEN** the tooltip MUST no longer be visible

---

### Requirement: Display a zone legend below the chart
The system SHALL render a zone legend beneath the timeline listing all zones present in the current workout, showing the zone color swatch, zone number, and a descriptive name.

#### Scenario: Legend shows only active zones
- **WHEN** the workout uses only Z2 and Z4
- **THEN** the legend MUST show only Z2 and Z4 entries (not Z1, Z3, Z5)

#### Scenario: Legend entry format
- **WHEN** the legend renders a zone entry
- **THEN** each entry MUST show a color swatch, "Zone N", and a human-readable name (e.g. "Zone 2 — Easy Endurance")

---

### Requirement: Follow the Menthoros dashboard visual style
The system SHALL render `WorkoutTimelineChart` as a white card (`background: #fff; border: 1px solid #d1d5db; border-radius: 10px`) on the light content background (`#e8eaed`), consistent with existing dashboard cards. Titles MUST use the Syne font at 11px uppercase/tracking style (`.card-title`). Numeric values MUST use Space Mono. The component MUST NOT use a dark/glassmorphism background or gradient overlays.

#### Scenario: Card matches dashboard style
- **WHEN** the chart is rendered inside a workout detail page
- **THEN** it MUST visually match the card styling of other dashboard panels (white background, gray border, light content area)

---

### Requirement: Integrate into the workout/plan detail view
The system SHALL render `WorkoutTimelineChart` in the workout detail or plan detail screen, positioned above the existing step list.

#### Scenario: Chart visible on workout detail page
- **WHEN** a user opens a workout detail page that has steps with zone data
- **THEN** `WorkoutTimelineChart` MUST be rendered above the step list

#### Scenario: Graceful empty state
- **WHEN** a workout has no steps or steps with zero total duration
- **THEN** the chart area MUST render a placeholder message ("No workout blocks to display") instead of an empty bar container
