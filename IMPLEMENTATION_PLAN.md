# FireLater - Critical Features Implementation Plan
**Date:** 2026-01-03
**Status:** Active Implementation
**Priority:** High - Market Differentiation Features

## Executive Summary

Based on YC validation feedback and competitive analysis, implementing automated migration tools and enterprise SSO integration are critical for:
1. **Customer Acquisition**: Migration tools reduce switching friction from ServiceNow/BMC
2. **Enterprise Readiness**: SSO/SAML required for mid-market and enterprise deals
3. **Competitive Parity**: All major ITSM tools offer these features

---

## Phase 1: Automated Migration Tool (Priority 1)

### Business Justification
- **Problem**: Manual migration is the #1 barrier to switching from existing ITSM tools
- **Solution**: Automated import tool for ServiceNow, BMC Remedy, Jira Service Management
- **Impact**: Reduces migration time from weeks to days, removes need for manual services

### Technical Design

#### 1.1 Migration Service Architecture
```typescript
/backend/src/services/migration/
├── index.ts              # Main migration service
├── parsers/
│   ├── servicenow.ts     # ServiceNow XML/JSON parser
│   ├── bmc-remedy.ts     # BMC Remedy CSV/API parser
│   ├── jira.ts           # Jira JSON/CSV parser
│   └── generic-csv.ts    # Generic CSV importer
├── mappers/
│   ├── field-mapper.ts   # Field mapping engine
│   ├── user-mapper.ts    # User/group mapping
│   └── status-mapper.ts  # Status/workflow mapping
├── validators/
│   ├── schema-validator.ts
│   └── data-validator.ts
└── importers/
    ├── incident-importer.ts
    ├── request-importer.ts
    ├── change-importer.ts
    ├── user-importer.ts
    └── application-importer.ts
```

#### 1.2 Migration API Endpoints
```
POST   /v1/migration/upload           # Upload migration file
GET    /v1/migration/jobs/:id         # Get migration status
POST   /v1/migration/jobs/:id/preview # Preview mapping
POST   /v1/migration/jobs/:id/execute # Execute migration
GET    /v1/migration/jobs/:id/report  # Get migration report
POST   /v1/migration/mappings         # Save custom field mappings
GET    /v1/migration/templates        # Get mapping templates
```

#### 1.3 Supported Migration Formats

**ServiceNow:**
- XML export (incident, request, change tables)
- REST API direct import
- Field mapping: priority, state, assignment_group, etc.

**BMC Remedy:**
- CSV export from Remedy tables
- AR System XML export
- Field mapping: Status, Priority, Assigned To, etc.

**Jira Service Management:**
- JSON export via REST API
- CSV export from Jira queries
- Custom field mapping

**Generic CSV:**
- Template-based CSV import
- User-defined field mapping
- Validation rules

#### 1.4 Migration Features
- **Dry Run Mode**: Preview imports without committing
- **Incremental Import**: Resume failed migrations
- **Conflict Resolution**: Handle duplicate records
- **Audit Trail**: Complete log of all imports
- **Rollback**: Undo migrations if needed
- **User Mapping**: Map external users to FireLater users
- **Attachment Import**: Import linked files/documents
- **History Preservation**: Import audit logs and comments

#### 1.5 Database Schema
```sql
-- Migration jobs tracking
CREATE TABLE public.migration_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id),
    source_system VARCHAR(50) NOT NULL,  -- 'servicenow', 'bmc', 'jira'
    file_path TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    total_records INT DEFAULT 0,
    processed_records INT DEFAULT 0,
    failed_records INT DEFAULT 0,
    mapping_config JSONB,
    error_log JSONB,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Migration field mappings (reusable templates)
CREATE TABLE public.migration_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    source_system VARCHAR(50) NOT NULL,
    target_entity VARCHAR(50) NOT NULL,  -- 'incident', 'request', 'change'
    field_mappings JSONB NOT NULL,
    is_template BOOLEAN DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Phase 2: SSO/SAML Integration (Priority 2)

### Business Justification
- **Problem**: Enterprise customers require SSO for security and compliance
- **Solution**: SAML 2.0, OIDC support for major identity providers
- **Impact**: Unlocks mid-market and enterprise segments

### Technical Design

#### 2.1 SSO Service Architecture
```typescript
/backend/src/services/sso/
├── index.ts              # Main SSO service
├── providers/
│   ├── saml.ts           # SAML 2.0 implementation
│   ├── oidc.ts           # OpenID Connect implementation
│   ├── azure-ad.ts       # Azure AD/Entra ID
│   ├── okta.ts           # Okta integration
│   └── google.ts         # Google Workspace
├── metadata/
│   └── saml-metadata.ts  # SAML metadata generator
└── validators/
    └── assertion-validator.ts
