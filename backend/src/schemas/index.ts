/**
 * Centralized Zod schema registry.
 * Import domain schemas from here rather than redefining validation inline in routes.
 */
export * as commonSchemas from './common.js';
export * as applicationSchemas from './applications.js';
export * as assetSchemas from './assets.js';
export * as attachmentSchemas from './attachments.js';
