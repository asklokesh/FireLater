# Migration Tool User Guide
**Version:** 1.0
**Last Updated:** 2026-01-03

---

## Overview

The FireLater Migration Tool allows you to import data from other ITSM systems into FireLater. It supports multiple source systems and provides intelligent field mapping, validation, and error handling.

### Supported Source Systems

- **ServiceNow** - XML and JSON exports
- **BMC Remedy** - CSV exports
- **Jira Service Management** - JSON exports
- **Generic CSV** - Any CSV file with headers

### Supported Entity Types

- **Incidents** - Service incidents and issues
- **Requests** - Service requests and catalog items
- **Changes** - Change requests (planned)
- **Problems** - Problem records (planned)

---

## Quick Start

### Step 1: Prepare Your Data

Export data from your source system in one of the supported formats:

**ServiceNow:**
- Navigate to the table (e.g., incident, request)
- Export as XML or JSON
- Include all fields you want to migrate

**BMC Remedy:**
- Use the Export functionality
- Export as CSV with all fields
- Ensure column headers are included

**Jira:**
- Use Jira's export functionality
- Export as JSON
- Include all custom fields

**Generic CSV:**
- First row must contain column headers
- Use consistent delimiters (comma, semicolon, tab, or pipe)
- UTF-8 encoding recommended

### Step 2: Upload File

```bash
curl -X POST https://api.firelater.io/v1/migration/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@incidents_export.xml" \
  -F "tenantSlug=your-tenant" \
  -F "sourceSystem=servicenow" \
  -F "entityType=incident"
```

**Response:**
```json
{
  "job": {
    "id": "job-123",
    "status": "pending",
    "totalRecords": 150,
    "sourceSystem": "servicenow",
    "entityType": "incident"
  },
  "preview": {
    "sampleRecords": [...],
    "fieldMappings": [...],
    "unmappedFields": ["custom_field_1"],
    "recommendations": [
      "2 source fields are not mapped and will be ignored"
    ]
  }
}
```

### Step 3: Review Preview

The preview shows:
- **Sample Records** - First 10 records from your file
- **Field Mappings** - How source fields map to FireLater fields
- **Unmapped Fields** - Source fields that won't be imported
- **Recommendations** - Warnings about missing required fields

### Step 4: Execute Migration

```bash
curl -X POST https://api.firelater.io/v1/migration/job-123/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "continueOnError": true
  }'
```

**Response:**
```json
{
  "jobId": "job-123",
  "status": "completed",
  "totalRecords": 150,
  "successfulRecords": 148,
  "failedRecords": 2,
  "duration": 45000,
  "errors": [
    {
      "recordIndex": 23,
      "errorType": "validation",
      "errorMessage": "Invalid priority value: 6"
    }
  ]
}
```

---

## Field Mapping

### Automatic Mapping

The migration tool automatically maps common fields based on the source system:

**ServiceNow Incidents:**
- `number` → `ticket_number`
- `short_description` → `title`
- `description` → `description`
- `state` → `status`
- `priority` → `priority`
- `assignment_group` → `assigned_group`
- `assigned_to` → `assigned_to`
- `opened_at` → `created_at`
- `sys_created_by` → `created_by`

**BMC Remedy:**
- `Request ID` → `ticket_number`
- `Summary` → `title`
- `Notes` → `description`
- `Status` → `status`
- `Priority` → `priority`
- `Assigned Group` → `assigned_group`
- `Assigned To` → `assigned_to`

**Jira Issues:**
- `key` → `ticket_number`
- `fields.summary` → `title`
- `fields.description` → `description`
- `fields.status.name` → `status`
- `fields.priority.name` → `priority`
- `fields.assignee.emailAddress` → `assigned_to`

### Custom Mapping

You can create custom field mappings using mapping templates:

```bash
curl -X POST https://api.firelater.io/v1/migration/templates \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ServiceNow Custom Mapping",
    "sourceSystem": "servicenow",
    "entityType": "incident",
    "fieldMappings": [
      {
        "sourceField": "u_custom_field",
        "targetField": "custom_field",
        "transformation": "uppercase",
        "required": false
      }
    ]
  }'
```

### Field Transformations

Available transformations:

- **uppercase** - Convert text to uppercase
- **lowercase** - Convert text to lowercase
- **trim** - Remove leading/trailing whitespace
- **date** - Parse date strings (multiple formats supported)
- **boolean** - Convert to true/false

**Example:**
```json
{
  "sourceField": "state",
  "targetField": "status",
  "transformation": "lowercase"
}
```

---

## Status Mapping

Map source system statuses to FireLater statuses:

