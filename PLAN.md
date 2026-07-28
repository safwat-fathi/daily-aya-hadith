# Slack Bot for Daily Aya & Hadith

## Technical Product Specification and AI Coding Agent Handoff

**Document version:** 1.0  
**Status:** Implementation-ready MVP specification  
**Primary stack:** NestJS, TypeScript, PostgreSQL, Prisma, Slack Web API  
**Package manager:** pnpm  
**Initial deployment model:** One Slack workspace and one channel  
**Architecture requirement:** Must remain extensible to multiple workspaces, channels, and schedules without a database rewrite

---

# 1. Purpose

Build a Slack bot that sends carefully reviewed Islamic content to a configured Slack channel on a scheduled basis.

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

The system must provide database-level protection against sending the same scheduled stream more than once for the same local delivery date.

## 2.3 Simple MVP, extensible internals

The first release supports one workspace and one channel, but the following entities must still be modeled separately:

- Slack workspace installation
- Slack channel subscription
- Scheduled content stream
- Content item
- Delivery record

This avoids coupling the entire application to environment variables or a single channel.

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
- One configured Slack workspace and channel.
- Multiple configurable scheduled streams per channel.
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

## 4.1 Slack channel member

Receives scheduled Islamic messages in a Slack channel.

No login or direct interaction is required for the MVP.

## 4.2 Content editor

Creates and edits draft content through the admin API.

An editor cannot make draft content eligible for delivery unless they also have reviewer permission. For the MVP, this may be enforced operationally with a single admin API key, while the database preserves review metadata.

## 4.3 Content reviewer

Reviews religious text, citations, explanations, and formatting. Approves or rejects content.

## 4.4 System administrator

Configures the Slack installation, channel subscription, scheduled streams, delivery behavior, retries, and application settings.

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

## 5.11 Channel subscription

A channel subscription links a Slack workspace to a Slack channel.

It contains:

- Workspace.
- Slack channel ID.
- Human-readable channel name.
- Enabled state.
- Default timezone.
- Default language.
- Message footer configuration.
- Created and updated timestamps.

The application must validate channel access by calling Slack before enabling the subscription.

## 5.12 Scheduled streams

A channel can have one or more scheduled streams.

Examples:

- Primary daily stream rotating between ayah and hadith.
- Daily blessing reminder stream.
- Weekly Companion story stream.

Each stream contains:

- Subscription ID.
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
4. Content locale must match the stream or fall back to the configured default.
5. Prefer content never sent to this subscription.
6. Otherwise choose the least recently sent eligible item.
7. Use a deterministic tie breaker, such as `createdAt ASC` or a seeded random value.
8. Never select an item already reserved by another concurrent scheduler transaction for the same stream and delivery date.

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

Flow:

1. Scheduler identifies a due stream.
2. It computes `deliveryLocalDate`.
3. It attempts to insert a unique delivery record.
4. If the unique record already exists, it stops.
5. It selects an eligible content item.
6. It changes delivery status to `SENDING`.
7. It renders Slack blocks.
8. It calls Slack `chat.postMessage`.
9. On success, it saves Slack message timestamp and status `SENT`.
10. On failure, it saves normalized error information and status `FAILED`.

If no eligible content exists:

- Set status to `SKIPPED`.
- Set failure reason to `NO_ELIGIBLE_CONTENT`.
- Log an error or warning.
- Do not send unapproved or repeated emergency fallback text.

## 5.16 Duplicate prevention

At minimum, create this unique constraint:

```text
UNIQUE(schedule_stream_id, delivery_local_date)
```

This assumes one delivery per stream per local date.

If weekly streams can run only on selected days, the same constraint still works.

Manual preview does not create a delivery record.

Manual production send must require an explicit idempotency key and should create a delivery record with a distinct `triggerType`.

```ts
enum DeliveryTriggerType {
  SCHEDULED
  MANUAL
  RETRY
}
```

For manual delivery, use:

```text
UNIQUE(schedule_stream_id, idempotency_key)
```

where the idempotency key is nullable for scheduled deliveries.

## 5.17 Retry behavior

MVP retry rules:

