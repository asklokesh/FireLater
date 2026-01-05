# SSO Setup Guide
**Version:** 1.0
**Last Updated:** 2026-01-03

---

## Overview

FireLater supports enterprise Single Sign-On (SSO) authentication using industry-standard protocols:

- **SAML 2.0** - Security Assertion Markup Language
- **OIDC** - OpenID Connect (OAuth 2.0)

### Supported Identity Providers

- **Azure Active Directory** (SAML & OIDC)
- **Okta** (SAML & OIDC)
- **Google Workspace** (OIDC)
- **Auth0** (SAML & OIDC)
- **Generic SAML 2.0** providers
- **Generic OIDC** providers

---

## Quick Start

### 1. Choose Your Protocol

**Use SAML 2.0 when:**
- Your IdP primarily supports SAML
- You need advanced features like Single Logout (SLO)
- Enterprise requirements mandate SAML

**Use OIDC when:**
- Your IdP supports both (OIDC is simpler)
- You want easier setup and debugging
- Modern OAuth 2.0 integration preferred

### 2. Gather Required Information

**For SAML:**
- IdP Entity ID
- SSO URL (Entry Point)
- X.509 Certificate
- Sign-on URL (optional)
- Logout URL (optional)

**For OIDC:**
- Issuer URL
- Authorization URL
- Token URL
- UserInfo URL
- Client ID
- Client Secret

### 3. Configure in FireLater

Use the SSO API or admin UI to create an SSO provider configuration.

### 4. Test Connection

Verify SSO login works before enabling for all users.

---

## Azure Active Directory Setup

### Option 1: OIDC (Recommended)

#### Step 1: Register Application in Azure AD

1. Go to **Azure Portal** → **Azure Active Directory** → **App registrations**
2. Click **New registration**
3. Enter details:
   - **Name:** FireLater ITSM
   - **Supported account types:** Accounts in this organizational directory only
   - **Redirect URI:** `https://api.firelater.io/v1/sso/callback/YOUR_TENANT_SLUG/PROVIDER_ID`
4. Click **Register**

#### Step 2: Configure Application

1. Note the **Application (client) ID**
2. Go to **Certificates & secrets**
3. Click **New client secret**
4. Set expiration and click **Add**
5. **Copy the secret value immediately** (shown only once)

#### Step 3: Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission** → **Microsoft Graph**
3. Select **Delegated permissions**
4. Add permissions:
   - `openid`
   - `profile`
   - `email`
   - `User.Read`
5. Click **Grant admin consent**

#### Step 4: Create Provider in FireLater

```bash
curl -X POST https://api.firelater.io/v1/sso/providers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Azure AD OIDC",
    "providerType": "oidc",
    "providerName": "azure_ad",
    "enabled": true,
    "isDefault": true,
    "configuration": {
      "issuer": "https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0",
      "authorizationURL": "https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/authorize",
      "tokenURL": "https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token",
      "userInfoURL": "https://graph.microsoft.com/oidc/userinfo",
      "clientID": "YOUR_CLIENT_ID",
      "clientSecret": "YOUR_CLIENT_SECRET",
      "callbackURL": "https://api.firelater.io/v1/sso/callback/YOUR_TENANT_SLUG/PROVIDER_ID",
      "scope": "openid profile email",
      "responseType": "code",
      "responseMode": "query"
    },
    "attributeMappings": {
      "email": "email",
      "firstName": "given_name",
      "lastName": "family_name",
      "displayName": "name"
    },
    "jitProvisioning": true,
    "autoCreateUsers": true,
    "defaultRole": "requester"
  }'
```

**Replace:**
- `YOUR_TENANT_ID` - Azure AD tenant ID
- `YOUR_CLIENT_ID` - Application client ID
- `YOUR_CLIENT_SECRET` - Client secret value
- `YOUR_TENANT_SLUG` - Your FireLater tenant slug
- `PROVIDER_ID` - Will be generated, update callback URL after creation

### Option 2: SAML 2.0

#### Step 1: Create Enterprise Application

1. Go to **Azure Portal** → **Azure Active Directory** → **Enterprise applications**
2. Click **New application** → **Create your own application**
3. Name: **FireLater ITSM**
4. Select **Integrate any other application you don't find in the gallery (Non-gallery)**
5. Click **Create**

#### Step 2: Configure SAML

1. Go to **Single sign-on** → Select **SAML**
2. Click **Edit** on **Basic SAML Configuration**
3. Set:
   - **Identifier (Entity ID):** `https://api.firelater.io/saml/YOUR_TENANT_SLUG`
   - **Reply URL (ACS URL):** `https://api.firelater.io/v1/sso/callback/YOUR_TENANT_SLUG/PROVIDER_ID`
   - **Sign on URL:** `https://app.firelater.io/login`
   - **Logout URL:** `https://api.firelater.io/v1/sso/logout/YOUR_TENANT_SLUG/SESSION_ID`
