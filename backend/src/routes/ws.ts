// Real-time WebSocket endpoint. Authenticated with the access JWT, scoped to the token's tenant.
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import type { JwtPayload } from '../types/index.js';
import { parseClientMessage, type ServerMessage } from '../lib/websocket/realtime-protocol.js';
import { SubscriptionHub } from '../lib/websocket/realtime-hub.js';
import { PresenceTracker } from '../lib/websocket/realtime-presence.js';
import { realtimeBridge } from '../lib/websocket/realtime-bridge.js';

export const hub = new SubscriptionHub();
export const presence = new PresenceTracker();

const MAX_SUBSCRIPTIONS = 100;

function broadcastPresence(tenantSlug: string, channel: string): void {
  hub.sendToChannel(tenantSlug, channel, {
    type: 'presence',
    channel,
    users: presence.list(tenantSlug, channel),
    collision: presence.hasCollision(tenantSlug, channel),
  });
}

export default async function wsRoutes(app: FastifyInstance) {
  realtimeBridge.attachHub(hub);

  app.get('/', { websocket: true }, (socket, request) => {
    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };

    // Browsers cannot set headers on WebSocket, so accept ?token= as well as Authorization.
    const query = request.query as { token?: string };
    const header = request.headers.authorization;
    const token = query.token || (header?.startsWith('Bearer ') ? header.slice(7) : undefined);

    let user: JwtPayload;
    try {
      if (!token) throw new Error('missing token');
      user = app.jwt.verify<JwtPayload>(token);
      if (!user?.userId || !user?.tenantSlug) throw new Error('invalid token');
    } catch {
      send({ type: 'error', message: 'Unauthorized' });
      socket.close(4401, 'Unauthorized');
      return;
    }

    const connectionId = randomUUID();
    const { tenantSlug, userId } = user;
    const channels = new Set<string>();
    hub.add({ id: connectionId, tenantSlug, userId, send });
    send({ type: 'connected', userId });

    const ensureSubscribed = (channel: string): boolean => {
      if (channels.has(channel)) return true;
      if (channels.size >= MAX_SUBSCRIPTIONS) {
        send({ type: 'error', message: 'subscription limit reached' });
        return false;
      }
      channels.add(channel);
      hub.subscribe(connectionId, channel);
      return true;
    };

    socket.on('message', (raw: Buffer) => {
      const parsed = parseClientMessage(raw.toString());
      if (!parsed.ok) {
        send({ type: 'error', message: parsed.error });
        return;
      }
      const msg = parsed.message;
      switch (msg.type) {
        case 'ping':
          send({ type: 'pong' });
          break;
        case 'subscribe':
          if (ensureSubscribed(msg.channel)) send({ type: 'subscribed', channel: msg.channel });
          break;
        case 'unsubscribe':
          channels.delete(msg.channel);
          hub.unsubscribe(connectionId, msg.channel);
          presence.leave(tenantSlug, msg.channel, connectionId);
          send({ type: 'unsubscribed', channel: msg.channel });
          broadcastPresence(tenantSlug, msg.channel);
          break;
        case 'presence':
          if (!ensureSubscribed(msg.channel)) break;
          presence.set(tenantSlug, msg.channel, connectionId, userId, msg.state);
          broadcastPresence(tenantSlug, msg.channel);
          break;
      }
    });

    socket.on('close', () => {
      hub.remove(connectionId);
      for (const room of presence.removeConnection(connectionId)) {
        broadcastPresence(room.tenantSlug, room.channel);
      }
    });
  });
}