- Scheduler runs every hour.
- A failed due delivery can be retried by an admin endpoint.
- Optionally retry automatically up to three times with delays managed by database timestamps, not a queue.
- Do not retry permanent Slack errors such as:
  - `channel_not_found`
  - `not_in_channel`
  - `invalid_auth`
  - `account_inactive`
- Retry transient errors such as:
  - HTTP 429 rate limiting.
  - HTTP 5xx.
  - Network timeouts.
- Respect Slack's `Retry-After` value.

Recommended delivery fields:

- `attemptCount`
- `nextRetryAt`
- `lastAttemptAt`
- `errorCode`
- `errorMessage`
- `isRetryable`

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
- Reject or warn about content that exceeds configured safe limits during preview or approval.
- Never silently truncate Quran or hadith text.
- It is acceptable to truncate optional commentary only when the admin preview explicitly shows the result; preferably reject oversize content instead.

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
- Stream created or updated.
- Subscription enabled or disabled.
- Manual delivery requested.
- Failed delivery retried.

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
- Scheduler due-check: under 5 seconds for fewer than 1,000 streams.
- Slack send processing: governed primarily by Slack API latency.
- Database indexes must support due-stream queries and content selection.

## 6.4 Observability

Use structured JSON logs in production.

Every scheduled execution should include:

- Request or job ID.
- Stream ID.
- Subscription ID.
- Workspace ID.
- Delivery local date.
- Content ID when selected.
- Delivery status.
- Slack error code when applicable.
- Duration.

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

  subscriptions/
    subscriptions.module.ts
    subscriptions.controller.ts
    subscriptions.service.ts

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

test/
  integration/
  e2e/
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

The following Prisma schema is a recommended starting point. The coding agent may adjust naming, but must preserve the constraints and behavior.

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

  subscriptions ChannelSubscription[]
  auditEvents   AuditEvent[]

  @@index([isActive])
}

model ChannelSubscription {
  id             String   @id @default(cuid())
  workspaceId    String
  slackChannelId String
  channelName    String?
  timezone       String   @default("Africa/Cairo")
  locale         String   @default("ar")
  isEnabled      Boolean  @default(true)
  footerText     String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  workspace SlackWorkspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  streams   ScheduleStream[]
  deliveries ContentDelivery[]

  @@unique([workspaceId, slackChannelId])
  @@index([isEnabled])
}

model ScheduleStream {
  id                    String            @id @default(cuid())
  subscriptionId        String
  name                  String
  isEnabled             Boolean           @default(true)
  frequency             ScheduleFrequency
  sendTime              String
  timezone              String
  daysOfWeek            Int[]
  allowedContentTypes   ContentType[]
  selectionStrategy     SelectionStrategy @default(LEAST_RECENTLY_SENT)
  maxAutomaticAttempts  Int               @default(1)
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  subscription ChannelSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  deliveries   ContentDelivery[]

  @@index([isEnabled, frequency])
  @@index([subscriptionId])
}

