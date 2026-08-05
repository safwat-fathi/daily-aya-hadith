export const CLOCK = Symbol('CLOCK');

/**
 * The single source of "now" for the application (PLAN.md §24).
 *
 * Scheduling decisions — whether a subscriber is due, which calendar date a delivery belongs to —
 * must never call `new Date()` inline. Reading the time through an injected clock is what makes
 * those decisions reproducible: with no test framework in this project (§17), a controllable
 * clock is the only way to observe behavior that would otherwise take 49 hours of wall time.
 */
export interface Clock {
  now(): Date;
}
