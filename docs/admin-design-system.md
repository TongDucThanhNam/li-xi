# Admin Design System

Admin surfaces use HeroUI Pro for management workflows: Campaign Studio,
game configuration, reward inventory, billing, analytics, ops readiness, and
future platform workspace screens.

## Scope

- Use `@heroui-pro/react` for app shell, sidebar, navbar, data display, and
  advanced workflow components.
- Use `@heroui/react` for base controls such as `Button`, `Card`, `Input`,
  `Table`, `Alert`, `Chip`, `Label`, and `ProgressBar`.
- Do not use the Lunar Fortune red/gold theme for admin screens except inside a
  game-preview surface that intentionally previews the guest experience.
- Keep canonical `/station/$campaignGameId` and `/play/$publicCode` on the
  custom game-template style system. `/draw` and `/claim/$publicCode` remain
  compatibility entries and must not own a second visual implementation.

## Styling

- Admin CSS lives in `app/styles/admin.css`.
- Shared reset/base CSS lives in `app/styles/base.css`.
- Import order must stay: `./base.css`, `@heroui/styles`,
  `@heroui-pro/react/css`.
- Prefer HeroUI semantic tokens: `bg-background`, `bg-surface`,
  `bg-surface-secondary`, `text-foreground`, `text-muted`, `border-border`,
  `text-success`, `text-warning`, and `text-danger`.
- Avoid introducing app-specific color palettes for management screens.

## Layout

- Use a persistent HeroUI Pro `AppLayout`/`Sidebar` shell for management pages.
- Put app branding in the sidebar, not repeated in every page header.
- Page content should use constrained width, generous top padding, and clear
  header/action grouping.
- Contextual tooling such as campaign/game preview, billing usage, readiness,
  recent assets, and route metadata should live in an `AppLayout` aside panel
  instead of competing with the main editor as another page column.
- When an aside is present, expose the built-in aside trigger from the navbar and
  allow the panel to become a sheet on tablet/mobile viewports.
- Tables, cards, alerts, and progress indicators should come from HeroUI rather
  than custom Tailwind-only components.
- Asset retry state in Campaign Studio should remain compact inside the upload
  area, use HeroUI feedback/actions, and avoid creating a separate decorative
  panel or toast.

## Current Route State

- The pathless authenticated workspace loads `app/styles/admin.css` once and
  owns campaign routes, `/analytics`, `/settings/*`, and `/operate/$campaignGameId`.
- `/station/$campaignGameId` and `/play/$publicCode` resolve CSS, fonts, stage,
  editor, and preview through the generalized game-template registry.
- `/setup`, `/draw`, `/leaderboard`, and `/claim/$publicCode` are compatibility
  routes that redirect or reuse canonical features.
- Shared components used by both admin and draw surfaces must expose explicit
  variants rather than relying on the Lunar Fortune theme globally.
