# Design-system audit index

This file exists as the machine-readable design snapshot entrypoint for the UX audit tool.
The authoritative rules remain in `docs/admin-design-system.md` for operator surfaces and
`design_system.md` for the Lunar Fortune li xi guest template.

Admin UI uses HeroUI semantic tokens (`background`, `surface`, `surface-secondary`,
`foreground`, `muted`, `border`, `success`, `warning`, and `danger`) and HeroUI components.
It must not introduce an application-specific palette. Guest li xi UI uses only the template
tokens `#5e0a0a`, `#b31414`, `#fff8dc`, `#d4af37`, `#050000`, and `#3e0000` with Cinzel
Decorative, Playfair Display, and Noto Serif. Admin and guest styling are isolated route domains.
