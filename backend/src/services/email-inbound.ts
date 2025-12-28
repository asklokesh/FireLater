import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';

// ============================================
// EMAIL-TO-TICKET SERVICE
// ============================================
// Handles inbound emails and creates tickets automatically

export interface InboundEmail {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  receivedAt?: string;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content?: string; // base64 encoded
}

export interface EmailConfig {
  id: string;
  tenant_id: string;
  name: string;
  email_address: string;
  provider: 'sendgrid' | 'mailgun' | 'postmark' | 'smtp';
  is_active: boolean;
  default_priority: 'low' | 'medium' | 'high' | 'critical';
  default_application_id?: string;
  default_assigned_group?: string;
  auto_reply_enabled: boolean;
  auto_reply_template?: string;
  spam_filter_enabled: boolean;
  allowed_domains?: string[];
  blocked_domains?: string[];
  created_at: string;
  updated_at: string;
}

export interface ParsedEmail {
  issueNumber?: string;
  isReply: boolean;
  subject: string;
  body: string;
  senderEmail: string;
  senderName?: string;
}

// Extract issue number from subject (e.g., "Re: [INC-00123] Server Down")
function extractIssueNumber(subject: string): string | undefined {
  const patterns = [
    /\[([A-Z]+-\d+)\]/i,      // [INC-00123]
    /\(([A-Z]+-\d+)\)/i,      // (INC-00123)
    /#([A-Z]+-\d+)/i,         // #INC-00123
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }
  return undefined;
}

// Clean email subject (remove Re:, Fwd:, etc.)
function cleanSubject(subject: string): string {
  return subject
    .replace(/^(Re:|Fwd:|Fw:)\s*/gi, '')
    .replace(/\[[A-Z]+-\d+\]/gi, '')
    .replace(/\([A-Z]+-\d+\)/gi, '')
    .replace(/#[A-Z]+-\d+/gi, '')
    .trim();
}

// Parse email body to extract relevant content
function parseEmailBody(textBody?: string, htmlBody?: string): string {
  let body = textBody || '';

  // If no text body, try to extract from HTML
  if (!body && htmlBody) {
    // Simple HTML to text conversion
    body = htmlBody
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim();
  }

  // Remove quoted replies (lines starting with >)
  const lines = body.split('\n');
  const cleanedLines: string[] = [];
  let inQuotedSection = false;

  for (const line of lines) {
    // Check for common reply markers
    if (
      line.match(/^>/) ||
      line.match(/^On .* wrote:$/i) ||
      line.match(/^-{3,}\s*Original Message\s*-{3,}/i) ||
      line.match(/^_{3,}$/i) ||
      line.match(/^From:\s/i) && cleanedLines.length > 0
    ) {
      inQuotedSection = true;
    }

    if (!inQuotedSection) {
      cleanedLines.push(line);
    }
  }

  return cleanedLines.join('\n').trim();
}

// Parse email address to extract name and email
function parseEmailAddress(from: string): { email: string; name?: string } {
  // Format: "John Doe <john@example.com>" or just "john@example.com"
  const match = from.match(/^(?:"?([^"<]+)"?\s*)?<?([^>]+@[^>]+)>?$/);
  if (match) {
    return {
      name: match[1]?.trim(),
      email: match[2].toLowerCase().trim(),
    };
  }
  return { email: from.toLowerCase().trim() };
}

// ============================================
// EMAIL CONFIGURATION MANAGEMENT
// ============================================

async function getEmailConfig(tenantSlug: string, emailAddress: string): Promise<EmailConfig | null> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const result = await pool.query(
    `SELECT * FROM ${schema}.email_configs WHERE email_address = $1 AND is_active = true`,
    [emailAddress.toLowerCase()]
  );

  return result.rows[0] || null;
}

async function getEmailConfigById(tenantSlug: string, configId: string): Promise<EmailConfig | null> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const result = await pool.query(
    `SELECT * FROM ${schema}.email_configs WHERE id = $1`,
    [configId]
  );

  return result.rows[0] || null;
}

async function listEmailConfigs(tenantSlug: string): Promise<EmailConfig[]> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const result = await pool.query(
    `SELECT * FROM ${schema}.email_configs ORDER BY created_at DESC`
  );

  return result.rows;
}