4. Click **Save**

#### Step 3: Configure Attributes

1. Go to **Attributes & Claims**
2. Ensure these claims exist:
   - `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` → `user.mail`
   - `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` → `user.givenname`
   - `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` → `user.surname`
   - `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` → `user.displayname`

#### Step 4: Download Certificate

1. Go to **SAML Certificates**
2. Download **Certificate (Base64)**
3. Save as `azure-ad-cert.pem`

#### Step 5: Get Federation Metadata

1. Note the **Login URL** (SAML SSO URL)
2. Note the **Azure AD Identifier** (Entity ID)
3. Note the **Logout URL**

#### Step 6: Create Provider in FireLater

```bash
curl -X POST https://api.firelater.io/v1/sso/providers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Azure AD SAML",
    "providerType": "saml",
    "providerName": "azure_ad",
    "enabled": true,
    "isDefault": true,
    "configuration": {
      "entryPoint": "https://login.microsoftonline.com/TENANT_ID/saml2",
      "issuer": "https://api.firelater.io/saml/YOUR_TENANT_SLUG",
      "callbackUrl": "https://api.firelater.io/v1/sso/callback/YOUR_TENANT_SLUG/PROVIDER_ID",
      "cert": "-----BEGIN CERTIFICATE-----\nMIIDdTCCAl2gAwIBAgI...\n-----END CERTIFICATE-----",
      "signatureAlgorithm": "sha256",
      "identifierFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      "wantAssertionsSigned": true,
      "wantAuthnResponseSigned": true,
      "logoutUrl": "https://login.microsoftonline.com/TENANT_ID/saml2"
    },
    "attributeMappings": {
      "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
      "firstName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
      "lastName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
      "displayName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
    },
    "jitProvisioning": true,
    "autoCreateUsers": true,
    "defaultRole": "requester"
  }'
```

---

## Okta Setup

### Option 1: OIDC (Recommended)

#### Step 1: Create Application in Okta

1. Go to **Okta Admin Console** → **Applications** → **Applications**
2. Click **Create App Integration**
3. Select:
   - **Sign-in method:** OIDC - OpenID Connect
   - **Application type:** Web Application
4. Click **Next**

#### Step 2: Configure Application

1. **App integration name:** FireLater ITSM
2. **Grant types:**
   - ✅ Authorization Code
   - ✅ Refresh Token (optional)
3. **Sign-in redirect URIs:**
   - `https://api.firelater.io/v1/sso/callback/YOUR_TENANT_SLUG/PROVIDER_ID`
4. **Assignments:** Choose who can access
5. Click **Save**

#### Step 3: Get Configuration

1. Note the **Client ID**
2. Note the **Client secret**
3. Go to **Okta domain** settings and note your domain (e.g., `dev-12345.okta.com`)

#### Step 4: Create Provider in FireLater

```bash
curl -X POST https://api.firelater.io/v1/sso/providers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Okta OIDC",
    "providerType": "oidc",
    "providerName": "okta",
    "enabled": true,
    "isDefault": true,
    "configuration": {
      "issuer": "https://YOUR_OKTA_DOMAIN/oauth2/default",
      "authorizationURL": "https://YOUR_OKTA_DOMAIN/oauth2/default/v1/authorize",
      "tokenURL": "https://YOUR_OKTA_DOMAIN/oauth2/default/v1/token",
      "userInfoURL": "https://YOUR_OKTA_DOMAIN/oauth2/default/v1/userinfo",
      "clientID": "YOUR_CLIENT_ID",
      "clientSecret": "YOUR_CLIENT_SECRET",
      "callbackURL": "https://api.firelater.io/v1/sso/callback/YOUR_TENANT_SLUG/PROVIDER_ID",
      "scope": "openid profile email",
      "responseType": "code"
    },
    "attributeMappings": {
      "email": "email",
      "firstName": "given_name",
      "lastName": "family_name",
      "displayName": "name"
    },
    "jitProvisioning": true,
    "autoCreateUsers": true,
    "defaultRole": "requester"
  }'
```

### Option 2: SAML 2.0

#### Step 1: Create SAML Application

1. Go to **Applications** → **Create App Integration**
2. Select **SAML 2.0** → **Next**
3. **App name:** FireLater ITSM
4. Click **Next**

#### Step 2: Configure SAML Settings

