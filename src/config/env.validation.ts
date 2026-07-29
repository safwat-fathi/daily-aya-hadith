import Joi from 'joi';

export type NodeEnvironment = 'development' | 'test' | 'production';
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface AppEnvironment {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  APP_BASE_URL: string;
  DATABASE_URL: string;
  ADMIN_API_KEY: string;
  DEFAULT_TIMEZONE: string;
  DEFAULT_LOCALE: string;
  LOG_LEVEL: LogLevel;
  SLACK_BOT_TOKEN?: string;
  SLACK_TOKEN_SECRET_KEY?: string;
  SLACK_APP_TOKEN?: string;
  SCHEDULER_ENABLED: boolean;
  SCHEDULER_INTERVAL_MINUTES: number;
  SCHEDULER_LOCK_ID: number;
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
  DEFAULT_TIMEZONE: timeZone.default('Africa/Cairo'),
  DEFAULT_LOCALE: Joi.string()
    .pattern(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
    .default('ar'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  SLACK_BOT_TOKEN: Joi.string().allow('').optional(),
  SLACK_TOKEN_SECRET_KEY: Joi.string().allow('').optional(),
  SLACK_APP_TOKEN: Joi.string().allow('').optional(),
  SCHEDULER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  SCHEDULER_INTERVAL_MINUTES: Joi.number().integer().min(1).max(60).default(5),
  SCHEDULER_LOCK_ID: Joi.number().integer().min(1).default(874321),
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
