// ============================================
// OPENAPI SCHEMA DEFINITIONS
// ============================================

// Common schemas used across multiple endpoints
export const commonSchemas = {
  Error: {
    type: 'object',
    properties: {
      statusCode: { type: 'number' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
  PaginationParams: {
    type: 'object',
    properties: {
      page: { type: 'number', default: 1, description: 'Page number (1-indexed)' },
      limit: { type: 'number', default: 20, description: 'Items per page' },
    },
  },
  PaginatedResponse: {
    type: 'object',
    properties: {
      data: { type: 'array', items: {} },
      pagination: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          limit: { type: 'number' },
          total: { type: 'number' },
          totalPages: { type: 'number' },
        },
      },
    },
  },
  UUID: {
    type: 'string',
    format: 'uuid',
    description: 'UUID v4',
  },
  Timestamp: {
    type: 'string',
    format: 'date-time',
    description: 'ISO 8601 timestamp',
  },
};

// Auth schemas
export const authSchemas = {
  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
    },
  },
  LoginResponse: {
    type: 'object',
    properties: {
      accessToken: { type: 'string' },
      refreshToken: { type: 'string' },
      expiresIn: { type: 'number' },
      user: { $ref: '#/components/schemas/User' },
    },
  },
  RegisterRequest: {
    type: 'object',
    required: ['email', 'password', 'name', 'tenantSlug'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
      name: { type: 'string' },
      tenantSlug: { type: 'string' },
    },
  },
  RefreshTokenRequest: {
    type: 'object',
    required: ['refreshToken'],
    properties: {
      refreshToken: { type: 'string' },
    },
  },
};

// User schemas
export const userSchemas = {
  User: {
    type: 'object',
    properties: {
      id: { $ref: '#/components/schemas/UUID' },
      email: { type: 'string', format: 'email' },
      name: { type: 'string' },
      avatar_url: { type: 'string', nullable: true },
      phone: { type: 'string', nullable: true },
      department: { type: 'string', nullable: true },
      job_title: { type: 'string', nullable: true },
      location: { type: 'string', nullable: true },
      timezone: { type: 'string' },
      is_active: { type: 'boolean' },
      created_at: { $ref: '#/components/schemas/Timestamp' },
      updated_at: { $ref: '#/components/schemas/Timestamp' },
    },
  },
  CreateUserRequest: {
    type: 'object',
    required: ['email', 'name'],
    properties: {
      email: { type: 'string', format: 'email' },
      name: { type: 'string' },
      password: { type: 'string', minLength: 8 },
      phone: { type: 'string' },
      department: { type: 'string' },
      job_title: { type: 'string' },
      location: { type: 'string' },
      timezone: { type: 'string' },
      roles: { type: 'array', items: { type: 'string' } },
    },
  },
  UpdateUserRequest: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      phone: { type: 'string' },
      department: { type: 'string' },
      job_title: { type: 'string' },
      location: { type: 'string' },
      timezone: { type: 'string' },
    },
  },
};