1. **Single sign on URL:** `https://api.firelater.io/v1/sso/callback/YOUR_TENANT_SLUG/PROVIDER_ID`
2. **Audience URI (SP Entity ID):** `https://api.firelater.io/saml/YOUR_TENANT_SLUG`
3. **Name ID format:** EmailAddress
4. **Application username:** Email
5. **Attribute Statements:**
   - `email` → `user.email`
   - `firstName` → `user.firstName`
   - `lastName` → `user.lastName`
   - `displayName` → `user.displayName`
6. Click **Next** → **Finish**

#### Step 3: Get Metadata

1. Go to **Sign On** tab
2. Click **View Setup Instructions**
3. Copy:
   - Identity Provider Single Sign-On URL
   - Identity Provider Issuer
   - X.509 Certificate

#### Step 4: Create Provider in FireLater

```bash
curl -X POST https://api.firelater.io/v1/sso/providers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Okta SAML",
    "providerType": "saml",
    "providerName": "okta",
    "enabled": true,
    "configuration": {
      "entryPoint": "https://YOUR_OKTA_DOMAIN/app/YOUR_APP_ID/sso/saml",
      "issuer": "https://api.firelater.io/saml/YOUR_TENANT_SLUG",
      "callbackUrl": "https://api.firelater.io/v1/sso/callback/YOUR_TENANT_SLUG/PROVIDER_ID",
      "cert": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
      "identifierFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
    },
    "attributeMappings": {
      "email": "email",
      "firstName": "firstName",
      "lastName": "lastName",
      "displayName": "displayName"
    },
    "jitProvisioning": true,
    "autoCreateUsers": true
  }'
```

---

## Google Workspace Setup (OIDC)

### Step 1: Create OAuth 2.0 Client

1. Go to **Google Cloud Console** → **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. **Application type:** Web application
4. **Name:** FireLater ITSM
5. **Authorized redirect URIs:**
   - `https://api.firelater.io/v1/sso/callback/YOUR_TENANT_SLUG/PROVIDER_ID`
6. Click **Create**

### Step 2: Get Credentials

1. Copy the **Client ID**
2. Copy the **Client secret**

### Step 3: Create Provider in FireLater

```bash
curl -X POST https://api.firelater.io/v1/sso/providers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Google Workspace",
    "providerType": "oidc",
    "providerName": "google",
    "enabled": true,
    "configuration": {
      "issuer": "https://accounts.google.com",
      "authorizationURL": "https://accounts.google.com/o/oauth2/v2/auth",
      "tokenURL": "https://oauth2.googleapis.com/token",
      "userInfoURL": "https://openidconnect.googleapis.com/v1/userinfo",
      "clientID": "YOUR_CLIENT_ID.apps.googleusercontent.com",
      "clientSecret": "YOUR_CLIENT_SECRET",
      "callbackURL": "https://api.firelater.io/v1/sso/callback/YOUR_TENANT_SLUG/PROVIDER_ID",
      "scope": "openid email profile",
      "responseType": "code"
    },
    "attributeMappings": {
      "email": "email",
      "firstName": "given_name",
      "lastName": "family_name",
      "displayName": "name"
    },
    "jitProvisioning": true,
    "autoCreateUsers": true,
    "defaultRole": "requester",
    "requireVerifiedEmail": true
  }'
```

---

## Configuration Options

### Just-In-Time (JIT) Provisioning

Automatically create and update users on first SSO login:

```json
{
  "jitProvisioning": true,        // Update existing users from IdP
  "autoCreateUsers": true,        // Create new users automatically
  "defaultRole": "requester",     // Role for new users
  "requireVerifiedEmail": false   // Require verified email from IdP
}
```

### Attribute Mappings

Map IdP attributes to FireLater user fields:

```json
{
  "attributeMappings": {
    "email": "email",                    // Required
    "firstName": "given_name",
    "lastName": "family_name",
    "displayName": "name",
    "phoneNumber": "phone",
    "department": "department",
    "jobTitle": "title",
    "groups": "groups",                  // Array of group names
    "roles": "roles"                     // Array of role names
  }
}
```

### Multi-Provider Setup

Support multiple SSO providers per tenant:

```json
// Provider 1: Azure AD for employees
{
  "name": "Azure AD - Employees",
  "isDefault": true,
  "enabled": true
}

// Provider 2: Okta for contractors
{
  "name": "Okta - Contractors",
  "isDefault": false,
  "enabled": true
}
```

Users can choose provider at login or use default provider.

---

## Testing SSO

### Test Login Flow

1. **Get Provider ID** from creation response
2. **Navigate to:**
   ```
   https://api.firelater.io/v1/sso/login/YOUR_TENANT_SLUG/PROVIDER_ID
   ```
3. **Complete IdP authentication**
4. **Verify redirect** to FireLater with session

