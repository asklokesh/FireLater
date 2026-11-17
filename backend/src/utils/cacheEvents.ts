import { cacheService, type CacheMessage } from './cache.js';
import { cacheMetrics } from './cacheMetrics.js';
import { resolveInvalidations } from './cacheDependencies.js';
import { logger } from './logger.js';

// ============================================
// EVENT-DRIVEN CACHE INVALIDATION
// ============================================

export type CacheEventAction = 'create' | 'update' | 'delete' | 'custom';

export interface CacheEvent {
  tenantSlug: string;
  /** Entity name registered in cacheDependencies (e.g. `application`) */
  entity: string;
  /** Id(s) of the mutated record; omit when the whole entity set changed */
  id?: string | string[];
  action: CacheEventAction;
}

export interface CacheEventContext {
  /** True when the event originated on another instance (Pub/Sub) */
  remote: boolean;
  /** Key patterns invalidated for this event (local events only) */
  patterns: string[];
}

export type CacheEventHandler = (event: CacheEvent, ctx: CacheEventContext) => void | Promise<void>;

class CacheEventBus {
  private handlers = new Map<string, Set<CacheEventHandler>>();
  private wired = false;

  /** Subscribe to events for an entity (or `*` for all). Returns an unsubscribe function. */
  subscribe(entity: string, handler: CacheEventHandler): () => void {
    this.wireRemote();
    let set = this.handlers.get(entity);
    if (!set) this.handlers.set(entity, (set = new Set()));
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }

  /**
   * Report a mutation. Invalidates only the keys affected by the entity (and the entities that
   * depend on it), notifies subscribers, and tells other instances.
   * Never throws: a cache failure must not fail the mutation.
   */
  async emit(event: CacheEvent): Promise<number> {
    this.wireRemote();
    const ids = event.id === undefined ? [undefined] : Array.isArray(event.id) ? event.id : [event.id];
    const patterns = [...new Set(ids.flatMap((id) => resolveInvalidations(event.tenantSlug, event.entity, id)))];
    cacheMetrics.inc('firelater_cache_events_total', { entity: event.entity, action: event.action });

    let deleted = 0;
    try {
      deleted = await cacheService.invalidateMany(patterns);
    } catch (err) {
      logger.error({ err, event }, 'Cache event invalidation failed');
    }
    await this.dispatch(event, { remote: false, patterns });
    cacheService.publish({ origin: cacheService.instanceId, type: 'event', event });
    return deleted;
  }

  private async dispatch(event: CacheEvent, ctx: CacheEventContext): Promise<void> {
    const hs = [...(this.handlers.get(event.entity) ?? []), ...(this.handlers.get('*') ?? [])];
    for (const h of hs) {
      try {
        await h(event, ctx);
      } catch (err) {
        logger.error({ err, event }, 'Cache event subscriber failed');
      }
    }
  }

  private wireRemote(): void {
    if (this.wired) return;
    this.wired = true;
    cacheService.onMessage((msg: CacheMessage) => {
      if (msg.type !== 'event' || !msg.event) return;
      void this.dispatch(msg.event as CacheEvent, { remote: true, patterns: [] });
    });
  }
}

export const cacheEvents = new CacheEventBus();