model ContentItem {
  id                    String        @id @default(cuid())
  type                  ContentType
  status                ContentStatus @default(DRAFT)
  locale                String        @default("ar")
  title                 String?
  payload               Json
  version               Int           @default(1)
  parentContentId       String?
  contentChecksum       String?
  reviewerId            String?
  reviewNote            String?
  submittedForReviewAt  DateTime?
  approvedAt            DateTime?
  rejectedAt            DateTime?
  archivedAt            DateTime?
  createdBy             String
  updatedBy             String
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  parent       ContentItem?  @relation("ContentRevisions", fields: [parentContentId], references: [id])
  revisions    ContentItem[] @relation("ContentRevisions")
  sources      ContentSource[]
  deliveries   ContentDelivery[]

  @@index([status, type, locale])
  @@index([parentContentId])
  @@index([approvedAt])
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

model ContentDelivery {
  id                String              @id @default(cuid())
  streamId          String
  subscriptionId    String
  contentId         String?
  triggerType       DeliveryTriggerType
  status            DeliveryStatus      @default(PENDING)
  deliveryLocalDate DateTime             @db.Date
  idempotencyKey    String?
  scheduledFor      DateTime?
  reservedAt        DateTime             @default(now())
  sendingAt         DateTime?
  sentAt            DateTime?
  failedAt          DateTime?
  skippedAt         DateTime?
  slackMessageTs    String?
  slackChannelId    String?
  attemptCount      Int                 @default(0)
  nextRetryAt       DateTime?
  lastAttemptAt     DateTime?
  errorCode         String?
  errorMessage      String?
  isRetryable       Boolean?
  renderedText      String?
  renderedBlocks    Json?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  stream       ScheduleStream      @relation(fields: [streamId], references: [id], onDelete: Cascade)
  subscription ChannelSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  content      ContentItem?         @relation(fields: [contentId], references: [id], onDelete: SetNull)

  @@unique([streamId, deliveryLocalDate])
  @@unique([streamId, idempotencyKey])
  @@index([status, nextRetryAt])
  @@index([contentId, sentAt])
  @@index([subscriptionId, createdAt])
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
5. Store rendered payload snapshots on delivery records to preserve exactly what was sent.
6. A later version can normalize type-specific payloads, but JSON is acceptable for the MVP when strict DTO and review validation are enforced.

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

## 9.4 Subscription endpoints

### `POST /subscriptions`

Request:

```json
{
  "workspaceId": "workspace-id",
  "slackChannelId": "C0123456789",
  "channelName": "general",
  "timezone": "Africa/Cairo",
  "locale": "ar",
  "isEnabled": true
}
```

Before enabling, verify that the bot can access the channel.

### `GET /subscriptions`

### `GET /subscriptions/:id`

### `PATCH /subscriptions/:id`

### `POST /subscriptions/:id/verify-channel`

Use Slack `conversations.info` or an appropriate API call.

## 9.5 Stream endpoints

### `POST /subscriptions/:subscriptionId/streams`

Request:

```json
{
  "name": "Primary Daily Message",
  "frequency": "DAILY",
  "sendTime": "09:00",
  "timezone": "Africa/Cairo",
  "daysOfWeek": [],
  "allowedContentTypes": ["AYAH", "HADITH"],
  "selectionStrategy": "LEAST_RECENTLY_SENT",
  "maxAutomaticAttempts": 1,
  "isEnabled": true
}
```

### `GET /subscriptions/:subscriptionId/streams`

### `GET /streams/:id`

### `PATCH /streams/:id`

### `POST /streams/:id/enable`

### `POST /streams/:id/disable`

### `GET /streams/:id/next-content`

Dry-run selection. It must not reserve or deliver content.

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
- Creates a delivery record.
- Sends immediately.
- Repeating the same idempotency key returns the existing result instead of posting again.

## 9.6 Delivery endpoints

### `GET /deliveries`

Filters:

- `status`
- `streamId`
- `subscriptionId`
- `contentId`
- `dateFrom`
- `dateTo`
- `page`
- `limit`

### `GET /deliveries/:id`

### `POST /deliveries/:id/retry`

Only allowed for `FAILED` retryable deliveries.

### `POST /deliveries/:id/mark-skipped`

Administrative escape hatch with a required reason.

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

For each enabled stream:

1. Resolve the stream timezone.
2. Convert current UTC time to stream local time.
3. Check frequency and day.
4. Check whether local time is within the due window.
5. Calculate local date.
6. Attempt unique delivery reservation.

Suggested due window:

- `sendTime <= nowLocal < sendTime + schedulerInterval`

This prevents missing a delivery because the process started a few seconds late.

## 11.3 Pseudocode

```ts
async runSchedulerTick(nowUtc: Date): Promise<void> {
  const lockAcquired = await this.schedulerLock.tryAcquire();

  if (!lockAcquired) {
    return;
  }

  try {
    const dueStreams = await this.schedules.findDueStreams(nowUtc);

    for (const stream of dueStreams) {
      try {
        await this.deliveryService.deliverScheduledStream(stream.id, nowUtc);
      } catch (error) {
        this.logger.error({
          event: 'scheduled_delivery_unhandled_error',
          streamId: stream.id,
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

```ts
async deliverScheduledStream(streamId: string, nowUtc: Date) {
  const reservation = await this.prisma.$transaction(async (tx) => {
    const stream = await this.streamRepository.getForDelivery(tx, streamId);

    const localDate = calculateLocalDate(nowUtc, stream.timezone);

    const existing = await tx.contentDelivery.findUnique({
      where: {
        streamId_deliveryLocalDate: {
          streamId,
          deliveryLocalDate: localDate,
        },
      },
    });

    if (existing) {
      return { kind: 'existing', delivery: existing };
    }

    const content = await this.contentSelector.select(tx, stream);

    if (!content) {
      const skipped = await tx.contentDelivery.create({
        data: {
          streamId,
          subscriptionId: stream.subscriptionId,
          triggerType: 'SCHEDULED',
          status: 'SKIPPED',
          deliveryLocalDate: localDate,
          skippedAt: new Date(),
          errorCode: 'NO_ELIGIBLE_CONTENT',
        },
      });

      return { kind: 'skipped', delivery: skipped };
    }

    const pending = await tx.contentDelivery.create({
      data: {
        streamId,
        subscriptionId: stream.subscriptionId,
        contentId: content.id,
        triggerType: 'SCHEDULED',
        status: 'PENDING',
        deliveryLocalDate: localDate,
        scheduledFor: calculateScheduledUtc(stream, localDate),
      },
    });

    return { kind: 'reserved', delivery: pending, content, stream };
  });

  if (reservation.kind !== 'reserved') {
    return reservation.delivery;
  }

  return this.sendReservedDelivery(reservation.delivery.id);
}
```

## 11.5 Concurrency

The unique constraint is mandatory even if a scheduler lock exists.

Handle a unique-constraint race as an idempotent success:

- Query the existing delivery.
- Return it.
- Do not treat it as an application error.

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

Depending on verification method and channel type, additional scopes may be needed:

```text
channels:read
groups:read
```

Use only the scopes actually required.

The bot must be invited to private channels before posting.

## 12.3 Slack service interface

```ts
export interface SlackMessage {
  channel: string;
  text: string;
  blocks: KnownBlock[];
}

export interface SlackPostResult {
  channel: string;
  ts: string;
}

export interface SlackGateway {
  verifyToken(workspaceId: string): Promise<void>;
  verifyChannel(workspaceId: string, channelId: string): Promise<void>;
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
- Escape Slack special characters where necessary.
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

DEFAULT_TIMEZONE=Africa/Cairo
DEFAULT_LOCALE=ar

SCHEDULER_ENABLED=true
SCHEDULER_INTERVAL_MINUTES=5
SCHEDULER_LOCK_ID=874321

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
- A Slack test channel.

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
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\" \"prisma/**/*.ts\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "jest --config ./test/jest-e2e.json",
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

# 17. Testing Strategy

## 17.1 Unit tests

Must cover:

- Each type-specific payload validator.
- Review status transitions.
- Schedule due calculation.
- Timezone behavior.
- Weekly day matching.
- Content selection.
- Slack renderer for each content type.
- Slack error mapping.
- Retryability decisions.
- Idempotency behavior.
- Safe handling of missing optional fields.

## 17.2 Integration tests

Use a test PostgreSQL database.

Must cover:

- Unique scheduled delivery constraint.
- Concurrent delivery reservation.
- Least-recently-sent selection.
- No selection of unapproved content.
- No selection of archived content.
- Revision behavior.
- Delivery status transitions.
- Manual send idempotency.
- Retry flow.
- Audit-event creation.

## 17.3 End-to-end tests

Mock Slack API using dependency injection or an HTTP mock.

Scenarios:

1. Create draft ayah.
2. Submit and approve it.
3. Configure workspace, subscription, and stream.
4. Trigger manual delivery.
5. Verify Slack payload and sent delivery record.
6. Repeat with same idempotency key and verify no second Slack call.
7. Simulate Slack 500 and verify failed retryable delivery.
8. Retry and verify success.
9. Run scheduler twice for the same local date and verify one post.
10. Verify no eligible content produces a skipped delivery.

## 17.4 Snapshot tests

Use snapshots carefully for Slack blocks.

Snapshot tests must not replace semantic assertions. Also assert:

- Correct content text.
- Correct source text.
- Correct fallback text.
- No missing mandatory sections.
- No accidental empty blocks.

## 17.5 Religious content tests

Automated tests cannot verify theological correctness.

They should verify:

- Required source fields exist.
- Quran references are structurally valid.
- Approved hadith includes a collection.
- Unreviewed content cannot be delivered.
- Exact stored Arabic text is passed to the renderer unchanged.

Human review remains mandatory.

---

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
- `SLACK_TOKEN_INVALID`
- `SLACK_CHANNEL_INACCESSIBLE`
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
7. Verify Slack token and channel after major configuration changes.

## 19.4 Scheduler deployment safety

Never accidentally run production scheduling from:

- Developer laptops.
- Preview environments.
- Staging using the production Slack token.

Use separate tokens and channels for development/staging.

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
- Last sent delivery per stream.
- Failed deliveries in the last seven days.
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
2. One channel subscription.
3. Three streams:
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
- Add channel verification.
- Implement four renderers.
- Add preview endpoint.
- Add Slack error mapping.

Exit criteria:

- Every content type renders valid Block Kit.
- Preview works without posting.
- Test message posts to a development channel.

## Phase 4: Scheduling and delivery

- Implement subscriptions and streams.
- Implement due calculation.
- Implement content selection.
- Implement delivery reservation transaction.
- Implement scheduled and manual sends.
- Implement retries.
- Add scheduler lock.

Exit criteria:

- Two scheduler executions produce one post.
- Restart does not duplicate a sent delivery.
- Failure is visible and retryable.

## Phase 5: Content import and launch hardening

- Add JSON/CSV import script.
- Add content validation report.
- Seed reviewed library.
- Add production Docker setup.
- Add backup instructions.
- Add monitoring.
- Complete e2e tests.

Exit criteria:

- At least 90 reviewed items are ready; target 120.
- Production scheduling is tested in a private Slack channel.
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
7. A channel can have independently configured streams.
8. The system supports `Africa/Cairo` correctly.
9. Daily and weekly schedules work.
10. The same stream cannot post twice for the same local date.
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
21. Automated tests cover scheduling, selection, rendering, status transitions, and idempotency.
22. Production secrets are loaded only from environment or a secret manager.
23. PostgreSQL is not publicly exposed.
24. Scheduler behavior can be disabled by environment variable.
25. The project includes clear setup, migration, seed, deployment, and backup instructions.

---

# 24. Coding Standards

- TypeScript strict mode.
- No `any` unless justified in a comment.
- Small services with explicit responsibilities.
- Dependency injection for Slack gateway, clock, and scheduler lock.
- Use a `Clock` abstraction in tests.
- Use UTC internally and timezone conversion only at scheduling boundaries.
- Use ISO 8601 timestamps in APIs.
- Use database transactions for delivery reservation.
- Use repositories only where they improve testability; do not create empty abstraction layers.
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
10. Add tests with each module.
11. Do not claim completion while acceptance criteria are failing.
12. Document every environment variable.
13. Make Slack and time dependencies injectable for tests.
14. Use database-level idempotency, not only in-memory flags.
15. Preserve exact stored Quran and hadith Arabic text during rendering.
16. Keep public methods typed.
17. Return normalized API errors.
18. Keep the scheduler disabled by default in test environments.
19. Produce a final implementation report listing:
    - Files added or changed.
    - Migrations created.
    - Tests added.
    - Commands to run.
    - Remaining limitations.
    - Any deviation from this specification.

---

# 26. Recommended First Agent Task

Give the coding agent this first scoped instruction:

> Initialize or inspect the NestJS repository and implement Phase 1 only: configuration validation, Prisma/PostgreSQL integration, the complete initial database schema, migrations, health endpoints, structured logging, and the `X-Admin-Key` guard. Add unit and e2e tests. Do not implement Slack posting or the scheduler yet. At the end, provide commands to run the app and tests, plus a file-by-file summary.

After Phase 1 is reviewed, continue with Phase 2 instead of asking the agent to implement the entire system in one uncontrolled change.

---

# 27. Future Enhancements

These are intentionally deferred:

- Public Slack OAuth installation.
- Multiple organizations with self-service onboarding.
- Web admin dashboard.
- Slack slash commands.
- Interactive buttons and feedback.
- Per-user preferences.
- Direct-message subscriptions.
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
