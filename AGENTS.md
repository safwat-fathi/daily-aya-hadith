# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A NestJS service that delivers locally stored, human-reviewed Islamic content (Quran ayahs,
hadiths, companion stories, blessing reminders) to Slack users via per-user direct message —
not per-channel. A user opts in with `/subscribe` in a DM to the bot; every scheduled or manual
send goes to that person's DM. There is no channel-subscription concept.

The full technical spec (product principles, functional requirements, DB design, API spec) is
[`PLAN.md`](./PLAN.md). Source comments cite it constantly as `PLAN.md §N.N` — when a comment
references a section, read that section before changing the surrounding code; it's the design
rationale, not decoration. **`README.md` and `PLAN.md` describe the state as of when they were
last edited and can lag the code** (e.g. README's "Known limitations" says the scheduler doesn't
exist, but `SchedulerModule` is wired into `app.module.ts`) — when in doubt, trust `src/` and
`prisma/schema.prisma` over prose.

## Commands

```bash
pnpm install           # Install dependencies
pnpm prisma:generate   # Generate the Prisma client (also runs automatically via prebuild)
pnpm db:migrate:dev    # Create and apply a dev migration after editing schema.prisma
pnpm db:migrate        # Apply committed migrations (production)
pnpm db:status         # Show migration status
pnpm prisma:validate   # Validate prisma/schema.prisma

pnpm build             # prisma generate + nest build
pnpm start:dev         # Start in watch mode
pnpm start             # Start the compiled app (dist/main.js)

pnpm lint              # ESLint, --max-warnings=0 (strict — no warnings tolerated)
pnpm format            # Prettier --write
pnpm format:check      # Prettier --check
```

There is **no test suite, test tooling, or test database** in this project (deliberate — see
README "Known limitations" and PLAN.md §17). Verify changes by building, linting, and exercising
the API directly (`pnpm start:dev`, curl/Swagger, or the `/api/v1/admin` UI). Never add a test
framework unless explicitly asked.

**Never use `prisma db push`** — every schema change needs a committed migration
(`pnpm db:migrate:dev`), committed alongside the code that depends on it.

## Architecture

### Two front doors, one guard model

Every route requires auth, but there are two independent mechanisms living side by side:

- **JSON admin API** (`/api/v1/*`) — protected by `AdminKeyGuard`, registered globally via
  `APP_GUARD` in `app.module.ts`. Callers send `X-Admin-Key: <ADMIN_API_KEY>`. Health probes
  (`/health/live`, `/health/ready`) are the only public, unprefixed exception, marked `@Public()`.
