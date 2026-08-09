import { DateTime } from 'luxon';

export interface SendTime {
  hour: number;
  minute: number;
}

export const SEND_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Parses the validated `HH:mm` string `ScheduleStream.sendTime` keeps (PLAN.md §8.1 note 3).
 * Returns null rather than throwing so callers can decide whether a malformed stored value is a
 * validation error or a row to skip.
 */
export function parseSendTime(value: string): SendTime | null {
  const match = SEND_TIME_PATTERN.exec(value);

  if (match === null) {
    return null;
  }

  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/**
 * The calendar date `instant` falls on for someone in `timeZone`, as a `Date` at **UTC
 * midnight**.
 *
 * Prisma's `@db.Date` stores a bare date and reads it back at UTC midnight, so the local date
 * has to be formatted in the subscriber's zone first and only then materialized as UTC. Taking
 * any shortcut here — `new Date(instant.setHours(0,0,0,0))`, or converting the zoned time to UTC
 * and truncating — produces a date one day off for anyone east or west of UTC, which is every
 * subscriber this design exists to serve.
 *
 * This is also what makes one `deliveryLocalDate` span up to ~49 hours of real time: a
 * subscriber in UTC+14 reaches a given date long before one in UTC-11, and both are correct.
 */
export function localDateFor(instant: Date, timeZone: string): Date {
  const local = DateTime.fromJSDate(instant, { zone: timeZone });

  return new Date(Date.UTC(local.year, local.month - 1, local.day, 0, 0, 0, 0));
}

/**
 * Day of week in `timeZone` as 0 = Sunday through 6 = Saturday, matching the `daysOfWeek`
 * contract in PLAN.md §5.12.
 *
 * Luxon counts 1 = Monday through 7 = Sunday, so this conversion is mandatory; comparing a raw
 * Luxon weekday against a stored `daysOfWeek` entry would silently shift every weekly stream by
 * a day and land Sunday on 7, which the stored range never contains.
 */
export function localDayOfWeek(instant: Date, timeZone: string): number {
  return DateTime.fromJSDate(instant, { zone: timeZone }).weekday % 7;
}

/**
 * Whether `instant` falls inside `[sendTime, sendTime + windowMinutes)` on its own local day in
 * `timeZone` — PLAN.md §11.2's due window, which exists so a tick that starts slightly late
 * still delivers.
 *
 * Daylight-saving behavior is deliberate. When the configured wall time does not exist on a
 * spring-forward day, Luxon moves it forward to the next real instant, so the delivery happens
 * late rather than being skipped. When it occurs twice on a fall-back day the window can match
 * twice; that is harmless, because the unique constraints on `DeliveryRun` and `ContentDelivery`
 * absorb the second attempt as an idempotent success (§11.5).
 */
export function isWithinDueWindow(
  instant: Date,
  timeZone: string,
  sendTime: string,
  windowMinutes: number,
): boolean {
  const parsed = parseSendTime(sendTime);

  if (parsed === null) {
    return false;
  }

  const local = DateTime.fromJSDate(instant, { zone: timeZone });

  if (!local.isValid) {
    return false;
  }

  const windowOpens = local.set({
    hour: parsed.hour,
    minute: parsed.minute,
    second: 0,
    millisecond: 0,
  });
  const windowCloses = windowOpens.plus({ minutes: windowMinutes });

  return local >= windowOpens && local < windowCloses;
}
