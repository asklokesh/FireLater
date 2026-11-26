import { z } from 'zod';

/**
 * POST /v1/sso/callback/:tenantSlug/:providerId (SAML HTTP-POST binding).
 * SAMLResponse is a base64 XML document signed by the IdP; it is only bounded here and
 * verified by node-saml in the handler.
 */
export const samlCallbackBodySchema = z.object({
  SAMLResponse: z.string().min(1).max(2_000_000),
  RelayState: z.string().max(4096).optional(),
}).passthrough();

export type SamlCallbackInput = z.infer<typeof samlCallbackBodySchema>;
