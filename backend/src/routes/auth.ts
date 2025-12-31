import { Address4, Address6 } from 'ip-address';

// Pre-parse trusted proxy CIDRs at module initialization
const TRUSTED_PROXY_CIDIRS = process.env.TRUSTED_PROXY_CIDIRS?.split(',') || [];
const TRUSTED_PROXY_CIDRS_V4: Address4[] = [];
const TRUSTED_PROXY_CIDRS_V6: Address6[] = [];

if (TRUSTED_PROXY_CIDIRS.length > 0) {
  TRUSTED_PROXY_CIDIRS.forEach(cidr => {
    try {
      if (cidr.includes('.')) {
        const subnet = new Address4(cidr);
        if (subnet.isValid()) {
          TRUSTED_PROXY_CIDRS_V4.push(subnet);
        }
      } else if (cidr.includes(':')) {
        const subnet = new Address6(cidr);
        if (subnet.isValid()) {
          TRUSTED_PROXY_CIDRS_V6.push(subnet);
        }
      }
    } catch (error) {
      console.warn(`Failed to parse trusted proxy CIDR ${cidr}:`, error);
    }
  });
}