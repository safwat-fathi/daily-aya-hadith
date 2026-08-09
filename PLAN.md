# Slack Bot for Daily Aya & Hadith

## Technical Product Specification and AI Coding Agent Handoff

**Document version:** 1.0  
**Status:** Implementation-ready MVP specification  
**Primary stack:** NestJS, TypeScript, PostgreSQL, Prisma, Slack Web API  
**Package manager:** pnpm  
**Initial deployment model:** One Slack workspace targeting opted-in users via direct messages
**Architecture requirement:** Must remain extensible to multiple workspaces, users, and schedules without a database rewrite

---

# 1. Purpose

Build a Slack bot that sends carefully reviewed Islamic content to subscribed users on a scheduled basis.

The bot must support:

1. Quran ayat with useful supporting information.
2. Hadith with verification and a concise explanation.
3. Short stories from the lives of the Companions.
4. Reminders about the countless blessings of Allah.
5. Human review and approval before any content can be sent.
6. Reliable scheduling without duplicate deliveries.
7. Clear Slack Block Kit formatting.
8. An admin API for managing content, schedules, subscriptions, previews, and delivery history.

The application is a content-delivery system, not a religious-content generation system. It must never generate Quran text, hadith text, rulings, tafsir, or historical claims dynamically with an LLM and publish them automatically.

---

# 2. Product Principles

## 2.1 Religious accuracy over automation

All content must be stored locally in the database and approved by a human reviewer before publication.

External services may be used during a controlled import or verification process, but the runtime scheduler must not call an external Quran, hadith, tafsir, or AI API to construct the daily message.

## 2.2 No duplicate daily delivery

The system must provide database-level protection at two levels, because a stream fans out to many subscribers:

1. A stream selects content **once** per local delivery date, so everyone reaching that date receives the same item.
2. A given subscriber is sent **at most one** message per stream per local delivery date, even across retries, restarts, and concurrent scheduler ticks.

Both must be enforced by unique constraints, not by application logic alone.

## 2.3 Simple MVP, extensible internals

The first release supports one workspace, but the following entities must still be modeled separately:

- Slack workspace installation
- Slack user subscriber
- Scheduled content stream
- Content item
- Delivery record

This avoids coupling the entire application to environment variables or a single hardcoded user list.

## 2.4 Transparent sourcing

Every factual religious content item must include one or more structured source references. The Slack message should display a concise source citation where appropriate.

## 2.5 Graceful failure

A failed Slack API call must not mark a message as successfully delivered. Failures must be recorded, retryable, and visible through the admin API and logs.

---

# 3. Scope

## 3.1 MVP scope

The MVP must include:

- NestJS REST API.
- PostgreSQL database.
- Prisma ORM and Prisma migrations.
- Slack posting through `@slack/web-api`.
- Scheduler through `@nestjs/schedule`.
- One configured Slack workspace with users subscribing via `/subscribe`.
- Multiple configurable scheduled streams per workspace, broadcast to every active subscriber.
- Four content types:
  - `AYAH`
  - `HADITH`
  - `COMPANION_STORY`
  - `BLESSING_REMINDER`
- Human review workflow.
- Slack Block Kit message rendering.
- Content rotation that minimizes repetition.
- Preview endpoint.
- Manual send endpoint.
- Delivery history.
- Retry support for failed deliveries.
- Swagger/OpenAPI documentation.
- Health endpoint.
- Structured application logs.
- Docker-compatible deployment.
- Seed scripts for development and initial reviewed content.

## 3.2 Launch content target

Target a reviewed library of 120 items:

- 30 ayah items.
- 30 hadith items.
- 30 blessing reminders.
- 30 Companion stories.

A reduced first release may launch with 90 reviewed items if Companion stories are intentionally deferred, but the schema and renderer must support all four content types from the start.

## 3.3 Out of scope for MVP

Do not implement these in the first version unless explicitly requested later:

- Public Slack App Directory distribution.
- Public Slack OAuth installation flow.
- Billing or paid subscriptions.
- User-personalized direct messages.
- Interactive quizzes.
- AI-generated religious content.
- Automatic scraping of religious websites.
- Redis.
- BullMQ.
- Kafka or message queues.
- A public web frontend.
- Native mobile applications.
- Advanced role-based administration.
- Content reactions or analytics based on individual Slack users.
- Localization beyond the initially configured Arabic-first message format.

---

# 4. Users and Actors

## 4.1 Slack user subscriber

Receives scheduled Islamic messages via Direct Message in Slack.

Users opt-in to the service by sending the `/subscribe` command to the bot.

## 4.2 Content editor

Creates and edits draft content through the admin API.

An editor cannot make draft content eligible for delivery unless they also have reviewer permission. For the MVP, this may be enforced operationally with a single admin API key, while the database preserves review metadata.

## 4.3 Content reviewer

Reviews religious text, citations, explanations, and formatting. Approves or rejects content.

## 4.4 System administrator

Configures the Slack installation, user subscribers, scheduled streams, delivery behavior, retries, and application settings.

## 4.5 Scheduler worker

Runs inside the NestJS process, identifies due streams, selects approved content, sends Slack messages, and records results.

---

# 5. Functional Requirements

# 5.1 Content management

The application must allow an administrator to:

- Create a content item.
- Update a draft or rejected content item.
- Submit content for review.
- Approve content.
- Reject content with reviewer notes.
- Archive content.
- List and filter content.
- Retrieve a single content item.
- Preview the rendered Slack message.
- View the content item's delivery history.

Approved content should normally be immutable. To modify approved content:

1. Create a new revision or return it to draft.
2. Review it again.
3. Approve the new revision.
4. Preserve the old delivery history.

For MVP simplicity, revisioning can be represented with `version`, `parentContentId`, and a new row rather than maintaining complex temporal tables.

## 5.2 Content statuses

Use the following enum:

```ts
enum ContentStatus {
  DRAFT
  IN_REVIEW
  APPROVED
  REJECTED
  ARCHIVED
}
```

Only `APPROVED` content is eligible for scheduled or manual production delivery.

## 5.3 Content types

Use the following enum:

```ts
enum ContentType {
  AYAH
  HADITH
  COMPANION_STORY
  BLESSING_REMINDER
}
```

Each content item has common metadata plus a type-specific JSON payload validated by application-level DTOs.

## 5.4 Ayah content

An ayah item should support:

```ts
type AyahPayload = {
  arabicText: string;
  surahNumber: number;
  surahNameArabic: string;
  surahNameEnglish?: string;
  ayahNumber: number;
  translation?: string;
  conciseTafsir?: string;
  wordMeanings?: Array<{
    word: string;
    meaning: string;
  }>;
  sababAlNuzul?: {
    summary: string;
    appliesToWholeAyah: boolean;
    scholarlyNote?: string;
  };
  reflection?: string;
  practicalAction?: string;
};
```

Rules:

- `arabicText` must be copied from a verified Quran source.
- The bot must not alter or normalize the displayed Arabic Quran text in a way that can change it.
- `surahNumber` must be between 1 and 114.
- `ayahNumber` must be validated against known surah lengths during import or review.
- `sababAlNuzul` is optional because not every ayah has a reliably documented specific occasion of revelation.
- Do not present a general thematic context as a definite occasion of revelation.
- Tafsir should be concise and sourced.
- Word meanings should focus only on words that benefit the reader.

## 5.5 Hadith content

A hadith item should support:

```ts
type HadithPayload = {
  arabicText: string;
  translation?: string;
  narrator?: string;
  collection: string;
  book?: string;
  hadithNumber?: string;
  grade?: string;
  grader?: string;
  conciseExplanation?: string;
  reflection?: string;
  practicalAction?: string;
};
```

Rules:

- A source reference is mandatory.
- Hadith grading must not be invented or inferred by the application.
- Where scholarly grading differs, the stored note must describe the selected source rather than claiming universal agreement.
- Weak or disputed narrations should not be included in the default approved pool unless a reviewer deliberately approves them with an explicit visible note.
- The initial production content pool should prioritize authentic narrations.

## 5.6 Companion story content

A Companion story should support:

```ts
type CompanionStoryPayload = {
  title: string;
  companionName: string;
  arabicName?: string;
  story: string;
  historicalContext?: string;
  lessons: string[];
  reflection?: string;
  practicalAction?: string;
};
```

Rules:

- Keep stories short enough for Slack.
- Avoid unsupported dramatic details.
- Include primary or reliable secondary references.
- Clearly distinguish a verified event from a popular but weak anecdote.

## 5.7 Blessing reminder content

A blessing reminder should support:

```ts
type BlessingReminderPayload = {
  title: string;
  body: string;
  examples?: string[];
  relatedAyahReference?: string;
  relatedHadithReference?: string;
  reflection?: string;
  gratitudeAction?: string;
};
```

Examples of themes:

- Health.
- Safety.
- Family.
- Faith.
- Time.
- Food and water.
- Shelter.
- The ability to learn.
- Forgiveness.
- Small daily conveniences that are often unnoticed.

A blessing reminder must not make unsupported promises about worldly outcomes.

## 5.8 Source references

Each content item must have one or more source references.

```ts
enum SourceType {
  QURAN
  HADITH_COLLECTION
  TAFSIR
  ASBAB_AL_NUZUL
  SEERAH
  BIOGRAPHY
  BOOK
  WEBSITE
  OTHER
}
```

A source reference contains:

