import { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { authService } from '../services/auth.js';
import { tenantService } from '../services/tenant.js';
import { Address4, Address6 } from 'ip-address';

// Pre-parse trusted proxy CIDRs at module initialization
const TRUSTED_PROXY_CIDIRS = process.env.TRUSTED_PROXY_CIDIRS?.split(',') || [];
const TRUSTED_PROXY_CIDRS_V4: Address4[] = [];
const TRUSTED_PROXY_CIDRS_V6: Address6[] = [];

if (TRUSTED_PROXY_CIDIRS.length > 0) {
  TRUSTED_PROXY_CIDIRS.forEach(cidr => {
    try {
      // Handle both IPv4 and IPv6 CIDRs properly
      if (cidr.includes(':')) {
        const subnet = new Address6(cidr);
        if (subnet.isValid()) {
          TRUSTED_PROXY_CIDRS_V6.push(subnet);
        }
      } else {
        const subnet = new Address4(cidr);
        if (subnet.isValid()) {
          TRUSTED_PROXY_CIDRS_V4.push(subnet);
        }
      }
    } catch (error) {
      console.warn(`Failed to parse trusted proxy CIDR ${cidr}:`, error);
    }
  });
}

function isTrustedProxy(clientIp: string): boolean {
  if (!clientIp) return false;

  try {
    // Handle IPv4-mapped IPv6 addresses
    let normalizedIp = clientIp;
    if (clientIp.startsWith('::ffff:')) {
      normalizedIp = clientIp.substring(7);
    }

    // Parse IP address properly
    let ipAddr;
    let isIPv6 = false;
    
    if (normalizedIp.includes(':')) {
      ipAddr = new Address6(normalizedIp);
      isIPv6 = true;
      
      // Convert IPv4-mapped IPv6 to IPv4 if needed
      if (ipAddr.is4()) {
        normalizedIp = ipAddr.to4().address;
        ipAddr = new Address4(normalizedIp);
        isIPv6 = false;
      }
    } else {
      ipAddr = new Address4(normalizedIp);
    }

    // Validate IP address
    if (!ipAddr.isValid()) {
      return false;
    }

    // Check against appropriate CIDR list
    if (isIPv6) {
      return TRUSTED_PROXY_CIDRS_V6.some(cidr => cidr.contains(ipAddr as Address6));
    } else {
      return TRUSTED_PROXY_CIDRS_V4.some(cidr => cidr.contains(ipAddr as Address4));
    }
  } catch (error) {
    console.warn(`Error validating proxy IP ${clientIp}:`, error);
    return false;
  }
}