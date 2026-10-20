// WebSocket message protocol for real-time entity synchronization.

export const ENTITY_TYPES = ['issue', 'problem', 'change', 'request', 'incident', 'notification'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type ChangeAction = 'created' | 'updated' | 'deleted' | 'status_changed' | 'assigned' | 'commented';

export interface EntityChangeEvent {
  tenantSlug: string;
  entityType: EntityType;
  entityId: string;
  action: ChangeAction;
  data?: Record<string, unknown>;
  actorId?: string;
  version?: string;
  timestamp: string;
}

export type PresenceState = 'viewing' | 'editing' | 'idle';

// Client -> server messages
export type ClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'presence'; channel: string; state: PresenceState }
  | { type: 'ping' };

export interface PresenceUser {
  userId: string;
  state: PresenceState;
  since: string;
}

// Server -> client messages
export type ServerMessage =
  | { type: 'connected'; userId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'event'; channel: string; event: EntityChangeEvent }
  | { type: 'presence'; channel: string; users: PresenceUser[]; collision: boolean }
  | { type: 'pong' }
  | { type: 'error'; message: string };

// Channels: "<entityType>" (all of a type) or "<entityType>:<id>" (single entity)
const CHANNEL_RE = /^([a-z_]+)(?::([A-Za-z0-9_-]{1,64}))?$/;

export function isValidChannel(channel: unknown): channel is string {
  if (typeof channel !== 'string') return false;
  const m = CHANNEL_RE.exec(channel);
  return !!m && (ENTITY_TYPES as readonly string[]).includes(m[1]);
}

export function channelsForEvent(event: EntityChangeEvent): string[] {
  return [event.entityType, `${event.entityType}:${event.entityId}`];
}

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; error: string };

export function parseClientMessage(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid JSON' };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'invalid message' };
  const msg = data as Record<string, unknown>;
  switch (msg.type) {
    case 'ping':
      return { ok: true, message: { type: 'ping' } };
    case 'subscribe':
    case 'unsubscribe':
      if (!isValidChannel(msg.channel)) return { ok: false, error: 'invalid channel' };
      return { ok: true, message: { type: msg.type, channel: msg.channel } };
    case 'presence':
      if (!isValidChannel(msg.channel)) return { ok: false, error: 'invalid channel' };
      if (msg.state !== 'viewing' && msg.state !== 'editing' && msg.state !== 'idle') {
        return { ok: false, error: 'invalid presence state' };
      }
      return { ok: true, message: { type: 'presence', channel: msg.channel, state: msg.state } };
    default:
      return { ok: false, error: 'unknown message type' };
  }
}
