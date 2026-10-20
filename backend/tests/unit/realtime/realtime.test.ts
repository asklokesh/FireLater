import { describe, it, expect, vi } from 'vitest';
import { parseClientMessage, isValidChannel, channelsForEvent, type ServerMessage, type EntityChangeEvent } from '../../../src/lib/websocket/realtime-protocol.js';
import { SubscriptionHub } from '../../../src/lib/websocket/realtime-hub.js';
import { PresenceTracker } from '../../../src/lib/websocket/realtime-presence.js';
import { RealtimeBridge, REALTIME_CHANNEL } from '../../../src/lib/websocket/realtime-bridge.js';
import { isVersionConflict } from '../../../src/services/issues.js';

function event(overrides: Partial<EntityChangeEvent> = {}): EntityChangeEvent {
  return {
    tenantSlug: 'acme',
    entityType: 'issue',
    entityId: 'abc',
    action: 'updated',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function conn(id: string, tenantSlug = 'acme', userId = 'u1') {
  const messages: ServerMessage[] = [];
  return { id, tenantSlug, userId, messages, send: (m: ServerMessage) => messages.push(m) };
}

describe('realtime protocol', () => {
  it('parses subscribe, unsubscribe, presence and ping', () => {
    expect(parseClientMessage('{"type":"subscribe","channel":"issue"}')).toEqual({ ok: true, message: { type: 'subscribe', channel: 'issue' } });
    expect(parseClientMessage('{"type":"unsubscribe","channel":"issue:123"}')).toEqual({ ok: true, message: { type: 'unsubscribe', channel: 'issue:123' } });
    expect(parseClientMessage('{"type":"presence","channel":"issue:1","state":"editing"}').ok).toBe(true);
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ ok: true, message: { type: 'ping' } });
  });

  it('rejects invalid JSON, unknown types, bad channels and states', () => {
    expect(parseClientMessage('not json')).toEqual({ ok: false, error: 'invalid JSON' });
    expect(parseClientMessage('null').ok).toBe(false);
    expect(parseClientMessage('{"type":"hack"}').ok).toBe(false);
    expect(parseClientMessage('{"type":"subscribe","channel":"secrets"}').ok).toBe(false);
    expect(parseClientMessage('{"type":"subscribe","channel":"issue:a|b"}').ok).toBe(false);
    expect(parseClientMessage('{"type":"presence","channel":"issue:1","state":"typing"}').ok).toBe(false);
  });

  it('validates channels and maps events to channels', () => {
    expect(isValidChannel('change')).toBe(true);
    expect(isValidChannel(42)).toBe(false);
    expect(channelsForEvent(event())).toEqual(['issue', 'issue:abc']);
  });
});

describe('SubscriptionHub', () => {
  it('delivers events to type and entity subscribers once per connection', () => {
    const hub = new SubscriptionHub();
    const a = conn('a');
    const b = conn('b');
    hub.add(a);
    hub.add(b);
    hub.subscribe('a', 'issue');
    hub.subscribe('a', 'issue:abc');
    hub.subscribe('b', 'issue:other');
    expect(hub.dispatch(event())).toBe(1);
    expect(a.messages).toHaveLength(1);
    expect(a.messages[0]).toMatchObject({ type: 'event', event: { entityId: 'abc' } });
    expect(b.messages).toHaveLength(0);
  });

  it('isolates tenants', () => {
    const hub = new SubscriptionHub();
    const a = conn('a', 'acme');
    const other = conn('x', 'globex');
    hub.add(a);
    hub.add(other);
    hub.subscribe('a', 'issue');
    hub.subscribe('x', 'issue');
    hub.dispatch(event({ tenantSlug: 'acme' }));
    expect(a.messages).toHaveLength(1);
    expect(other.messages).toHaveLength(0);
  });

  it('stops delivery after unsubscribe and remove', () => {
    const hub = new SubscriptionHub();
    const a = conn('a');
    hub.add(a);
    hub.subscribe('a', 'issue');
    hub.unsubscribe('a', 'issue');
    expect(hub.dispatch(event())).toBe(0);
    hub.subscribe('a', 'issue');
    hub.remove('a');
    expect(hub.dispatch(event())).toBe(0);
    expect(hub.size).toBe(0);
    expect(hub.subscribe('a', 'issue')).toBe(false);
  });

  it('keeps delivering when one connection throws', () => {
    const hub = new SubscriptionHub();
    hub.add({ id: 'bad', tenantSlug: 'acme', userId: 'u', send: () => { throw new Error('closed'); } });
    const good = conn('good');
    hub.add(good);
    hub.subscribe('bad', 'issue');
    hub.subscribe('good', 'issue');
    hub.dispatch(event());
    expect(good.messages).toHaveLength(1);
  });
});

