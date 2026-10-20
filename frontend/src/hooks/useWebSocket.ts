'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '@/lib/api';

export type PresenceState = 'viewing' | 'editing' | 'idle';

export interface EntityChangeEvent {
  tenantSlug: string;
  entityType: string;
  entityId: string;
  action: string;
  data?: Record<string, unknown>;
  actorId?: string;
  version?: string;
  timestamp: string;
}

export interface PresenceUser {
  userId: string;
  state: PresenceState;
  since: string;
}

export type ServerMessage =
  | { type: 'connected'; userId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'event'; channel: string; event: EntityChangeEvent }
  | { type: 'presence'; channel: string; users: PresenceUser[]; collision: boolean }
  | { type: 'pong' }
  | { type: 'error'; message: string };

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'fallback' | 'closed';

export interface UseWebSocketOptions {
  url?: string;
  enabled?: boolean;
  /** Reconnect attempts before switching to polling fallback. */
  maxReconnectAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** While in fallback, retry the socket at this interval. */
  fallbackRetryMs?: number;
}

type Listener = (msg: ServerMessage) => void;

export function getWebSocketUrl(): string {
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  return api.replace(/^http/, 'ws').replace(/\/$/, '') + '/v1/ws';
}

/** Exponential backoff with cap: base * 2^attempt, max maxDelay. */
export function reconnectDelay(attempt: number, baseDelayMs = 1000, maxDelayMs = 30000): number {
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

/**
 * Manages one authenticated WebSocket connection with auto-reconnect (exponential backoff),
 * resubscription after reconnect, and a 'fallback' status once reconnects are exhausted so
 * consumers can poll instead.
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    url,
    enabled = true,
    maxReconnectAttempts = 5,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    fallbackRetryMs = 60000,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('closed');
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelsRef = useRef<Map<string, number>>(new Map());
  const listenersRef = useRef<Set<Listener>>(new Set());
  const stoppedRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  const sendRaw = useCallback((msg: Record<string, unknown>) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const connect = useCallback(() => {
    if (stoppedRef.current || typeof WebSocket === 'undefined') {
      if (typeof WebSocket === 'undefined') setStatus('fallback');
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setStatus('fallback');
      return;
    }
    setStatus(attemptRef.current > 0 ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(`${url || getWebSocketUrl()}?token=${encodeURIComponent(token)}`);
    socketRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      setStatus('open');
      // Recover state: resubscribe every active channel
      for (const channel of channelsRef.current.keys()) {
        ws.send(JSON.stringify({ type: 'subscribe', channel }));
      }
    };

    ws.onmessage = (e: MessageEvent) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data));
      } catch {
        return;
      }
      listenersRef.current.forEach((l) => l(msg));
    };

    ws.onclose = (e: CloseEvent) => {
      socketRef.current = null;
      if (stoppedRef.current) {
        setStatus('closed');
        return;
      }
      // 4401 = auth rejected; do not hammer the server, poll instead
      if (e.code === 4401 || attemptRef.current >= maxReconnectAttempts) {
        setStatus('fallback');
        attemptRef.current = 0;
        timerRef.current = setTimeout(() => connectRef.current(), fallbackRetryMs);
        return;
      }
      const delay = reconnectDelay(attemptRef.current, baseDelayMs, maxDelayMs);
      attemptRef.current += 1;
      setStatus('reconnecting');
      timerRef.current = setTimeout(() => connectRef.current(), delay);
    };

    ws.onerror = () => {
      // onclose follows and handles reconnect
    };
  }, [url, maxReconnectAttempts, baseDelayMs, maxDelayMs, fallbackRetryMs]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (!enabled) return;
    stoppedRef.current = false;
    // Opening the socket syncs with an external system; the status update is intended.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    connect();
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled, connect]);

  const subscribe = useCallback(
    (channel: string, listener?: Listener) => {
      const count = channelsRef.current.get(channel) || 0;
      channelsRef.current.set(channel, count + 1);
      if (count === 0) sendRaw({ type: 'subscribe', channel });
      if (listener) listenersRef.current.add(listener);
      return () => {
        if (listener) listenersRef.current.delete(listener);
        const n = (channelsRef.current.get(channel) || 1) - 1;
        if (n <= 0) {
          channelsRef.current.delete(channel);
          sendRaw({ type: 'unsubscribe', channel });
        } else {
          channelsRef.current.set(channel, n);
        }
      };
    },
    [sendRaw]
  );

  const setPresence = useCallback(
    (channel: string, state: PresenceState) => sendRaw({ type: 'presence', channel, state }),
    [sendRaw]
  );

  return { status, isConnected: status === 'open', isFallback: status === 'fallback', subscribe, setPresence };
}
