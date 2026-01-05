# Integration Setup Guide
**Version:** 1.0
**Last Updated:** 2026-01-03

---

## Overview

FireLater supports integrations with popular collaboration and incident management platforms. This guide covers setup and configuration for all supported integrations.

### Supported Integrations

- **Slack** - Team collaboration and notifications
- **Microsoft Teams** - Enterprise collaboration and notifications
- **PagerDuty** - Incident management and on-call scheduling
- **Email** - SendGrid for transactional emails
- **Webhooks** - Custom webhook integrations
- **API Keys** - Programmatic access

---

## Quick Start

### Prerequisites

- FireLater account with admin permissions
- Access to the third-party platform you want to integrate
- API credentials for the integration platform

### Basic Setup Flow

1. Navigate to **Settings > Integrations**
2. Select the integration type
3. Provide credentials and configuration
4. Test the connection
5. Configure notification preferences
6. Save and activate

---

## Slack Integration

### Step 1: Create Slack App

1. Go to https://api.slack.com/apps
2. Click **Create New App**
3. Choose **From scratch**
4. App Name: `FireLater`
5. Select your workspace
6. Click **Create App**

### Step 2: Configure OAuth & Permissions

1. In your app settings, go to **OAuth & Permissions**
2. Scroll to **Scopes** section
3. Add the following **Bot Token Scopes**:
   - `chat:write` - Send messages
   - `chat:write.public` - Send messages to public channels
   - `channels:read` - View basic channel info
   - `groups:read` - View basic private channel info
   - `users:read` - View people in workspace
   - `users:read.email` - View email addresses

### Step 3: Install App to Workspace

1. Scroll to **OAuth Tokens for Your Workspace**
2. Click **Install to Workspace**
3. Review permissions and click **Allow**
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### Step 4: Configure in FireLater

```bash
curl -X POST https://api.firelater.io/v1/integrations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Slack Production",
    "type": "slack",
    "description": "Main Slack workspace",
    "credentials": {
      "botToken": "xoxb-your-bot-token",
      "signingSecret": "your-signing-secret"
    },
    "config": {
      "defaultChannel": "#incidents",
      "mentionOnCritical": true,
      "threadReplies": true
    }
  }'
```

### Step 5: Configure Notification Channels

Map FireLater entities to Slack channels:

```bash
curl -X POST https://api.firelater.io/v1/integrations/{id}/channels \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mappings": [
      {
        "entityType": "incident",
        "priority": "critical",
        "channel": "#incidents-critical"
      },
      {
        "entityType": "incident",
        "priority": "high",
        "channel": "#incidents"
      },
      {
        "entityType": "change",
        "channel": "#changes"
      }
    ]
  }'
```

### Notification Message Format

Incidents posted to Slack include:
- Incident number and title
- Priority level with color coding
- Assigned user and group
- Quick action buttons (Acknowledge, Resolve, View)
- Threaded updates for comments

**Example:**
```
🔴 CRITICAL: INC-12345 - Database Connection Timeout

Priority: Critical
Assigned: @john.doe
Group: Database Team
Status: New

Created: 2026-01-03 10:30 AM

[Acknowledge] [Assign to Me] [View Details]
```

### Slack Commands (Optional)

Create slash commands for quick actions:

1. In Slack App settings, go to **Slash Commands**
2. Click **Create New Command**
3. Command: `/firelater`
4. Request URL: `https://api.firelater.io/v1/integrations/slack/commands`
5. Short Description: `FireLater incident management`
6. Usage Hint: `list | create | assign [incident]`

---

## Microsoft Teams Integration

### Step 1: Register Azure AD App

1. Go to https://portal.azure.com
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Name: `FireLater Teams Integration`
5. Supported account types: **Single tenant**
6. Redirect URI: `https://api.firelater.io/v1/integrations/teams/callback`
7. Click **Register**

### Step 2: Configure API Permissions

1. In your app, go to **API permissions**
2. Click **Add a permission** > **Microsoft Graph**
3. Select **Application permissions**
4. Add the following permissions:
   - `Channel.ReadBasic.All`
   - `ChannelMessage.Send`
   - `Team.ReadBasic.All`
   - `User.Read.All`
5. Click **Grant admin consent**