```ts
type SourceReference = {
  sourceType: SourceType;
  title: string;
  author?: string;
  publisher?: string;
  edition?: string;
  volume?: string;
  page?: string;
  chapter?: string;
  referenceNumber?: string;
  url?: string;
  notes?: string;
};
```

Source URLs are optional. Bibliographic references must remain useful even if a URL stops working.

## 5.9 Review workflow

Allowed transitions:

```text
DRAFT -> IN_REVIEW
IN_REVIEW -> APPROVED
IN_REVIEW -> REJECTED
REJECTED -> DRAFT
APPROVED -> ARCHIVED
APPROVED -> new revision in DRAFT
ARCHIVED -> DRAFT only through a new revision
```

Every approval must save:

- Reviewer identifier.
- Approval timestamp.
- Optional review note.
- Content checksum or version.

## 5.10 Slack workspace installation

For the first release, use a manually configured bot token.

The application must still create a `SlackWorkspace` record containing:

- Slack team/workspace ID.
- Workspace name.
- Encrypted bot token or an environment-secret reference.
- Installation status.
- Bot user ID if known.
- Token last verified timestamp.

Preferred MVP behavior:

- Store the bot token in an environment variable.
- Store `tokenSecretKey` or a token alias in the database rather than the raw token.
- The Slack client provider resolves the token from configuration.

This keeps secrets out of normal database exports.

## 5.11 User subscriber

A user subscriber links a Slack workspace to a Slack user ID who opted in.

It contains:

- Workspace.
- Slack user ID.
- Enabled/Active state.
- Default timezone.
- Default language.
- Created and updated timestamps.

Users subscribe by sending `/subscribe` and unsubscribe via `/unsubscribe`.

## 5.12 Scheduled streams

A workspace can have one or more scheduled streams broadcast to all active subscribers.

Examples:

- Primary daily stream rotating between ayah and hadith.
- Daily blessing reminder stream.
- Weekly Companion story stream.

Each stream contains:

- Workspace ID.
- Name.
- Enabled state.
- Allowed content types.
- Timezone.
- Local send time.
- Frequency.
- Days of week when applicable.
- Selection strategy.
- Retry configuration.
- Slack formatting options.

Use:

```ts
enum ScheduleFrequency {
  DAILY
  WEEKLY
}
```

For MVP, do not implement arbitrary cron expressions entered by users. Store explicit scheduling fields and generate predictable due checks.

Suggested schedule fields:

```ts
type StreamSchedule = {
  frequency: "DAILY" | "WEEKLY";
  sendTime: string; // HH:mm
  timezone: string; // IANA, e.g. Africa/Cairo
  daysOfWeek?: number[]; // 0 Sunday through 6 Saturday
};
```

For `DAILY`, `daysOfWeek` is ignored.

For `WEEKLY`, at least one day must be specified.

## 5.13 Default suggested schedule

Use configuration rather than hardcoding, but seed:

- Primary Aya/Hadith stream: daily at 09:00 in `Africa/Cairo`.
- Blessing reminder: either included in the primary rotation or configured as a separate daily stream.
- Companion story: one selected weekday at 09:00.

The administrator must be able to change these values.

## 5.14 Content selection

Supported MVP strategy:

```ts
enum SelectionStrategy {
  LEAST_RECENTLY_SENT
  RANDOM_WITHOUT_REPLACEMENT
}
```

Default to `LEAST_RECENTLY_SENT`.

Selection requirements:

1. Content must be `APPROVED`.
2. Content type must be allowed by the stream.
3. Content must not be archived.
4. Content locale must match the stream's `locale`.
5. Prefer content never sent by this stream.
6. Otherwise choose the least recently sent eligible item.
7. Use a deterministic tie breaker, such as `createdAt ASC` or a seeded random value.
8. Never select an item already reserved by another concurrent scheduler transaction for the same stream and delivery date.

Selection is a property of the **cycle**, not of any one subscriber: it runs once per stream per local delivery date and every subscriber reaching that date receives the result. Selection history therefore reads from `DeliveryRun`, not from the per-subscriber delivery rows.

The selection query should use a database transaction and a stream-level lock or equivalent idempotency mechanism.

## 5.15 Delivery lifecycle

Use the following enum:

```ts
enum DeliveryStatus {
  PENDING
  SENDING
  SENT
  FAILED
  SKIPPED
}
```

Delivery is a two-level structure: a `DeliveryRun` is one cycle of a stream on one calendar date, and a `ContentDelivery` is one subscriber's copy of that cycle. The run decides *what* is sent; each child row records whether *that person* received it.

Flow:

1. Scheduler finds a subscriber whose own local time has reached the stream's `sendTime`.
2. It computes that subscriber's `deliveryLocalDate`.
3. It finds or creates the `DeliveryRun` for `(streamId, deliveryLocalDate)`. Losing this race is an idempotent success: reuse the existing run.
4. If the run is new, it selects an eligible content item and renders the message once, storing `renderedText`, `renderedBlocks`, and `rendererVersion` on the run.
5. It inserts a `ContentDelivery` for `(runId, subscriberId)`. A unique violation means this person was already handled; stop.
6. It sets that row to `SENDING`.
7. It calls Slack `chat.postMessage` with the run's stored snapshot, addressed to the subscriber's Slack user ID.
8. On success it saves the returned DM channel and message timestamp on that row, with status `SENT`.
9. On failure it saves normalized error information on that row with status `FAILED`, and leaves every other subscriber's row untouched.

Because the snapshot lives on the run, a retry resends exactly what was originally rendered rather than re-rendering content that may have changed.

If no eligible content exists:

- Set the **run** status to `SKIPPED` with `errorCode` `NO_ELIGIBLE_CONTENT`, and create no child rows.
- Log an error or warning.
- Do not send unapproved or repeated emergency fallback text.

## 5.16 Duplicate prevention

Two unique constraints are required, one per level of §2.2:

```text
UNIQUE(delivery_run.schedule_stream_id, delivery_run.delivery_local_date)
UNIQUE(content_delivery.run_id, content_delivery.subscriber_id)
```

The first guarantees one content selection per stream per local date. The second guarantees one message per subscriber per cycle — this is the constraint that makes a retry safe, since a retry of one person's failed delivery updates their existing row rather than inserting a second one.

If weekly streams can run only on selected days, both constraints still work.

Manual preview does not create a delivery record.

Manual production send must require an explicit idempotency key and should create a run with a distinct `triggerType`, fanned out to subscribers exactly as a scheduled cycle is.

```ts
enum DeliveryTriggerType {
  SCHEDULED
  MANUAL
  RETRY
}
```

For manual delivery, use:

```text
UNIQUE(delivery_run.schedule_stream_id, delivery_run.idempotency_key)
```

where the idempotency key is nullable for scheduled runs. The key belongs on the run rather than on a per-subscriber row: one manual send is one cycle, and repeating the key must return that whole cycle rather than re-fanning it out.

## 5.17 Retry behavior

Retry operates on a **single subscriber's** delivery row, never on a whole cycle. One person's permanent failure must leave everyone else's `SENT` rows alone and must be retryable on its own.

MVP retry rules:

- Scheduler runs every hour.
- A failed delivery can be retried by an admin endpoint, one subscriber at a time.
- A retry resends the run's stored snapshot rather than re-rendering (§12.5).
- Optionally retry automatically up to three times with delays managed by database timestamps, not a queue.
- Do not retry permanent Slack errors such as:
  - `user_not_found`
  - `invalid_auth`
  - `account_inactive`
- Retry transient errors such as:
  - HTTP 429 rate limiting.
  - HTTP 5xx.
  - Network timeouts.
- Respect Slack's `Retry-After` value.

Recommended per-subscriber delivery fields:

- `attemptCount`
- `nextRetryAt`
- `lastAttemptAt`
- `errorCode`
- `errorMessage`
- `isRetryable`

`maxAutomaticAttempts` is configured on the stream but counted per subscriber.

## 5.18 Slack formatting

Use Slack Block Kit.

General structure:

1. Header.
2. Main Arabic text or story.
3. Context, explanation, or reminder.
4. Reflection.
5. Practical action.
6. Source.
7. Optional footer.

Keep messages readable and not excessively long.

Slack payload must always include a plain-text `text` fallback for notifications and accessibility.

## 5.19 Ayah Slack template

Suggested layout:

```text
Header: آية اليوم

Arabic ayah text

Surah and ayah reference

Optional concise tafsir
Optional word meanings
Optional reason for revelation
Reflection
Practical action
Sources
```

Do not overload every message with all optional fields. The renderer should include only populated sections.

## 5.20 Hadith Slack template

Suggested layout:

```text
Header: حديث اليوم

Arabic hadith text

Narrator and collection reference
Concise explanation
Reflection
Practical action
Sources
```

## 5.21 Companion story Slack template

Suggested layout:

```text
Header: موقف من حياة الصحابة

Title and Companion name
Short story
Lessons
Practical reflection
Sources
```

## 5.22 Blessing reminder Slack template

Suggested layout:

```text
Header: تذكير بنعم الله

Reminder body
Examples
Reflection
Gratitude action
Related ayah or hadith reference
Sources
```

## 5.23 Slack message length

The renderer must protect against Slack field and block limits.

Implementation guidelines:

- Keep normal messages under approximately 3,000 visible characters when practical.
- Split long sections into separate blocks.
- Content exceeding a hard Slack limit is **split across blocks and flagged with a warning**,
  never truncated and never silently. Splitting must preserve every character.
