import { Address4, Address6 } from 'ip-address';
import { TRUSTED_PROXY_CIDIRS } from '../config/env.js';

export function isTrustedProxy(ip: string): boolean {
  // Validate IP format first
  const isIPv4 = Address4.isValid(ip);
  const isIPv6 = Address6.isValid(ip);
  
  if (!isIPv4 && !isIPv6) {
    return false;
  }

  return TRUSTED_PROXY_CIDIRS.some(cidr => {
    try {
      // Handle IPv4 CIDR
      if (cidr.includes('.')) {
        const subnet = new Address4(cidr);
        if (subnet.isValid()) {
          const address = new Address4(ip);
          return address.isValid() && subnet.contains(address);
        }
      }
      // Handle IPv6 CIDR
      else if (cidr.includes(':')) {
        const subnet = new Address6(cidr);
        if (subnet.isValid()) {
          const address = new Address6(ip);
          return address.isValid() && subnet.contains(address);
        }
      }
      // Handle exact IP match
      return cidr === ip;
    } catch (error) {
      // Log specific errors for debugging
      console.warn(`Failed to validate CIDR ${cidr} against IP ${ip}:`, error);
      // If parsing fails, fall back to exact match
      return cidr === ip;
    }
  });
}