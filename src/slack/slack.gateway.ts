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

export interface SlackChannelInfo {
  id: string;
  name?: string;
  isPrivate: boolean;
  isArchived: boolean;
  isMember: boolean;
}

/**
 * PLAN.md §12.3, with one deliberate deviation: the spec types both verification methods
 * `Promise<void>`, but §9.3 must persist `botUserId` and §9.4 needs the channel name and
 * membership state. `void` would discard exactly the data those endpoints exist to store, so
 * the return types are widened while the names and parameters stay as specified.
 *
 * Injected by symbol so the implementation can be substituted (PLAN.md §24).
 */
export interface SlackGateway {
  verifyToken(workspaceId: string): Promise<SlackAuthIdentity>;
  verifyChannel(workspaceId: string, channelId: string): Promise<SlackChannelInfo>;
  postMessage(workspaceId: string, message: SlackMessage): Promise<SlackPostResult>;
}
