// Stub implementation for network utilities
// TODO: Install ip-address package and implement proper CIDR validation

export function isTrustedProxy(ip: string): boolean {
  // Simple validation - allows localhost and private IPs
  // In production, this should use proper CIDR matching
  const trustedPatterns = [
    '127.0.0.1',
    'localhost',
    '::1',
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
  ];

  return trustedPatterns.some(pattern => {
    if (typeof pattern === 'string') {
      return ip === pattern;
    }
    return pattern.test(ip);
  });
}
