/**
 * `actorId`/`reviewerId`/`createdBy`/etc. for every admin-ui-driven action. A per-operator value
 * is the seed of real user accounts, which PLAN.md §27 defers — not invented here. UI-driven
 * audit rows are therefore distinguishable from JSON-API-driven ones by this constant, but not
 * from each other.
 */
export const ADMIN_UI_ACTOR = 'admin-ui';
