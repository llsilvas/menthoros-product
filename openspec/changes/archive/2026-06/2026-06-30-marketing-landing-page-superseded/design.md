## Context

Menthoros is a React + TypeScript dashboard product for endurance coaching and athlete management. The current `HomePage` is only a minimal welcome screen and does not communicate the product's strengths.

This change introduces a proper landing page that explains what Menthoros does, why it is valuable, and how it helps coaches and athletes operate better. The page should feel more premium and persuasive than the dashboard interior, while still belonging to the same product family.

## Goals / Non-Goals

**Goals**

- Present Menthoros as a complete coaching and athlete-performance platform
- Highlight the product's strongest capabilities in a clear narrative
- Create a high-quality first impression on both desktop and mobile
- Reuse the Menthoros identity without copying the dashboard layout literally
- Guide users toward the primary product entry point

**Non-Goals**

- Building a CMS or editable marketing system
- Adding lead-capture backend integration
- Creating a full public marketing site with multi-page navigation
- Replacing authenticated dashboard pages

## Content Structure

The landing page should be composed of these sections:

### 1. Hero

The hero must communicate:

- the product name: Menthoros
- a strong positioning statement
- a short supporting paragraph
- primary CTA
- optional secondary CTA

Recommended positioning direction:

- Menthoros helps coaches centralize athlete data, build smarter plans, monitor execution, and prepare athletes for key races with more clarity and less operational friction.

### 2. Product Strengths

A dedicated section should communicate the strongest product qualities, such as:

- athlete management in one place
- training plan organization
- workout structure and execution visibility
- race planning and target-event tracking
- coaching-oriented monitoring and decision support

These can be rendered as feature cards or a benefit grid.

### 3. Workflow / Product Narrative

The page should explain how Menthoros supports the training lifecycle:

1. organize athletes
2. define goals and availability
3. generate or manage plans
4. inspect workout details and execution
5. prepare for target races

This section should make the product feel cohesive rather than a list of isolated modules.

### 4. Differentiation / Value

The landing page should explicitly communicate why Menthoros is strong:

- built for endurance coaching
- combines planning and execution visibility
- reduces fragmentation across athletes, plans, workouts, and races
- gives coaches a clearer operational view

### 5. Final CTA

End with a strong CTA section encouraging entry into the product flow.

Default CTA direction:

- primary: go to login / app entry
- secondary: optionally revisit feature sections or dashboard preview areas

## Visual Direction

### Overall look

- Use the Menthoros dark blue + lime identity as the base
- Landing page should feel intentional, premium, and modern
- Avoid glass-heavy admin-style composition from internal dialogs
- Prefer strong section rhythm, clear typography hierarchy, and bold spacing

### Typography

- Use expressive heading styling aligned with current Menthoros branding
- Body copy should stay readable and concise
- Mobile typography must scale down without feeling cramped

### Layout

- Desktop: wide hero, multi-column feature sections, clear alternation of dense and open sections
- Mobile: stacked layout, generous spacing, full-width CTA buttons when appropriate

### Components

Likely visual building blocks:

- hero section
- highlight cards
- feature grid
- metrics/value strip
- CTA banner

## Interaction Decisions

- The landing page is content-first, not app-like
- Primary CTA should navigate into the app entry flow
- The page should not depend on hover-only interactions for key content
- Motion, if used, should be lightweight and supportive only

## Risks / Trade-offs

- **Too dashboard-like**: The page could feel like an internal tool instead of a product landing page. Mitigation: stronger narrative hierarchy, larger typography, and more deliberate section design.
- **Too generic**: A bland SaaS layout would undersell Menthoros. Mitigation: write copy specifically around coaching, athletes, plans, workouts, and races.
- **Too dense on mobile**: Feature-heavy pages can become exhausting on small screens. Mitigation: compress copy and keep sections visually distinct.

## Migration Plan

1. Replace the current placeholder home content
2. Introduce the full landing page structure in `HomePage`
3. Reuse current theme tokens and routing constants where appropriate
4. Validate layout quality on desktop and mobile

## Open Questions Resolved

- The landing page should talk about the full product, not only athlete management
- The page should emphasize strengths and product quality, not technical implementation details
- The route remains `/`
