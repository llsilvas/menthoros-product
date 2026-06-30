## ADDED Requirements

### Requirement: Replace the placeholder home page with a product landing page
The system SHALL render a complete landing page on the home route (`/`) instead of the current placeholder welcome content.

#### Scenario: Home route renders landing page
- **WHEN** a user opens the home route `/`
- **THEN** the frontend MUST render a structured Menthoros landing page
- **AND** it MUST NOT render only the placeholder welcome text currently used

---

### Requirement: Present the Menthoros value proposition prominently
The system SHALL render a hero section that communicates what Menthoros is and why it is valuable for coaches and athletes.

#### Scenario: Hero communicates product identity
- **WHEN** the landing page loads
- **THEN** the page MUST display the Menthoros name
- **AND** it MUST display a headline describing the product value proposition
- **AND** it MUST display supporting copy explaining the platform succinctly

#### Scenario: Hero provides a primary CTA
- **WHEN** the hero section renders
- **THEN** it MUST include a primary call-to-action leading the user toward the main product entry flow

---

### Requirement: Highlight core product strengths
The system SHALL present the strongest capabilities of Menthoros in dedicated feature or benefit sections.

#### Scenario: Product strengths include core modules
- **WHEN** the landing page renders its feature content
- **THEN** it MUST highlight athlete management
- **AND** it MUST highlight training plans
- **AND** it MUST highlight workout visibility or execution tracking
- **AND** it MUST highlight race planning or target-event preparation

#### Scenario: Strengths are understandable without product context
- **WHEN** a first-time visitor reads the feature section
- **THEN** the content MUST explain benefits in product language rather than internal implementation detail

---

### Requirement: Explain the Menthoros workflow as a cohesive system
The system SHALL present Menthoros as an integrated coaching workflow rather than disconnected screens.

#### Scenario: Workflow narrative is visible
- **WHEN** the user scrolls through the landing page
- **THEN** the page MUST include a section describing how athletes, plans, workouts, and races connect in a single flow

---

### Requirement: Include a final conversion-oriented CTA section
The system SHALL conclude with a section that encourages the user to proceed into the product.

#### Scenario: Final CTA is present
- **WHEN** the user reaches the lower portion of the landing page
- **THEN** the page MUST display a clear concluding CTA
- **AND** it MUST reinforce the product's strengths or intended audience

---

### Requirement: Follow Menthoros visual identity with a public-facing layout
The system SHALL use the Menthoros design language while presenting a more promotional and premium experience than the internal dashboard pages.

#### Scenario: Landing page matches Menthoros branding
- **WHEN** the landing page is rendered
- **THEN** it MUST use Menthoros-aligned colors, typography, and section styling
- **AND** it MUST feel visually consistent with the product brand

#### Scenario: Landing page is not an admin placeholder
- **WHEN** the page is viewed
- **THEN** it MUST feel like a product landing page
- **AND** it MUST NOT read like a bare internal dashboard placeholder

---

### Requirement: Support desktop and mobile layouts
The system SHALL render the landing page responsively on both desktop and mobile screens.

#### Scenario: Desktop layout supports multiple sections comfortably
- **WHEN** the landing page is viewed on desktop
- **THEN** key sections MAY use multi-column layout
- **AND** the page MUST maintain strong visual hierarchy and readability

#### Scenario: Mobile layout remains readable and tappable
- **WHEN** the landing page is viewed on mobile
- **THEN** sections MUST stack vertically
- **AND** copy MUST remain legible
- **AND** CTA buttons MUST remain easy to tap
