# AGENTS Instructions

## Product Direction
- Treat this as a marketing game campaign platform for brands, agencies, and campaign operators, not as a SaaS prize-draw app and not as a one-off Tet li xi tool.
- A campaign is a marketing activation. A game is the interactive customer-facing experience inside that campaign.
- The current li xi envelope flow is only the first game template. The platform must support additional game templates such as lucky wheel, raffle draw, scratch card, quiz, slot-style reveal, memory match, and other branded thank-you games.
- Each game template should be able to own its rules, configuration schema, visual assets, CSS/theme layer, guest flow, reward strategy, and analytics events.
- Backend naming and new business logic should move toward campaign/game/play-session/reward terminology. Existing draw/redemption/public-claim names are legacy implementation details and should not be expanded unless the work is specifically about the current li xi template or migration.
- Public participant journeys should be play-first. Claiming or collecting a reward is an optional result of a game, not the whole product.
- Keep the end-user game screen visually premium. Platform standardization must not flatten the guest experience or force every game into the li xi envelope interaction.

## UI Design System
- All UI/UX work must follow `design_system.md` and `docs/admin-design-system.md`.
- Do not introduce new colors, fonts, or component styles that conflict with the relevant design system.
- If a new game template needs its own visual language, document its tokens and constraints before implementation.
- Admin/workspace screens should stay utilitarian and campaign-operator focused; guest game screens can be richer, branded, and more immersive.

## Backend Direction
- New authentication work should move toward Convex Auth with Google OAuth.
- Keep legacy username/PIN behavior only as a migration bridge. Do not expand the legacy auth model unless it directly supports migration.
- Host PIN remains a separate operational guard for station-mode game operations and other in-person host actions.
- Prefer Convex-side authorization helpers over trusting client-supplied owner IDs.
- Prefer Convex Components where they fit the platform roadmap:
  - Aggregate for leaderboard/count/sum reads.
  - Sharded Counter for high-write campaign/game metrics.
  - Cloudflare R2 for uploaded brand/campaign/game assets.
  - Polar for plans, subscriptions, and billing state.
- Target domain model for new work: campaigns, game templates, campaign games/game instances, play sessions, participants, reward outcomes/claims, share links, and analytics events.
- Do not add new draw-specific backend concepts for features that should apply to all games. Isolate draw/envelope logic inside the li xi game template boundary.

## Frontend Direction
- The target frontend runtime is TanStack Start, not Next.js.
- During migration, map Next App Router files to TanStack file routes (`page.tsx` -> route file, `layout.tsx` -> `__root.tsx`) and replace `next/navigation` with TanStack Router navigation.
- Use `VITE_` public environment variables in frontend code; do not add new `NEXT_PUBLIC_` runtime fallbacks.
- Game templates should be registered through a real template registry: game id, display name, route/stage component, CSS URL, fonts, config editor, preview, reward/result UI, and analytics labels.
- Current `/draw` and `/claim/<publicCode>` routes are transitional li xi/draw surfaces. New participant surfaces should move toward play-oriented routes and copy.

## Application Flow
1. Host logs in or registers through Google OAuth. Legacy username/PIN account auth is only a migration bridge.
2. Host creates a marketing campaign in Campaign Studio, including brand identity, assets, audience/channel intent, and one or more game experiences.
3. Host selects a game template such as li xi envelope draw, lucky wheel, raffle draw, scratch card, quiz, or another branded game.
4. Host configures game rules, reward inventory or reward logic, participant eligibility, visual style/assets, station mode, public play link, and operational PIN requirements.
5. Participant opens the public play link, QR link, or station screen and starts from the premium game hero.
6. Participant plays the selected game according to that template's mechanics.
7. The game records a play session and, when applicable, a reward outcome/claim with campaign-specific collect copy.
8. Station mode returns to a waiting/play-start state for the next participant; public play mode exits the completed game/claim flow.
9. Campaign dashboard reports performance by campaign and game: opens, starts, completions, reward outcomes, claims, conversion, and channel/share performance.
