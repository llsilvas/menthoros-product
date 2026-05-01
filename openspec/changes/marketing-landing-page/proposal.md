## Why

The current Menthoros home page is only a placeholder with a short welcome message. It does not communicate the product's value, differentiation, or breadth of capabilities to coaches, athletes, or prospective users.

Menthoros needs a proper landing page that explains the platform, highlights its strongest product benefits, and presents the app as a premium training and coaching system rather than a raw internal dashboard.

## What Changes

- Replace the current placeholder home page with a structured marketing landing page for Menthoros
- Present the main product strengths, including athlete management, training plans, workout detail, race planning, and coaching visibility
- Define a public-facing page structure with clear value proposition, feature sections, trust/value statements, and action prompts
- Reuse the Menthoros visual identity already established in the dashboard while adapting it for a more promotional page
- Ensure the landing page works well on desktop and mobile

## Capabilities

### New Capabilities

- `marketing-landing-page`: Public-facing landing page that presents Menthoros positioning, feature highlights, and conversion-oriented entry points

### Modified Capabilities

- `home`: The current home route (`/`) changes from placeholder content to a complete product landing experience

## Impact

- **UI**: `src/pages/home/HomePage.tsx` will be redesigned as a full landing page
- **Content**: Requires curated copy blocks for hero, product benefits, feature highlights, and CTA sections
- **Navigation**: Landing page should remain compatible with the current application shell and future authentication flow
- **Design system**: Must reuse Menthoros colors, typography, and card language without feeling like an internal admin screen

## Assumptions

- The landing page is informational and does not require backend changes
- The first version will focus on product storytelling and CTA entry points, not lead capture forms
- The primary CTA can point to the app entry flow already defined in the product (`/auth/login` or equivalent future route)
