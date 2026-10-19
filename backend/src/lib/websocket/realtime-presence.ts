// Presence tracking per tenant/channel with editing collision detection.
import type { PresenceUser, PresenceState } from './realtime-protocol.js';

export class PresenceTracker {
  // "<tenant>|<channel>" -> connectionId -> presence
  private rooms = new Map<string, Map<string, PresenceUser>>();

  private key(tenantSlug: string, channel: string): string {
    return `${tenantSlug}|${channel}`;
  }

  set(tenantSlug: string, channel: string, connectionId: string, userId: string, state: PresenceState): void {
    const k = this.key(tenantSlug, channel);
    if (!this.rooms.has(k)) this.rooms.set(k, new Map());
    const room = this.rooms.get(k)!;
    const prev = room.get(connectionId);
    room.set(connectionId, {
      userId,
      state,
      since: prev && prev.state === state ? prev.since : new Date().toISOString(),
    });
  }

  leave(tenantSlug: string, channel: string, connectionId: string): void {
    const k = this.key(tenantSlug, channel);
    const room = this.rooms.get(k);
    room?.delete(connectionId);
    if (room && room.size === 0) this.rooms.delete(k);
  }

  // Remove a connection from every room (on disconnect); returns affected rooms.
  removeConnection(connectionId: string): Array<{ tenantSlug: string; channel: string }> {
    const affected: Array<{ tenantSlug: string; channel: string }> = [];
    for (const [k, room] of this.rooms) {
      if (room.delete(connectionId)) {
        const idx = k.indexOf('|');
        affected.push({ tenantSlug: k.slice(0, idx), channel: k.slice(idx + 1) });
      }
      if (room.size === 0) this.rooms.delete(k);
    }
    return affected;
  }

  // One entry per user; editing wins over viewing over idle.
  list(tenantSlug: string, channel: string): PresenceUser[] {
    const room = this.rooms.get(this.key(tenantSlug, channel));
    if (!room) return [];
    const rank: Record<PresenceState, number> = { editing: 2, viewing: 1, idle: 0 };
    const byUser = new Map<string, PresenceUser>();
    for (const p of room.values()) {
      const cur = byUser.get(p.userId);
      if (!cur || rank[p.state] > rank[cur.state]) byUser.set(p.userId, p);
    }
    return [...byUser.values()];
  }

  // Collision: more than one distinct user editing the same entity.
  hasCollision(tenantSlug: string, channel: string): boolean {
    return this.list(tenantSlug, channel).filter((p) => p.state === 'editing').length > 1;
  }
}