- Preview never rejects. It must succeed for content in any status, reporting problems as
  warnings so an editor can see and fix them.
- The send path refuses to post when hard-limit warnings are present, so oversize content is
  stopped before delivery rather than at authoring time.
- Never silently truncate Quran or hadith text.

## 5.24 Admin authentication

MVP:

- Protect all admin endpoints with an `X-Admin-Key` header.
- Compare against a secret environment variable using timing-safe comparison.
- Exclude `/health` from authentication.
- Keep Swagger protected in production or disable it publicly.

Later versions can replace this with user accounts and role-based access.

## 5.25 Admin audit trail

Record important actions:

- Content created.
- Content edited.
- Submitted for review.
- Approved.
- Rejected.
- Archived.
- Stream created, updated, enabled, or disabled.
- Subscriber created, activated, or deactivated.
- Manual delivery (send-now) requested.
- Failed delivery retried.
- Delivery marked skipped by an administrator.

Partially implemented (§29): the audit vocabulary currently has `STREAM_*` actions and a `STREAM` entity type, but lacks `DELIVERY_*`
actions and `DELIVERY_RUN`/`DELIVERY` entity types, so none of the delivery events above can be recorded until those are added.

Each audit event includes:

- Actor identifier.
- Action.
- Entity type.
- Entity ID.
- Timestamp.
- Minimal before and after metadata.
- Request ID.

---

# 6. Non-Functional Requirements

## 6.1 Reliability

- Scheduled delivery must be idempotent.
- Application restart must not cause duplicate posts.
- A database transaction must protect delivery reservation and content selection.
- Slack failures must be stored.
- The bot should recover from temporary Slack outages.

## 6.2 Security

- Never commit Slack tokens, database passwords, or admin keys.
- Do not log full Slack tokens or authorization headers.
- Use HTTPS in production.
- Use Helmet.
- Enable request size limits.
- Add rate limiting to admin endpoints.
- Validate all input DTOs.
- Use Prisma parameterized queries.
- Encrypt tokens at rest if raw tokens are later stored.
- Restrict database network access.
- Use a dedicated non-superuser PostgreSQL account.

## 6.3 Performance

Expected MVP traffic is low.

Targets:

- Admin list endpoints: under 500 ms for typical datasets.
- Scheduler due-check: under 5 seconds. The tick is now O(streams x active subscribers), since due-ness is evaluated in each subscriber's own timezone; budget against that product rather than stream count alone.
- Slack send processing: governed primarily by Slack API latency.
- Database indexes must support due-stream queries and content selection.

## 6.4 Observability

Use structured JSON logs in production.

Every scheduled execution should include:

- Request or job ID.
- Stream ID.
- Workspace ID.
- Subscriber ID, for anything at the per-person level.
- Delivery run ID.
- Delivery local date.
- Content ID when selected.
- Delivery status.
- Slack error code when applicable.
- Duration.

Log the run-level decision once per cycle rather than repeating it per subscriber, and log per-subscriber lines only for sends, failures, and retries.

Expose:

- `GET /health/live`
- `GET /health/ready`

Readiness must verify database connectivity. Slack API connectivity may be reported separately but should not necessarily make the process unready during a temporary Slack outage.

## 6.5 Timezones

- Use IANA timezone strings.
- Default to `Africa/Cairo`.
- Do not use fixed UTC offsets for schedule configuration.
- Handle daylight-saving changes through a timezone-aware library.
- Recommended library: Luxon.

## 6.6 Localization

Initial content and Slack output are Arabic-first.

Store locale as a BCP 47-compatible string, such as:

- `ar`
- `ar-EG`
- `en`

The application should not translate religious content automatically.

---

# 7. Proposed Architecture

## 7.1 Components

```text
Slack
  ^
  |
Slack Web API
  ^
  |
NestJS Application
  |-- Admin API
  |-- Scheduler
  |-- Content Module
  |-- Review Module
  |-- Slack Module
  |-- Delivery Module
  |-- Subscription Module
  |-- Audit Module
  |-- Health Module
  |
PostgreSQL
```

## 7.2 Runtime process

For MVP, run one NestJS process containing both the HTTP API and scheduler.

To prevent duplicate scheduler execution when horizontal scaling is introduced:

- Either run exactly one scheduler-enabled process.
- Or use PostgreSQL advisory locks before each scheduler tick and stream reservation.

Implement PostgreSQL advisory locking from the start if it is straightforward. Otherwise document that only one scheduler-enabled replica is allowed.

## 7.3 Recommended NestJS modules

```text
src/
  app.module.ts
  main.ts

  config/
    app-config.module.ts
    env.validation.ts

  common/
    decorators/
    filters/
    guards/
    interceptors/
    logger/
    utils/

  prisma/
    prisma.module.ts
    prisma.service.ts

  content/
    content.module.ts
    content.controller.ts
    content.service.ts
    content.repository.ts
    dto/
    validators/
    renderers/

  review/
    review.module.ts
    review.controller.ts
    review.service.ts

  slack/
    slack.module.ts
    slack-client.factory.ts
    slack.service.ts
    slack-block.renderer.ts
    slack-error.mapper.ts

  workspaces/
    workspaces.module.ts
    workspaces.controller.ts
    workspaces.service.ts

  subscribers/
    subscribers.module.ts
    subscribers.controller.ts
    subscribers.service.ts

  slack-events/
    slack-events.module.ts
    slack-events.service.ts

  schedules/
    schedules.module.ts
    schedules.controller.ts
    schedules.service.ts
    schedule.matcher.ts

  deliveries/
    deliveries.module.ts
    deliveries.controller.ts
    deliveries.service.ts
    delivery.repository.ts

  scheduler/
    scheduler.module.ts
    scheduler.service.ts
    scheduler.lock.ts

  audit/
    audit.module.ts
    audit.service.ts

  health/
    health.module.ts
    health.controller.ts

prisma/
  schema.prisma
  migrations/
  seed.ts

```

## 7.4 Important separation of concerns

- Content validation must not call Slack.
- Slack rendering must not query the database.
- Content selection must not send messages.
- Delivery orchestration coordinates selection, rendering, Slack posting, and persistence.
- Scheduler only discovers due streams and invokes delivery orchestration.
- Review service controls approval transitions.
- Source verification is a human workflow, not a runtime automated claim.

---

# 8. Database Design

This is the live schema, mirrored from `prisma/schema.prisma`. Preserve the constraints and behavior; the `@@unique` declarations on `DeliveryRun` and `ContentDelivery` are what enforce §2.2 and are not optional.

