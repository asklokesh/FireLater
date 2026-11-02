import { ErrorCode, ExternalServiceError, ServiceUnavailableError } from './errors.js';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  timeout: number;
  failureThreshold: number;
  cooldownPeriod: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  
  constructor(private options: CircuitBreakerOptions) {}

  async call<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.lastFailureTime && 
          Date.now() - this.lastFailureTime > this.options.cooldownPeriod) {
        this.state = 'HALF_OPEN';
      } else {
        const elapsed = this.lastFailureTime ? Date.now() - this.lastFailureTime : 0;
        const remainingMs = Math.max(0, this.options.cooldownPeriod - elapsed);
        throw new ServiceUnavailableError('Circuit breaker is OPEN', {
          code: ErrorCode.CIRCUIT_OPEN,
          retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
        });
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ExternalServiceError('Operation timeout', { code: ErrorCode.UPSTREAM_TIMEOUT })
              ),
            this.options.timeout
          );
        }),
      ]);
      
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.options.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }
}