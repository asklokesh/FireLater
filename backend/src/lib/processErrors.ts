import { captureException, flushErrorTracking } from './errorTracking.js';
import { logger } from '../utils/logger.js';

interface ProcessLike {
  on(event: 'unhandledRejection', cb: (reason: unknown) => void): unknown;
  on(event: 'uncaughtException', cb: (err: Error) => void): unknown;
}

/**
 * Report errors outside the request cycle to error tracking. Node's default (crash with exit code 1)
 * is kept: after the event is captured and flushed the process exits.
 */
export function installProcessErrorHandlers(
  proc: ProcessLike = process,
  exit: (code: number) => void = (code) => process.exit(code),
  flushTimeoutMs = 2000
): void {
  const fatal = async (err: unknown, operation: string, message: string) => {
    logger.error({ err }, message);
    captureException(err, { operation });
    await flushErrorTracking(flushTimeoutMs);
    exit(1);
  };
  proc.on('unhandledRejection', (reason) => {
    void fatal(reason, 'process.unhandledRejection', 'Unhandled promise rejection');
  });
  proc.on('uncaughtException', (err) => {
    void fatal(err, 'process.uncaughtException', 'Uncaught exception');
  });
}