```prisma
enum ContentType {
  AYAH
  HADITH
  COMPANION_STORY
  BLESSING_REMINDER
}

enum ContentStatus {
  DRAFT
  IN_REVIEW
  APPROVED
  REJECTED
  ARCHIVED
}

enum SourceType {
  QURAN
  HADITH_COLLECTION
  TAFSIR
  ASBAB_AL_NUZUL
  SEERAH
  BIOGRAPHY
  BOOK
  WEBSITE
  OTHER
}

enum ScheduleFrequency {
  DAILY
  WEEKLY
}

enum SelectionStrategy {
  LEAST_RECENTLY_SENT
  RANDOM_WITHOUT_REPLACEMENT
}

enum DeliveryStatus {
  PENDING
  SENDING
  SENT
  FAILED
  SKIPPED
}

enum DeliveryTriggerType {
  SCHEDULED
  MANUAL
  RETRY
}

model SlackWorkspace {
  id                  String   @id @default(cuid())
  slackTeamId         String   @unique
  name                String
  botUserId           String?
  tokenSecretKey      String
  isActive            Boolean  @default(true)
  tokenLastVerifiedAt DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  subscribers UserSubscriber[]
  streams     ScheduleStream[]
  auditEvents   AuditEvent[]

  @@index([isActive])
}

model UserSubscriber {
  id          String   @id @default(cuid())
  workspaceId String
  slackUserId String
  /// Governs *when* this person is sent to: the scheduler evaluates `ScheduleStream.sendTime`
  /// against this zone, so each subscriber receives at their own local time.
  timezone    String   @default("Africa/Cairo")
  /// Reserved for a future per-user language phase. It does **not** affect rendering today:
  /// content rotation is shared, so one cycle produces one render in the stream's locale.
  locale      String   @default("ar")
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace  SlackWorkspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  deliveries ContentDelivery[]

  @@unique([workspaceId, slackUserId])
  @@index([isActive])
}

model ScheduleStream {
  id          String            @id @default(cuid())
  workspaceId String
  name        String
  isEnabled   Boolean           @default(true)
  frequency   ScheduleFrequency
  /// Local wall-clock time, `HH:mm`, evaluated in each *subscriber's* timezone.
  sendTime    String
  /// Reference zone for administrative display and for subscribers with no usable timezone.
  /// It does **not** decide when anyone is sent to — `UserSubscriber.timezone` does.
  timezone    String
  daysOfWeek  Int[]
  /// Content selection filters on this locale (PLAN.md §5.14 rule 4) and the cycle renders in it.
  locale               String            @default("ar")
  allowedContentTypes  ContentType[]
  selectionStrategy    SelectionStrategy @default(LEAST_RECENTLY_SENT)
  maxAutomaticAttempts Int               @default(1)
  createdAt            DateTime          @default(now())
  updatedAt            DateTime          @updatedAt

  workspace SlackWorkspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  runs      DeliveryRun[]

  @@index([isEnabled, frequency])
  @@index([workspaceId])
}

model ContentItem {
  id                   String        @id @default(cuid())
  type                 ContentType
  status               ContentStatus @default(DRAFT)
  locale               String        @default("ar")
  title                String?
  payload              Json
  version              Int           @default(1)
  parentContentId      String?
  contentChecksum      String?
  reviewerId           String?
  reviewNote           String?
  submittedForReviewAt DateTime?
  approvedAt           DateTime?
  rejectedAt           DateTime?
  archivedAt           DateTime?
  createdBy            String
  updatedBy            String
  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt

  parent    ContentItem?    @relation("ContentRevisions", fields: [parentContentId], references: [id])
  revisions ContentItem[]   @relation("ContentRevisions")
  sources   ContentSource[]
  runs      DeliveryRun[]

  @@index([status, type, locale])
  @@index([parentContentId])
  @@index([approvedAt])
  // PostgreSQL treats every NULL parentContentId as distinct, so this only constrains
  // revisions sharing a parent, never the root row of a family. The companion CHECK
  // constraint ContentItem_revision_version_check (added in migration
  // 20260728174034_content_revision_version_check, since Prisma cannot express CHECK
  // constraints) pins roots to version 1 and revisions to version > 1, which is what makes
  // version unique across a whole revision family. Keep both, or neither holds.
  @@unique([parentContentId, version])
}

model ContentSource {
  id              String     @id @default(cuid())
  contentId       String
  sourceType      SourceType
  title           String
  author          String?
  publisher       String?
  edition         String?
  volume          String?
  page            String?
  chapter         String?
  referenceNumber String?
  url             String?
  notes           String?
  sortOrder       Int        @default(0)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  content ContentItem @relation(fields: [contentId], references: [id], onDelete: Cascade)

  @@index([contentId, sortOrder])
}

/// One delivery cycle: a single content selection for one stream on one calendar date, fanned
/// out to every active subscriber as `ContentDelivery` children.
///
/// The cycle is keyed by *calendar date*, not by absolute time. Because each subscriber is sent
/// to at their own local `sendTime`, one `deliveryLocalDate` can span roughly 49 hours of real
/// time across UTC+14 to UTC-11. Everyone who reaches that date receives the same content: the
/// first subscriber to cross `sendTime` creates the run and picks the content, and every later
/// subscriber on the same date reuses it.
model DeliveryRun {
  id                String              @id @default(cuid())
  streamId          String
  /// Null only when the cycle was SKIPPED for lack of eligible content.
  contentId         String?
  triggerType       DeliveryTriggerType
  /// Outcome of the *cycle*, not of any one person: PENDING (reserved), SENT (content selected
  /// and fanned out) or SKIPPED. Whether a given subscriber actually received the message lives
  /// on the child row — SENT here never means "everyone got it".
  status            DeliveryStatus      @default(PENDING)
  deliveryLocalDate DateTime            @db.Date
  idempotencyKey    String?
  scheduledFor      DateTime?
  reservedAt        DateTime            @default(now())
  skippedAt         DateTime?
  errorCode         String?
  /// Rendered once per cycle and reused for every subscriber and every retry, so a retry
  /// resends exactly what was originally sent rather than re-rendering mutable content.
  renderedText      String?
  renderedBlocks    Json?
  rendererVersion   String?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  stream     ScheduleStream    @relation(fields: [streamId], references: [id], onDelete: Cascade)
  content    ContentItem?      @relation(fields: [contentId], references: [id], onDelete: SetNull)
  deliveries ContentDelivery[]

  /// PLAN.md §2.2 at the cycle level: one content selection per stream per local date.
  @@unique([streamId, deliveryLocalDate])
  /// Manual-send idempotency (§5.16). Nullable for scheduled runs; PostgreSQL treats each NULL
  /// as distinct, so this only constrains manual sends, which must always supply a key.
  @@unique([streamId, idempotencyKey])
  /// Backs least-recently-sent selection, which is a property of the cycle, not of a subscriber.
  @@index([contentId, createdAt])
  @@index([status, deliveryLocalDate])
}

/// One subscriber's copy of a cycle: the unit that is actually sent, failed, and retried.
///
/// Splitting this from `DeliveryRun` is what makes retry per person — one subscriber's
/// permanent failure leaves the others `SENT` and is retried alone.
model ContentDelivery {
  id             String         @id @default(cuid())
  runId          String
  subscriberId   String
  status         DeliveryStatus @default(PENDING)
  /// The `D…` direct-message channel Slack returns for this user, not a configured channel.
  slackChannelId String?
  slackMessageTs String?
  attemptCount   Int            @default(0)
  nextRetryAt    DateTime?
  lastAttemptAt  DateTime?
  sendingAt      DateTime?
  sentAt         DateTime?
  failedAt       DateTime?
  errorCode      String?
  errorMessage   String?
  isRetryable    Boolean?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  run        DeliveryRun    @relation(fields: [runId], references: [id], onDelete: Cascade)
  subscriber UserSubscriber @relation(fields: [subscriberId], references: [id], onDelete: Cascade)

  /// PLAN.md §2.2 at the person level: one send per subscriber per cycle.
  @@unique([runId, subscriberId])
  @@index([status, nextRetryAt])
  @@index([subscriberId, createdAt])
}

model AuditEvent {
  id          String   @id @default(cuid())
  workspaceId String?
  actorId     String
  action      String
  entityType  String
  entityId    String
  requestId   String?
  metadata    Json?
  createdAt   DateTime @default(now())

  workspace SlackWorkspace? @relation(fields: [workspaceId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId])
  @@index([actorId, createdAt])
}
```

## 8.1 Schema notes

1. PostgreSQL may treat `NULL` values as distinct in a unique constraint. Confirm the behavior of `@@unique([streamId, idempotencyKey])`. Manual sends must always provide a non-null idempotency key.
2. `deliveryLocalDate` should be a PostgreSQL `DATE`.
3. `sendTime` can remain a validated `HH:mm` string for MVP.
4. `daysOfWeek` should be empty for daily streams.
5. Store the rendered snapshot on the **run**, not on each subscriber's row: shared rotation renders once per cycle, so duplicating it per subscriber would store N identical copies and let them drift.
6. A later version can normalize type-specific payloads, but JSON is acceptable for the MVP when strict DTO and review validation are enforced.
7. **Resolved in migration `20260729164457_per_subscriber_delivery`.** The channel-to-DM pivot left `ContentDelivery` shaped for one channel post per stream per day, which made per-person duplicate prevention inexpressible and retry all-or-nothing. Delivery is now two levels: `DeliveryRun` is one cycle (one stream, one calendar date, one content selection, one render) and `ContentDelivery` is one subscriber's copy of it. A cycle is keyed by calendar date rather than absolute time, so with per-subscriber send times a single `deliveryLocalDate` can span ~49 hours across UTC+14 to UTC−11 while still delivering the same item to everyone who reaches that date.
8. `ScheduleStream.timezone` is a reference zone for display only. `UserSubscriber.timezone` decides when a person is actually sent to.
9. `UserSubscriber.locale` is reserved and unused: one shared render per cycle can only carry one locale, which is the stream's. Wire it up only alongside per-subscriber rendering.

---

# 9. API Specification

Base path:

```text
/api/v1
```

All admin endpoints require:

```http
X-Admin-Key: <secret>
```

## 9.1 Health

### `GET /health/live`

Returns process liveness.

### `GET /health/ready`

Returns database readiness.

Example:

```json
{
  "status": "ok",
  "checks": {
    "database": "up"
  },
  "timestamp": "2026-07-28T09:00:00.000Z"
}
```

## 9.2 Content endpoints

### `POST /content`

Create a draft.

Request:

```json
{
  "type": "AYAH",
  "locale": "ar",
  "title": "آية في الشكر",
  "payload": {},
  "sources": [],
  "createdBy": "admin"
}
```

Response: created content item.

### `GET /content`

Filters:

- `type`
- `status`
- `locale`
- `search`
- `page`
- `limit`
- `sort`

### `GET /content/:id`

Return content, sources, revision metadata, and delivery summary.

### `PATCH /content/:id`

Allowed only for `DRAFT` or `REJECTED` items.

Use optimistic concurrency through an expected `updatedAt` or version field.

### `POST /content/:id/submit-review`

Transition `DRAFT` to `IN_REVIEW`.

### `POST /content/:id/approve`

Request:

```json
{
  "reviewerId": "reviewer-1",
  "reviewNote": "Verified text and references."
}
```

### `POST /content/:id/reject`

Request:

```json
{
  "reviewerId": "reviewer-1",
  "reviewNote": "The source reference is incomplete."
}
```

### `POST /content/:id/archive`

Archive approved content.

### `POST /content/:id/revise`

Create a new draft revision linked to the existing item.

### `GET /content/:id/preview`

Return:

```json
{
  "text": "plain-text fallback",
  "blocks": []
}
```

Preview must work for draft content and return validation warnings.

### `GET /content/:id/deliveries`

Paginated delivery history.

## 9.3 Workspace endpoints

### `POST /workspaces`

Creates the manually configured workspace record.

### `GET /workspaces`

### `GET /workspaces/:id`

### `POST /workspaces/:id/verify-token`

Calls Slack `auth.test` and updates verification fields.

