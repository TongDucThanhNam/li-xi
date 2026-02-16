# AGENTS Instructions

## UI Design System
- All UI/UX work must follow `design_system.md`.
- Do not introduce new colors, fonts, or component styles that conflict with the design system.
- If a new UI pattern is needed, update `design_system.md` before implementation.

## Application Flow
1. Host login/register.
2. Host setup budget (if not completed).
3. Host creates a new draw session by entering guest name + host PIN.
4. Guest screen starts at hero (Summon Luck).
5. Guest picks an envelope from the grid.
6. Result modal shows winnings.
7. After Collect, return to guest start screen waiting for the next session.
