# Slack Bot for Daily Aya & Hadith

NestJS service for delivering locally stored, human-reviewed Islamic content to Slack. The
implementation follows the phases in [`PLAN.md`](./PLAN.md).

This repository currently contains **Phases 1 and 2**:

- **Phase 1** — application configuration, structured logging, Prisma/PostgreSQL integration,
  the database schema, health probes, and global admin API-key protection.
- **Phase 2** — content CRUD, type-specific payload validation, structured source references,
  the review workflow (submit, approve, reject), revisioning, archiving, delivery-history
  reads, an administrative audit trail, and Swagger/OpenAPI documentation.

Slack posting (Phase 3), scheduling and delivery (Phase 4), and the reviewed seed content
library (Phase 5) are intentionally not implemented yet.

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

| Method  | Path                        | Description                                                        |
| ------- | --------------------------- | ------------------------------------------------------------------ |
| `POST`  | `/content`                  | Create a draft                                                     |
| `GET`   | `/content`                  | List with `type`, `status`, `locale`, `search`, `sort`, pagination |
| `GET`   | `/content/:id`              | Content with sources and revision history                          |
| `PATCH` | `/content/:id`              | Edit a `DRAFT` or `REJECTED` item                                  |
| `POST`  | `/content/:id/submit-review`| `DRAFT` → `IN_REVIEW`                                              |
| `POST`  | `/content/:id/approve`      | `IN_REVIEW` → `APPROVED`, enforces approval validation             |
| `POST`  | `/content/:id/reject`       | `IN_REVIEW` → `REJECTED`, requires a review note                   |
| `POST`  | `/content/:id/archive`      | `APPROVED` → `ARCHIVED`                                            |
| `POST`  | `/content/:id/revise`       | New `DRAFT` revision from `APPROVED` or `ARCHIVED` content         |
| `GET`   | `/content/:id/deliveries`   | Paginated delivery history                                         |

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

| Variable                     | Behavior                                      | Description                                                                |
| ---------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| `NODE_ENV`                   | Optional, defaults to `development`           | `development`, `test`, or `production`                                     |
| `PORT`                       | Optional, defaults to `3000`                  | HTTP port                                                                  |
| `APP_BASE_URL`               | Optional, defaults to `http://localhost:3000` | Public application URL                                                     |
| `DATABASE_URL`               | Required                                      | PostgreSQL connection URL                                                  |
| `ADMIN_API_KEY`              | Required, minimum 32 characters               | Secret accepted through `X-Admin-Key`                                      |
| `DEFAULT_TIMEZONE`           | Optional, defaults to `Africa/Cairo`          | Valid IANA timezone                                                        |
| `DEFAULT_LOCALE`             | Optional, defaults to `ar`                    | Initial content locale                                                     |
| `LOG_LEVEL`                  | Optional, defaults to `info`                  | Pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent` |
| `SWAGGER_ENABLED`            | Optional, defaults to `false`                 | Serves OpenAPI docs; ignored in production                                 |
| `SLACK_BOT_TOKEN`            | Optional until Phase 3                        | Slack bot token; redacted if logged                                        |
| `SLACK_TOKEN_SECRET_KEY`     | Optional until Phase 3                        | Identifier for stored Slack token material                                 |
| `SCHEDULER_ENABLED`          | Optional, defaults to `false`                 | Phase 4 scheduler switch                                                   |
| `SCHEDULER_INTERVAL_MINUTES` | Optional, defaults to `5`                     | Phase 4 scheduler interval                                                 |
| `SCHEDULER_LOCK_ID`          | Optional, defaults to `874321`                | Phase 4 PostgreSQL advisory-lock ID                                        |

Configuration is validated before application startup. Validation errors name invalid fields
but do not include their values.

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

- Slack workspaces and channel subscriptions
- Scheduled streams
- Versioned content items and structured sources
- Delivery records with rendered snapshots and database uniqueness constraints
- Administrative audit events

| Migration                                    | Contents                                             |
| -------------------------------------------- | ---------------------------------------------------- |
| `20260728095425_init`                        | Full initial schema                                  |
| `20260728160216_content_revision_version_unique` | `UNIQUE (parentContentId, version)` on `ContentItem` |

The schema supports all four content types, but no content is delivered anywhere yet.

## Known limitations

1. **No automated tests.** This project deliberately carries no test suite, no test tooling,
   and no test database. Changes are verified by building, linting, and exercising the API
   directly. `PLAN.md` §17 is therefore not implemented.

2. **The content checksum fingerprints database rows, not content.** `ReviewService.approve`
   passes full Prisma source rows into `ContentChecksumService.calculate`, which canonicalizes
   every enumerable property — including `id`, `contentId`, `createdAt`, and `updatedAt`. The
   `ChecksumSource` interface is compile-time only and strips nothing at runtime. As a result,
   re-saving byte-identical bibliographic data produces a different checksum, and a revision
   can never match its parent's checksum even when the content is unchanged. The checksum is
   still a stable per-approval fingerprint, so it remains usable as an approval marker.

3. **Prisma errors surface as HTTP 500.** `AllExceptionsFilter` normalizes only
   `HttpException`. A unique-constraint violation (`P2002`) or a serialization failure
   (`P2034`) from the `Serializable` transaction in `revise` is returned as
   `INTERNAL_SERVER_ERROR` rather than a `409`. This is reachable only under concurrent
   revisions of the same content item.

4. **The revision uniqueness constraint does not cover root items.** `parentContentId` is
   nullable and PostgreSQL treats `NULL`s as distinct, so `UNIQUE (parentContentId, version)`
   constrains revisions only. Root items are always version 1, so this is benign today.