```json
{
  "statusMappings": [
    { "sourceStatus": "1", "targetStatus": "new" },
    { "sourceStatus": "2", "targetStatus": "in_progress" },
    { "sourceStatus": "3", "targetStatus": "on_hold" },
    { "sourceStatus": "6", "targetStatus": "resolved" },
    { "sourceStatus": "7", "targetStatus": "closed" }
  ]
}
```

**ServiceNow State Values:**
- 1 = New
- 2 = In Progress
- 3 = On Hold
- 6 = Resolved
- 7 = Closed
- 8 = Canceled

**FireLater Statuses:**
- new
- in_progress
- on_hold
- resolved
- closed
- canceled

---

## Priority Mapping

Map source priorities to FireLater priority levels (1-5):

```json
{
  "priorityMappings": [
    { "sourcePriority": "1 - Critical", "targetPriority": 1 },
    { "sourcePriority": "2 - High", "targetPriority": 2 },
    { "sourcePriority": "3 - Moderate", "targetPriority": 3 },
    { "sourcePriority": "4 - Low", "targetPriority": 4 },
    { "sourcePriority": "5 - Planning", "targetPriority": 5 }
  ]
}
```

---

## User Mapping

Control how users are created and mapped:

### Auto-Create Users

Users found in the data will be automatically created:

```json
{
  "userMappings": [
    {
      "sourceEmail": "john.doe@oldcompany.com",
      "action": "create"
    }
  ]
}
```

### Map to Existing Users

Map source users to existing FireLater users:

```json
{
  "userMappings": [
    {
      "sourceEmail": "admin@servicenow.com",
      "targetUserId": "user-123",
      "action": "map"
    }
  ]
}
```

### Skip Users

Skip creating certain users:

```json
{
  "userMappings": [
    {
      "sourceEmail": "system@servicenow.com",
      "action": "skip"
    }
  ]
}
```

---

## Error Handling

### Continue on Error

By default, migration stops on first error. Use `continueOnError` to process all records:

```json
{
  "continueOnError": true
}
```

### Error Types

- **validation** - Data doesn't meet validation rules
- **mapping** - Field mapping failed
- **database** - Database constraint violation
- **transformation** - Field transformation failed
- **import** - General import error

### Viewing Errors

```bash
curl -X GET https://api.firelater.io/v1/migration/job-123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response includes errors:**
```json
{
  "errors": [
    {
      "recordIndex": 23,
      "recordId": "INC0012345",
      "errorType": "validation",
      "errorMessage": "Priority must be between 1 and 5",
      "fieldName": "priority",
      "timestamp": "2026-01-03T10:15:30Z"
    }
  ]
}
```

---

## Duplicate Handling

### Skip Duplicates

By default, records with existing `external_id` are skipped:

```json
{
  "skipDuplicates": true
}
```

### Update Existing

Update existing records instead of skipping:

```json
{
  "updateExisting": true
}
```

**Note:** Only works when used with `continueOnError: true`

---

## Rollback

If migration fails or produces incorrect results, you can rollback:

```bash
curl -X DELETE https://api.firelater.io/v1/migration/job-123/rollback \
  -H "Authorization: Bearer YOUR_TOKEN"
```

This will:
- Delete all imported records from this migration
- Restore system to pre-migration state
- Log rollback action for audit

**Warning:** Rollback is only available for completed migrations, not failed ones.

---

## Best Practices

### Data Preparation

1. **Clean Your Data** - Remove test records, duplicates before export
2. **Validate Dates** - Ensure dates are in standard ISO format
3. **Check References** - Verify user emails, group names exist
4. **Backup** - Always backup data before migration

### Testing

1. **Dry Run** - Test with small dataset first (10-20 records)
2. **Preview** - Always review preview before executing
3. **Check Mappings** - Verify field mappings are correct
4. **Validate Data** - Check imported data after migration

### Performance

1. **Batch Size** - Default 100 records per batch
2. **File Size Limits:**
   - Starter: 10 MB
   - Professional: 100 MB
   - Enterprise: 500 MB
3. **Processing Speed:** ~5,000 records/minute
4. **Concurrent Jobs:**
   - Professional: 1 concurrent migration
   - Enterprise: 5 concurrent migrations

### Security

1. **File Encryption** - Files encrypted at rest in storage
2. **Automatic Cleanup** - Files deleted after successful migration
3. **Access Control** - Only tenant admins can run migrations
4. **Audit Logging** - All migrations logged with user, timestamp

---

## Troubleshooting

### "No valid records found"

**Problem:** Parser couldn't extract any records from file

**Solutions:**
- Check file format matches sourceSystem
- Verify file isn't corrupted
- Ensure CSV has headers
- Check encoding (use UTF-8)

### "Missing required fields"

**Problem:** Required FireLater fields not mapped

**Solutions:**
- Add field mappings for required fields
- Use default values in mapping configuration
- Check source data has required information

### "Failed to parse file"

**Problem:** File format not recognized

**Solutions:**
- ServiceNow: Use XML or JSON export
- Verify file extension matches content
- Check for special characters in data
- Try smaller file to isolate issue

### "Database constraint violation"

**Problem:** Data violates database rules

**Solutions:**
- Check foreign key references (users, groups)
- Verify unique constraints (ticket numbers)
- Validate enum values (status, priority)
- Use proper data types

### "Migration timeout"

**Problem:** Large file taking too long

**Solutions:**
- Split file into smaller chunks
- Increase timeout (Enterprise only)
- Remove unnecessary fields from export
- Contact support for large migrations

---

## API Reference

### Upload File

```http
POST /v1/migration/upload
Content-Type: multipart/form-data

