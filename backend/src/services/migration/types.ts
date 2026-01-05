/**
 * Migration Service Types
 * Defines types for the automated ITSM migration tool
 */

export type SourceSystem = 'servicenow' | 'bmc_remedy' | 'jira' | 'generic_csv';

export type MigrationStatus = 'pending' | 'processing' | 'preview' | 'completed' | 'failed' | 'cancelled';

export type EntityType = 'incident' | 'request' | 'change' | 'user' | 'group' | 'application' | 'problem';

export interface MigrationJob {
  id: string;
  tenantId: string;
  sourceSystem: SourceSystem;
  filePath?: string;
  status: MigrationStatus;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  mappingConfig: FieldMappingConfig;
  errorLog: MigrationError[];
  createdBy: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface FieldMappingConfig {
  entityType: EntityType;
  sourceSystem: SourceSystem;
  fieldMappings: FieldMapping[];
  userMappings?: UserMapping[];
  statusMappings?: StatusMapping[];
  priorityMappings?: PriorityMapping[];
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transformation?: 'uppercase' | 'lowercase' | 'trim' | 'date' | 'boolean' | 'custom';
  customTransform?: (value: any) => any;
  required: boolean;
  defaultValue?: any;
}

export interface UserMapping {
  sourceEmail: string;
  sourceUsername?: string;
  targetUserId?: string;
  action: 'map' | 'create' | 'skip';
}

export interface StatusMapping {
  sourceStatus: string;
  targetStatus: string;
}

export interface PriorityMapping {
  sourcePriority: string | number;
  targetPriority: number;
}

export interface MigrationError {
  recordIndex: number;
  recordId?: string;
  errorType: 'validation' | 'mapping' | 'database' | 'transformation' | 'import';
  errorMessage: string;
  fieldName?: string;
  timestamp: Date;
}

export interface ParsedRecord {
  sourceId: string;
  entityType: EntityType;
  data: Record<string, any>;
  metadata?: {
    createdAt?: Date;
    updatedAt?: Date;
    createdBy?: string;
    updatedBy?: string;
  };
}

export interface MigrationResult {
  success: boolean;
  recordsProcessed: number;
  recordsSucceeded: number;
  recordsFailed: number;
  errors: MigrationError[];
  warnings: string[];
  targetIds?: string[];
}

export interface MigrationPreview {
  jobId: string;
  totalRecords: number;
  sampleRecords: ParsedRecord[];
  fieldMappings: FieldMapping[];
  unmappedFields: string[];
  missingRequiredFields: string[];
  recommendations: string[];
}

// ServiceNow specific types
export interface ServiceNowRecord {
  sys_id: string;
  number: string;
  short_description?: string;
  description?: string;
  state?: string;
  priority?: string;
  assignment_group?: string;
  assigned_to?: string;
  opened_at?: string;
  closed_at?: string;
  [key: string]: any;
}

// BMC Remedy specific types
export interface BMCRemedyRecord {
  'Request ID': string;
  'Status': string;
  'Priority': string;
  'Assigned To': string;
  'Assigned Group': string;
  'Summary': string;
  'Notes': string;
  'Create Date': string;
  [key: string]: any;
}

// Jira specific types
export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string;
    status: { name: string };
    priority: { name: string; id: string };
    assignee?: { emailAddress: string; displayName: string };
    reporter: { emailAddress: string; displayName: string };
    created: string;
    updated: string;
    [key: string]: any;
  };
}

// Migration mapping templates
export interface MappingTemplate {
  id: string;
  name: string;
  sourceSystem: SourceSystem;
  targetEntity: EntityType;
  fieldMappings: FieldMapping[];
  isTemplate: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface MigrationUploadRequest {
  tenantSlug: string;
  sourceSystem: SourceSystem;
  entityType: EntityType;
  file: Buffer;
  filename: string;
  mappingTemplateId?: string;
  dryRun?: boolean;
}

export interface MigrationExecuteRequest {
  jobId: string;
  mappingConfig?: FieldMappingConfig;
  continueOnError?: boolean;
  batchSize?: number;
}

export interface MigrationReport {
  jobId: string;
  status: MigrationStatus;
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  skippedRecords: number;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  errors: MigrationError[];
  warnings: string[];
  summary: {
    usersCreated: number;
    usersSkipped: number;
    incidentsImported: number;
    requestsImported: number;
    changesImported: number;
  };
}

export interface ImportResult {
  totalRecords: number;
  successfulRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  failedRecords: number;
  errors: MigrationError[];
}