```

#### 2.2 SSO API Endpoints
```
GET    /v1/auth/sso/providers         # List configured SSO providers
POST   /v1/auth/sso/configure         # Configure SSO provider (admin)
GET    /v1/auth/sso/:provider/login   # Initiate SSO login
POST   /v1/auth/sso/:provider/callback # SSO callback handler
GET    /v1/auth/sso/:provider/metadata # SAML metadata endpoint
POST   /v1/auth/sso/:provider/logout  # SSO logout
GET    /v1/auth/sso/test              # Test SSO configuration
```

#### 2.3 Supported Identity Providers

**SAML 2.0:**
- Azure AD / Entra ID
- Okta
- OneLogin
- Google Workspace
- Auth0
- Generic SAML 2.0

**OpenID Connect (OIDC):**
- Azure AD / Entra ID
- Okta
- Google
- Auth0
- Keycloak

#### 2.4 SSO Features
- **Just-In-Time (JIT) Provisioning**: Auto-create users on first login
- **Attribute Mapping**: Map SAML attributes to user fields
- **Group Sync**: Sync user groups from IdP
- **Multi-Provider**: Support multiple SSO providers per tenant
- **Fallback Authentication**: Local auth when SSO unavailable
- **Session Management**: Single logout support
- **Admin Override**: Admins can use local auth even with SSO enabled

#### 2.5 Database Schema
```sql
-- SSO provider configurations (tenant-specific)
CREATE TABLE tenant_template.sso_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(50) NOT NULL,  -- 'saml', 'oidc'
    provider_name VARCHAR(50) NOT NULL,  -- 'azure_ad', 'okta', 'google'
    enabled BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    configuration JSONB NOT NULL,  -- Provider-specific config
    attribute_mappings JSONB,      -- Field mapping config
    jit_provisioning BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sso_providers_enabled ON tenant_template.sso_providers(enabled);
```

---

## Phase 3: Azure AD / Entra ID Integration (Priority 3)

### Business Justification
- **Problem**: Microsoft-centric enterprises need native Azure AD integration
- **Solution**: Deep Azure AD integration beyond basic SAML/OIDC
- **Impact**: Access to Microsoft-heavy enterprise customers

### Technical Design

#### 3.1 Azure AD Features
- **Native MSAL Integration**: Use Microsoft Authentication Library
- **Conditional Access Support**: Honor Azure AD conditional access policies
- **Microsoft Graph Integration**: Sync user photos, org structure
- **Azure AD Groups**: Map Azure AD security groups to roles
- **Multi-Factor Authentication (MFA)**: Support Azure MFA
- **Device Compliance**: Check device compliance status

#### 3.2 Azure-Specific Endpoints
```
POST   /v1/integrations/azure-ad/configure   # Configure Azure AD tenant
GET    /v1/integrations/azure-ad/users/sync  # Sync users from Azure AD
GET    /v1/integrations/azure-ad/groups/sync # Sync groups from Azure AD
POST   /v1/integrations/azure-ad/test        # Test connection
```

#### 3.3 Database Schema
```sql
-- Azure AD specific integration
CREATE TABLE tenant_template.azure_ad_integration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id_azure VARCHAR(255) NOT NULL,  -- Azure AD tenant ID
    client_id VARCHAR(255) NOT NULL,
    client_secret_encrypted TEXT NOT NULL,
    directory_id VARCHAR(255),
    sync_enabled BOOLEAN DEFAULT true,
    sync_frequency VARCHAR(20) DEFAULT 'daily',  -- hourly, daily, weekly
    last_sync_at TIMESTAMPTZ,
    group_sync_enabled BOOLEAN DEFAULT false,
    user_sync_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Implementation Timeline

### Sprint 1 (Week 1-2): Migration Tool Foundation
- [ ] Design migration service architecture
- [ ] Implement generic CSV parser
- [ ] Build field mapping engine
- [ ] Create migration job management
- [ ] Add migration UI (upload, preview, execute)

