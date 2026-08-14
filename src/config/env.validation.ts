import Joi from 'joi';

export type NodeEnvironment = 'development' | 'test' | 'production';
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface AppEnvironment {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  APP_BASE_URL: string;
  DATABASE_URL: string;
  ADMIN_API_KEY: string;
  SESSION_SECRET: string;
  DEFAULT_TIMEZONE: string;
  DEFAULT_LOCALE: string;
  LOG_LEVEL: LogLevel;
  SLACK_APP_TOKEN?: string;
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_TOKEN_ENCRYPTION_KEY?: string;
  SCHEDULER_ENABLED: boolean;
  SCHEDULER_INTERVAL_MINUTES: number;
  SCHEDULER_LOCK_ID: number;
  WORKSPACE_PURGE_ENABLED: boolean;
  WORKSPACE_PURGE_INTERVAL_MINUTES: number;
  WORKSPACE_PURGE_GRACE_DAYS: number;
  WORKSPACE_PURGE_LOCK_ID: number;
  QURAN_FOUNDATION_ENV: 'prelive' | 'production';
  QURAN_FOUNDATION_CLIENT_ID?: string;
  QURAN_FOUNDATION_CLIENT_SECRET?: string;
  QURAN_FOUNDATION_TRANSLATION_RESOURCE_ID?: string;
  QURAN_FOUNDATION_TAFSIR_RESOURCE_ID?: string;
  HADITH_API_KEY?: string;
  CLOCK_OFFSET_SECONDS: number;
  SWAGGER_ENABLED: boolean;
}

const postgresUrl = Joi.string()
  .uri({ scheme: ['postgresql', 'postgres'] })
  .required();

const timeZone = Joi.string().custom((value: string, helpers: Joi.CustomHelpers<string>) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value;
  } catch {
    return helpers.error('any.invalid');
  }
}, 'IANA timezone validation');

const environmentSchema = Joi.object<AppEnvironment>({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  APP_BASE_URL: Joi.string().uri().default('http://localhost:3000'),
  DATABASE_URL: postgresUrl,
  ADMIN_API_KEY: Joi.string().min(32).required(),
  // Signs the admin dashboard's session cookie (express-session). Unrelated to ADMIN_API_KEY,
  // which the dashboard's login form still checks against to establish that session in the
  // first place.
  SESSION_SECRET: Joi.string().min(32).required(),
  DEFAULT_TIMEZONE: timeZone.default('Africa/Cairo'),
  DEFAULT_LOCALE: Joi.string()
    .pattern(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
    .default('ar'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  SLACK_APP_TOKEN: Joi.string().allow('').optional(),
  // Public OAuth "Add to Slack" install flow. Optional like SLACK_APP_TOKEN: the app still boots
  // without them, but /slack/install and /slack/oauth/callback return a clear "not configured"
  // error until all three are set. There is no other way to give a workspace a bot token —
  // SlackClientFactory resolves every workspace's token from its (encrypted) database row.
  SLACK_CLIENT_ID: Joi.string().allow('').optional(),
  SLACK_CLIENT_SECRET: Joi.string().allow('').optional(),
  // Base64-encoded 32-byte AES-256-GCM key that encrypts OAuth-issued bot tokens at rest
  // (TokenCipherService). Generate with `openssl rand -base64 32`.
  SLACK_TOKEN_ENCRYPTION_KEY: Joi.string().allow('').optional(),
  SCHEDULER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  SCHEDULER_INTERVAL_MINUTES: Joi.number().integer().min(1).max(60).default(5),
  SCHEDULER_LOCK_ID: Joi.number().integer().min(1).default(874321),
  // Hard-deletes a SlackWorkspace (cascading its subscribers/streams/deliveries) once it has
  // been uninstalled (SlackWorkspace.uninstalledAt) for WORKSPACE_PURGE_GRACE_DAYS. Fulfills the
  // privacy policy's "we will periodically purge data associated with uninstalled workspaces".
  // Enabled by default, unlike SCHEDULER_ENABLED, since this is a standing compliance promise
  // rather than an opt-in delivery feature.
  WORKSPACE_PURGE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  WORKSPACE_PURGE_INTERVAL_MINUTES: Joi.number().integer().min(1).default(1440),
  WORKSPACE_PURGE_GRACE_DAYS: Joi.number().integer().min(1).default(30),
  WORKSPACE_PURGE_LOCK_ID: Joi.number().integer().min(1).default(874322),
  // All optional: leave blank and the app still boots, with the import endpoint returning 503
  // QURAN_FOUNDATION_NOT_CONFIGURED, same graceful-degradation pattern as the Slack vars above.
  // Never call the runtime scheduler/delivery path with this client (PLAN.md §2.1) — import only.
  // Defaults to production: verified live that dashboard-issued credentials authenticate
  // against the production OAuth/API hosts without a separate prelive/sandbox request, so most
  // integrations should start there. A 401 invalid_client on the token request means "wrong
  // host for these credentials", not "wrong credentials" — try the other value.
  QURAN_FOUNDATION_ENV: Joi.string().valid('prelive', 'production').default('production'),
  QURAN_FOUNDATION_CLIENT_ID: Joi.string().allow('').optional(),
  QURAN_FOUNDATION_CLIENT_SECRET: Joi.string().allow('').optional(),
  QURAN_FOUNDATION_TRANSLATION_RESOURCE_ID: Joi.string().allow('').optional(),
  QURAN_FOUNDATION_TAFSIR_RESOURCE_ID: Joi.string().allow('').optional(),
  HADITH_API_KEY: Joi.string().allow('').optional(),
  // Shifts every scheduling decision, so production must never run with it set. Enforced here
  // rather than in the clock itself: a startup failure cannot be missed, a runtime check can.
  CLOCK_OFFSET_SECONDS: Joi.number()
    .integer()
    .default(0)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid(0),
    }),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
})
  .unknown(true)
  .options({
    abortEarly: false,
    convert: true,
  });

export function validateEnvironment(config: Record<string, unknown>): AppEnvironment {
  const validationResult: Joi.ValidationResult<AppEnvironment> = environmentSchema.validate(config);
  const { error } = validationResult;

  if (error) {
    const fields = error.details.map((detail) => detail.path.join('.')).join(', ');
    throw new Error(`Environment validation failed for: ${fields}`);
  }

  return validationResult.value;
}