Parameters:
  - file: File (required)
  - tenantSlug: string (required)
  - sourceSystem: string (required)
  - entityType: string (required)
  - mappingTemplateId: string (optional)
  - dryRun: boolean (optional)
```

### Get Migration Job

```http
GET /v1/migration/:jobId
```

### Execute Migration

```http
POST /v1/migration/:jobId/execute
Content-Type: application/json

Body:
{
  "continueOnError": boolean,
  "batchSize": number
}
```

### List Migration Jobs

```http
GET /v1/migration?limit=50
```

### Save Mapping Template

```http
POST /v1/migration/templates
Content-Type: application/json

Body:
{
  "name": string,
  "sourceSystem": string,
  "entityType": string,
  "fieldMappings": array,
  "statusMappings": array,
  "priorityMappings": array
}
```

### List Mapping Templates

```http
GET /v1/migration/templates
```

### Rollback Migration

```http
DELETE /v1/migration/:jobId/rollback
```

---

## Examples

### Complete ServiceNow Migration

```bash
# 1. Upload and preview
curl -X POST https://api.firelater.io/v1/migration/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@servicenow_incidents.xml" \
  -F "tenantSlug=acme-corp" \
  -F "sourceSystem=servicenow" \
  -F "entityType=incident"

# Save job ID from response
JOB_ID="job-abc123"

# 2. Review preview (optional)
curl -X GET https://api.firelater.io/v1/migration/$JOB_ID \
  -H "Authorization: Bearer $TOKEN" | jq .preview

# 3. Execute migration
curl -X POST https://api.firelater.io/v1/migration/$JOB_ID/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"continueOnError": true}'

# 4. Check status
curl -X GET https://api.firelater.io/v1/migration/$JOB_ID \
  -H "Authorization: Bearer $TOKEN" | jq '{status, totalRecords, successfulRecords, failedRecords}'
```

### Custom Field Mapping

```bash
# Create custom mapping template
curl -X POST https://api.firelater.io/v1/migration/templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ACME ServiceNow Mapping",
    "sourceSystem": "servicenow",
    "entityType": "incident",
    "fieldMappings": [
      {
        "sourceField": "number",
        "targetField": "ticket_number",
        "required": true
      },
      {
        "sourceField": "short_description",
        "targetField": "title",
        "transformation": "trim",
        "required": true
      },
      {
        "sourceField": "u_environment",
        "targetField": "environment",
        "transformation": "lowercase"
      }
    ],
    "statusMappings": [
      {"sourceStatus": "1", "targetStatus": "new"},
      {"sourceStatus": "2", "targetStatus": "in_progress"},
      {"sourceStatus": "6", "targetStatus": "resolved"},
      {"sourceStatus": "7", "targetStatus": "closed"}
    ],
    "priorityMappings": [
      {"sourcePriority": "1 - Critical", "targetPriority": 1},
      {"sourcePriority": "2 - High", "targetPriority": 2},
      {"sourcePriority": "3 - Moderate", "targetPriority": 3},
      {"sourcePriority": "4 - Low", "targetPriority": 4}
    ]
  }'

# Use template in migration
TEMPLATE_ID="template-xyz789"
curl -X POST https://api.firelater.io/v1/migration/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@incidents.xml" \
  -F "tenantSlug=acme-corp" \
  -F "sourceSystem=servicenow" \
  -F "entityType=incident" \
  -F "mappingTemplateId=$TEMPLATE_ID"
```

---

## Support

For assistance with migrations:

- **Documentation:** https://docs.firelater.io/migration
- **Support Email:** support@firelater.io
- **Enterprise Support:** Available 24/7 for Enterprise customers
- **Community:** https://community.firelater.io

---

## Changelog

### Version 1.0 (2026-01-03)
- Initial release
- ServiceNow XML/JSON support
- BMC Remedy CSV support
- Jira JSON support
- Generic CSV support
- Field mapping engine
- Automatic cleanup
- Rollback support
