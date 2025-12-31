import { Address4, Address6 } from 'ip-address';

// Pre-parse trusted proxy CIDRs at module initialization with validation
const TRUSTED_PROXY_CIDIRS = process.env.TRUSTED_PROXY_CIDIRS?.split(',') || [];
const TRUSTED_PROXY_CIDRS_V4: Address4[] = [];
const TRUSTED_PROXY_CIDRS_V6: Address6[] = [];

if (TRUSTED_PROXY_CIDIRS.length > 0) {
  TRUSTED_PROXY_CIDIRS.forEach(cidr => {
    if (!cidr || typeof cidr !== 'string') {
      console.warn(`Invalid CIDR format (not a string): ${cidr}`);
      return;
    }
    
    const trimmedCidr = cidr.trim();
    if (!trimmedCidr) {
      console.warn('Empty CIDR provided');
      return;
    }

    try {
      // Handle both IPv4 and IPv6 CIDRs properly
      if (trimmedCidr.includes(':')) {
        const subnet = new Address6(trimmedCidr);
        if (subnet.isValid()) {
          TRUSTED_PROXY_CIDRS_V6.push(subnet);
        } else {
          console.warn(`Invalid IPv6 CIDR format: ${trimmedCidr}`);
        }
      } else {
        const subnet = new Address4(trimmedCidr);
        if (subnet.isValid()) {
          TRUSTED_PROXY_CIDRS_V4.push(subnet);
        } else {
          console.warn(`Invalid IPv4 CIDR format: ${trimmedCidr}`);
        }
      }
    } catch (error) {
      console.warn(`Failed to parse trusted proxy CIDR ${trimmedCidr}:`, error);
    }
  });
}