// Redis Pub/Sub bridge so entity changes reach WebSocket clients on every instance.
import type { EntityChangeEvent, EntityType, ChangeAction } from './realtime-protocol.js';
import type { SubscriptionHub } from './realtime-hub.js';
import { logger } from '../../utils/logger.js';

export const REALTIME_CHANNEL = 'firelater:realtime:events';

export interface RedisLike {
  publish(channel: string, message: string): unknown;
  subscribe(channel: string): unknown;
  unsubscribe?(channel: string): unknown;
  on(event: 'message', listener: (channel: string, message: string) => void): unknown;
  quit?(): unknown;
}

export class RealtimeBridge {
  private publisher: RedisLike | null = null;
  private subscriber: RedisLike | null = null;
  private hub: SubscriptionHub | null = null;

  // Without Redis, published events go straight to the local hub.
  attachHub(hub: SubscriptionHub): void {
    this.hub = hub;
  }

  async start(hub: SubscriptionHub, publisher: RedisLike, subscriber: RedisLike): Promise<void> {
    this.hub = hub;
    this.publisher = publisher;
    this.subscriber = subscriber;
    subscriber.on('message', (channel: string, message: string) => {
      if (channel !== REALTIME_CHANNEL) return;
      this.handleMessage(message);
    });
    await subscriber.subscribe(REALTIME_CHANNEL);
  }

  handleMessage(message: string): void {
    let event: EntityChangeEvent;
    try {
      event = JSON.parse(message) as EntityChangeEvent;
    } catch {
      logger.warn('Invalid realtime message received from Redis');
      return;
    }
    if (!event || typeof event.tenantSlug !== 'string' || typeof event.entityId !== 'string') return;
    this.hub?.dispatch(event);
  }

  async publish(event: EntityChangeEvent): Promise<void> {
    if (this.publisher) {
      await this.publisher.publish(REALTIME_CHANNEL, JSON.stringify(event));
    } else {
      this.hub?.dispatch(event);
    }
  }

  async stop(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe?.(REALTIME_CHANNEL);
      await this.subscriber.quit?.();
    }
    this.subscriber = null;
    this.publisher = null;
  }
}

export const realtimeBridge = new RealtimeBridge();

// Fire-and-forget helper for services. Never throws.
export function publishEntityChange(
  tenantSlug: string,
  entityType: EntityType,
  entityId: string,
  action: ChangeAction,
  extra: { data?: Record<string, unknown>; actorId?: string; version?: string } = {}
): void {
  const event: EntityChangeEvent = {
    tenantSlug,
    entityType,
    entityId,
    action,
    ...extra,
    timestamp: new Date().toISOString(),
  };
  Promise.resolve()
    .then(() => realtimeBridge.publish(event))
    .catch((err) => logger.warn({ err, tenantSlug, entityType, entityId }, 'Failed to publish realtime event'));
}