async function createEmailConfig(
  tenantSlug: string,
  data: {
    name: string;
    emailAddress: string;
    provider: 'sendgrid' | 'mailgun' | 'postmark' | 'smtp';
    defaultPriority?: 'low' | 'medium' | 'high' | 'critical';
    defaultApplicationId?: string;
    defaultAssignedGroup?: string;
    autoReplyEnabled?: boolean;
    autoReplyTemplate?: string;
    spamFilterEnabled?: boolean;
    allowedDomains?: string[];
    blockedDomains?: string[];
  }
): Promise<EmailConfig> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const result = await pool.query(
    `INSERT INTO ${schema}.email_configs (
      name, email_address, provider, is_active,
      default_priority, default_application_id, default_assigned_group,
      auto_reply_enabled, auto_reply_template,
      spam_filter_enabled, allowed_domains, blocked_domains
    ) VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      data.name,
      data.emailAddress.toLowerCase(),
      data.provider,
      data.defaultPriority || 'medium',
      data.defaultApplicationId || null,
      data.defaultAssignedGroup || null,
      data.autoReplyEnabled ?? false,
      data.autoReplyTemplate || null,
      data.spamFilterEnabled ?? true,
      data.allowedDomains ? JSON.stringify(data.allowedDomains) : null,
      data.blockedDomains ? JSON.stringify(data.blockedDomains) : null,
    ]
  );

  return result.rows[0];
}

async function updateEmailConfig(
  tenantSlug: string,
  configId: string,
  data: {
    name?: string;
    isActive?: boolean;
    defaultPriority?: 'low' | 'medium' | 'high' | 'critical';
    defaultApplicationId?: string | null;
    defaultAssignedGroup?: string | null;
    autoReplyEnabled?: boolean;
    autoReplyTemplate?: string | null;
    spamFilterEnabled?: boolean;
    allowedDomains?: string[];
    blockedDomains?: string[];
  }
): Promise<EmailConfig | null> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.isActive !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    values.push(data.isActive);
  }
  if (data.defaultPriority !== undefined) {
    updates.push(`default_priority = $${paramIndex++}`);
    values.push(data.defaultPriority);
  }
  if (data.defaultApplicationId !== undefined) {
    updates.push(`default_application_id = $${paramIndex++}`);
    values.push(data.defaultApplicationId);
  }
  if (data.defaultAssignedGroup !== undefined) {
    updates.push(`default_assigned_group = $${paramIndex++}`);
    values.push(data.defaultAssignedGroup);
  }
  if (data.autoReplyEnabled !== undefined) {
    updates.push(`auto_reply_enabled = $${paramIndex++}`);
    values.push(data.autoReplyEnabled);
  }
  if (data.autoReplyTemplate !== undefined) {
    updates.push(`auto_reply_template = $${paramIndex++}`);
    values.push(data.autoReplyTemplate);
  }
  if (data.spamFilterEnabled !== undefined) {
    updates.push(`spam_filter_enabled = $${paramIndex++}`);
    values.push(data.spamFilterEnabled);
  }
  if (data.allowedDomains !== undefined) {
    updates.push(`allowed_domains = $${paramIndex++}`);
    values.push(JSON.stringify(data.allowedDomains));
  }
  if (data.blockedDomains !== undefined) {
    updates.push(`blocked_domains = $${paramIndex++}`);
    values.push(JSON.stringify(data.blockedDomains));
  }

  if (updates.length === 0) {
    return getEmailConfigById(tenantSlug, configId);
  }

  updates.push(`updated_at = NOW()`);
  values.push(configId);

  const result = await pool.query(
    `UPDATE ${schema}.email_configs SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0] || null;
}

async function deleteEmailConfig(tenantSlug: string, configId: string): Promise<boolean> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const result = await pool.query(
    `DELETE FROM ${schema}.email_configs WHERE id = $1`,
    [configId]
  );

  return (result.rowCount ?? 0) > 0;
}

// ============================================
// INBOUND EMAIL PROCESSING
// ============================================

async function findOrCreateUserByEmail(
  tenantSlug: string,
  email: string,
  _name?: string
): Promise<string | null> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  // First, try to find existing user
  const existingUser = await pool.query(
    `SELECT id FROM ${schema}.users WHERE LOWER(email) = $1`,
    [email.toLowerCase()]
  );

  if (existingUser.rows[0]) {
    return existingUser.rows[0].id;
  }

  // For now, return null if user doesn't exist
  // In a full implementation, you might want to create a portal user automatically
  return null;
}

async function findIssueByNumber(tenantSlug: string, issueNumber: string): Promise<{ id: string } | null> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const result = await pool.query(
    `SELECT id FROM ${schema}.issues WHERE issue_number = $1`,
    [issueNumber]
  );

  return result.rows[0] || null;
}