### `PATCH /workspaces/:id`

Enable or disable installation.

## 9.4 Subscriber endpoints

Users are not created through the admin API in normal operation — they opt in themselves by
sending `/subscribe` to the bot in a direct message (§4.1, §5.11), which the Slack events module
resolves into a `UserSubscriber` row automatically. The endpoints below exist for administrative
visibility and for creating a subscriber record ahead of time (for example, to test a delivery
before asking someone to opt in).

### `POST /subscribers`

Request:

```json
{
  "workspaceId": "workspace-id",
  "slackUserId": "U0123456789",
  "timezone": "Africa/Cairo",
  "locale": "ar",
  "isActive": true
}
```

There is no channel to verify: `chat.postMessage` to a Slack user ID opens or reuses that
user's direct message with the bot automatically.

### `GET /subscribers`

### `GET /subscribers/:id`

### `PATCH /subscribers/:id`

## 9.5 Stream endpoints

Streams belong to a workspace and broadcast to every active subscriber in it, not to a single
subscription.

### `POST /streams`

Request:

```json
{
  "name": "Primary Daily Message",
  "frequency": "DAILY",
  "sendTime": "09:00",
  "timezone": "Africa/Cairo",
  "locale": "ar",
  "daysOfWeek": [],
  "allowedContentTypes": ["AYAH", "HADITH"],
  "selectionStrategy": "LEAST_RECENTLY_SENT",
  "maxAutomaticAttempts": 1,
  "isEnabled": true
}
```

`sendTime` is evaluated in each subscriber's own timezone, so a stream's `timezone` is a
reference value for display and does not decide when anyone receives the message. `locale`
filters content selection and is the locale the cycle renders in.

### `GET /streams`

### `GET /streams/:id`

### `PATCH /streams/:id`

### `POST /streams/:id/enable`

### `POST /streams/:id/disable`

### `GET /streams/:id/next-content`

Dry-run selection. It must not create a run, reserve anything, or deliver content.

### `POST /streams/:id/send-now`

Request:

```json
{
  "idempotencyKey": "manual-2026-07-28-primary-001",
  "contentId": "optional-specific-approved-content-id"
}
```

Rules:

- Requires approved content.
- If `contentId` is omitted, use normal selection.
- Creates one run with `triggerType: MANUAL` and one delivery per active subscriber.
- Sends immediately, ignoring each subscriber's local `sendTime`.
- Repeating the same idempotency key returns the existing run and its deliveries instead of posting again. The key is unique per stream on the run, so a repeat cannot re-fan-out to anyone.

## 9.6 Delivery endpoints

A delivery is one subscriber's copy of a cycle. The cycle itself is a `DeliveryRun`, reachable
through `runId`.

### `GET /deliveries`

Filters:

- `status`
- `streamId`
- `runId`
- `subscriberId`
- `contentId`
- `dateFrom`
- `dateTo`
- `page`
- `limit`

### `GET /deliveries/:id`

Returns the subscriber's row together with its run, since the row alone does not say which
content or which date it belonged to.

### `POST /deliveries/:id/retry`

Retries **one subscriber's** delivery. Only allowed for `FAILED` deliveries whose
`isRetryable` is true; a permanent Slack failure such as `account_inactive` is never retried.
The retry resends the run's stored snapshot rather than re-rendering, and updates the existing
row rather than inserting another.

### `POST /deliveries/:id/mark-skipped`

Administrative escape hatch with a required reason, scoped to one subscriber's delivery.

### `GET /runs/:id`

The cycle: which content was selected for a stream on a local date, the rendered snapshot, and
the per-subscriber outcomes. This is where a partial failure is diagnosed — some subscribers
`SENT`, others `FAILED`.

## 9.7 Audit endpoints

### `GET /audit-events`

Filters:

- `actorId`
- `action`
- `entityType`
- `entityId`
- `dateFrom`
- `dateTo`

---

# 10. DTO Validation

Use `class-validator` and `class-transformer`.

Global validation pipe:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

Type-specific payload validation must be explicit.

Recommended approach:

1. Accept `type`.
2. Map `type` to a DTO class.
3. Validate `payload` against that DTO.
4. Validate source requirements.
5. Validate status transition separately.

Approval validation must be stricter than draft validation.

For example:

- A draft ayah may omit tafsir.
- An approved ayah cannot omit Arabic text, surah number, ayah number, and a Quran source.
- An approved hadith cannot omit Arabic text, collection, and a source.
- An approved Companion story must have at least one lesson and one source.
- An approved blessing reminder must have a body and at least one appropriate supporting source when it includes a religious quotation or claim.

---

# 11. Scheduler Design

## 11.1 Cron frequency

Run every hour:

```ts
@Cron(CronExpression.EVERY_HOUR)
```

An hourly scheduler is sufficient for MVP if send times are aligned to the hour.

If arbitrary minutes are required, run every five minutes instead. Do not run every second.

A more robust recommendation is every five minutes with a configured due window.

## 11.2 Due calculation

Due-ness is evaluated **per subscriber**, because each person is sent to at their own local `sendTime`. For each enabled stream, for each active subscriber of that stream's workspace:

1. Resolve the *subscriber's* timezone.
2. Convert current UTC time to that subscriber's local time.
3. Check frequency, and for `WEEKLY` check `daysOfWeek` against the subscriber's local day.
4. Check whether their local time is within the due window.
5. Calculate their local date.
6. Find or create the run for `(streamId, localDate)`, then attempt the unique per-subscriber reservation.

Suggested due window:

- `sendTime <= nowLocal < sendTime + schedulerInterval`

This prevents missing a delivery because the process started a few seconds late.

Use a timezone-aware library (§6.5) rather than offset arithmetic: around a DST transition the window can otherwise fire twice or not at all. Firing twice is harmless — the unique constraints absorb it — but skipping is a missed delivery.

A subscriber who opts in after their local `sendTime` has already passed is not backfilled; they start on the next cycle.

## 11.3 Pseudocode

```ts
async runSchedulerTick(nowUtc: Date): Promise<void> {
  const lockAcquired = await this.schedulerLock.tryAcquire();

  if (!lockAcquired) {
    return;
  }

  try {
    // Due-ness is per (stream, subscriber): one stream can be due for a subscriber in Auckland
    // and not yet due for one in Los Angeles, many hours apart on the same calendar date.
    const due = await this.schedules.findDueStreamSubscribers(nowUtc);

    for (const { stream, subscriber } of due) {
      try {
        await this.deliveryService.deliverToSubscriber(stream, subscriber, nowUtc);
      } catch (error) {
        // One subscriber's failure must never abort the rest of the tick.
        this.logger.error({
          event: 'scheduled_delivery_unhandled_error',
          streamId: stream.id,
          subscriberId: subscriber.id,
          error: normalizeError(error),
        });
      }
    }
  } finally {
    await this.schedulerLock.release();
  }
}
```

## 11.4 Delivery transaction pseudocode

Two reservations, one per level of §2.2. The run reservation decides *what* this cycle sends and
is shared; the per-subscriber reservation decides whether *this person* still needs it. Only the
second one is repeated per subscriber, so one person's failure is isolated to their own row.

```ts
async deliverToSubscriber(stream: Stream, subscriber: Subscriber, nowUtc: Date) {
  const localDate = calculateLocalDate(nowUtc, subscriber.timezone);

  // 1. Shared: find or create this cycle. The first subscriber to reach `localDate` selects the
  //    content and renders it; everyone else reaching the same date reuses that decision.
  const run = await this.reserveRun(stream, localDate, 'SCHEDULED');

  if (run.status === 'SKIPPED') {
    return run; // no eligible content for this cycle; nothing to send to anyone
  }

  // 2. Per person: claim this subscriber's slot. A unique violation means they were already
  //    handled by a concurrent tick or an earlier run of this one — an idempotent success.
  const delivery = await this.reserveSubscriberDelivery(run.id, subscriber.id);

  if (delivery === null) {
    return null;
  }

  // 3. Send outside any transaction, using the snapshot stored on the run so a retry resends
  //    exactly what was originally rendered.
  return this.sendDelivery(delivery.id, run, subscriber);
}

async reserveRun(stream: Stream, localDate: Date, triggerType: DeliveryTriggerType) {
  return this.prisma.$transaction(async (tx) => {
    const existing = await tx.deliveryRun.findUnique({
      where: { streamId_deliveryLocalDate: { streamId: stream.id, deliveryLocalDate: localDate } },
    });

    if (existing) {
      return existing;
    }

    const content = await this.contentSelector.select(tx, stream);

    if (!content) {
      return tx.deliveryRun.create({
        data: {
          streamId: stream.id,
          triggerType,
          status: 'SKIPPED',
          deliveryLocalDate: localDate,
          skippedAt: new Date(),
          errorCode: 'NO_ELIGIBLE_CONTENT',
        },
      });
    }

    // Rendered once here, then reused for every subscriber and every retry of this cycle.
    const rendered = this.renderer.render(content, { locale: stream.locale });

    return tx.deliveryRun.create({
      data: {
        streamId: stream.id,
        contentId: content.id,
        triggerType,
        status: 'SENT',
        deliveryLocalDate: localDate,
        scheduledFor: calculateScheduledUtc(stream, localDate),
        renderedText: rendered.text,
        renderedBlocks: rendered.blocks,
        rendererVersion: rendered.rendererVersion,
      },
    });
  }, { isolationLevel: 'Serializable' });
}
```

