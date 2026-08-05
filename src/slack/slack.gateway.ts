import type { KnownBlock } from '@slack/types';

export const SLACK_GATEWAY = Symbol('SLACK_GATEWAY');

export interface SlackMessage {
  channel: string;
  text: string;
  blocks: KnownBlock[];
}

export interface SlackPostResult {
  channel: string;
  ts: string;
}

export interface SlackAuthIdentity {
  teamId: string;
  teamName?: string;
  botUserId?: string;
  url?: string;
}

/**
 * PLAN.md §12.3, with one deliberate deviation: the spec types `verifyToken` as
 * `Promise<void>`, but §9.3 must persist `botUserId`. `void` would discard exactly the data
 * that endpoint exists to store, so the return type is widened while the name and parameters
 * stay as specified.
 *
 * There is no channel-verification method: in the direct-message model there is no channel to
 * check access to, because `postMessage` to a Slack user ID opens that DM automatically.
 *
 * Injected by symbol so the implementation can be substituted (PLAN.md §24).
 */
export interface SlackGateway {
  verifyToken(workspaceId: string): Promise<SlackAuthIdentity>;
  postMessage(workspaceId: string, message: SlackMessage): Promise<SlackPostResult>;
}
