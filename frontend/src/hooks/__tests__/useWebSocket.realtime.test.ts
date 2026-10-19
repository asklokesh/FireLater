import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/lib/api', () => ({ getAccessToken: vi.fn(() => 'tok') }));

import { useWebSocket, reconnectDelay, getWebSocketUrl } from '../useWebSocket';
import { useRealtimeEntity } from '../useRealtimeEntity';

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  serverClose(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const last = () => MockWebSocket.instances[MockWebSocket.instances.length - 1];

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('computes capped exponential backoff and ws url', () => {
    expect(reconnectDelay(0, 1000, 30000)).toBe(1000);
    expect(reconnectDelay(3, 1000, 30000)).toBe(8000);
    expect(reconnectDelay(10, 1000, 30000)).toBe(30000);
    expect(getWebSocketUrl()).toMatch(/^ws.*\/v1\/ws$/);
  });

  it('connects with token and resubscribes after reconnect', () => {
    const { result } = renderHook(() => useWebSocket({ baseDelayMs: 10 }));
    expect(last().url).toContain('token=tok');
    act(() => last().open());
    expect(result.current.status).toBe('open');
    act(() => {
      result.current.subscribe('issue:1');
    });
    expect(last().sent).toContainEqual({ type: 'subscribe', channel: 'issue:1' });

    act(() => last().serverClose());
    expect(result.current.status).toBe('reconnecting');
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    act(() => last().open());
    expect(last().sent).toContainEqual({ type: 'subscribe', channel: 'issue:1' });
  });

  it('switches to fallback after max reconnect attempts', () => {
    const { result } = renderHook(() => useWebSocket({ baseDelayMs: 10, maxReconnectAttempts: 2 }));
    act(() => last().serverClose());
    act(() => {
      vi.advanceTimersByTime(10);
    });
    act(() => last().serverClose());
    act(() => {
      vi.advanceTimersByTime(20);
    });
    act(() => last().serverClose());
    expect(result.current.status).toBe('fallback');
    expect(result.current.isFallback).toBe(true);
  });

  it('goes straight to fallback on auth rejection', () => {
    const { result } = renderHook(() => useWebSocket());
    act(() => last().serverClose(4401));
    expect(result.current.status).toBe('fallback');
  });

  it('unsubscribes when the last listener leaves', () => {
    const { result } = renderHook(() => useWebSocket());
    act(() => last().open());
    let off: () => void = () => {};
    act(() => {
      off = result.current.subscribe('issue');
    });
    act(() => off());
    expect(last().sent).toContainEqual({ type: 'unsubscribe', channel: 'issue' });
  });
});

describe('useRealtimeEntity', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    queryClient = new QueryClient();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('invalidates queries on change events and tracks presence collisions', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(
      () => useRealtimeEntity('issue', '1', { queryKeys: [['issues', '1']], presence: 'editing' }),
      { wrapper }
    );
    act(() => last().open());
    expect(last().sent).toContainEqual({ type: 'presence', channel: 'issue:1', state: 'editing' });

    act(() =>
      last().receive({
        type: 'event',
        channel: 'issue:1',
        event: { tenantSlug: 't', entityType: 'issue', entityId: '1', action: 'updated', timestamp: 'now' },
      })
    );
    expect(spy).toHaveBeenCalledWith({ queryKey: ['issues', '1'] });
    expect(result.current.lastEvent?.action).toBe('updated');

    act(() =>
      last().receive({
        type: 'presence',
        channel: 'issue:1',
        users: [
          { userId: 'a', state: 'editing', since: 'x' },
          { userId: 'b', state: 'editing', since: 'y' },
        ],
        collision: true,
      })
    );
    expect(result.current.presenceUsers).toHaveLength(2);
    expect(result.current.collision).toBe(true);
  });

  it('polls via query invalidation while in fallback', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useRealtimeEntity('issue', undefined, { queryKeys: [['issues']], pollIntervalMs: 1000 }), {
      wrapper,
    });
    act(() => last().serverClose(4401));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