### Test API

```bash
# Initiate SSO login
curl -X GET "https://api.firelater.io/v1/sso/login/acme-corp/provider-123?relayState=/dashboard" \
  --location

# Should redirect to IdP login page
```

### Common Issues

**"SSO Provider not found"**
- Check provider is enabled
- Verify provider ID is correct
- Ensure tenant slug matches

**"Email attribute not found"**
- Verify attribute mappings are correct
- Check IdP sends email claim
- Review IdP attribute configuration

**"User not found and auto-create is disabled"**
- Enable `autoCreateUsers: true`
- Or manually create user first
- Or use JIT provisioning

---

## Security Best Practices

### Certificate Management

1. **Rotate certificates** before expiration
2. **Use strong algorithms** (RSA 2048+, SHA-256)
3. **Secure private keys** in key management system
4. **Monitor expiration** dates

### Access Control

1. **Require MFA** at IdP level
2. **Limit access** to authorized domains
3. **Review users** regularly
4. **Disable inactive** providers

### Monitoring

1. **Log all SSO events**
2. **Alert on failures**
3. **Track session durations**
4. **Monitor for anomalies**

### Compliance

1. **GDPR:** JIT provisioning respects data minimization
2. **SOC 2:** All SSO events audited
3. **HIPAA:** Encryption in transit and at rest
4. **ISO 27001:** Security controls documented

---

## API Reference

### Create SSO Provider

```http
POST /v1/sso/providers
Content-Type: application/json

{
  "name": string,
  "providerType": "saml" | "oidc",
  "providerName": "azure_ad" | "okta" | "google" | "auth0" | "generic",
  "enabled": boolean,
  "isDefault": boolean,
  "configuration": object,
  "attributeMappings": object,
  "jitProvisioning": boolean,
  "autoCreateUsers": boolean,
  "defaultRole": string,
  "requireVerifiedEmail": boolean
}
```

### List SSO Providers

```http
GET /v1/sso/providers
```

### Update SSO Provider

```http
PATCH /v1/sso/providers/:id
```

### Delete SSO Provider

```http
DELETE /v1/sso/providers/:id
```

### SSO Login

```http
GET /v1/sso/login/:tenantSlug/:providerId?relayState=<redirect_url>
```

### SSO Logout

```http
GET /v1/sso/logout/:tenantSlug/:sessionId
```

### Get SAML Metadata

```http
GET /v1/sso/metadata/:tenantSlug/:providerId
```

---

## Troubleshooting

### SAML Issues

**Assertion validation failed**
- Check certificate is correct
- Verify clock synchronization
- Ensure audience matches entity ID
- Check signature algorithm

**Signature verification failed**
- Certificate might be wrong
- Check certificate format (Base64, PEM)
- Verify not using encrypted assertion

**NameID not found**
- Check NameID format configuration
- Verify IdP sends NameID
- Try different identifier format

### OIDC Issues

**Token exchange failed**
- Verify client ID and secret
- Check redirect URI matches exactly
- Ensure token URL is correct

**UserInfo endpoint failed**
- Verify access token is valid
- Check userInfo URL is correct
- Ensure required scopes granted

**Invalid scope**
- Check IdP supports requested scopes
- Verify scope configuration
- Try minimal scopes (openid email profile)

---

## Advanced Configuration

### Custom Claims Mapping

Map nested or custom claims:

```json
{
  "attributeMappings": {
    "email": "email",
    "firstName": "custom_claims.given_name",
    "department": "extension_attributes.department_code",
    "groups": "groups"
  }
}
```

### Group-Based Role Assignment

Automatically assign roles based on IdP groups:

```json
{
  "roleMappings": [
    {"idpGroup": "IT Admins", "firelaterRole": "admin"},
    {"idpGroup": "Support Team", "firelaterRole": "agent"},
    {"idpGroup": "All Employees", "firelaterRole": "requester"}
  ]
}
```

### Session Configuration

Control SSO session behavior:

```json
{
  "sessionDuration": 86400,      // 24 hours in seconds
  "slidingExpiration": true,     // Extend on activity
  "maxSessionDuration": 604800   // 7 days max
}
```

---

## Support

For SSO setup assistance:

- **Documentation:** https://docs.firelater.io/sso
- **Support Email:** support@firelater.io
- **Enterprise Support:** 24/7 for Enterprise customers
- **Setup Assistance:** Available for Professional+ plans

---

## Changelog

### Version 1.0 (2026-01-03)
- Initial SSO support
- SAML 2.0 protocol
- OIDC protocol
- Azure AD integration
- Okta integration
- Google Workspace integration
- JIT provisioning
- Multi-provider support