- **Server-rendered admin dashboard** (`src/admin-ui/`, views in `views/*.ejs`) — every
  controller in this module is `@Public()` (so it bypasses `AdminKeyGuard`, since HTML
  navigation/forms can't send a custom header) and instead protected by `AdminUiSessionGuard`,
  which checks an `express-session` flag set by `LoginController` after checking the same
  `ADMIN_API_KEY` value through the login form. Session state lives in Postgres via
  `connect-pg-simple` against the `Session` model (raw SQL, not Prisma — see
  `admin-ui.setup.ts`).

Both mechanisms ultimately trust `ADMIN_API_KEY`; they just carry it differently (header vs.
cookie-backed session). When adding an admin-ui route, mark it `@Public()` + guard with
`AdminUiSessionGuard`; when adding a JSON API route, do neither and let the global guard apply.

### Content lifecycle and review gate

`ContentItem` (`src/content/`) moves through `DRAFT → IN_REVIEW → APPROVED → ARCHIVED`, with
`REJECTED` as a dead-end back to `DRAFT`-like editability. Drafts are deliberately permissive
(every payload field optional, for partial saves); **approval is the strict validation gate**
(`content-validation.service.ts`), with per-type required fields (see README "Validation model").
A failed approval rolls back entirely — status, checksum, and audit trail untouched.

Approved content is never edited in place: `POST /content/:id/revise` creates a new `DRAFT` row
linked via `parentContentId` with an incremented `version`, preserving the original and its
delivery history (`@@unique([parentContentId, version])` plus a companion CHECK constraint pin
roots to version 1 — see the comment on `ContentItem` in `schema.prisma`).

`content-preview.service.ts` renders the exact Slack message for content in **any** status
without sending or persisting anything — this is the tool for eyeballing a draft (see README
"Rendering and preview" for the full renderer-guarantee list: byte-identical Arabic, no silent
truncation, split-not-truncate on Slack limits, `rendererVersion` per type).

### Delivery: two-level fan-out, per-subscriber retry

This is the core Phase 4 mechanism (`src/deliveries/`, `src/scheduler/`, `src/streams/`) and the
part most worth reading `schema.prisma`'s doc comments on before touching:

- **`DeliveryRun`** — one cycle: one content selection for one `ScheduleStream` on one calendar
  date (`@@unique([streamId, deliveryLocalDate])`). Rendered once, in both supported locales
  (`renderedText`/`renderedBlocks` for the stream's canonical locale, `renderedTextEn`/
  `renderedBlocksEn` for the other) and reused for every subscriber and every retry.
- **`ContentDelivery`** — one subscriber's copy of that run (`@@unique([runId, subscriberId])`),
  holding their own status/timestamp/retry state. This split is what makes retry per-person: one
  subscriber's permanent failure leaves everyone else `SENT`.

A cycle is keyed by **calendar date, not absolute time** — each subscriber is sent to at their
own local `sendTime` (`UserSubscriber.sendTime` override, else `ScheduleStream.sendTime`,
evaluated against `UserSubscriber.timezone`), so one `deliveryLocalDate` can span ~49 hours of
real time across timezones. `ScheduleStream.timezone` is display-only. `DeliveryOrchestratorService`
owns reservation/render/send/retry; `ContentSelectionService` owns picking the next item (default
strategy: least-recently-sent); `SchedulerService` ticks on a plain `setInterval` (not cron —
`SCHEDULER_INTERVAL_MINUTES` is a number) guarded by a Postgres advisory lock
(`SchedulerLockService`) so multiple processes can't double-tick. `/aya` and `/hadith` slash
commands bypass all of this and send immediately, outside any stream's cycle.

### Slack integration

- **Socket Mode** (`SlackEventsService`, `src/slack-events/`) — outbound WebSocket, no public URL
  needed. Handles `/subscribe`, `/unsubscribe`, `/settings`, `/aya`, `/hadith`, plain-text DM
  `subscribe`/`unsubscribe`, and `app_uninstalled`. Skipped entirely (with a one-time warning) if
  `SLACK_APP_TOKEN` is unset — everything else keeps working.
- **OAuth install** (`src/slack-oauth/`) — `/api/v1/slack/install` → Slack →
  `/api/v1/slack/oauth/callback` creates the `SlackWorkspace` row, encrypts the bot token
  (`TokenCipherService`, AES-256-GCM via `SLACK_TOKEN_ENCRYPTION_KEY`), and auto-provisions a
  default `DAILY`/`AYAH` stream. There is no env-var bot token — every workspace's token is
  resolved per-call from its encrypted DB row (`SlackClientFactory`).
- **Rendering** (`src/slack/renderers/`) — one renderer per content type
  (`ayah.renderer.ts`, `hadith.renderer.ts`, `companion-story.renderer.ts`,
  `blessing-reminder.renderer.ts`), each versioned (`rendererVersion`) and orchestrated by
  `slack-block.renderer.ts`. Religious text always lands in its own block with no surrounding
  mrkdwn markers, so literal `*`/`_` in stored Arabic can't alter formatting.
- **Errors** are normalized through `slack-error.mapper.ts` into the app's own error codes
  (`SLACK_NOT_CONFIGURED`, `SLACK_TOKEN_INVALID`, etc. — see README's Slack error code table).
  Slack's own error text is never forwarded to callers, since Slack error payloads can echo
  request contents.
- **Workspace purge** (`src/workspace-purge/`) — a separate scheduled sweep (same
  setInterval + advisory-lock pattern as `SchedulerService`) that hard-deletes a `SlackWorkspace`
  (cascading everything) `WORKSPACE_PURGE_GRACE_DAYS` after `app_uninstalled` fires, fulfilling
  the privacy-policy purge commitment. Enabled by default, unlike the delivery scheduler.

### Content import (admin-triggered only)

`src/quran-foundation/` and `src/hadith-api/` pull content from external APIs
(Quran.Foundation OAuth API; hadithapi.com) and create it as `DRAFT` `ContentItem`s through the
normal `ContentService.create()` path — nothing here bypasses validation or auto-approves.
**Never wire either client into the scheduler/delivery path** — they're import-only, used from
`QuranImportController`/`HadithImportController` and the admin-ui import screens
(`views/quran-import/`, `views/hadith-import/`). Each keeps a singleton cursor row
(`QuranImportCursor`, `HadithImportCursor`) to resume sequential imports across runs.

### Shared infra

- **`common/clock/`** — all "now" access goes through the injectable `Clock` (`CLOCK` token), not
  `Date.now()`/`new Date()` directly, so `CLOCK_OFFSET_SECONDS` can shift time in dev/test.
  Production startup fails if this is non-zero (enforced in `env.validation.ts`, since a runtime
  check "can be missed").
- **`common/filters/all-exceptions.filter.ts`** — normalizes every error response to
  `{ statusCode, code, message, details?, requestId }`.
- **`config/env.validation.ts`** — single source of truth for every env var, validated via Joi at
  startup (`Joi.unknown(true)` — unrecognized vars are ignored, not rejected). Read this file
  rather than `.env.example` when you need to know what's actually required vs. optional and why.
- **Audit trail** (`src/audit/`) — immutable `AuditEvent` rows written by services (content
  review actions, workspace changes, purges), queryable via `GET /audit-events`.
- **`src/generated/prisma/`** is generated output (git-ignored source of truth is
  `prisma/schema.prisma`) — never hand-edit it; run `pnpm prisma:generate` after schema changes.

## Conventions worth preserving

- Doc comments in `schema.prisma` and service headers explain **why**, often citing `PLAN.md §`
  or a specific constraint (e.g. why a unique index exists, why a field is nullable). When adding
  a field or table, match that style — a future reader (agent or human) needs the reasoning, not
  a restatement of the type.
- ESLint is strict: `no-explicit-any`, `no-floating-promises`, `no-misused-promises`, and explicit
  function return types are all `error`-level with zero warnings tolerated (`--max-warnings=0`).
- Error codes are domain-specific string constants (`*.errors.ts` per module, e.g.
  `content.errors.ts`, `slack.errors.ts`, `workspaces.errors.ts`) mapped to HTTP status — follow
  the existing per-module pattern rather than throwing raw Nest exceptions from services.
