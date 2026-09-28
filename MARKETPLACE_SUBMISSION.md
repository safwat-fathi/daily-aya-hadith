# Slack Marketplace submission — blocker fix plan

> Status: **planned, not yet implemented** (as of 2026-09-28). This documents how to clear
> Slack's automated-review blockers. See [`PLAN.md`](./PLAN.md) for the product/technical spec and
> [`CLAUDE.md`](./CLAUDE.md) for the architecture overview.

## Context

Slack's automated review lists four blockers before `daily-aya-hadith` can be listed. Two are
code/config, one is host-level infra, one is a business requirement:

1. **404 on legal/landing URLs** — Slack's app config points at
   `https://daily-aya-hadith.online/static/{install,support,privacy,tos}.html`. Those files were
   deleted and moved to EJS routes in commits `90bd05c` (dropped the `/static` prefix) and
   `354a6f0` (migrated to EJS). They now serve at `/` and `/api/v1/{privacy,tos,support}` — the
   `/static/*.html` paths 404, and even the site's own footer links (`/privacy`, `/tos`,
   `/support`) 404 because those routes still carry the `api/v1` prefix.
2. **TLS 1.2+ not verified** — **confirmed host-level**: `curl --tlsv1.1 --tls-max 1.1
   https://daily-aya-hadith.online/` returns `HTTP/2 200`, i.e. Cloudflare is *accepting* TLS 1.1.
   Slack requires 1.0/1.1 be *rejected*. Not a repo issue. (The OAuth callback appears in Slack's
   TLS list but not its 404 list, proving TLS ≠ side effect of the 404s.)
3. **Socket Mode must be disabled** — Marketplace apps cannot use Socket Mode. Inbound Slack
   traffic (slash commands + events) must move to HTTP request URLs with signature verification.
   This is the bulk of the work.
4. **< 10 active workspaces** — not fixable in code; must be earned via real installs (bucket C).

Outcome: all four listed URLs return 200 over TLS 1.2+ with 1.0/1.1 rejected, Slack traffic
delivered over signed HTTP endpoints, Socket Mode off — leaving only the 10-workspace count.

---

## Bucket A — Code changes

### A1. Serve legal pages at clean, prefix-free URLs (fixes #1 + broken footer)

Purely routing — no service/content logic changes.

- **`src/app.setup.ts`** (`configureApplication`, ~line 19-25): add three entries to the
  `setGlobalPrefix` `exclude` array so the pages serve at `/privacy`, `/tos`, `/support` (matching
  what the footer already links to), mirroring the existing `''`/`health` exclusions:
  ```ts
  { path: 'privacy', method: RequestMethod.GET },
  { path: 'tos',     method: RequestMethod.GET },
  { path: 'support', method: RequestMethod.GET },
  ```
  Routes are simple `render()` handlers in `src/app.controller.ts` (already `@Public()`); nothing
  else references `/api/v1/privacy|tos|support`, so this is strictly better and fixes the footer
  links in `views/_layout/_site_footer.ejs` for free.
- **`public/sitemap.xml`**: replace the stale `/install.html`, `/privacy.html`, `/tos.html`,
  `/support.html` entries with `/`, `/privacy`, `/tos`, `/support`.

Landing/install already returns 200 at `/` — no change; the Slack "Install URL" just needs to
point there (bucket B).

### A2. Convert Socket Mode → HTTP request URLs (fixes #3)

The handler logic is already transport-agnostic: `handleSubscriptionToggle`, `handleSettings*`,
`handleInstantContent`, and the `app_uninstalled` teardown all take primitives (`teamId`,
`userId`, `text`, `type`) and reply via `SLACK_GATEWAY.postMessage` (DMs), independent of how the
request arrived. **Only the inbound envelope + the WebSocket lifecycle change; every handler body
and the outbound path are reused unchanged.** No interactive components exist anywhere in the app
(verified) → **no Interactivity request URL needed** — only Event Subscriptions + slash commands.

Package note: `@slack/socket-mode` is the only Socket Mode dep; `@slack/web-api` (outbound) stays.
Do **not** add `@slack/bolt` — it wants to own the HTTP receiver and would mean rewriting handlers
and re-plumbing Nest DI; a ~25-line signature guard reuses everything we already have.

