'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  useWebSocket,
  type EntityChangeEvent,
  type PresenceUser,
  type PresenceState,
  type UseWebSocketOptions,
} from './useWebSocket';

export interface UseRealtimeEntityOptions extends UseWebSocketOptions {
  /** React Query keys to invalidate when a change event arrives. */
  queryKeys?: QueryKey[];
  /** Polling interval used as fallback when the socket is unavailable. */
  pollIntervalMs?: number;
  /** Presence state to announce for this entity (omit to only observe). */
  presence?: PresenceState;
  onEvent?: (event: EntityChangeEvent) => void;
}

/**
 * Subscribes to live changes for an entity type (entityId omitted) or a single entity.
 * Invalidates the given React Query keys on change, tracks presence/collisions, and polls
 * (invalidates on an interval) while the WebSocket is in fallback.
 */
export function useRealtimeEntity(entityType: string, entityId?: string, options: UseRealtimeEntityOptions = {}) {
  const { queryKeys = [], pollIntervalMs = 30000, presence, onEvent, ...wsOptions } = options;
  const channel = entityId ? `${entityType}:${entityId}` : entityType;
  const queryClient = useQueryClient();
  const { status, isFallback, subscribe, setPresence } = useWebSocket(wsOptions);
  const [lastEvent, setLastEvent] = useState<EntityChangeEvent | null>(null);
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [collision, setCollision] = useState(false);

  const keysRef = useRef(queryKeys);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    keysRef.current = queryKeys;
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    return subscribe(channel, (msg) => {
      if (msg.type === 'event' && msg.channel === channel) {
        setLastEvent(msg.event);
        onEventRef.current?.(msg.event);
        keysRef.current.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      } else if (msg.type === 'presence' && msg.channel === channel) {
        setUsers(msg.users);
        setCollision(msg.collision);
      }
    });
  }, [channel, subscribe, queryClient]);

  useEffect(() => {
    if (presence && status === 'open') setPresence(channel, presence);
  }, [presence, status, channel, setPresence]);

  // Polling fallback
  useEffect(() => {
    if (!isFallback || pollIntervalMs <= 0) return;
    const id = setInterval(() => {
      keysRef.current.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [isFallback, pollIntervalMs, queryClient]);

  return { status, isFallback, lastEvent, presenceUsers: users, collision };
}