// Issue schemas
export const issueSchemas = {
  Issue: {
    type: 'object',
    properties: {
      id: { $ref: '#/components/schemas/UUID' },
      number: { type: 'string', description: 'Issue number (e.g., INC0001234)' },
      short_description: { type: 'string' },
      description: { type: 'string' },
      type: { type: 'string', enum: ['issue', 'problem', 'question'] },
      source: { type: 'string', enum: ['portal', 'email', 'phone', 'monitoring', 'api'] },
      state: { type: 'string', enum: ['new', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled'] },
      priority: { type: 'number', minimum: 1, maximum: 5 },
      urgency: { type: 'number', minimum: 1, maximum: 5 },
      impact: { type: 'number', minimum: 1, maximum: 5 },
      assigned_to: { $ref: '#/components/schemas/UUID', nullable: true },
      assignment_group: { $ref: '#/components/schemas/UUID', nullable: true },
      application_id: { $ref: '#/components/schemas/UUID', nullable: true },
      reporter_id: { $ref: '#/components/schemas/UUID' },
      created_at: { $ref: '#/components/schemas/Timestamp' },
      updated_at: { $ref: '#/components/schemas/Timestamp' },
      resolved_at: { $ref: '#/components/schemas/Timestamp', nullable: true },
      closed_at: { $ref: '#/components/schemas/Timestamp', nullable: true },
    },
  },
  CreateIssueRequest: {
    type: 'object',
    required: ['short_description'],
    properties: {
      short_description: { type: 'string', maxLength: 255 },
      description: { type: 'string' },
      type: { type: 'string', enum: ['issue', 'problem', 'question'], default: 'issue' },
      source: { type: 'string', enum: ['portal', 'email', 'phone', 'monitoring', 'api'], default: 'portal' },
      priority: { type: 'number', minimum: 1, maximum: 5, default: 3 },
      urgency: { type: 'number', minimum: 1, maximum: 5, default: 3 },
      impact: { type: 'number', minimum: 1, maximum: 5, default: 3 },
      assigned_to: { $ref: '#/components/schemas/UUID' },
      assignment_group: { $ref: '#/components/schemas/UUID' },
      application_id: { $ref: '#/components/schemas/UUID' },
    },
  },
  UpdateIssueRequest: {
    type: 'object',
    properties: {
      short_description: { type: 'string', maxLength: 255 },
      description: { type: 'string' },
      state: { type: 'string', enum: ['new', 'in_progress', 'pending', 'resolved', 'closed', 'cancelled'] },
      priority: { type: 'number', minimum: 1, maximum: 5 },
      urgency: { type: 'number', minimum: 1, maximum: 5 },
      impact: { type: 'number', minimum: 1, maximum: 5 },
      assigned_to: { $ref: '#/components/schemas/UUID' },
      assignment_group: { $ref: '#/components/schemas/UUID' },
      resolution_notes: { type: 'string' },
      resolution_code: { type: 'string' },
    },
  },
};

// Change schemas
export const changeSchemas = {
  Change: {
    type: 'object',
    properties: {
      id: { $ref: '#/components/schemas/UUID' },
      number: { type: 'string', description: 'Change number (e.g., CHG0001234)' },
      title: { type: 'string' },
      description: { type: 'string' },
      type: { type: 'string', enum: ['standard', 'normal', 'emergency'] },
      state: { type: 'string', enum: ['draft', 'submitted', 'pending_approval', 'approved', 'scheduled', 'in_progress', 'completed', 'closed', 'cancelled', 'failed'] },
      risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      priority: { type: 'number', minimum: 1, maximum: 5 },
      requested_by: { $ref: '#/components/schemas/UUID' },
      assigned_to: { $ref: '#/components/schemas/UUID', nullable: true },
      start_date: { $ref: '#/components/schemas/Timestamp' },
      end_date: { $ref: '#/components/schemas/Timestamp' },
      application_id: { $ref: '#/components/schemas/UUID', nullable: true },
      implementation_plan: { type: 'string' },
      backout_plan: { type: 'string' },
      test_plan: { type: 'string' },
      created_at: { $ref: '#/components/schemas/Timestamp' },
      updated_at: { $ref: '#/components/schemas/Timestamp' },
    },
  },
  CreateChangeRequest: {
    type: 'object',
    required: ['title', 'description', 'start_date', 'end_date'],
    properties: {
      title: { type: 'string', maxLength: 255 },
      description: { type: 'string' },
      type: { type: 'string', enum: ['standard', 'normal', 'emergency'], default: 'normal' },
      risk: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
      priority: { type: 'number', minimum: 1, maximum: 5, default: 3 },
      start_date: { type: 'string', format: 'date-time' },
      end_date: { type: 'string', format: 'date-time' },
      application_id: { $ref: '#/components/schemas/UUID' },
      implementation_plan: { type: 'string' },
      backout_plan: { type: 'string' },
      test_plan: { type: 'string' },
    },
  },
};

// Application schemas
export const applicationSchemas = {
  Application: {
    type: 'object',
    properties: {
      id: { $ref: '#/components/schemas/UUID' },
      name: { type: 'string' },
      short_name: { type: 'string' },
      description: { type: 'string' },
      criticality: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      status: { type: 'string', enum: ['active', 'inactive', 'deprecated', 'retired'] },
      owner_id: { $ref: '#/components/schemas/UUID' },
      support_group_id: { $ref: '#/components/schemas/UUID', nullable: true },
      environment: { type: 'string' },
      url: { type: 'string', format: 'uri', nullable: true },
      documentation_url: { type: 'string', format: 'uri', nullable: true },
      metadata: { type: 'object' },
      created_at: { $ref: '#/components/schemas/Timestamp' },
      updated_at: { $ref: '#/components/schemas/Timestamp' },
    },
  },
  CreateApplicationRequest: {
    type: 'object',
    required: ['name', 'short_name'],
    properties: {
      name: { type: 'string' },
      short_name: { type: 'string', maxLength: 50 },
      description: { type: 'string' },
      criticality: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
      owner_id: { $ref: '#/components/schemas/UUID' },
      support_group_id: { $ref: '#/components/schemas/UUID' },
      environment: { type: 'string' },
      url: { type: 'string', format: 'uri' },
      documentation_url: { type: 'string', format: 'uri' },
    },
  },
};

// Catalog schemas
export const catalogSchemas = {
  CatalogItem: {
    type: 'object',
    properties: {
      id: { $ref: '#/components/schemas/UUID' },
      name: { type: 'string' },
      description: { type: 'string' },
      category: { type: 'string' },
      type: { type: 'string', enum: ['service', 'hardware', 'software', 'access'] },
      price: { type: 'number', nullable: true },
      fulfillment_time: { type: 'string', description: 'Expected fulfillment time (e.g., "2 hours", "3 days")' },
      is_active: { type: 'boolean' },
      approval_required: { type: 'boolean' },
      form_schema: { type: 'object', description: 'JSON Schema for request form' },
      created_at: { $ref: '#/components/schemas/Timestamp' },
      updated_at: { $ref: '#/components/schemas/Timestamp' },
    },
  },
  ServiceRequest: {
    type: 'object',
    properties: {
      id: { $ref: '#/components/schemas/UUID' },
      number: { type: 'string', description: 'Request number (e.g., REQ0001234)' },
      catalog_item_id: { $ref: '#/components/schemas/UUID' },
      requested_by: { $ref: '#/components/schemas/UUID' },
      requested_for: { $ref: '#/components/schemas/UUID' },
      state: { type: 'string', enum: ['draft', 'submitted', 'pending_approval', 'approved', 'in_fulfillment', 'fulfilled', 'closed', 'cancelled', 'rejected'] },
      priority: { type: 'number', minimum: 1, maximum: 5 },
      form_data: { type: 'object' },
      created_at: { $ref: '#/components/schemas/Timestamp' },
      updated_at: { $ref: '#/components/schemas/Timestamp' },
    },
  },
};

// Attachment schemas
export const attachmentSchemas = {
  Attachment: {
    type: 'object',
    properties: {
      id: { $ref: '#/components/schemas/UUID' },
      entity_type: { type: 'string', enum: ['issue', 'change', 'request', 'application', 'comment'] },
      entity_id: { $ref: '#/components/schemas/UUID' },
      filename: { type: 'string' },
      original_filename: { type: 'string' },
      file_size: { type: 'number' },
      mime_type: { type: 'string' },
      uploaded_by: { $ref: '#/components/schemas/UUID' },
      uploaded_at: { $ref: '#/components/schemas/Timestamp' },
    },
  },
  UploadUrlRequest: {
    type: 'object',
    required: ['entityType', 'entityId', 'filename', 'mimeType', 'fileSize'],
    properties: {
      entityType: { type: 'string', enum: ['issue', 'change', 'request', 'application', 'comment'] },
      entityId: { $ref: '#/components/schemas/UUID' },
      filename: { type: 'string' },
      mimeType: { type: 'string' },
      fileSize: { type: 'number', maximum: 52428800, description: 'Max 50MB' },
    },
  },
  UploadUrlResponse: {
    type: 'object',
    properties: {
      uploadUrl: { type: 'string', format: 'uri' },
      storageKey: { type: 'string' },
      expiresAt: { $ref: '#/components/schemas/Timestamp' },
    },
  },
};

// Audit schemas
export const auditSchemas = {
  AuditLog: {
    type: 'object',
    properties: {
      id: { $ref: '#/components/schemas/UUID' },
      user_id: { $ref: '#/components/schemas/UUID', nullable: true },
      user_email: { type: 'string', nullable: true },
      action: { type: 'string', enum: ['create', 'update', 'delete', 'view', 'export', 'login', 'logout', 'login_failed', 'approve', 'reject', 'assign', 'escalate'] },
      entity_type: { type: 'string' },
      entity_id: { $ref: '#/components/schemas/UUID', nullable: true },
      old_values: { type: 'object', nullable: true },
      new_values: { type: 'object', nullable: true },
      changed_fields: { type: 'array', items: { type: 'string' }, nullable: true },
      ip_address: { type: 'string', nullable: true },
      user_agent: { type: 'string', nullable: true },
      created_at: { $ref: '#/components/schemas/Timestamp' },
    },
  },
};

// Group schemas
export const groupSchemas = {
  Group: {
    type: 'object',
    properties: {
      id: { $ref: '#/components/schemas/UUID' },
      name: { type: 'string' },
      description: { type: 'string' },
      type: { type: 'string', enum: ['assignment', 'approval', 'support', 'custom'] },
      manager_id: { $ref: '#/components/schemas/UUID', nullable: true },
      email: { type: 'string', format: 'email', nullable: true },
      is_active: { type: 'boolean' },
      created_at: { $ref: '#/components/schemas/Timestamp' },
      updated_at: { $ref: '#/components/schemas/Timestamp' },
    },
  },
};

// Notification schemas
export const notificationSchemas = {
  Notification: {
    type: 'object',
    properties: {
      id: { $ref: '#/components/schemas/UUID' },
      user_id: { $ref: '#/components/schemas/UUID' },
      type: { type: 'string' },
      title: { type: 'string' },
      message: { type: 'string' },
      data: { type: 'object' },
      read: { type: 'boolean' },
      created_at: { $ref: '#/components/schemas/Timestamp' },
      read_at: { $ref: '#/components/schemas/Timestamp', nullable: true },
    },
  },
};

// Combine all schemas
export const allSchemas = {
  ...commonSchemas,
  ...authSchemas,
  ...userSchemas,
  ...issueSchemas,
  ...changeSchemas,
  ...applicationSchemas,
  ...catalogSchemas,
  ...attachmentSchemas,
  ...auditSchemas,
  ...groupSchemas,
  ...notificationSchemas,
};
