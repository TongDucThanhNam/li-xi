# Quiz template — design tokens and constraints

Stage-2b template and the FIRST authoritative multi-step gameplay contract.
Documented BEFORE implementation (like `docs/design-scratch-card.md` and
`docs/design-slot-reveal.md`). Follows `docs/design_system.md`,
`docs/admin-design-system.md` and the project HeroUI skills; every class is
prefixed `quiz-` so this skin never collides with draw.css, `wheel-*`,
`scratch-*`, `slot-*` or the admin HeroUI layers.

## Identity

- Template id: `quiz` (registered in `gameTemplateIds`).
- Public route: `/p` (public-self-serve).
- Fonts: Be Vietnam Pro (text) + Baloo 2 (display) — the registered
  wheel-era pairing gives the quiz a friendly branded voice without new
  font downloads beyond one stylesheet already used by the route family.
- Station mode: `public-self-serve`. A quiz is a free branded
  knowledge/thank-you game: no stake, no entry fee.

## Bounded configuration (one correct choice per question)

- 1–20 ordered questions; each question has 2–6 text choices (1–80 chars)
  and exactly one correct index; optional per-question explanation
  (bounded), shown ONLY in the post-completion answer review.
- `passCount`: integer within `[1, questions.length]` — the passing
  threshold. No timer anywhere.

## Private vs public halves (privacy contract)

- PRIVATE (frozen at admission in `rulesSnapshot.quiz`, server-only):
  `correctIndex` and `explanation` per question plus the pass rule.
  NEVER projected through entry, public snapshot, action responses,
  recovery, SSR or saved summaries before completion.
- PUBLIC (projected through the capability-authorized snapshot half):
  per-question `prompt` + `choices` (the participant must see them to
  answer) and `passCount`. No correct index, no explanation.
- The answer review (correct choice + explanation per answered question)
  is projected ONLY by the capability-authorized quiz-state query AFTER
  the session has completed.

## Multi-step action contract (typed, idempotent)

- One answer action: `{ type: "quiz-answer", questionIndex, choiceIndex,
  revision }` where `revision` is the client's count of already-accepted
  answers (0 for the first). Server semantics:
  - NEW answer: `revision === answeredCount` and `questionIndex` equals the
    current index and the choice exists → append and return the progressed
    step state.
  - RETRY (lost response): `revision === answeredCount - 1` and the pair
    matches the LAST recorded answer → return the current state unchanged
    (never advances twice).
  - Anything else (skipping ahead, stale/conflicting revision, replay of an
    older answer, invalid choice) → rejected with a clear Vietnamese error.
  - Convex serialization makes overlapping submissions safe: the second
    identical submission becomes a retry; a conflicting one is rejected.
- Typed action result: `{ status: "in-progress", step } |
  { status: "completed", outcome }`. Compatibility adapters keep the four
  immediate templates on the existing `onPlay → outcome` contract; only the
  quiz stage consumes `onPlayStep`.
- Intermediate answers create NO outcome, NO completion, NO quota/stock
  change. Grading happens exactly once when the last question is answered:
  the server recomputes the score from the frozen private key; a PASS makes
  the participant reward-ELIGIBLE under the frozen policy (atomic
  allocation, exactly-once); a FAIL or an engagement-only game completes
  with a truthful no-reward outcome and consumes nothing.

## Persistence and recovery

- `playSessions.quizProgress.answers` (bounded ≤ question count) persists
  bounded progression; reload mid-quiz recovers via the capability-bound
  `getPublicQuizState` query (current index, answered count — never keys).
- Stale replies cannot overwrite newer progress: the stage adopts only
  step responses whose `answeredCount` is at least its own.
- Action caches and reactive reads bind to the exact session capability;
  sibling/foreign sessions can never grade or read another participant's
  quiz.

## Stage presentation

- Ready intro (`quiz-ready`): one card with the question count, the pass
  rule ("cần đúng ít nhất {passCount} câu") and exactly ONE start CTA
  labelled from `publicCopy.startCtaLabel`. Recovered sessions skip it —
  stored progress (`answeredCount > 0`) resumes at the current question and
  a completed capability opens the result directly.
- Between questions the stage gives ONLY neutral feedback (selected choice
  flashes the accent plus a textual "Đang ghi nhận câu trả lời…"
  acknowledgment). Correctness, correct choices and explanations never
  appear before completion — they are server-private halves.
- The result screen states the score against the frozen threshold:
  "Bạn đúng {score}/{total} câu" plus "— đạt yêu cầu!" on a pass or the
  exact requirement ("cần đúng ít nhất {passCount}/{total} câu") on a fail.

## Asset slots

Registered campaign-game asset slots (declared in `app/game-templates/registry.ts`,
uploaded through the generalized game-editor assets panel). Slot images are
PRESENTATION ONLY: resolved live as renderable R2 URLs at read time (same
trust level as the campaign hero), never frozen into `rulesSnapshot`, and
never a grading/eligibility signal.

### `game-quiz-backdrop` — backdrop image

- **Purpose**: give the quiz stage (and its pre-session entry hero) the
  campaign's own full-bleed backdrop instead of the flat `--quiz-bg` token.
- **Aspect ratio**: 16:9 landscape (at least 1280×720 recommended); rendered
  `background-size: cover; background-position: center`, cropped on any
  viewport with no layout shift.
- **Max size**: 8 MB. Types: JPG, PNG, WebP, GIF, AVIF (shared campaign asset
  policy, `lib/assetPolicy.ts`).
- **Placement**: the existing dimmed background layer of `QuizEntryHero` and
  `QuizStage` (`.quiz-stage` full-bleed, `mix-blend-screen`, unchanged
  opacity). The backdrop slot image takes precedence over the campaign hero
  image on these two surfaces only; every other template surface is
  untouched.
- **Fallback**: without a backdrop slot the hero/dim layer renders exactly as
  today (campaign hero when present, flat token background otherwise) —
  existing guest snapshots must keep matching.
- **Constraint**: text contrast keeps relying on the same dimming layer; the
  image must not brighten the stage beyond the current hero treatment.

## Tokens (quiz.css, @theme)

- `--quiz-bg`: #12203a stage backdrop; `--quiz-bg-deep`: #0c1626.
- `--quiz-ink`: #f2f7ff; `--quiz-ink-soft`: rgba(242,247,255,0.75).
- `--quiz-accent`: #4f7cff (choice/progress accent); `--quiz-accent-deep`:
  #2c4bbf; `--quiz-pass`: #2ec4b6; `--quiz-fail`: #ef476f.
- `--quiz-fail-soft`: #ff8fa3 — lightened fail tone reserved for error text
  (`quiz-error`) so messages stay readable on the dark stage without using
  the full-saturation fail color as body text.
- Choice cards: dark surface, 1px line border, focus-visible ring; selected
  answers flash the accent before advancing (skipped under reduced motion).
- Progress: `quiz-progress__bar` fill (width %) — decorative, plus a
  textual "Câu X/Y" for screen readers.
- All classes prefixed `quiz-`; Be Vietnam Pro body, Baloo 2 display.

## Constraints

- No allocation on page view, admission or intermediate answers; exactly
  ONE grading per session; claim privacy preserved (voucher codes only
  after claim); atomic allocation with aggregates/metrics recorded at the
  real completion time; frozen admission snapshot survives live edits;
  long text wraps (`overflow-wrap: anywhere`); controls are keyboard
  reachable with visible focus; reduced motion removes the flash/advance
  animation only — progression itself never depends on motion.