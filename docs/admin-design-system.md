# Admin Design System

Admin surfaces use HeroUI Pro for management workflows: Campaign Studio,
setup, leaderboard, billing, analytics, ops readiness, and future SaaS
workspace screens.

## Scope

- Use `@heroui-pro/react` for app shell, sidebar, navbar, data display, and
  advanced workflow components.
- Use `@heroui/react` for base controls such as `Button`, `Card`, `Input`,
  `Table`, `Alert`, `Chip`, `Label`, and `ProgressBar`.
- Do not use the Lunar Fortune red/gold theme for admin screens except inside a
  draw-preview surface that intentionally previews the guest experience.
- Keep `/draw` station mode and `/claim/$publicCode` on the custom draw
  template style system.

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
- Contextual tooling such as campaign preview, billing usage, readiness, recent
  assets, and route metadata should live in an `AppLayout` aside panel instead
  of competing with the main editor as another page column.
- When an aside is present, expose the built-in aside trigger from the navbar and
  allow the panel to become a sheet on tablet/mobile viewports.
- Tables, cards, alerts, and progress indicators should come from HeroUI rather
  than custom Tailwind-only components.
- Asset retry state in Campaign Studio should remain compact inside the upload
  area, use HeroUI feedback/actions, and avoid creating a separate decorative
  panel or toast.

## Current Migration State

- `/`, `/auth`, `/setup`, `/campaigns`, and `/leaderboard` load
  `app/styles/admin.css` and use the HeroUI Pro admin direction.
- `/draw` and `/claim/$publicCode` load the Lunar Fortune draw template CSS via
  the draw-template registry.
- Shared components used by both admin and draw surfaces must expose explicit
  variants rather than relying on the Lunar Fortune theme globally.