**Steps:**

1. **`src/main.ts`** (~line 12): enable raw body —
   `NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true })`.
   Nest still parses `req.body` normally; the raw bytes needed for HMAC land in `req.rawBody`.
   (Slash commands arrive as `x-www-form-urlencoded`, events as `application/json`; HMAC is over
   the raw body in both.)

2. **New `src/common/guards/slack-signature.guard.ts`** — verify Slack's v0 signature (no new
   dependency, node `crypto`):
   - Recompute `v0=` + HMAC-SHA256 of `v0:{X-Slack-Request-Timestamp}:{rawBody}` with
     `SLACK_SIGNING_SECRET`; compare to the `X-Slack-Signature` header.
   - **Length-check both buffers before `crypto.timingSafeEqual`** (it throws on length mismatch).
   - Reject stale timestamps (>5 min) to block replays. **Use `CLOCK` (`CLOCK` token) for "now"**
     per the repo convention — prod forces `CLOCK_OFFSET_SECONDS=0`, so this is safe; leave a
     comment noting that a non-zero dev offset would reject live Slack requests.
   - **Fail closed when the secret is unset**: throw the existing `SLACK_NOT_CONFIGURED` domain
     error from `src/slack/slack.errors.ts` (never pass unsigned requests through).

3. **New `src/slack-events/slack-events.controller.ts`** — `@Public()` +
   `@UseGuards(SlackSignatureGuard)` (mirror `SlackOauthController`: `@Controller('slack')`,
   `@Public()` bypasses the global `AdminKeyGuard`). Read the body via
   `@Req() req: RawBodyRequest<Request>` (NOT a whitelisted DTO — the global `ValidationPipe` has
   `forbidNonWhitelisted:true` and would reject Slack's many fields). Two routes:
   - `POST slack/events` (Event Subscriptions): if `body.type === 'url_verification'` → return
     `{ challenge }` (this challenge request is itself signed, so the guard runs first and passes
     once the secret is set). Otherwise return `200` immediately, then `void`-dispatch the
     `message`/`app_uninstalled` payload to the service (fast 200 prevents Slack retries).
   - `POST slack/commands` (all five slash commands; Slack routes by the `command` field): return
     `200` immediately (empty), then `void`-dispatch to the service — replies arrive as DMs via
     the existing gateway, so no synchronous response body is needed and the 3-second rule is met.

4. **`src/slack-events/slack-events.service.ts`** — refactor:
   - Remove `implements OnModuleInit, OnModuleDestroy`, the `SocketModeClient`/`LogLevel` import,
     the `client` field, `onModuleInit`, `onModuleDestroy`, and the `appToken` read.
   - Repurpose `onSlashCommand`/`onMessage`/`onAppUninstalled` into **public** methods taking the
     already-parsed HTTP body (drop the `ack` calls — the controller's 200 is the ack). The
     `SlashCommandEnvelope`/`MessageEnvelope`/`AppUninstalledEnvelope` interfaces already model
     `body`/`event` with `unknown` fields matching the HTTP payload shape, so parsing stays.
   - Optional cleanup: the `'socket-mode'` string passed to `subscribersService.create/update`
     (7 occurrences) is a free-text `requestId` audit label (no typed union) — rename to
     `'slack-http'` so the audit trail is accurate. Cosmetic; safe.

5. **`src/slack-events/slack-events.module.ts`** — add `controllers: [SlackEventsController]` and
   provide `SlackSignatureGuard`.

6. **`src/config/env.validation.ts`** — add `SLACK_SIGNING_SECRET?: string` to the
   `AppEnvironment` interface and `Joi.string().allow('').optional()` to the schema (next to the
   other Slack vars, ~line 66) so it's readable via typed `config.get(..., { infer: true })`.
   `SLACK_APP_TOKEN` becomes dead — remove it from the interface + schema.

### A3. Docs

- **`.env.example`**: drop `SLACK_APP_TOKEN` (line 20), add `SLACK_SIGNING_SECRET` with a comment.
- **`CLAUDE.md`** "Slack integration" section: replace the "Socket Mode (outbound WebSocket, no
  public URL)" description with the HTTP request-URL + signature-guard model.

---

## Bucket B — Manual steps (outside the repo)

### B1. Cloudflare — fix TLS (#2)

- Dashboard → **SSL/TLS → Edge Certificates → Minimum TLS Version → set to `1.2`**. This makes
  the edge reject 1.0/1.1, which is what Slack checks.
- If the TLS item persists after that, check **Bot Fight Mode / WAF** isn't challenging Slack's
  checker (serving non-browser clients a 403/challenge page).
- **Verify with SSL Labs** (ssllabs.com/ssltest) — macOS LibreSSL is unreliable for TLS-1.0/1.1
  probes; trust SSL Labs' protocol table over local `curl`.

### B2. Slack app config (App management → api.slack.com/apps)

- **Manage Distribution / listing URLs** — point at the working 200 URLs:
  - Install URL → `https://daily-aya-hadith.online/` (root, returns 200 — *not*
    `/api/v1/slack/install`, which is a 302 redirect action).
  - Support URL → `https://daily-aya-hadith.online/support`
  - Privacy Policy URL → `https://daily-aya-hadith.online/privacy`
  - Terms of Service URL → `https://daily-aya-hadith.online/tos`
- **Event Subscriptions** → enable, Request URL
  `https://daily-aya-hadith.online/api/v1/slack/events`; subscribe bot events `message.im` and
  `app_uninstalled`.
- **Slash Commands** → set the Request URL of all five (`/subscribe`, `/unsubscribe`, `/settings`,
  `/aya`, `/hadith`) to `https://daily-aya-hadith.online/api/v1/slack/commands`.
- **Socket Mode** → **disable**.
- Scopes are unchanged (`chat:write`, `commands`, `im:history` already cover HTTP delivery) → **no
  reinstall required**.

### B3. Cutover order (load-bearing — do in this sequence)

1. Deploy bucket-A code.
2. Set `SLACK_SIGNING_SECRET` in prod env (from *Basic Information → Signing Secret*), remove
   `SLACK_APP_TOKEN`. **Restart the app** and confirm the signing secret is loaded before the next
   step — the `url_verification` challenge is signed and fails if the secret is missing.
3. Set + save the Event Subscriptions Request URL (Slack sends the signed `url_verification`
   challenge here; it must succeed to save).
4. Set the five slash-command Request URLs.
5. Disable Socket Mode.
6. Set the four listing URLs (B2) + apply Cloudflare min-TLS (B1).

---

## Bucket C — Not fixable in code

- **10-workspace minimum**: the app must be installed on ≥10 active workspaces. Share the install
  link, recruit real installs; Slack's count can lag ~24h. Nothing to build.

---

## Verification (no test framework — per CLAUDE.md, verify by build + curl)

1. `pnpm build && pnpm lint` (strict, `--max-warnings=0`) — must be clean.
2. `pnpm start:dev`, then:
   - `curl -I http://localhost:3000/privacy` → `200`; same for `/tos`, `/support`, `/`.
   - **Signature guard** — compute a signature with
     `openssl dgst -sha256 -hmac "$SLACK_SIGNING_SECRET"` over `v0:{ts}:{body}`:
     - valid signature + fresh ts → `200`
     - tampered signature → `401`
     - timestamp >5 min old → `401`
   - `url_verification`: POST a signed `{"type":"url_verification","challenge":"abc"}` to
     `/api/v1/slack/events` → body echoes `abc`.
   - Signed `/api/v1/slack/commands` with `command=/aya` form body → `200`, and a DM is posted
     (or logs show the postMessage attempt).
3. **Prod, post-cutover**: SSL Labs shows TLS 1.0/1.1 rejected; run a real `/aya` and a real
   `/subscribe` from a test workspace and confirm the DM arrives with Socket Mode off; uninstall
   the test workspace and confirm the `app_uninstalled` event deactivates its row.

## Critical files

- `src/app.setup.ts`, `public/sitemap.xml` (A1)
- `src/main.ts`, `src/config/env.validation.ts`, `.env.example` (A2 wiring)
- `src/common/guards/slack-signature.guard.ts` *(new)*,
  `src/slack-events/slack-events.controller.ts` *(new)* (A2)
- `src/slack-events/slack-events.service.ts`, `src/slack-events/slack-events.module.ts` (A2)
- `CLAUDE.md` (A3)
