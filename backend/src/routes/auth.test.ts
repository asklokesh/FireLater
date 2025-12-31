import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Address4, Address6 } from 'ip-address';

describe('CIDR Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should handle valid IPv4 CIDRs', async () => {
    process.env.TRUSTED_PROXY_CIDIRS = '192.168.1.0/24,10.0.0.0/8';
    const { TRUSTED_PROXY_CIDRS_V4, TRUSTED_PROXY_CIDRS_V6 } = await import('./auth');
    
    expect(TRUSTED_PROXY_CIDRS_V4).toHaveLength(2);
    expect(TRUSTED_PROXY_CIDRS_V6).toHaveLength(0);
    expect(TRUSTED_PROXY_CIDRS_V4[0].address).toBe('192.168.1.0');
    expect(TRUSTED_PROXY_CIDRS_V4[1].address).toBe('10.0.0.0');
  });

  it('should handle valid IPv6 CIDRs', async () => {
    process.env.TRUSTED_PROXY_CIDIRS = '2001:db8::/32,::1/128';
    const { TRUSTED_PROXY_CIDRS_V4, TRUSTED_PROXY_CIDRS_V6 } = await import('./auth');
    
    expect(TRUSTED_PROXY_CIDRS_V4).toHaveLength(0);
    expect(TRUSTED_PROXY_CIDRS_V6).toHaveLength(2);
    expect(TRUSTED_PROXY_CIDRS_V6[0].address).toBe('2001:db8::');
    expect(TRUSTED_PROXY_CIDRS_V6[1].address).toBe('::1');
  });

  it('should handle mixed IPv4 and IPv6 CIDRs', async () => {
    process.env.TRUSTED_PROXY_CIDIRS = '192.168.1.0/24,2001:db8::/32';
    const { TRUSTED_PROXY_CIDRS_V4, TRUSTED_PROXY_CIDRS_V6 } = await import('./auth');
    
    expect(TRUSTED_PROXY_CIDRS_V4).toHaveLength(1);
    expect(TRUSTED_PROXY_CIDRS_V6).toHaveLength(1);
  });

  it('should warn and skip invalid IPv4 CIDRs', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.TRUSTED_PROXY_CIDIRS = '192.168.1.0/24,invalid.cidr,300.300.300.300/32';
    const { TRUSTED_PROXY_CIDRS_V4, TRUSTED_PROXY_CIDRS_V6 } = await import('./auth');
    
    expect(TRUSTED_PROXY_CIDRS_V4).toHaveLength(1);
    expect(TRUSTED_PROXY_CIDRS_V6).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid IPv4 CIDR format: invalid.cidr');
    expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid IPv4 CIDR format: 300.300.300.300/32');
    
    consoleWarnSpy.mockRestore();
  });

  it('should warn and skip invalid IPv6 CIDRs', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.TRUSTED_PROXY_CIDIRS = '2001:db8::/32,invalid::ipv6::cidr';
    const { TRUSTED_PROXY_CIDRS_V4, TRUSTED_PROXY_CIDRS_V6 } = await import('./auth');
    
    expect(TRUSTED_PROXY_CIDRS_V4).toHaveLength(0);
    expect(TRUSTED_PROXY_CIDRS_V6).toHaveLength(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid IPv6 CIDR format: invalid::ipv6::cidr');
    
    consoleWarnSpy.mockRestore();
  });

  it('should handle empty CIDR strings', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.TRUSTED_PROXY_CIDIRS = '192.168.1.0/24,, ,2001:db8::/32';
    const { TRUSTED_PROXY_CIDRS_V4, TRUSTED_PROXY_CIDRS_V6 } = await import('./auth');
    
    expect(TRUSTED_PROXY_CIDRS_V4).toHaveLength(1);
    expect(TRUSTED_PROXY_CIDRS_V6).toHaveLength(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith('Empty CIDR provided');
    
    consoleWarnSpy.mockRestore();
  });

  it('should handle non-string CIDR values', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // @ts-ignore - intentionally testing invalid input
    process.env.TRUSTED_PROXY_CIDIRS = '192.168.1.0/24,123,2001:db8::/32';
    const { TRUSTED_PROXY_CIDRS_V4, TRUSTED_PROXY_CIDRS_V6 } = await import('./auth');
    
    expect(TRUSTED_PROXY_CIDRS_V4).toHaveLength(1);
    expect(TRUSTED_PROXY_CIDRS_V6).toHaveLength(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid CIDR format (not a string): 123');
    
    consoleWarnSpy.mockRestore();
  });

  it('should handle undefined TRUSTED_PROXY_CIDIRS', async () => {
    delete process.env.TRUSTED_PROXY_CIDIRS;
    const { TRUSTED_PROXY_CIDRS_V4, TRUSTED_PROXY_CIDRS_V6 } = await import('./auth');
    
    expect(TRUSTED_PROXY_CIDRS_V4).toHaveLength(0);
    expect(TRUSTED_PROXY_CIDRS_V6).toHaveLength(0);
  });
});