import { FastifyRequest } from 'fastify';
import { BadRequestError } from '../utils/errors.js';

// Add trusted proxy configuration
const TRUSTED_PROXY_CIDRS = process.env.TRUSTED_PROXY_CIDRS?.split(',') || [];
const TRUST_ALL_PROXIES = process.env.TRUST_ALL_PROXIES === 'true';

// Helper to validate IP address format
function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

// Helper to check if IP is in trusted CIDR range
function isTrustedProxy(ip: string): boolean {
  if (TRUST_ALL_PROXIES) return true;
  
  // For simplicity, we're doing exact match. In production, you'd check CIDR ranges.
  return TRUSTED_PROXY_CIDIRS.some(cidr => 
    cidr === ip || (cidr.includes('/') && ip.startsWith(cidr.split('/')[0]))
  );
}

// Helper to extract and validate client IP from x-forwarded-for
function getValidatedClientIP(request: FastifyRequest): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  
  // Only use x-forwarded-for if request came from trusted proxy
  if (forwardedFor && typeof forwardedFor === 'string' && isTrustedProxy(request.ip)) {
    const clientIP = forwardedFor.split(',')[0].trim();
    if (isValidIP(clientIP)) {
      return clientIP;
    }
  }
  
  // Fallback to direct connection IP
  const directIP = request.ip || request.socket.remoteAddress;
  if (directIP && isValidIP(directIP)) {
    return directIP;
  }
  
  return 'unknown';
}

  // Login route with stricter rate limiting
  app.post('/login', {
    config: {
      rateLimit: {
        ...loginRateLimit,
        keyGenerator: (request: FastifyRequest) => {
          return getValidatedClientIP(request);
        }
      }
    }
  }, async (request, reply) => {
    const { email, password, tenantSlug } = loginSchema.parse(request.body);
    
    // Validate tenantSlug format to prevent injection
    if (!tenantSlug || typeof tenantSlug !== 'string' || !tenantSlug.match(/^[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/)) {
      throw new BadRequestError('Invalid tenant identifier');
    }