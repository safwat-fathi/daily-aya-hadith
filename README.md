# Slack Bot for Daily Aya & Hadith

NestJS service for delivering locally stored, human-reviewed Islamic content to Slack. The
implementation follows the phases in [`PLAN.md`](./PLAN.md).

This repository contains **Phases 1 to 3**, and Phase 4 is in progress:

- **Phase 1** — application configuration, structured logging, Prisma/PostgreSQL integration,
  the database schema, health probes, and global admin API-key protection.
- **Phase 2** — content CRUD, type-specific payload validation, structured source references,
  the review workflow (submit, approve, reject), revisioning, archiving, delivery-history
  reads, an administrative audit trail, and Swagger/OpenAPI documentation.
- **Phase 3** — Slack Block Kit renderers for all four content types, a preview endpoint,
  the Slack client provider, workspace token verification, normalized Slack error mapping,
  per-user subscribers, and a diagnostic connectivity endpoint.

Delivery is **per-user direct message, not per-channel**. There is no channel subscription
concept: a Slack user opts in by sending `/subscribe` (or the word "subscribe") to the bot in a
direct message, and every scheduled or manual send goes to that user's DM. This is a deliberate
pivot from an earlier channel-broadcast design; see [Subscriber model](#subscriber-model) below.

**Phase 4** has started with its schema slice: delivery is now modelled per subscriber rather
than per channel post, so duplicate prevention and retry work per person (see
[Delivery model](#delivery-model)). The scheduler, streams API, content selection, and the send
path that would populate those tables are still to come, so nothing is delivered automatically
yet — Slack posting today happens only through the diagnostic connectivity endpoint, which sends
a fixed message and never delivers content. The reviewed seed content library is Phase 5.

## Prerequisites

- Node.js 20.19 or newer supported LTS
- pnpm 10
- PostgreSQL 15 or newer

## Local setup

Install dependencies and create local configuration:

```bash
pnpm install
cp .env.example .env
```

Set a unique admin key of at least 32 characters:

```bash
openssl rand -hex 24
```

Create the development database, adjusting the PostgreSQL user and connection URL in `.env`
for your installation:

```bash
createdb slack_bot_aya_hadith_dev
```

Generate the Prisma client and apply migrations:

```bash
pnpm prisma:generate
pnpm db:migrate:dev
```

Start the application:

```bash
pnpm start:dev
```

## API

The admin API base path is `/api/v1`. Health probes are deliberately unprefixed and public:

```text
GET /health/live
GET /health/ready
```

All other routes require:

```http
X-Admin-Key: <ADMIN_API_KEY>
```

### Content

| Method  | Path                         | Description                                                        |
| ------- | ---------------------------- | ------------------------------------------------------------------ |
| `POST`  | `/content`                   | Create a draft                                                     |
| `GET`   | `/content`                   | List with `type`, `status`, `locale`, `search`, `sort`, pagination |
| `GET`   | `/content/:id`               | Content with sources and revision history                          |
| `PATCH` | `/content/:id`               | Edit a `DRAFT` or `REJECTED` item                                  |
| `POST`  | `/content/:id/submit-review` | `DRAFT` → `IN_REVIEW`                                              |
| `POST`  | `/content/:id/approve`       | `IN_REVIEW` → `APPROVED`, enforces approval validation             |
| `POST`  | `/content/:id/reject`        | `IN_REVIEW` → `REJECTED`, requires a review note                   |
| `POST`  | `/content/:id/archive`       | `APPROVED` → `ARCHIVED`                                            |
| `POST`  | `/content/:id/revise`        | New `DRAFT` revision from `APPROVED` or `ARCHIVED` content         |
| `GET`   | `/content/:id/preview`       | Render the Slack message without sending it                        |
| `GET`   | `/content/:id/deliveries`    | Paginated delivery history                                         |

### Workspaces and subscribers

| Method  | Path                           | Description                                          |
| ------- | ------------------------------ | ---------------------------------------------------- |
| `POST`  | `/workspaces`                  | Register the manually configured Slack workspace     |
| `GET`   | `/workspaces`                  | List workspaces, filterable by `isActive`            |
| `GET`   | `/workspaces/:id`              | Get a workspace                                      |
| `PATCH` | `/workspaces/:id`              | Update name, token alias, or active state            |
| `POST`  | `/workspaces/:id/verify-token` | Slack `auth.test`; stores bot user and verified time |
| `POST`  | `/subscribers`                 | Register a subscriber; `isActive` defaults to `true` |
| `GET`   | `/subscribers`                 | List, filterable by `workspaceId` and `isActive`     |
| `GET`   | `/subscribers/:id`             | Get a subscriber                                     |
| `PATCH` | `/subscribers/:id`             | Update timezone, locale, or active state             |
| `POST`  | `/slack/test-message`          | Post a fixed connectivity check to a user's DM       |

### Streams

| Method  | Path                   | Description                                            |
| ------- | ---------------------- | ------------------------------------------------------ |
| `POST`  | `/streams`             | Create a scheduled content stream                      |
| `GET`   | `/streams`             | List streams, filterable by `workspaceId`, `isEnabled` |
| `GET`   | `/streams/:id`         | Get a stream                                           |
| `PATCH` | `/streams/:id`         | Update a stream configuration                          |
| `POST`  | `/streams/:id/enable`  | Enable a stream                                        |
| `POST`  | `/streams/:id/disable` | Disable a stream                                       |

`sendTime` is evaluated in each subscriber's own timezone (`UserSubscriber.timezone`), so `ScheduleStream.timezone` is a reference value for display and does not decide when anyone is sent to.

`slackTeamId` is immutable once a workspace is created — it is the identity the verified token
is checked against.

In normal operation subscribers are **not created through this API** — a user opts in by
messaging the bot directly (see [Subscriber model](#subscriber-model)), and the Slack events
module creates or reactivates the `UserSubscriber` row automatically. These endpoints exist for
administrative visibility, and for registering a subscriber ahead of time (for example, to test
a delivery before asking someone to opt in). There is no channel access to verify: posting to a
Slack user ID opens or reuses that user's direct message with the bot.

`GET /audit-events` lists the immutable audit trail, filterable by `actorId`, `action`,
`entityType`, `entityId`, `dateFrom`, and `dateTo`.

### Validation model

Drafts are deliberately permissive: every type-specific payload field is optional, so an
editor can save partial work. Approval is the strict gate. `POST /content/:id/approve`
re-validates the payload and additionally requires, per type:

- **Ayah** — Arabic text, Arabic surah name, surah number, ayah number, at least one `QURAN`
  source, and an ayah number within the real verse count for that surah.
- **Hadith** — Arabic text, collection, and at least one `HADITH_COLLECTION` source.
- **Companion story** — title, Companion name, story, and at least one non-blank lesson.
- **Blessing reminder** — title and body; a `relatedAyahReference` requires a `QURAN` source
  and a `relatedHadithReference` requires a `HADITH_COLLECTION` source.

Every item needs at least one source with a non-blank title. A failed approval rolls back
entirely: status, checksum, and the audit trail are left untouched.

Approved content is not edited in place. `POST /content/:id/revise` creates a new `DRAFT` row
linked to the root item through `parentContentId` with an incremented `version`, preserving
the original and its delivery history.

### Rendering and preview

`GET /content/:id/preview` returns the exact Slack message an item would produce, without
posting anything and without creating a delivery record. It works for content in **any**
status, so an editor can see a draft take shape:

```json
{
  "rendererVersion": "ayah-v1",
  "text": "plain-text notification fallback",
  "blocks": [],
  "warnings": ["limit.section_split"],
  "approvalIssues": [
    { "field": "payload.arabicText", "message": "arabicText is required for approval" }
  ]
}
```

The two lists answer different questions. `warnings` describe how the message will render
(`limit.section_split`, `limit.block_count`, `limit.soft_budget`, `render.missing_primary_text`,
`render.no_sources`, `render.payload_not_object`, `render.url_not_linkable`). `approvalIssues`
describe what would block approval. Both are advisory here; preview never rejects.

Paste the `blocks` array into [Slack's Block Kit Builder](https://app.slack.com/block-kit-builder)
to confirm it renders as intended.

Renderer guarantees:

- Stored Quran and hadith Arabic reaches Slack **byte-identical**. The only transformation is
  Slack's three-character escape (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`), and Arabic script
  contains none of those characters. Nothing is normalized, trimmed, or truncated.
- Religious text is emitted as its own block with no surrounding mrkdwn markers, so a literal
  `*` or `_` in the stored text cannot alter the rendering.
- Text longer than a Slack block limit is **split across blocks and flagged**, never truncated.
  Splitting preserves every character.
- Empty and blank sections are omitted entirely, so a partially filled draft produces a short
  message rather than empty headings.
- Hadith grading is shown only when stored, attributed to the stored grader, with no wording the
  application invents. An occasion of revelation is shown only when a summary is stored, and its
  scope qualifier only when the stored boolean states it.
- A source URL becomes a link only when it parses as `http`/`https`; otherwise the citation is
  plain text and `render.url_not_linkable` is reported.

Renderer versions (`ayah-v1`, `hadith-v1`, `companion-story-v1`, `blessing-reminder-v1`) are
returned with every preview and change only when block structure changes, never for wording.

## Subscriber model

Content is delivered to individual Slack users who have opted in, not to a channel. There is no
"invite the bot to a channel" step and no channel-access verification anywhere in this flow:
`chat.postMessage` to a Slack user ID (`U…`) opens or reuses that user's direct message with the
bot automatically.

Users opt in themselves once the app is installed and Socket Mode is running:

- Sending the `/subscribe` slash command, or the plain word `subscribe` as a direct message,
  creates (or reactivates) a `UserSubscriber` row for that Slack user.
- `/unsubscribe`, or the word `unsubscribe`, sets it inactive.
- Repeating the same command is a no-op: one row per `(workspaceId, slackUserId)`, enforced by
  a unique index, is created or updated — never duplicated.

This is handled by `SlackEventsService` over **Socket Mode** (`@slack/socket-mode`), which needs
no public URL or ngrok tunnel — the app opens an outbound WebSocket connection to Slack and
receives events over it. If `SLACK_APP_TOKEN` is unset, this connection is skipped, a warning is
logged once, and slash commands are simply never received; everything else in the API keeps
working.

## Slack setup

Every workspace's bot token is obtained via OAuth and stored encrypted in its `SlackWorkspace`
row (`src/slack-oauth/`) — there is no env-var bot token to configure by hand.

1. Create a Slack app.
2. **Enable Socket Mode** and generate an app-level token (`xapp-…`) with the `connections:write`
   scope. Put it in `SLACK_APP_TOKEN`. This one token is shared by every installed workspace —
   Socket Mode envelopes carry `team_id`, so inbound events already route to the right workspace
   (`SlackEventsService`) without a per-workspace connection.
3. **Slash Commands** — create `/subscribe` and `/unsubscribe`. The Request URL field is ignored
   under Socket Mode, but the commands must still be declared here or Slack rejects them locally
   with "not a valid command" before your app ever sees them.
4. **Event Subscriptions** — enable, and under _Subscribe to bot events_ add `message.im` (for
   the plain-text `subscribe`/`unsubscribe` DM path) and `app_uninstalled` (so a workspace that
   removes the app is deactivated automatically instead of generating failing deliveries forever).
5. **OAuth & Permissions** — add bot scopes `chat:write`, `commands`, and `im:history` (the last
   is what lets `message.im` reach `onMessage`'s plain-text `subscribe`/`unsubscribe` path), and
   set the **Redirect URL** to `${APP_BASE_URL}/api/v1/slack/oauth/callback`. Copy the **Client
   ID** and **Client Secret** from _Basic Information_ into `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`.
6. Under **Manage Distribution**, turn on public distribution to get the shareable "Add to Slack"
   link/button — this is the plain OAuth install flow below, not a Slack Marketplace submission
   (Slack disallows Socket Mode for the latter; this app only uses the former).
7. Generate `SLACK_TOKEN_ENCRYPTION_KEY` with `openssl rand -base64 32` (must decode to exactly
   32 bytes) — this is the key `TokenCipherService` uses to encrypt every workspace's bot token
   at rest, and also (via HKDF) to sign the OAuth `state` parameter.
8. Start (or restart) the app and confirm the log line `Connected to Slack Socket Mode.`
9. Visit `${APP_BASE_URL}/api/v1/slack/install` (or share that link) to install into a workspace.
   The callback creates the `SlackWorkspace` row, encrypts its bot token, and provisions a
   default `DAILY` / `AYAH` stream automatically — nothing to configure by hand afterward.
10. In Slack, message the app directly and send `/subscribe` (or the word `subscribe`).

The raw bot token is never stored in plaintext: `SlackClientFactory` resolves it by decrypting
`SlackWorkspace.botTokenCiphertext` on each use, keyed by `SLACK_TOKEN_ENCRYPTION_KEY`.
`tokenSecretKey` is retained on the row only as a human-readable label (`oauth:<teamId>` for
OAuth installs) — it plays no role in token resolution.

### Slack error codes

| Code                                | Status | Meaning                                                       |
| ----------------------------------- | ------ | -------------------------------------------------------------- |
| `SLACK_NOT_CONFIGURED`              | 503    | This workspace has no `botTokenCiphertext` — install it via OAuth first |
| `SLACK_TOKEN_INVALID`               | 502    | Slack rejected the token                                      |
| `SLACK_TOKEN_WORKSPACE_MISMATCH`    | 409    | The token belongs to a different Slack workspace              |
| `SLACK_SEND_FAILED`                 | 502    | Posting failed; 503 instead when the failure is retryable     |
| `WORKSPACE_INACTIVE`                | 409    | The workspace record is disabled                              |
| `SLACK_OAUTH_NOT_CONFIGURED`        | 503    | `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`/`SLACK_TOKEN_ENCRYPTION_KEY` not all set |
| `SLACK_OAUTH_STATE_INVALID`         | 400    | The install link expired (10 min TTL), was tampered with, or `code`/`state` is missing |
| `SLACK_OAUTH_DENIED`                | 400    | The workspace admin declined the install                      |
| `SLACK_OAUTH_EXCHANGE_FAILED`       | 502    | Slack rejected the OAuth code exchange                        |
| `SLACK_OAUTH_ENTERPRISE_UNSUPPORTED`| 400    | Enterprise-wide installs aren't supported; install into a single workspace |
| `SUBSCRIBER_NOT_FOUND`              | 404    | No subscriber with that ID                                    |
| `SUBSCRIBER_ALREADY_EXISTS`         | 409    | That Slack user is already registered for this workspace      |

These carry `details.reason` with the underlying Slack code and `details.retryable`;
rate-limited failures also carry `details.retryAfterSeconds`. Slack's own error text is never
forwarded — the message is written by this application, because Slack error payloads can echo
request contents.

The application starts normally with no Slack credentials. Content, review, preview and health
all work; only Slack operations fail, with `503 SLACK_NOT_CONFIGURED`.

### Swagger

Set `SWAGGER_ENABLED=true` to serve the OpenAPI UI at `/api/docs` and the document at
`/api/docs-json`. Both paths are unprefixed, because `setGlobalPrefix` does not apply to
`SwaggerModule.setup`. Swagger is force-disabled when `NODE_ENV=production` regardless of the
flag.

## Commands

```bash
pnpm build             # Generate Prisma Client and compile the application
pnpm start             # Start the compiled application
pnpm start:dev         # Start in watch mode
pnpm lint              # Run strict ESLint checks
pnpm format            # Format project files
pnpm format:check      # Verify formatting
pnpm prisma:validate   # Validate prisma/schema.prisma
pnpm prisma:generate   # Generate the ignored Prisma client
pnpm db:migrate:dev    # Create and apply a development migration
pnpm db:migrate        # Apply committed migrations
pnpm db:status         # Show migration status
```

Never use `prisma db push` or schema synchronization for this project. Every schema change
must have a committed migration. Production deployments should run `pnpm db:migrate`.

## Environment variables

| Variable                     | Behavior                                      | Description                                                                 |
| ---------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| `NODE_ENV`                   | Optional, defaults to `development`           | `development`, `test`, or `production`                                      |
| `PORT`                       | Optional, defaults to `3000`                  | HTTP port                                                                   |
| `APP_BASE_URL`               | Optional, defaults to `http://localhost:3000` | Public application URL                                                      |
| `DATABASE_URL`               | Required                                      | PostgreSQL connection URL                                                   |
| `ADMIN_API_KEY`              | Required, minimum 32 characters               | Secret accepted through `X-Admin-Key`                                       |
| `DEFAULT_TIMEZONE`           | Optional, defaults to `Africa/Cairo`          | Valid IANA timezone                                                         |
| `DEFAULT_LOCALE`             | Optional, defaults to `ar`                    | Initial content locale                                                      |
| `LOG_LEVEL`                  | Optional, defaults to `info`                  | Pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent` |
| `SWAGGER_ENABLED`            | Optional, defaults to `false`                 | Serves OpenAPI docs; ignored in production                                  |
| `SLACK_APP_TOKEN`            | Required for `/subscribe` and `/unsubscribe`  | App-level token (`xapp-…`) for Socket Mode; redacted if logged              |
| `SLACK_CLIENT_ID`            | Required for `/slack/install`                 | Slack app's OAuth client ID                                                 |
| `SLACK_CLIENT_SECRET`        | Required for `/slack/install`                 | Slack app's OAuth client secret; redacted if logged                         |
| `SLACK_TOKEN_ENCRYPTION_KEY` | Required for `/slack/install`                 | Base64, 32 bytes; encrypts bot tokens at rest and signs OAuth `state`       |
| `SCHEDULER_ENABLED`          | Optional, defaults to `false`                 | Phase 4 scheduler switch                                                    |
| `SCHEDULER_INTERVAL_MINUTES` | Optional, defaults to `5`                     | Phase 4 scheduler interval                                                  |
| `SCHEDULER_LOCK_ID`          | Optional, defaults to `874321`                | Phase 4 PostgreSQL advisory-lock ID                                         |
| `CLOCK_OFFSET_SECONDS`       | Optional, defaults to `0`                     | Shifts "now" for scheduling; **startup fails if non-zero in production**    |

Configuration is validated before application startup. Validation errors name invalid fields
but do not include their values.

All Slack variables remain optional to the validator so the application boots without a Slack
app. When `SLACK_APP_TOKEN` is blank, startup logs a warning and Socket Mode simply never
connects — slash commands and DM opt-ins are never received, but the rest of the API is
unaffected. When `SLACK_TOKEN_ENCRYPTION_KEY` is blank, `/slack/install` and
`/slack/oauth/callback` return `503 SLACK_OAUTH_NOT_CONFIGURED`, and any workspace with no
`botTokenCiphertext` yet (never installed, or uninstalled) returns `503 SLACK_NOT_CONFIGURED`
from posting/verify-token. Slack request timeouts and retry behavior are fixed constants, not
environment variables: retries are the delivery records' responsibility, not the SDK's.

## Logging and errors

`nestjs-pino` provides request-scoped structured logging. Development logs use `pino-pretty`;
test and production logs are JSON when enabled. A valid inbound `X-Request-Id` of at most 128
characters is propagated, otherwise the server generates one. The request ID is stored on
every audit event.

Admin keys, authorization headers, Slack tokens, and credential-shaped request fields are
redacted. API errors use the normalized form:

```json
{
  "statusCode": 400,
  "code": "CONTENT_VALIDATION_FAILED",
  "message": "Content payload is invalid.",
  "details": [{ "field": "payload.arabicText", "message": "arabicText is required for approval" }],
  "requestId": "request-id"
}
```

## Database

The migrations create the complete extensible MVP data model:

- Slack workspaces and per-user subscribers
- Scheduled streams
- Versioned content items and structured sources
- Delivery cycles with rendered snapshots, and one delivery record per subscriber
- Administrative audit events

### Delivery model

Delivery is two levels, because a stream sends to many people at once:

- **`DeliveryRun`** — one cycle: a single content selection for one stream on one calendar date,
  rendered once. `@@unique([streamId, deliveryLocalDate])` guarantees a stream picks content only
  once per date, so everyone reaching that date receives the same item.
- **`ContentDelivery`** — one subscriber's copy of that cycle, holding their own status, Slack
  message timestamp, and retry state. `@@unique([runId, subscriberId])` guarantees one message per
  person per cycle.

That split is what makes retry work per person: if one subscriber's send fails, the others stay
`SENT` and only the failed row is retried. A retry resends the run's stored snapshot rather than
re-rendering, so the message that goes out second is identical to the one that went out first.

A cycle is keyed by **calendar date, not absolute time**. Each subscriber is sent to at their own
local `sendTime` (`UserSubscriber.timezone`), so one `deliveryLocalDate` can span roughly 49 hours
of real time from UTC+14 to UTC−11 — and everyone who reaches that date still gets the same
content. `ScheduleStream.timezone` is a reference value for display and does not decide when
anyone is sent to. Someone who subscribes after their local send time has passed starts on the
next cycle; there is no backfill.

| Migration                                        | Contents                                                                                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260728095425_init`                            | Full initial schema                                                                                                                                                                                  |
| `20260728160216_content_revision_version_unique` | `UNIQUE (parentContentId, version)` on `ContentItem`                                                                                                                                                 |
| `20260728174034_content_revision_version_check`  | `CHECK` pinning roots to version 1, revisions above                                                                                                                                                  |
| `20260729121712_user_subscriptions`              | Replaces `ChannelSubscription` with `UserSubscriber` (`@@unique([workspaceId, slackUserId])`), and repoints `ScheduleStream`/`ContentDelivery` from a channel subscription to a workspace/subscriber |
| `20260729164457_per_subscriber_delivery`         | Splits delivery into `DeliveryRun` (per cycle) and `ContentDelivery` (per subscriber), so duplicate prevention and retry are per person. Adds `rendererVersion` and `ScheduleStream.locale`          |

The schema supports all four content types, but no content is delivered anywhere yet — the
scheduler that would create these rows is the rest of Phase 4.

## Known limitations

1. **No automated tests.** This project deliberately carries no test suite, no test tooling,
   and no test database. Changes are verified by building, linting, and exercising the API
   directly, as described in `PLAN.md` §17.

2. **The content checksum includes the revision version.** `contentChecksum` is a stable
   fingerprint of an approval: identical content approved twice produces an identical hash,
   including across separate rows with different ids and timestamps. Because `version` is part
   of the hashed identity, a revision never matches its parent's checksum even when the text is
   unchanged. That is deliberate — the checksum identifies the approved revision — but it means
   the checksum cannot be used to answer "is this revision textually identical to the last one".

3. **Phase 3 posts only the diagnostic message.** `POST /slack/test-message` sends a fixed,
   server-authored connectivity check. It accepts no text, blocks, or content id, invokes no
   renderer, and writes no delivery record, so it cannot be used to deliver content around the
   duplicate protection that arrives in Phase 4.

4. **The scheduler does not exist yet.** The delivery schema, the injectable `Clock`, and
   per-subscriber local-date arithmetic are in place, but nothing creates `DeliveryRun` or
   `ContentDelivery` rows automatically. Streams, content selection, and the cron tick are the
   remaining Phase 4 work; see `PLAN.md` §29.1.
