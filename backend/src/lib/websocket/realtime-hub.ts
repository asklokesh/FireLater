// In-process subscription hub. Connections are scoped by tenant; channel keys never cross tenants.
import type { ServerMessage, EntityChangeEvent } from './realtime-protocol.js';
import { channelsForEvent } from './realtime-protocol.js';

export interface HubConnection {
  id: string;
  tenantSlug: string;
  userId: string;
  send: (message: ServerMessage) => void;
}

export class SubscriptionHub {
  private connections = new Map<string, HubConnection>();
  private channels = new Map<string, Set<string>>(); // "<tenant>|<channel>" -> connection ids
  private byConnection = new Map<string, Set<string>>(); // connection id -> channel keys

  private key(tenantSlug: string, channel: string): string {
    return `${tenantSlug}|${channel}`;
  }

  add(conn: HubConnection): void {
    this.connections.set(conn.id, conn);
    this.byConnection.set(conn.id, new Set());
  }

  remove(connectionId: string): void {
    const keys = this.byConnection.get(connectionId);
    if (keys) {
      for (const k of keys) {
        const set = this.channels.get(k);
        set?.delete(connectionId);
        if (set && set.size === 0) this.channels.delete(k);
      }
    }
    this.byConnection.delete(connectionId);
    this.connections.delete(connectionId);
  }

  subscribe(connectionId: string, channel: string): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) return false;
    const k = this.key(conn.tenantSlug, channel);
    if (!this.channels.has(k)) this.channels.set(k, new Set());
    this.channels.get(k)!.add(connectionId);
    this.byConnection.get(connectionId)!.add(k);
    return true;
  }

  unsubscribe(connectionId: string, channel: string): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) return false;
    const k = this.key(conn.tenantSlug, channel);
    const set = this.channels.get(k);
    set?.delete(connectionId);
    if (set && set.size === 0) this.channels.delete(k);
    this.byConnection.get(connectionId)?.delete(k);
    return true;
  }

  subscribers(tenantSlug: string, channel: string): HubConnection[] {
    const ids = this.channels.get(this.key(tenantSlug, channel));
    if (!ids) return [];
    return [...ids].map((id) => this.connections.get(id)).filter((c): c is HubConnection => !!c);
  }

  sendToChannel(tenantSlug: string, channel: string, message: ServerMessage): number {
    let sent = 0;
    for (const conn of this.subscribers(tenantSlug, channel)) {
      try {
        conn.send(message);
        sent++;
      } catch {
        // broken connection; its close handler removes it
      }
    }
    return sent;
  }

  // Deliver an entity change once per connection subscribed to the type or entity channel.
  dispatch(event: EntityChangeEvent): number {
    const delivered = new Set<string>();
    for (const channel of channelsForEvent(event)) {
      for (const conn of this.subscribers(event.tenantSlug, channel)) {
        if (delivered.has(conn.id)) continue;
        delivered.add(conn.id);
        try {
          conn.send({ type: 'event', channel, event });
        } catch {
          // ignore
        }
      }
    }
    return delivered.size;
  }

  get size(): number {
    return this.connections.size;
  }
}