async function addCommentToIssue(
  tenantSlug: string,
  issueId: string,
  content: string,
  userId?: string,
  isInternal: boolean = false
): Promise<void> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  await pool.query(
    `INSERT INTO ${schema}.issue_comments (issue_id, user_id, content, is_internal, source)
     VALUES ($1, $2, $3, $4, 'email')`,
    [issueId, userId || null, content, isInternal]
  );
}

async function getNextIssueNumber(tenantSlug: string): Promise<string> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const result = await pool.query(
    `UPDATE ${schema}.id_sequences
     SET current_value = current_value + 1
     WHERE entity_type = 'ISSUE'
     RETURNING prefix, current_value`
  );

  const row = result.rows[0];
  return `${row.prefix}-${String(row.current_value).padStart(5, '0')}`;
}

async function createIssueFromEmail(
  tenantSlug: string,
  email: ParsedEmail,
  config: EmailConfig
): Promise<{ id: string; issueNumber: string }> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  // Find reporter
  const reporterId = await findOrCreateUserByEmail(tenantSlug, email.senderEmail, email.senderName);

  // Get next issue number
  const issueNumber = await getNextIssueNumber(tenantSlug);

  const result = await pool.query(
    `INSERT INTO ${schema}.issues (
      issue_number, title, description, priority,
      status, reporter_id, application_id, assigned_group,
      source, source_ref
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'email', $9)
    RETURNING id, issue_number`,
    [
      issueNumber,
      email.subject || 'No Subject',
      email.body || '',
      config.default_priority || 'medium',
      'new',
      reporterId,
      config.default_application_id || null,
      config.default_assigned_group || null,
      email.senderEmail,
    ]
  );

  return result.rows[0];
}

async function logInboundEmail(
  tenantSlug: string,
  email: InboundEmail,
  configId: string,
  result: {
    success: boolean;
    action: 'created_issue' | 'added_comment' | 'rejected' | 'error';
    issueId?: string;
    issueNumber?: string;
    errorMessage?: string;
  }
): Promise<void> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  await pool.query(
    `INSERT INTO ${schema}.email_logs (
      email_config_id, from_email, from_name, to_email,
      subject, message_id, in_reply_to,
      action, issue_id, success, error_message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      configId,
      email.from,
      email.fromName || null,
      email.to,
      email.subject,
      email.messageId || null,
      email.inReplyTo || null,
      result.action,
      result.issueId || null,
      result.success,
      result.errorMessage || null,
    ]
  );
}

// Check if email should be filtered as spam
function shouldFilterEmail(email: InboundEmail, config: EmailConfig): { filter: boolean; reason?: string } {
  if (!config.spam_filter_enabled) {
    return { filter: false };
  }

  const { email: senderEmail } = parseEmailAddress(email.from);
  const senderDomain = senderEmail.split('@')[1];

  // Check blocked domains
  if (config.blocked_domains) {
    const blockedDomains = typeof config.blocked_domains === 'string'
      ? JSON.parse(config.blocked_domains)
      : config.blocked_domains;

    if (blockedDomains.includes(senderDomain)) {
      return { filter: true, reason: 'Sender domain is blocked' };
    }
  }

  // Check allowed domains (if configured, only allow these)
  if (config.allowed_domains) {
    const allowedDomains = typeof config.allowed_domains === 'string'
      ? JSON.parse(config.allowed_domains)
      : config.allowed_domains;

    if (allowedDomains.length > 0 && !allowedDomains.includes(senderDomain)) {
      return { filter: true, reason: 'Sender domain not in allowed list' };
    }
  }

  // Check for common spam indicators
  const spamIndicators = [
    /unsubscribe/i,
    /click here/i,
    /buy now/i,
    /limited time/i,
    /act now/i,
    /free gift/i,
    /winner/i,
    /lottery/i,
  ];

  const subject = email.subject || '';
  const body = email.textBody || '';

  for (const pattern of spamIndicators) {
    if (pattern.test(subject) && pattern.test(body)) {
      return { filter: true, reason: 'Spam content detected' };
    }
  }

  return { filter: false };
}

// Main function to process inbound email
async function processInboundEmail(
  tenantSlug: string,
  email: InboundEmail,
  toAddress: string
): Promise<{
  success: boolean;
  action: 'created_issue' | 'added_comment' | 'rejected' | 'error';
  issueId?: string;
  issueNumber?: string;
  message: string;
}> {
  try {
    // Get email configuration
    const config = await getEmailConfig(tenantSlug, toAddress);
    if (!config) {
      return {
        success: false,
        action: 'rejected',
        message: 'No active email configuration found for this address',
      };
    }

    // Check spam filter
    const spamCheck = shouldFilterEmail(email, config);
    if (spamCheck.filter) {
      await logInboundEmail(tenantSlug, email, config.id, {
        success: false,
        action: 'rejected',
        errorMessage: spamCheck.reason,
      });
      return {
        success: false,
        action: 'rejected',
        message: spamCheck.reason || 'Email filtered as spam',
      };
    }

    // Parse the email
    const { email: senderEmail, name: senderName } = parseEmailAddress(email.from);
    const issueNumber = extractIssueNumber(email.subject || '');
    const cleanedSubject = cleanSubject(email.subject || '');
    const cleanedBody = parseEmailBody(email.textBody, email.htmlBody);

    const parsedEmail: ParsedEmail = {
      issueNumber,
      isReply: !!issueNumber || !!email.inReplyTo,
      subject: cleanedSubject || 'No Subject',
      body: cleanedBody,
      senderEmail,
      senderName,
    };

    // If this is a reply to an existing issue
    if (parsedEmail.issueNumber) {
      const issue = await findIssueByNumber(tenantSlug, parsedEmail.issueNumber);
      if (issue) {
        const userId = await findOrCreateUserByEmail(tenantSlug, senderEmail, senderName);
        const commentContent = senderName
          ? `**From:** ${senderName} <${senderEmail}>\n\n${parsedEmail.body}`
          : `**From:** ${senderEmail}\n\n${parsedEmail.body}`;

        await addCommentToIssue(tenantSlug, issue.id, commentContent, userId || undefined);

        await logInboundEmail(tenantSlug, email, config.id, {
          success: true,
          action: 'added_comment',
          issueId: issue.id,
          issueNumber: parsedEmail.issueNumber,
        });

        logger.info({ tenantSlug, issueNumber: parsedEmail.issueNumber }, 'Added email reply as comment');

        return {
          success: true,
          action: 'added_comment',
          issueId: issue.id,
          issueNumber: parsedEmail.issueNumber,
          message: `Comment added to issue ${parsedEmail.issueNumber}`,
        };
      }
    }

    // Create new issue
    const newIssue = await createIssueFromEmail(tenantSlug, parsedEmail, config);

    await logInboundEmail(tenantSlug, email, config.id, {
      success: true,
      action: 'created_issue',
      issueId: newIssue.id,
      issueNumber: newIssue.issueNumber,
    });

    logger.info({ tenantSlug, issueNumber: newIssue.issueNumber }, 'Created issue from email');

    return {
      success: true,
      action: 'created_issue',
      issueId: newIssue.id,
      issueNumber: newIssue.issueNumber,
      message: `Created new issue ${newIssue.issueNumber}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, tenantSlug }, 'Failed to process inbound email');
    return {
      success: false,
      action: 'error',
      message,
    };
  }
}

