import { Address4, Address6 } from 'ip-address';

// Pre-parse trusted proxy CIDRs at module initialization
const TRUSTED_PROXY_CIDRS_V4: Address4[] = [];
const TRUSTED_PROXY_CIDRS_V6: Address6[] = [];

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

function isTrustedProxy(ip: string): boolean {
  const isIPv4 = Address4.isValid(ip);
  const isIPv6 = Address6.isValid(ip);
  
  if (!isIPv4 && !isIPv6) {
    return false;
  }

  try {
    if (isIPv4) {
      const address = new Address4(ip);
      if (!address.isValid()) return false;
      
      return TRUSTED_PROXY_CIDRS_V4.some(subnet => subnet.contains(address));
    } else if (isIPv6) {
      const address = new Address6(ip);
      if (!address.isValid()) return false;
      
      return TRUSTED_PROXY_CIDRS_V6.some(subnet => subnet.contains(address));
    }
  } catch (error) {
    console.warn(`Failed to validate IP ${ip}:`, error);
    return false;
  }

  return false;
}