### Step 3: Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Description: `FireLater Integration`
4. Expires: **24 months** (recommended)
5. Click **Add**
6. Copy the secret **Value** immediately (won't be shown again)

### Step 4: Get Tenant and Client IDs

1. Go to **Overview** page
2. Copy **Application (client) ID**
3. Copy **Directory (tenant) ID**

### Step 5: Configure in FireLater

```bash
curl -X POST https://api.firelater.io/v1/integrations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Microsoft Teams Production",
    "type": "teams",
    "description": "Main Teams workspace",
    "credentials": {
      "tenantId": "your-tenant-id",
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret"
    },
    "config": {
      "defaultTeamId": "team-id",
      "defaultChannelId": "channel-id",
      "mentionOnCritical": true,
      "adaptiveCards": true
    }
  }'
```

### Step 6: Get Team and Channel IDs

**Option 1: Using Graph Explorer**
1. Go to https://developer.microsoft.com/graph/graph-explorer
2. Query: `GET /teams`
3. Find your team and copy its `id`
4. Query: `GET /teams/{team-id}/channels`
5. Find your channel and copy its `id`

**Option 2: From Teams URL**
- Team ID is in the URL after `groupId=`
- Channel ID is in the URL after `threadId=`

### Notification Message Format

Incidents posted to Teams use Adaptive Cards with:
- Color-coded priority indicators
- Incident details in structured format
- Action buttons for quick operations
- Avatar images for assigned users

---

## PagerDuty Integration

### Step 1: Create API Key

1. Go to https://app.pagerduty.com
2. Navigate to **Integrations** > **API Access Keys**
3. Click **Create New API Key**
4. Description: `FireLater Integration`
5. Key Type: **General Access Key (v2)**
6. Click **Create Key**
7. Copy the API key immediately

### Step 2: Get Service Integration Key

**For Event Integration (Recommended):**
1. Go to **Services** > Select your service
2. Click **Integrations** tab
3. Click **Add Integration**
4. Integration Type: **Events API V2**
5. Name: `FireLater`
6. Click **Add Integration**
7. Copy the **Integration Key**

**For REST API:**
1. Use the General Access Key from Step 1
2. Service ID is in the URL: `/services/{SERVICE_ID}`

### Step 3: Configure in FireLater

```bash
curl -X POST https://api.firelater.io/v1/integrations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PagerDuty Production",
    "type": "pagerduty",
    "description": "PagerDuty incident management",
    "credentials": {
      "apiKey": "your-api-key",
      "integrationKey": "your-integration-key"
    },
    "config": {
      "autoCreateIncidents": true,
      "syncStatus": true,
      "escalationPolicyId": "policy-id",
      "urgencyMapping": {
        "critical": "high",
        "high": "high",
        "medium": "low",
        "low": "low"
      }
    }
  }'
```

### Step 4: Configure Bi-Directional Sync

Enable two-way synchronization between FireLater and PagerDuty:

```bash
curl -X PATCH https://api.firelater.io/v1/integrations/{id} \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "syncEnabled": true,
    "syncDirection": "both",
    "syncInterval": 5,
    "fieldMappings": {
      "status": {
        "new": "triggered",
        "in_progress": "acknowledged",
        "resolved": "resolved"
      }
    }
  }'
```

### Step 5: Configure Webhooks (Optional)

Set up PagerDuty webhooks for real-time updates:

1. In PagerDuty, go to **Integrations** > **Generic Webhooks (v3)**
2. Click **New Webhook**
3. Webhook URL: `https://api.firelater.io/v1/integrations/pagerduty/webhook`
4. Scope Type: **Account**
5. Event Subscription:
   - `incident.triggered`
   - `incident.acknowledged`
   - `incident.resolved`
   - `incident.assigned`
6. Click **Add Webhook**

### Incident Mapping

FireLater incidents map to PagerDuty as follows:

| FireLater | PagerDuty |
|-----------|-----------|
| Critical | High Urgency |
| High | High Urgency |
| Medium | Low Urgency |
| Low | Low Urgency |
| New | Triggered |
| In Progress | Acknowledged |
| Resolved | Resolved |
| Closed | Resolved |

---

## Email Integration (SendGrid)

### Step 1: Create SendGrid Account

1. Go to https://sendgrid.com
2. Sign up or log in
3. Navigate to **Settings** > **API Keys**
4. Click **Create API Key**
5. API Key Name: `FireLater`
6. Permissions: **Full Access** (or Restricted with Mail Send)
7. Click **Create & View**
8. Copy the API key immediately

### Step 2: Verify Sender Domain

1. Go to **Settings** > **Sender Authentication**
2. Click **Verify a Domain**
3. Enter your domain (e.g., `firelater.io`)
4. Add DNS records provided by SendGrid
5. Wait for verification (5-10 minutes)

### Step 3: Configure in FireLater

Set environment variables:

```bash
SENDGRID_API_KEY=your-sendgrid-api-key
EMAIL_FROM=noreply@firelater.io
EMAIL_FROM_NAME=FireLater
```

Or configure via API:

```bash
curl -X POST https://api.firelater.io/v1/integrations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SendGrid Email",
    "type": "sendgrid",
    "credentials": {
      "apiKey": "your-sendgrid-api-key"
    },
    "config": {
      "fromEmail": "noreply@firelater.io",
      "fromName": "FireLater",
      "replyTo": "support@firelater.io",
      "templates": {
        "incidentCreated": "d-template-id",
        "incidentAssigned": "d-template-id",
        "incidentResolved": "d-template-id"
      }
    }
  }'
```

### Email Templates

Create dynamic templates in SendGrid:

1. Go to **Email API** > **Dynamic Templates**
2. Click **Create Dynamic Template**
3. Template Name: `Incident Created`
4. Add version and design email
5. Use handlebars variables:
   - `{{incident.number}}`
   - `{{incident.title}}`
   - `{{incident.priority}}`
   - `{{incident.url}}`
   - `{{user.name}}`

---

## Webhooks

### Creating a Webhook

```bash
curl -X POST https://api.firelater.io/v1/integrations/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Webhook",
    "description": "Notify external system",
    "url": "https://yourapp.com/firelater/webhook",
    "secret": "your-webhook-secret",
    "events": [
      "incident.created",
      "incident.updated",
      "incident.resolved",
      "change.created",
      "change.approved"
    ],
    "filters": {
      "priority": ["critical", "high"]
    },
    "retryCount": 3,
    "retryDelay": 60,
    "timeout": 30,
    "customHeaders": {
      "X-Custom-Header": "value"
    }
  }'
```

### Webhook Payload Format

All webhooks follow this structure:

```json
{
  "event": "incident.created",
  "timestamp": "2026-01-03T10:30:00Z",
  "tenantSlug": "acme-corp",
  "data": {
    "id": "inc-123",
    "number": "INC-12345",
    "title": "Database connection timeout",
    "priority": "critical",
    "status": "new",
    "assignedTo": {
      "id": "user-456",
      "name": "John Doe",
      "email": "john@acme.com"
    },
    "createdAt": "2026-01-03T10:30:00Z",
    "url": "https://app.firelater.io/incidents/INC-12345"
  }
}
```

### Webhook Security

**Verify Signature:**

All webhooks include an `X-FireLater-Signature` header:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**Retry Logic:**

- Failed webhooks are retried up to `retryCount` times
- Delay between retries: `retryDelay` seconds
- Exponential backoff: delay × (2 ^ attempt)
- HTTP status codes 500-599 trigger retries
- HTTP status codes 400-499 do not retry

### Available Events

| Event | Description |
|-------|-------------|
| `incident.created` | New incident created |
| `incident.updated` | Incident fields updated |
| `incident.assigned` | Incident assigned to user/group |
| `incident.resolved` | Incident marked as resolved |
| `incident.closed` | Incident closed |
| `incident.commented` | Comment added to incident |
| `change.created` | Change request created |
| `change.updated` | Change request updated |
| `change.approved` | Change approved |
| `change.rejected` | Change rejected |
| `problem.created` | Problem record created |
| `problem.updated` | Problem record updated |
| `asset.created` | Asset created |
| `asset.updated` | Asset updated |
| `sla.breached` | SLA target breached |
| `sla.warning` | SLA warning threshold reached |

---

## API Keys

### Creating an API Key

```bash
curl -X POST https://api.firelater.io/v1/integrations/api-keys \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CI/CD Pipeline",
    "description": "Automated deployments",
    "permissions": [
      "incidents:read",
      "incidents:write",
      "changes:read",
      "changes:write"
    ],
    "rateLimit": 1000,
    "expiresAt": "2027-01-03T00:00:00Z",
    "ipWhitelist": [
      "192.168.1.100",
      "10.0.0.0/8"
    ]
  }'
```

**Response:**
```json
{
  "data": {
    "id": "key-123",
    "name": "CI/CD Pipeline",
    "keyPrefix": "fl_live_abc",
    "createdAt": "2026-01-03T10:30:00Z"
  },
  "key": "fl_live_abc123def456...",
  "message": "Store this key securely - it will not be shown again"
}
```

### Using API Keys

Include the API key in the `Authorization` header:

```bash
curl -X GET https://api.firelater.io/v1/incidents \
  -H "Authorization: Bearer fl_live_abc123def456..."
```

### API Key Permissions

Available permission scopes:

- `incidents:read` - View incidents
- `incidents:write` - Create and update incidents
- `changes:read` - View change requests
- `changes:write` - Create and update changes
- `problems:read` - View problems
- `problems:write` - Create and update problems
- `assets:read` - View assets
- `assets:write` - Create and update assets
- `users:read` - View users
- `users:write` - Create and update users
- `reports:read` - View reports
- `admin:*` - Full admin access

---

## Testing Integrations

### Test Slack Integration

```bash
curl -X POST https://api.firelater.io/v1/integrations/{id}/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "#test-channel",
    "message": "Testing FireLater integration"
  }'
```

### Test Teams Integration

```bash
curl -X POST https://api.firelater.io/v1/integrations/{id}/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "teamId": "team-id",
    "channelId": "channel-id",
    "message": "Testing FireLater integration"
  }'
```

### Test PagerDuty Integration

```bash
curl -X POST https://api.firelater.io/v1/integrations/{id}/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "trigger",
    "summary": "Test incident from FireLater",
    "severity": "info"
  }'
```

### Test Webhook

```bash
curl -X POST https://api.firelater.io/v1/integrations/webhooks/{id}/test \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Troubleshooting

### Slack Issues

**Problem: Bot not posting messages**
- Check bot token is correct (`xoxb-...`)
- Verify bot is invited to channel
- Check scopes include `chat:write`
- Ensure channel name includes `#`

**Problem: 404 channel_not_found**
- Bot must be added to private channels
- Use channel ID instead of name for private channels
- Run `/invite @FireLater` in the channel

### Teams Issues

**Problem: 403 Forbidden**
- Verify admin consent granted for API permissions
- Check tenant ID is correct
- Ensure client secret hasn't expired

**Problem: Channel not found**
- Verify team ID and channel ID are correct
- Check app has access to the team
- Ensure channel wasn't deleted

### PagerDuty Issues

**Problem: Invalid integration key**
- Check integration key format (32 characters)
- Verify service hasn't been deleted
- Ensure Events API V2 integration exists

**Problem: Incidents not syncing**
- Check API key has correct permissions
- Verify webhook URL is accessible
- Check firewall allows PagerDuty IPs

### Webhook Issues

**Problem: Deliveries failing**
- Check endpoint URL is accessible
- Verify SSL certificate is valid
- Check for firewall blocking requests
- Ensure endpoint returns 2xx status code
- Check request timeout settings

**Problem: Signature verification failing**
- Verify secret is correct
- Check payload isn't modified before verification
- Ensure timing-safe comparison is used

---

## Best Practices

### Security

1. **Rotate credentials regularly** - Update API keys every 6 months
2. **Use HTTPS only** - Never send credentials over HTTP
3. **Verify webhooks** - Always validate signature
4. **Limit permissions** - Grant minimum required access
5. **Monitor access** - Review integration logs regularly
6. **IP whitelist** - Restrict API key access by IP when possible

### Performance

1. **Batch notifications** - Avoid sending individual messages
2. **Use async processing** - Don't block on external API calls
3. **Implement retries** - Handle transient failures gracefully
4. **Cache responses** - Cache channel lists, team info
5. **Rate limit** - Respect platform rate limits

### Reliability

1. **Circuit breakers** - Prevent cascading failures
2. **Fallback mechanisms** - Have backup notification methods
3. **Health checks** - Monitor integration status
4. **Error logging** - Log all integration errors
5. **Alerting** - Get notified when integrations fail

---

## Support

For integration support:

- **Documentation:** https://docs.firelater.io/integrations
- **Support Email:** support@firelater.io
- **Community:** https://community.firelater.io
- **Status Page:** https://status.firelater.io

---

## Changelog

### Version 1.0 (2026-01-03)
- Initial release
- Slack integration support
- Microsoft Teams integration support
- PagerDuty integration support
- Webhooks support
- API keys management
- Email integration with SendGrid