### Sprint 2 (Week 3-4): ServiceNow Migration
- [ ] ServiceNow XML parser
- [ ] ServiceNow REST API client
- [ ] Field mapping templates
- [ ] Incident import
- [ ] Request import
- [ ] Change import

### Sprint 3 (Week 5-6): Additional ITSM Tools
- [ ] BMC Remedy CSV parser
- [ ] Jira JSON parser
- [ ] User/group mapping
- [ ] Attachment import
- [ ] History preservation

### Sprint 4 (Week 7-8): SSO Foundation
- [ ] SAML 2.0 implementation
- [ ] OIDC implementation
- [ ] Provider configuration UI
- [ ] JIT provisioning
- [ ] Attribute mapping

### Sprint 5 (Week 9-10): Enterprise SSO Providers
- [ ] Azure AD/Entra ID integration
- [ ] Okta integration
- [ ] Google Workspace integration
- [ ] Multi-provider support
- [ ] Admin override

### Sprint 6 (Week 11-12): Testing & Documentation
- [ ] End-to-end migration testing
- [ ] SSO flow testing
- [ ] Migration documentation
- [ ] SSO setup guides
- [ ] Admin training materials

---

## Success Metrics

### Migration Tool
- **Time to Migrate**: < 4 hours for 10,000 records
- **Success Rate**: > 95% records imported successfully
- **User Satisfaction**: NPS > 8 for migration experience
- **Business Impact**: 50% reduction in migration services cost

### SSO Integration
- **Enterprise Adoption**: 80% of Enterprise tier using SSO
- **Login Success Rate**: > 99.5% SSO login success
- **Setup Time**: < 30 minutes to configure SSO
- **Business Impact**: 30% increase in Enterprise deal closure

---

## Risk Mitigation

### Migration Tool Risks
1. **Data Quality**: Implement robust validation and preview
2. **Performance**: Use background jobs for large imports
3. **Data Loss**: Implement transaction rollback and audit logs
4. **Compatibility**: Test with real-world exports from each platform

### SSO Risks
1. **Security**: Follow OWASP SAML/OIDC security guidelines
2. **Provider Changes**: Use standard protocols, not proprietary APIs
3. **Fallback**: Always maintain local auth as backup
4. **Testing**: Test with all major IdP providers

---

## Dependencies

### Migration Tool
- **Libraries**:
  - `csv-parse` - CSV parsing
  - `xml2js` - XML parsing
  - `papaparse` - Advanced CSV handling
- **Infrastructure**:
  - S3 for file storage
  - Background job queue for processing

### SSO Integration
- **Libraries**:
  - `passport-saml` - SAML 2.0
  - `openid-client` - OIDC
  - `@azure/msal-node` - Azure AD
- **Infrastructure**:
  - HTTPS endpoint for callbacks
  - SSL certificates

---

## Testing Strategy

### Migration Tool Testing
1. **Unit Tests**: Parser, mapper, validator functions
2. **Integration Tests**: End-to-end import flows
3. **Load Tests**: 100,000+ record imports
4. **Compatibility Tests**: Real exports from ServiceNow, BMC, Jira

### SSO Testing
1. **Unit Tests**: SAML/OIDC assertion validation
2. **Integration Tests**: Full SSO login flows
3. **Provider Tests**: Test with Okta, Azure AD, Google
4. **Security Tests**: Test against SAML vulnerabilities

---

## Documentation Deliverables

### User Documentation
1. **Migration Guide**: Step-by-step migration instructions
2. **SSO Setup Guides**: Provider-specific setup guides
3. **Field Mapping Reference**: Mapping templates and examples
4. **Troubleshooting Guide**: Common issues and solutions

### Developer Documentation
1. **Migration API Reference**: Complete API documentation
2. **SSO Integration Guide**: For custom IdP setup
3. **Architecture Diagrams**: System architecture and flows
4. **Code Examples**: Sample imports and SSO configurations

---

## Next Steps

1. **Immediate**: Start Sprint 1 - Migration Tool Foundation
2. **Day 1-3**: Implement generic CSV parser and field mapper
3. **Day 4-7**: Build migration job management and UI
4. **Week 2**: Begin ServiceNow-specific implementation
5. **Parallel Track**: Research SAML libraries and Azure AD requirements

---

*This implementation plan addresses the critical gaps identified in the YC validation process and positions FireLater as a complete ITSM solution with enterprise-grade migration and authentication capabilities.*