`reserveRun` and `reserveSubscriberDelivery` must both treat a unique-constraint violation as an
idempotent success and re-read the existing row (§11.5), because the advisory lock reduces races
but the constraints are what actually guarantee correctness.

## 11.5 Concurrency

Both unique constraints are mandatory even if a scheduler lock exists. The lock reduces contention; the constraints are what make correctness true.

Handle a unique-constraint race as an idempotent success, at either level:

- Query the existing run or subscriber delivery.
- Return it.
- Do not treat it as an application error.

The two levels fail differently and both must be handled. Losing the **run** race means another tick already chose this cycle's content — adopt it rather than selecting again, or subscribers on the same date would receive different items. Losing the **subscriber** race means that person was already sent to — stop, or they receive the message twice.

---

# 12. Slack Integration

## 12.1 Package

Use:

```bash
pnpm add @slack/web-api
```

Do not require Slack Bolt for the MVP because there are no slash commands, events, or interactive actions.

## 12.2 Required Slack bot scopes

Minimum:

```text
chat:write
```

One additional scope is needed depending on which subscription paths are enabled:

```text
im:history
```

`im:history` is required only for reading the plain-text `subscribe`/`unsubscribe` DM path
(§4.1); the `/subscribe` and `/unsubscribe` slash commands do not need it, since slash-command
payloads arrive as structured events regardless of message-history scopes.

Use only the scopes actually required.

There is no channel to invite the bot to: every message is a direct message to a user who
opted in, and `chat.postMessage` to a user ID opens that DM automatically.

## 12.3 Slack service interface

`channel` is Slack's own field name for the target of `chat.postMessage`; passing a Slack
user ID there opens (or reuses) that user's direct message with the bot, so no separate
channel concept or channel-access verification is needed for the DM model.

```ts
export interface SlackMessage {
  channel: string; // a Slack user ID (U…) for the DM model
  text: string;
  blocks: KnownBlock[];
}

export interface SlackPostResult {
  channel: string;
  ts: string;
}

export interface SlackGateway {
  verifyToken(workspaceId: string): Promise<void>;
  postMessage(
    workspaceId: string,
    message: SlackMessage,
  ): Promise<SlackPostResult>;
}
```

## 12.4 Slack error mapping

Normalize SDK errors into:

```ts
type NormalizedSlackError = {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  rawStatusCode?: number;
};
```

Never store the full raw response if it can expose secrets.

## 12.5 Message snapshot

Before sending, save or generate:

- Plain-text fallback.
- Blocks JSON.
- Renderer version.

Prefer saving snapshots before the Slack call, then updating status after the call. This enables exact retries and auditability.

The snapshot belongs to the cycle, so it is stored once on `DeliveryRun` and shared by every subscriber and every retry of that cycle.

A retry should normally resend the stored snapshot, not rerender mutable content.

---

# 13. Content Rendering

## 13.1 Renderer interface

```ts
export interface RenderContext {
  locale: string;
  footerText?: string;
}

export interface RenderedSlackMessage {
  text: string;
  blocks: KnownBlock[];
  rendererVersion: string;
  warnings: string[];
}

export interface ContentRenderer<TPayload> {
  supports(type: ContentType): boolean;
  render(
    content: ContentItemWithSources,
    context: RenderContext,
  ): RenderedSlackMessage;
}
```

Create one renderer per content type.

## 13.2 Formatting rules

- Arabic content should be presented in its original order.
- Avoid excessive emoji.
- Use a small, consistent set of visual markers only if desired.
- Do not put the full message inside a code block.
- Use dividers sparingly.
- Display source references in a concise final context block.
- Escape Slack special characters where necessary. The **only** transformation permitted on
  stored Quran and hadith text is Slack's `&`, `<`, and `>` escaping: the exact stored Arabic
  must otherwise reach Slack unchanged, with no normalization, trimming, or truncation.
- Do not create clickable links for missing or untrusted URLs.

## 13.3 Renderer versioning

Store a renderer version string, such as:

```text
ayah-v1
hadith-v1
companion-story-v1
blessing-reminder-v1
```

This helps explain formatting differences between old and new deliveries.

---

# 14. Content Import and Seeding

## 14.1 Runtime rule

The production scheduler reads only from the local PostgreSQL database.

## 14.2 Controlled import

A separate import script may:

- Read reviewed JSON or CSV.
- Validate structure.
- Calculate checksums.
- Create draft content and sources.
- Produce an import report.
- Never auto-approve imported content unless the source file itself is a signed, reviewer-approved release artifact and the process is explicitly configured.

## 14.3 Suggested source file structure

```json
{
  "type": "HADITH",
  "locale": "ar",
  "title": "فضل الكلمة الطيبة",
  "payload": {
    "arabicText": "...",
    "collection": "...",
    "hadithNumber": "...",
    "grade": "...",
    "conciseExplanation": "...",
    "reflection": "...",
    "practicalAction": "..."
  },
  "sources": [
    {
      "sourceType": "HADITH_COLLECTION",
      "title": "...",
      "referenceNumber": "..."
    }
  ],
  "review": {
    "reviewerId": "reviewer-1",
    "reviewedAt": "2026-07-28T00:00:00.000Z"
  }
}
```

## 14.4 Verification references

Possible references used during editorial verification may include:

- A reliable Quran text dataset or Quran API for controlled import.
- Recognized tafsir books.
- Recognized books of asbab al-nuzul.
- Original hadith collections.
- Dorar or another scholarly hadith index for verification.
- Sunnah.com as a reference index when appropriate.

Do not make runtime availability depend on these external services. Respect licensing and terms of use.

---

# 15. Configuration

Use environment variables validated at application startup.

Example `.env.example`:

```dotenv
NODE_ENV=development
PORT=3000
APP_BASE_URL=http://localhost:3000

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/daily_islamic_slack_bot

ADMIN_API_KEY=replace-with-a-long-random-secret

SLACK_BOT_TOKEN=xoxb-replace-me
SLACK_TOKEN_SECRET_KEY=primary-slack-bot-token
SLACK_APP_TOKEN=xapp-replace-me

DEFAULT_TIMEZONE=Africa/Cairo
DEFAULT_LOCALE=ar

SCHEDULER_ENABLED=true
SCHEDULER_INTERVAL_MINUTES=5
SCHEDULER_LOCK_ID=874321

# Shifts the application's idea of "now", so per-subscriber scheduling can be exercised without
# waiting. Startup fails if non-zero while NODE_ENV=production.
CLOCK_OFFSET_SECONDS=0

LOG_LEVEL=debug
SWAGGER_ENABLED=true
```

Startup must fail fast when required configuration is invalid.

Use a validation library such as Joi or Zod.

---

# 16. Local Development

## 16.1 Prerequisites

- Node.js 20 LTS or newer supported LTS.
- pnpm.
- PostgreSQL 15 or newer.
- A Slack app and bot token.
- A Slack test user (your own account is sufficient).

## 16.2 Suggested commands

```bash
pnpm install
pnpm prisma generate
pnpm prisma migrate dev
pnpm db:seed
pnpm start:dev
```

## 16.3 Suggested package scripts

```json
{
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "lint": "eslint .",
    "format": "prettier --write .",
    "prisma:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy",
    "db:migrate:dev": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "content:import": "tsx scripts/import-content.ts",
    "content:validate": "tsx scripts/validate-content.ts"
  }
}
```

---

# 17. Verification Strategy

This project deliberately carries **no automated test suite and no test tooling**. Correctness is
established by type checking, linting, and exercising the running application directly. Every
change must be verified before it is considered done.

## 17.1 Standing gate

```bash
pnpm lint
pnpm build
pnpm db:status
```

`pnpm build` runs `prisma generate` first, so it also proves the schema and client agree.
`pnpm db:status` must report every migration applied and no drift.

## 17.2 Manual verification

Run the application against the development database and exercise the affected endpoints with
`curl`, using the `X-Admin-Key` header. Read the key from the environment rather than pasting it:

```bash
KEY=$(grep ^ADMIN_API_KEY .env | cut -d= -f2-)
```

Assert against the database with `psql` where the HTTP response alone cannot prove the outcome —
row counts, constraint enforcement, audit rows, and rollback after a failed request.

## 17.3 What each area requires

- **Payload validation.** Create a draft that is valid at draft level but incomplete for
  approval, and confirm approval is rejected with the expected `details` and that the item's
  status and checksum are unchanged.
- **Status transitions.** Attempt each disallowed transition and confirm
  `INVALID_STATUS_TRANSITION`.
- **Rendering.** Preview each content type and paste the returned `blocks` into Slack's Block Kit
  Builder, which must validate them with no errors.
- **Stored religious text.** Compare the rendered block text against
  `SELECT payload->>'arabicText'` with `diff` and `shasum`; they must be byte-identical. The only
  transformation the renderer may apply is Slack's `&`, `<`, `>` escaping.
- **Scheduling and selection** (Phase 4). Run the scheduler twice for the same local date and
  confirm exactly one delivery row and one Slack call; restart the process mid-flight and confirm
  no duplicate.
- **Idempotency** (Phase 4). Repeat a manual send with the same idempotency key and confirm the
  stored result is returned without a second Slack call.
- **Slack failures.** Exercise an invalid token and a nonexistent user ID, and confirm the
  normalized error code, the `retryable` flag, and that no secret appears in the logs
  (`grep -c 'xox' app.log` must be `0`).