describe('PresenceTracker', () => {
  it('lists users and detects editing collisions', () => {
    const p = new PresenceTracker();
    p.set('acme', 'issue:1', 'c1', 'u1', 'editing');
    p.set('acme', 'issue:1', 'c2', 'u2', 'viewing');
    expect(p.list('acme', 'issue:1')).toHaveLength(2);
    expect(p.hasCollision('acme', 'issue:1')).toBe(false);
    p.set('acme', 'issue:1', 'c2', 'u2', 'editing');
    expect(p.hasCollision('acme', 'issue:1')).toBe(true);
  });

  it('does not treat the same user in two tabs as a collision', () => {
    const p = new PresenceTracker();
    p.set('acme', 'issue:1', 'c1', 'u1', 'editing');
    p.set('acme', 'issue:1', 'c2', 'u1', 'viewing');
    expect(p.list('acme', 'issue:1')).toEqual([expect.objectContaining({ userId: 'u1', state: 'editing' })]);
    expect(p.hasCollision('acme', 'issue:1')).toBe(false);
  });

  it('removes a connection on disconnect and reports affected rooms', () => {
    const p = new PresenceTracker();
    p.set('acme', 'issue:1', 'c1', 'u1', 'viewing');
    p.set('acme', 'issue:2', 'c1', 'u1', 'editing');
    p.set('globex', 'issue:1', 'c9', 'u9', 'viewing');
    const affected = p.removeConnection('c1');
    expect(affected).toHaveLength(2);
    expect(p.list('acme', 'issue:1')).toEqual([]);
    expect(p.list('globex', 'issue:1')).toHaveLength(1);
    p.leave('globex', 'issue:1', 'c9');
    expect(p.list('globex', 'issue:1')).toEqual([]);
  });
});

describe('RealtimeBridge (Redis Pub/Sub)', () => {
  function fakeRedis() {
    const listeners: Array<(c: string, m: string) => void> = [];
    return {
      publish: vi.fn(async (channel: string, message: string) => {
        listeners.forEach((l) => l(channel, message));
        return 1;
      }),
      subscribe: vi.fn(async () => 1),
      unsubscribe: vi.fn(async () => 1),
      quit: vi.fn(async () => 'OK'),
      on: vi.fn((_e: 'message', l: (c: string, m: string) => void) => { listeners.push(l); }),
    };
  }

  it('publishes to Redis and dispatches received messages to the hub', async () => {
    const hub = new SubscriptionHub();
    const a = conn('a');
    hub.add(a);
    hub.subscribe('a', 'issue:abc');
    const redis = fakeRedis();
    const bridge = new RealtimeBridge();
    await bridge.start(hub, redis, redis);
    expect(redis.subscribe).toHaveBeenCalledWith(REALTIME_CHANNEL);
    await bridge.publish(event());
    expect(redis.publish).toHaveBeenCalledWith(REALTIME_CHANNEL, expect.any(String));
    expect(a.messages).toHaveLength(1);
    await bridge.stop();
    expect(redis.unsubscribe).toHaveBeenCalledWith(REALTIME_CHANNEL);
  });

  it('ignores malformed and foreign-channel messages', async () => {
    const hub = new SubscriptionHub();
    const spy = vi.spyOn(hub, 'dispatch');
    const bridge = new RealtimeBridge();
    bridge.attachHub(hub);
    bridge.handleMessage('{oops');
    bridge.handleMessage('{"foo":1}');
    expect(spy).not.toHaveBeenCalled();
  });

  it('dispatches locally when Redis is not started', async () => {
    const hub = new SubscriptionHub();
    const a = conn('a');
    hub.add(a);
    hub.subscribe('a', 'issue');
    const bridge = new RealtimeBridge();
    bridge.attachHub(hub);
    await bridge.publish(event());
    expect(a.messages).toHaveLength(1);
  });
});

describe('issue version conflict detection', () => {
  it('detects stale versions and accepts matching ones', () => {
    const current = new Date('2026-01-01T10:00:00.000Z');
    expect(isVersionConflict(current, '2026-01-01T10:00:00.000Z')).toBe(false);
    expect(isVersionConflict(current, '2026-01-01T09:59:59.000Z')).toBe(true);
    expect(isVersionConflict(current, 'garbage')).toBe(true);
    expect(isVersionConflict(null, '2026-01-01T10:00:00.000Z')).toBe(false);
  });
});
