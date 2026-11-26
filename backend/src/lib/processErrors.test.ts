import { describe, it, expect, vi } from 'vitest';

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { installProcessErrorHandlers } from './processErrors.js';
import { setErrorTracker } from './errorTracking.js';

function fakeProcess() {
  const handlers: Record<string, (arg: any) => void> = {};
  return { handlers, on: (event: string, cb: (arg: any) => void) => { handlers[event] = cb; } };
}

describe('process error handlers', () => {
  it('captures, flushes, then exits on uncaughtException', async () => {
    const order: string[] = [];
    setErrorTracker({
      name: 't',
      captureException: () => { order.push('capture'); },
      flush: async () => { await new Promise((r) => setTimeout(r, 5)); order.push('flush'); },
    });
    const proc = fakeProcess();
    const exit = vi.fn(() => { order.push('exit'); });
    installProcessErrorHandlers(proc as any, exit);
    proc.handlers.uncaughtException(new Error('boom'));
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(order).toEqual(['capture', 'flush', 'exit']);
  });

  it('keeps Node default of terminating on unhandledRejection (after capture)', async () => {
    const captured: any[] = [];
    setErrorTracker({ name: 't', captureException: (e, c) => { captured.push([e, c]); } });
    const proc = fakeProcess();
    const exit = vi.fn();
    installProcessErrorHandlers(proc as any, exit);
    proc.handlers.unhandledRejection('reason');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(captured[0][1]).toMatchObject({ operation: 'process.unhandledRejection' });
  });

  it('still exits when the tracker flush never settles', async () => {
    setErrorTracker({ name: 't', captureException: () => {}, flush: () => new Promise<void>(() => {}) });
    const proc = fakeProcess();
    const exit = vi.fn();
    installProcessErrorHandlers(proc as any, exit, 30);
    proc.handlers.uncaughtException(new Error('boom'));
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1), { timeout: 1000 });
  });

  it('still exits when the tracker flush fails', async () => {
    setErrorTracker({ name: 't', captureException: () => {}, flush: async () => { throw new Error('x'); } });
    const proc = fakeProcess();
    const exit = vi.fn();
    installProcessErrorHandlers(proc as any, exit);
    proc.handlers.uncaughtException(new Error('boom'));
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  });
});
