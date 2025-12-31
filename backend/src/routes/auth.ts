// Remove the TRUST_ALL_PROXIES configuration and related logic
const TRUSTED_PROXY_CIDRS = process.env.TRUSTED_PROXY_CIDRS?.split(',') || [];
// Remove this line entirely:
// const TRUST_ALL_PROXIES = process.env.TRUST_ALL_PROXIES === 'true';

// Update the isTrustedProxy function to remove the insecure trust-all path
function isTrustedProxy(ip: string): boolean {
  // Remove the insecure condition:
  // if (TRUST_ALL_PROXIES) return true;
  
  // For simplicity, we're doing exact match. In production, you'd check CIDR ranges.
  return TRUSTED_PROXY_CIDIRS.some(cidr => 
    cidr === ip || (cidr.includes('/') && ip.startsWith(cidr.split('/')[0]))
  );
}