// Get email logs
async function getEmailLogs(
  tenantSlug: string,
  params?: {
    configId?: string;
    action?: string;
    success?: boolean;
    page?: number;
    limit?: number;
  }
): Promise<{ logs: unknown[]; total: number }> {
  const schema = `tenant_${tenantSlug.replace(/-/g, '_')}`;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params?.configId) {
    conditions.push(`el.email_config_id = $${paramIndex++}`);
    values.push(params.configId);
  }
  if (params?.action) {
    conditions.push(`el.action = $${paramIndex++}`);
    values.push(params.action);
  }
  if (params?.success !== undefined) {
    conditions.push(`el.success = $${paramIndex++}`);
    values.push(params.success);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = params?.page || 1;
  const limit = params?.limit || 50;
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM ${schema}.email_logs el ${whereClause}`,
    values
  );

  const logsResult = await pool.query(
    `SELECT el.*, ec.name as config_name, i.issue_number
     FROM ${schema}.email_logs el
     LEFT JOIN ${schema}.email_configs ec ON el.email_config_id = ec.id
     LEFT JOIN ${schema}.issues i ON el.issue_id = i.id
     ${whereClause}
     ORDER BY el.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset]
  );

  return {
    logs: logsResult.rows,
    total: parseInt(countResult.rows[0].count),
  };
}

export const emailInboundService = {
  // Config management
  getEmailConfig,
  getEmailConfigById,
  listEmailConfigs,
  createEmailConfig,
  updateEmailConfig,
  deleteEmailConfig,

  // Email processing
  processInboundEmail,
  parseEmailAddress,
  extractIssueNumber,
  cleanSubject,
  parseEmailBody,

  // Logs
  getEmailLogs,
};
