import { URL } from 'url';
import dns from 'dns/promises';
import { BadRequestError } from './errors.js';
import { logger } from './logger.js';

// Private IP address ranges (RFC 1918, RFC 4193, and others)
const PRIVATE_IP_RANGES = [
  /^127\./,                    // Loopback
  /^10\./,                     // Private Class A
  /^172\.(1[6-9]|2\d|3[01])\./, // Private Class B
  /^192\.168\./,               // Private Class C
  /^169\.254\./,               // Link-local
  /^::1$/,                     // IPv6 loopback
  /^fe80:/,                    // IPv6 link-local
  /^fc00:/,                    // IPv6 unique local
  /^fd00:/,                    // IPv6 unique local
];

// Reserved/dangerous hostnames
const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',  // GCP metadata
  '169.254.169.254',           // AWS/Azure/GCP metadata
  '100.100.100.200',           // Alibaba Cloud metadata
  'kubernetes.default.svc',    // Kubernetes API
  'consul',
  'vault',
];

/**
 * Check if an IP address is private/internal
 */
function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((range) => range.test(ip));
}

/**
 * Check if a hostname is blocked
 */
function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return BLOCKED_HOSTNAMES.some(
    (blocked) => lower === blocked || lower.endsWith(`.${blocked}`)
  );
}

/**
 * Validate a URL for SSRF vulnerabilities
 * Throws BadRequestError if URL is unsafe
 */
export async function validateUrlForSSRF(urlString: string): Promise<void> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlString);
  } catch (_error) {
    throw new BadRequestError('Invalid URL format');
  }

  // Only allow HTTP(S) protocols
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new BadRequestError(
      `Protocol "${parsedUrl.protocol}" is not allowed. Only HTTP(S) is permitted.`
    );
  }

  const hostname = parsedUrl.hostname;

  // Check for blocked hostnames
  if (isBlockedHostname(hostname)) {
    logger.warn({ hostname, url: urlString }, 'SSRF attempt blocked: dangerous hostname');
    throw new BadRequestError(
      'This hostname is not allowed for security reasons'
    );
  }

  // Check for IP address literals in URL
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIP(hostname)) {
      logger.warn({ hostname, url: urlString }, 'SSRF attempt blocked: private IP address');
      throw new BadRequestError(
        'URLs pointing to private IP addresses are not allowed'
      );
    }
  }

  // Perform DNS resolution to check if hostname resolves to private IP
  try {
    const addresses = await dns.resolve4(hostname).catch(() => []);

    for (const address of addresses) {
      if (isPrivateIP(address)) {
        logger.warn(
          { hostname, resolvedIp: address, url: urlString },
          'SSRF attempt blocked: hostname resolves to private IP'
        );
        throw new BadRequestError(
          'This URL resolves to a private IP address and is not allowed'
        );
      }
    }
  } catch (error) {
    // DNS resolution failed - could be IPv6 only or non-existent domain
    // Try IPv6 resolution
    try {
      const addresses = await dns.resolve6(hostname).catch(() => []);

      for (const address of addresses) {
        if (isPrivateIP(address)) {
          logger.warn(
            { hostname, resolvedIp: address, url: urlString },
            'SSRF attempt blocked: hostname resolves to private IPv6'
          );
          throw new BadRequestError(
            'This URL resolves to a private IP address and is not allowed'
          );
        }
      }
    } catch (_ipv6Error) {
      // Both IPv4 and IPv6 resolution failed
      if (error instanceof BadRequestError) {
        throw error;
      }
      // Allow it to proceed - the actual request will fail if DNS is truly broken
      logger.debug({ hostname, error }, 'DNS resolution failed during SSRF check');
    }
  }

  // Additional check for URL-encoded attacks (e.g., %31%32%37.%30.%30.%31 = 127.0.0.1)
  const decodedHostname = decodeURIComponent(hostname);
  if (decodedHostname !== hostname) {
    logger.warn(
      { hostname, decodedHostname, url: urlString },
      'SSRF attempt blocked: URL-encoded hostname'
    );
    throw new BadRequestError(
      'URL-encoded hostnames are not allowed'
    );
  }
}

/**
 * Synchronous validation for basic SSRF checks (without DNS resolution)
 * Use this when you need immediate validation without async/await
 */
export function validateUrlForSSRFSync(urlString: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlString);
  } catch (_error) {
    throw new BadRequestError('Invalid URL format');
  }

  // Only allow HTTP(S) protocols
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new BadRequestError(
      `Protocol "${parsedUrl.protocol}" is not allowed. Only HTTP(S) is permitted.`
    );
  }

  const hostname = parsedUrl.hostname;

  // Check for blocked hostnames
  if (isBlockedHostname(hostname)) {
    logger.warn({ hostname, url: urlString }, 'SSRF attempt blocked: dangerous hostname');
    throw new BadRequestError(
      'This hostname is not allowed for security reasons'
    );
  }

  // Check for IP address literals in URL
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIP(hostname)) {
      logger.warn({ hostname, url: urlString }, 'SSRF attempt blocked: private IP address');
      throw new BadRequestError(
        'URLs pointing to private IP addresses are not allowed'
      );
    }
  }

  // Check for URL-encoded attacks
  const decodedHostname = decodeURIComponent(hostname);
  if (decodedHostname !== hostname) {
    logger.warn(
      { hostname, decodedHostname, url: urlString },
      'SSRF attempt blocked: URL-encoded hostname'
    );
    throw new BadRequestError(
      'URL-encoded hostnames are not allowed'
    );
  }
}
