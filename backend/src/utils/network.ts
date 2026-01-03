import { Address4, Address6 } from 'ip-address';

// Network utilities for IP validation and CIDR matching
// Uses ip-address package for proper CIDR validation

export function isTrustedProxy(ip: string): boolean {
  // Trusted CIDR ranges for private networks and localhost
  const trustedCIDRs = [
    '127.0.0.0/8',      // IPv4 loopback
    '::1/128',          // IPv6 loopback
    '10.0.0.0/8',       // Private network (Class A)
    '172.16.0.0/12',    // Private network (Class B)
    '192.168.0.0/16',   // Private network (Class C)
    'fc00::/7',         // IPv6 unique local addresses
  ];

  // Try IPv4 first
  if (Address4.isValid(ip)) {
    try {
      const addr4 = new Address4(ip);
      return trustedCIDRs.some(cidr => {
        if (!cidr.includes(':')) {
          try {
            const networkAddr = new Address4(cidr);
            return addr4.isInSubnet(networkAddr);
          } catch {
            return false;
          }
        }
        return false;
      });
    } catch {
      return false;
    }
  }

  // Try IPv6
  if (Address6.isValid(ip)) {
    try {
      const addr6 = new Address6(ip);
      return trustedCIDRs.some(cidr => {
        if (cidr.includes(':')) {
          try {
            const networkAddr = new Address6(cidr);
            return addr6.isInSubnet(networkAddr);
          } catch {
            return false;
          }
        }
        return false;
      });
    } catch {
      return false;
    }
  }

  return false;
}
