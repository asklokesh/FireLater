import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';

/**
 * Content Sanitization Utility
 *
 * Provides comprehensive XSS protection for user-generated content.
 * Handles HTML, Markdown, and plain text sanitization.
 */

// Configure sanitize-html for strict security
const SANITIZE_HTML_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: [
    // Text formatting
    'p', 'br', 'span', 'strong', 'em', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
    // Links (sanitized separately)
    'a',
    // Code
    'code', 'pre', 'kbd', 'samp', 'var',
    // Quotes
    'blockquote', 'q', 'cite',
    // Other semantic HTML
    'abbr', 'address', 'time', 'details', 'summary',
    // Divs (for layout)
    'div',
    // Images (src will be sanitized)
    'img',
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
    'time': ['datetime'],
    'blockquote': ['cite'],
    'q': ['cite'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan'],
    'ol': ['start', 'reversed', 'type'],
    '*': ['class', 'id'], // Allow class/id on all tags
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: {
    'img': ['http', 'https', 'data'],
  },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: true,
};

/**
 * Sanitize HTML content
 * Removes dangerous tags, attributes, and JavaScript
 */
export function sanitizeHTML(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, SANITIZE_HTML_CONFIG);
}

/**
 * Sanitize Markdown content
 * Parses Markdown to HTML, then sanitizes the result
 */
export function sanitizeMarkdown(markdown: string): string {
  if (!markdown) return '';

  // Configure marked for security
  marked.setOptions({
    mangle: false, // Don't mangle email addresses (we'll sanitize hrefs anyway)
    breaks: true, // GFM line breaks
  });

  // Convert Markdown to HTML
  const html = marked.parse(markdown) as string;

  // Sanitize the resulting HTML
  return sanitizeHTML(html);
}

/**
 * Sanitize plain text for safe HTML display
 * Escapes HTML entities and converts newlines to <br>
 */
export function sanitizePlainText(text: string, convertNewlines = true): string {
  if (!text) return '';

  // Escape HTML entities
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  // Optionally convert newlines to <br> tags
  if (convertNewlines) {
    escaped = escaped.replace(/\n/g, '<br>');
  }

  return escaped;
}

/**
 * Sanitize URL for safe href/src attributes
 * Prevents javascript:, data:, and other dangerous protocols
 */
export function sanitizeURL(url: string): string | null {
  if (!url) return null;

  const trimmed = url.trim().toLowerCase();

  // Block dangerous protocols
  const dangerousProtocols = [
    'javascript:',
    'data:',
    'vbscript:',
    'file:',
    'about:',
  ];

  for (const protocol of dangerousProtocols) {
    if (trimmed.startsWith(protocol)) {
      return null; // Return null for dangerous URLs
    }
  }

  // Allow only safe protocols
  const safeProtocols = /^(https?|mailto|tel|ftp):/i;
  if (trimmed.match(/^[a-z]+:/i) && !safeProtocols.test(trimmed)) {
    return null;
  }

  // URL looks safe
  return url;
}

/**
 * Content type enum
 */
export enum ContentType {
  HTML = 'html',
  MARKDOWN = 'markdown',
  PLAINTEXT = 'plaintext',
}

/**
 * Sanitize content based on type
 * Main entry point for all content sanitization
 */
export function sanitizeContent(content: string, type: ContentType = ContentType.PLAINTEXT): string {
  if (!content) return '';

  switch (type) {
    case ContentType.HTML:
      return sanitizeHTML(content);
    case ContentType.MARKDOWN:
      return sanitizeMarkdown(content);
    case ContentType.PLAINTEXT:
    default:
      return sanitizePlainText(content);
  }
}

/**
 * Sanitize object fields recursively
 * Useful for sanitizing entire database records
 */
export function sanitizeFields(
  obj: Record<string, unknown>,
  fieldConfig: Record<string, ContentType>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...obj };

  for (const [field, contentType] of Object.entries(fieldConfig)) {
    if (field in obj && typeof obj[field] === 'string') {
      sanitized[field] = sanitizeContent(obj[field] as string, contentType);
    }
  }

  return sanitized;
}

/**
 * Strip all HTML tags (for search indexing, previews, etc.)
 */
export function stripHTML(html: string): string {
  if (!html) return '';
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
}

/**
 * Truncate sanitized content to a specific length
 * Useful for previews, summaries, etc.
 */
export function truncateSanitized(content: string, maxLength: number, type: ContentType = ContentType.PLAINTEXT): string {
  const sanitized = sanitizeContent(content, type);
  const stripped = stripHTML(sanitized);

  if (stripped.length <= maxLength) {
    return stripped;
  }

  return stripped.substring(0, maxLength).trim() + '...';
}