- **Audit trail.** After any sensitive administrative action, confirm the expected `AuditEvent`
  row exists with the correct actor, request ID, and before/after metadata.

## 17.4 Religious content

Automated checks could not verify theological correctness in any case. Human review remains
mandatory, and the reviewer is responsible for text, citations, grading, and attribution.
Verification here is limited to the mechanical guarantees: required source fields are present,
Quran references are structurally valid, an approved hadith carries a collection, unreviewed
content cannot be delivered, and stored Arabic reaches the renderer unchanged.

# 18. Logging and Error Handling

## 18.1 Global error format

```json
{
  "statusCode": 400,
  "code": "CONTENT_VALIDATION_FAILED",
  "message": "Content payload is invalid.",
  "details": [
    {
      "field": "payload.arabicText",
      "message": "arabicText is required for approval"
    }
  ],
  "requestId": "req_123"
}
```

## 18.2 Recommended error codes

- `UNAUTHORIZED_ADMIN`
- `CONTENT_NOT_FOUND`
- `CONTENT_VALIDATION_FAILED`
- `INVALID_STATUS_TRANSITION`
- `CONTENT_NOT_APPROVED`
- `NO_ELIGIBLE_CONTENT`
- `WORKSPACE_NOT_FOUND`
- `SUBSCRIBER_NOT_FOUND`
- `STREAM_NOT_FOUND`
- `DELIVERY_NOT_FOUND`
- `SLACK_TOKEN_INVALID`
- `SLACK_SEND_FAILED`
- `DELIVERY_ALREADY_EXISTS`
- `DELIVERY_NOT_RETRYABLE`
- `IDEMPOTENCY_KEY_REQUIRED`
- `SCHEDULE_INVALID`
- `TIMEZONE_INVALID`

## 18.3 Sensitive logging

Redact:

- Slack tokens.
- Admin keys.
- Database credentials.
- Authorization headers.

Religious content itself is not secret, but avoid logging complete message bodies on every request. Log content and delivery IDs instead.

---

# 19. Deployment

## 19.1 Recommended MVP deployment

A small Linux VPS or container platform is sufficient.

Components:

- NestJS application.
- PostgreSQL.
- Nginx or managed reverse proxy.
- PM2, systemd, or Docker restart policy.
- HTTPS.
- Daily database backups.

## 19.2 Docker Compose example shape

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "127.0.0.1:3000:3000"

  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: daily_islamic_slack_bot
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app_user -d daily_islamic_slack_bot"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

Do not expose PostgreSQL publicly.

## 19.3 Production migrations

Deployment order:

1. Build application.
2. Back up database.
3. Run `prisma migrate deploy`.
4. Restart or reload application.
5. Check readiness.
6. Verify scheduler lock and next due streams.
7. Verify the Slack token after major configuration changes.

## 19.4 Scheduler deployment safety

Never accidentally run production scheduling from:

- Developer laptops.
- Preview environments.
- Staging using the production Slack token.

Use separate tokens and test users for development/staging.

Require:

```dotenv
SCHEDULER_ENABLED=false
```

by default outside production unless explicitly enabled.

---

# 20. Monitoring and Operations

## 20.1 Minimum alerts

Alert when:

- No successful delivery occurred for an expected active stream.
- A delivery fails.
- Slack authentication becomes invalid.
- No approved eligible content remains for a stream.
- Database readiness fails.
- The process restarts repeatedly.

## 20.2 Useful operational queries

- Next due stream.
- Last completed cycle per stream, and the content it sent.
- Cycles where some subscribers succeeded and others failed — the partial-failure case that the per-subscriber split exists to make visible.
- Failed deliveries in the last seven days, grouped by subscriber and by Slack error code.
- Subscribers whose deliveries fail persistently, which usually means a deactivated Slack account.
- Remaining never-sent approved content per stream.
- Content items with incomplete sources.
- Content items awaiting review.
- Repetition interval per content item.

## 20.3 Backup policy

Minimum:

- Daily PostgreSQL backup.
- Retain at least seven daily backups.
- Periodically test restoration.
- Back up content source files and import reports.
- Do not rely only on the VPS disk.

---

# 21. Initial Seed Data

Development seed should create:

1. One Slack workspace using `SLACK_TOKEN_SECRET_KEY`.
2. One test user subscriber (yourself).
3. Three streams on that workspace:
   - Daily Aya/Hadith.
   - Daily blessing reminder.
   - Weekly Companion story.
4. At least one draft and one approved example for each content type.
5. Example source references.
6. No fake Quran or hadith text in production seeds.

Development-only fixture text must be clearly labeled as test data and must never be approved in production.

---

# 22. Suggested Implementation Phases

## Phase 1: Foundation

- Initialize NestJS project.
- Add ConfigModule.
- Add Prisma and PostgreSQL.
- Add environment validation.
- Add health endpoints.
- Add structured logger.
- Add admin API-key guard.
- Create schema and migrations.

Exit criteria:

- Application starts.
- Database migration succeeds.
- Health checks pass.
- Protected endpoint rejects missing key.

## Phase 2: Content and review

- Implement content CRUD.
- Implement type-specific DTO validation.
- Implement source CRUD within content operations.
- Implement review transitions.
- Implement revision creation.
- Implement audit events.
- Add Swagger docs.

Exit criteria:

- Approved content cannot bypass validation.
- Invalid transitions are rejected.
- All changes are auditable.

## Phase 3: Slack rendering and integration

- Add Slack client provider.
- Add workspace verification.
- Add workspace token verification.
- Implement four renderers.
- Add preview endpoint.
- Add Slack error mapping.
- Implement subscriptions.
- Add a diagnostic Slack connectivity endpoint.

Exit criteria:

- Every content type renders valid Block Kit.
- Preview works without posting.
- Test message posts to a subscriber's direct message.

## Phase 4: Scheduling and delivery

See §29.1 for the current detailed punch list; the bullets below are the phase summary.

- Split delivery into per-cycle and per-subscriber records (migration `20260729164457_per_subscriber_delivery`). **Done** — everything below depends on it.
- Add `@nestjs/schedule` and a timezone library, and introduce the injectable `Clock` (§24). **Done**
- Implement streams. **Done**
- Implement per-subscriber due calculation. **Done**
- Implement content selection.
- Implement the two-level reservation transaction.
- Implement scheduled and manual sends with per-subscriber fan-out.
- Implement per-subscriber retries.
- Add scheduler lock.

Exit criteria:

- Two scheduler executions produce one message per subscriber, not two.
- Subscribers in different timezones receive the same content on their own local date.
- Restart does not duplicate a sent delivery.
- One subscriber's failure leaves the others `SENT`, is visible, and is retryable on its own.
- A permanent Slack failure is not retried automatically.

## Phase 5: Content import and launch hardening

- Add JSON/CSV import script.
- Add content validation report.
- Seed reviewed library.
- Add production Docker setup.
- Add backup instructions.
- Add monitoring.

Exit criteria:

- At least 90 reviewed items are ready; target 120.
- Production scheduling is tested with a real subscriber account.
- Restore procedure is documented.
- No secrets are committed.

---

# 23. Acceptance Criteria

The MVP is complete only when all of the following are true:

1. An admin can create all four content types.
2. Content cannot be scheduled before approval.
3. Approval requires type-specific mandatory fields and sources.
4. The app can render a preview without sending.
5. The app posts valid Slack Block Kit messages.
6. The plain-text Slack fallback is present.
7. Streams are configured per workspace and broadcast to every active subscriber.
8. The system supports `Africa/Cairo` correctly.
9. Daily and weekly schedules work.
10. A subscriber cannot receive the same stream twice for the same local date, and a stream cannot select content twice for the same local date.
11. The app survives restart without duplicate delivery.
12. Failed Slack calls are stored.
13. Retryable failures can be retried.
14. Permanent failures are not retried automatically.
15. Manual sends require an idempotency key.
16. Delivery records preserve the rendered message snapshot.
17. The selection algorithm avoids recent repetition.
18. Unapproved, rejected, and archived content is never selected.
19. Audit events are created for sensitive administrative actions.
20. Swagger accurately documents the REST API.
21. Production secrets are loaded only from environment or a secret manager.
22. PostgreSQL is not publicly exposed.
23. Scheduler behavior can be disabled by environment variable.
24. The project includes clear setup, migration, seed, deployment, and backup instructions.

---

# 24. Coding Standards

- TypeScript strict mode.
- No `any` unless justified in a comment.
- Small services with explicit responsibilities.
- Dependency injection for Slack gateway, clock, and scheduler lock.
- Use a `Clock` abstraction instead of calling `Date.now()` inside services.
- Use UTC internally and timezone conversion only at scheduling boundaries.
- Use ISO 8601 timestamps in APIs.
- Use database transactions for delivery reservation.
- Use repositories only where they clarify data access; do not create empty abstraction layers.
- Use ESLint and Prettier.
- Use conventional commits where possible.
- Add JSDoc only for non-obvious business rules.
- Prefer enums and discriminated unions for content types.
- Never swallow errors silently.
- Never use `synchronize: true` in production.
- Do not mutate approved content in place.
- Do not call external AI services from the scheduler or renderer.

---

# 25. AI Coding Agent Instructions

The coding agent must follow these rules:

