# AGENTS Instructions

## Product Direction
- Treat this as a SaaS prize-draw platform, not only a one-off Tet li xi app.
- The Tet/lunar theme is the default campaign skin, but backend naming and new business logic should allow brand campaigns, prize draws, uploaded campaign assets, public claim links, billing, and analytics.
- Keep the end-user draw screen visually premium. Backend standardization must not flatten the guest experience.

## UI Design System
- All UI/UX work must follow `design_system.md`.
- Do not introduce new colors, fonts, or component styles that conflict with the design system.
- If a new UI pattern is needed, update `design_system.md` before implementation.

## Backend Direction
- New authentication work should move toward Convex Auth with Google OAuth.
- Keep legacy username/PIN behavior only as a migration bridge. Do not expand the legacy auth model unless it directly supports migration.
- Host PIN remains a separate operational guard for creating an in-person draw session.
- Prefer Convex-side authorization helpers over trusting client-supplied owner IDs.
- Prefer Convex Components where they fit the SaaS roadmap:
  - Aggregate for leaderboard/count/sum reads.
  - Sharded Counter for high-write campaign metrics.
  - Cloudflare R2 for uploaded brand/campaign assets.
  - Polar for plans, subscriptions, and billing state.

## Frontend Direction
- The target frontend runtime is TanStack Start, not Next.js.
- During migration, map Next App Router files to TanStack file routes (`page.tsx` -> route file, `layout.tsx` -> `__root.tsx`) and replace `next/navigation` with TanStack Router navigation.
- Use `VITE_` public environment variables in frontend code; do not add new `NEXT_PUBLIC_` runtime fallbacks.

## Application Flow
1. Host logs in or registers through Google OAuth. Legacy username/PIN account auth is only a migration bridge.
2. Host completes budget/PIN setup if needed, then configures campaigns in Campaign Studio before creating draws.
3. Host creates either a station draw session or a public claim link by entering guest name + host PIN.
4. Station guest screens and public claim links both start at the premium hero (Summon Luck).
5. Guest picks an envelope from the grid.
6. Result modal shows winnings and campaign-specific collect copy when available.
7. After Collect, station mode returns to the guest start screen waiting for the next session; public claim mode exits the completed claim flow.
