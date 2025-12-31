import { Address4, Address6 } from 'ip-address';

// Update the isTrustedProxy function with proper CIDR validation
function isTrustedProxy(ip: string): boolean {
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
    } catch {
      // If parsing fails, fall back to exact match
      return cidr === ip;
    }
  });
}