1. Implement the system incrementally by phase.
2. Before writing code, inspect the existing repository and preserve its conventions where reasonable.
3. Do not replace Prisma with another ORM.
4. Do not add Redis, BullMQ, or Slack Bolt for the MVP.
5. Do not build a frontend unless explicitly requested.
6. Do not generate real religious content as seed data.
7. Use placeholders clearly marked as development fixtures.
8. Do not auto-approve imported content.
9. Add migrations for every schema change.
10. Do not claim completion while acceptance criteria are failing.
11. Document every environment variable.
12. Make Slack and time dependencies injectable so they can be substituted.
13. Use database-level idempotency, not only in-memory flags.
14. Preserve exact stored Quran and hadith Arabic text during rendering.
15. Keep public methods typed.
16. Return normalized API errors.
17. Keep the scheduler disabled by default outside production.
18. Produce a final implementation report listing:
    - Files added or changed.
    - Migrations created.
    - Commands to run.
    - Remaining limitations.
    - Any deviation from this specification.

---

# 26. Recommended First Agent Task

Give the coding agent this first scoped instruction:

> Initialize or inspect the NestJS repository and implement Phase 1 only: configuration validation, Prisma/PostgreSQL integration, the complete initial database schema, migrations, health endpoints, structured logging, and the `X-Admin-Key` guard. Do not implement Slack posting or the scheduler yet. At the end, provide commands to run the app, plus a file-by-file summary.

After Phase 1 is reviewed, continue with Phase 2 instead of asking the agent to implement the entire system in one uncontrolled change.

---

# 27. Future Enhancements

These are intentionally deferred:

- Public Slack OAuth installation.
- Multiple organizations with self-service onboarding.
- Web admin dashboard.
- Interactive buttons and feedback.
- Per-user rendering locale (schema field exists on `UserSubscriber.locale`; unused, §8.1 note 9).
- Multiple languages.
- Content campaigns for Ramadan or special periods.
- Approval roles and user accounts.
- Import integrations.
- Notification alerts to an admin Slack channel.
- BullMQ-based delivery workers when scale requires it.
- Metrics dashboard.
- Content engagement analytics.
- Public API.
- Billing.

Any future AI-assisted editorial workflow must remain draft-only and require human review before approval.

---

# 28. Final Architectural Decision Summary

Use:

- NestJS.
- TypeScript.
- PostgreSQL.
- Prisma.
- `@nestjs/schedule`.
- `@slack/web-api`.
- Slack Block Kit.
- Local, reviewed content.
- Admin REST API with Swagger.
- Database-backed idempotency and delivery history.
- Timezone-aware schedules.
- One-process MVP with a scheduler lock.
- No Redis or BullMQ initially.
- No Slack Bolt initially.
- No runtime religious-content API dependency.
- No automatic AI publishing.

The most important correctness rule is:

> No content is delivered unless it is locally stored, source-referenced, human-reviewed, approved, selected through an idempotent delivery transaction, and successfully accepted by Slack.

---

# 29. Known Gaps and Remaining Work

This section is the authoritative punch list as of migration `20260729164457_per_subscriber_delivery`. It exists because the channel-to-DM pivot and the per-subscriber delivery split each closed one set of gaps while the surrounding modules — audit vocabulary, the scheduler, security hardening — were left for later. Keep this section current: when an item here is closed, delete it from here and, if it changes behavior described elsewhere in this document, update that section too rather than leaving both a fixed gap and a stale note.

## 29.1 Implemented, pending §17 manual verification

Both items below are now code-complete (lint/build/`db:status` all pass, and the application
boots cleanly with every new module wired into the DI graph) but have **not** been through §17's
manual verification, which requires sending real Slack messages to a real subscriber and is
therefore left to whoever runs it with their own workspace/token rather than performed
unilaterally. Do not treat this section as "done" until that pass has run per PLAN.md §17.2's
checklist for scheduling and idempotency.

1. **`deliveries/` and `scheduler/` modules.** §7.3 named both; both now exist. `deliveries/`
   implements §9.6 (including `GET /runs/:id` as a top-level route), and `scheduler/` implements
   the tick, an xact-scoped advisory lock (`pg_try_advisory_xact_lock`, not the session-scoped
   `pg_try_advisory_lock` — see `scheduler.lock.ts`), and the two-level reservation transaction
   from §11. **Deliberately not implemented in this slice:** `POST /streams/:id/send-now` and the
   `MANUAL` trigger type. The schema's two `DeliveryRun` unique constraints don't obviously allow
   a manual run to coexist with a same-date scheduled run, and that question was deferred rather
   than resolved — see the `send-now` note if this is picked up later. The automatic retry sweep
   *is* implemented (bounded by each stream's `maxAutomaticAttempts`, counted per subscriber), and
   also reclaims `ContentDelivery` rows stuck at `SENDING` by a crash mid-send.
2. **`DELIVERY_*` audit vocabulary.** `src/audit/audit.constants.ts` now has `DELIVERY_RETRIED`
   and `DELIVERY_MARKED_SKIPPED` actions and `DELIVERY_RUN`/`DELIVERY` entity types. Scheduled
   sends, scheduled failures, and automatic retries are intentionally **not** audited — they're
   system-generated and actor-less; they go through structured logs (§6.4) instead. Only the two
   admin-triggered actions above write `AuditEvent` rows.

## 29.2 Dead code — removed

The orphaned `verifyChannel`, `SlackChannelInfo`, and `slackChannelInaccessible` from the
channel-subscription design were deleted. `SlackGateway` is now `verifyToken` + `postMessage`,
which is the whole surface the DM model needs.

## 29.3 Deferred to Phase 5 — referenced elsewhere as though already built

These are legitimately out of scope until Phase 5, but three places in this document read as if they already exist, which will mislead an agent picking up Phase 4:

- **`pnpm db:seed` / `prisma/seed.ts`.** Named in §16.2, §16.3, and §21, but neither the script entry nor the file exists. Until Phase 5 builds it, §16.2's suggested setup commands will fail on a clean checkout at that step; a reader following them should skip it and create fixtures through the admin API instead (as the manual verification flow in §17.2 already does).
- **`content:import` / `content:validate` scripts** (§14.2, §16.3). Neither `scripts/import-content.ts` nor `scripts/validate-content.ts` exists yet.
- **Docker Compose deployment** (§19.2). The example shape is illustrative; no `Dockerfile` or `docker-compose.yml` exists in the repository yet.

## 29.4 Security hardening named in §6.2 but not yet implemented

§6.2 requires Helmet and admin-endpoint rate limiting. Neither is wired into `src/main.ts` or `src/app.module.ts` today. Input validation (`class-validator` + the global `ValidationPipe`), parameterized queries (via Prisma), and the `X-Admin-Key` guard are in place; the two gaps are additive middleware and can be picked up independently of Phase 4's scheduling work, but should not be forgotten before a production deployment (§19).

## 29.5 Design questions Phase 4 must still resolve

Not gaps in the sense of missing code — the schema and API surface described in §8, §9.5, and §9.6 already answer these — but decisions worth restating here so a later reader does not re-litigate them:

- **Content rotation is shared, not per-subscriber.** One `DeliveryRun` per stream per calendar date is selected once and fanned out to every active subscriber; nobody gets their own independent rotation. See §2.2 and the `DeliveryRun` doc comment in §8.
- **Send time is governed by the subscriber's timezone, not the stream's.** `ScheduleStream.timezone` is a display-only reference value (§8.1 note 8). Do not wire scheduling logic to it.
- **`UserSubscriber.locale` is inert.** It is reserved for a future per-subscriber-rendering phase and must not be read by the Phase 4 renderer path (§8.1 note 9) — the cycle renders once, in the stream's `locale`.

## 29.6 What is verified working today

To keep this list honest as a *gap* list and not a general status report: Phases 1 through 3 are implemented and manually verified per §17, including the full content lifecycle, all four renderers, the preview endpoint, workspace token verification, the diagnostic Slack connectivity endpoint, per-user subscription via `/subscribe`/`/unsubscribe` over Socket Mode, and the per-subscriber delivery schema itself (migration `20260729164457_per_subscriber_delivery`, with its two-level unique-constraint guarantee confirmed against a running database). Slice 2 then added the scheduling foundations: `@nestjs/schedule` and `luxon` are installed, the injectable `Clock` (§24) exists with a `CLOCK_OFFSET_SECONDS` escape hatch that startup refuses in production, and `src/common/utils/schedule-time.ts` implements per-subscriber local-date arithmetic — verified directly, including that one calendar date spans 48.98 hours between UTC+14 and UTC−11, that `daysOfWeek` maps 0=Sunday, and that DST transitions neither throw nor skip a day. Slice 3 implemented the `streams/` module and `STREAM_*` audit vocabulary.

Slice 4 implemented the scheduler and its supporting modules (§29.1): due-stream-subscriber
lookup, content selection (§5.14, both strategies), the two-level reservation transaction, Slack
send/failure recording, the admin retry and mark-skipped endpoints, and the automatic retry
sweep. This has passed `pnpm lint`/`pnpm build`/`pnpm db:status` and a DI/boot smoke test, but
**not yet** the §17.2 manual verification pass with a real Slack subscriber — that step, and the
`send-now`/`MANUAL` deferral noted in §29.1, are what remains before Phase 4 can be called done.
The deferred work in §29.3–29.4 is still outstanding and unrelated to the scheduler.
