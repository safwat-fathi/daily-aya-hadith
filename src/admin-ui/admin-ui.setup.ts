import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { Pool } from 'pg';
import type { AppEnvironment } from '../config/env.validation';

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const PgSession = connectPgSimple(session);

/**
 * View engine, static assets, and session middleware for the admin dashboard. Paths are resolved
 * from `process.cwd()` rather than `__dirname` — `views/` and `public/` are project-root
 * directories, not compiled by `tsc`, so their location relative to the compiled `dist/` output
 * depends on how deeply this file is nested; `process.cwd()` sidesteps that arithmetic entirely
 * and matches how this app is always started (`pnpm start`/`start:dev` from the project root).
 */
export function configureAdminUiViews(app: NestExpressApplication): void {
  const config = app.get(ConfigService<AppEnvironment, true>);

  app.setBaseViewsDir(join(process.cwd(), 'views'));
  app.setViewEngine('ejs');
  app.useStaticAssets(join(process.cwd(), 'public'));

  // Dedicated pool, separate from Prisma's own connection to the same database (prisma.service.ts)
  // — connect-pg-simple manages its own lifecycle and issues raw SQL against the `session` table
  // (prisma/schema.prisma's `Session` model, migrated like any other table) rather than going
  // through Prisma.
  const pool = new Pool({ connectionString: config.get('DATABASE_URL', { infer: true }) });

  app.use(
    session({
      store: new PgSession({ pool, tableName: 'session', createTableIfMissing: false }),
      secret: config.get('SESSION_SECRET', { infer: true }),
      resave: false,
      saveUninitialized: false,
      name: 'admin.sid',
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE_MS,
        secure: config.get('NODE_ENV', { infer: true }) === 'production',
      },
    }),
  );
}
