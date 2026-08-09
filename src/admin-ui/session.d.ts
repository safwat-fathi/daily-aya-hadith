import 'express-session';

declare module 'express-session' {
  interface SessionData {
    admin?: boolean;
    flash?: { type: 'success' | 'error'; text: string };
  }
}
