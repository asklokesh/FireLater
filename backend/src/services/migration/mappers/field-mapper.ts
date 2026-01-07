/**
 * Field Mapping Engine
 * Transforms source system fields to FireLater schema
 */

import type {
  FieldMapping,
  FieldMappingConfig,
  ParsedRecord,
  MigrationError,
  EntityType,
} from '../types.js';
// Note: logger will be used when detailed field mapping diagnostics are implemented

export interface TransformResult {
  success: boolean;
  value: any;
  error?: string;
}

export interface MappedRecord {
  targetData: Record<string, any>;
  errors: MigrationError[];
  warnings: string[];
}

export class FieldMapper {
  /**
   * Apply field mappings to a parsed record
   */
  mapRecord(
    record: ParsedRecord,
    config: FieldMappingConfig,
    recordIndex: number
  ): MappedRecord {
    const targetData: Record<string, any> = {};
    const errors: MigrationError[] = [];
    const warnings: string[] = [];

    for (const mapping of config.fieldMappings) {
      try {
        const sourceValue = this.getSourceValue(record.data, mapping.sourceField);

        // Handle missing required fields
        if (mapping.required && (sourceValue === undefined || sourceValue === null || sourceValue === '')) {
          if (mapping.defaultValue !== undefined) {
            targetData[mapping.targetField] = mapping.defaultValue;
            warnings.push(`Using default value for required field: ${mapping.targetField}`);
          } else {
            errors.push({
              recordIndex,
              recordId: record.sourceId,
              errorType: 'validation',
              errorMessage: `Missing required field: ${mapping.sourceField}`,
              fieldName: mapping.targetField,
              timestamp: new Date(),
            });
            continue;
          }
        }

        // Skip if not required and no value
        if (!mapping.required && (sourceValue === undefined || sourceValue === null || sourceValue === '')) {
          if (mapping.defaultValue !== undefined) {
            targetData[mapping.targetField] = mapping.defaultValue;
          }
          continue;
        }

        // Apply transformation
        const transformResult = this.transform(sourceValue, mapping);

        if (transformResult.success) {
          targetData[mapping.targetField] = transformResult.value;
        } else {
          errors.push({
            recordIndex,
            recordId: record.sourceId,
            errorType: 'transformation',
            errorMessage: transformResult.error || 'Transformation failed',
            fieldName: mapping.targetField,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        errors.push({
          recordIndex,
          recordId: record.sourceId,
          errorType: 'mapping',
          errorMessage: error instanceof Error ? error.message : 'Unknown mapping error',
          fieldName: mapping.targetField,
          timestamp: new Date(),
        });
      }
    }

    return { targetData, errors, warnings };
  }

  /**
   * Get source value from nested object paths
   * Supports dot notation: "fields.assignee.email"
   */
  private getSourceValue(data: Record<string, any>, path: string): any {
    const keys = path.split('.');
    let value = data;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  /**
   * Apply transformation to a value
   */
  private transform(value: any, mapping: FieldMapping): TransformResult {
    try {
      // Apply custom transformation if provided
      if (mapping.customTransform) {
        const transformed = mapping.customTransform(value);
        return { success: true, value: transformed };
      }

      // Apply built-in transformations
      switch (mapping.transformation) {
        case 'uppercase':
          return { success: true, value: String(value).toUpperCase() };

        case 'lowercase':
          return { success: true, value: String(value).toLowerCase() };

        case 'trim':
          return { success: true, value: String(value).trim() };

        case 'date':
          return this.transformDate(value);

        case 'boolean':
          return this.transformBoolean(value);

        default:
          // No transformation
          return { success: true, value };
      }
    } catch (error) {
      return {
        success: false,
        value: null,
        error: error instanceof Error ? error.message : 'Transformation failed',
      };
    }
  }

  /**
   * Transform value to date
   */
  private transformDate(value: any): TransformResult {
    if (!value) {
      return { success: true, value: null };
    }

    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return { success: false, value: null, error: 'Invalid date format' };
      }
      return { success: true, value: date.toISOString() };
    } catch (_error) {
      return { success: false, value: null, error: 'Date parsing failed' };
    }
  }

  /**
   * Transform value to boolean
   */
  private transformBoolean(value: any): TransformResult {
    if (value === null || value === undefined) {
      return { success: true, value: null };
    }

    const stringValue = String(value).toLowerCase().trim();

    const trueValues = ['true', '1', 'yes', 'y', 'active', 'enabled'];
    const falseValues = ['false', '0', 'no', 'n', 'inactive', 'disabled'];

    if (trueValues.includes(stringValue)) {
      return { success: true, value: true };
    }

    if (falseValues.includes(stringValue)) {
      return { success: true, value: false };
    }

    return { success: false, value: null, error: `Cannot convert '${value}' to boolean` };
  }

  /**
   * Validate mapped data against target schema
   */
  validateMappedData(
    data: Record<string, any>,
    entityType: EntityType
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Define required fields for each entity type
    const requiredFields = this.getRequiredFields(entityType);

    for (const field of requiredFields) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate data types
    if (entityType === 'incident' || entityType === 'request') {
      if (data.priority && (typeof data.priority !== 'number' || data.priority < 1 || data.priority > 4)) {
        errors.push('Priority must be a number between 1 and 4');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get required fields for entity type
   */
  private getRequiredFields(entityType: EntityType): string[] {
    const fieldMap: Record<EntityType, string[]> = {
      incident: ['title', 'priority', 'status'],
      request: ['title', 'priority', 'status'],
      change: ['title', 'risk_level', 'status'],
      user: ['email', 'name'],
      group: ['name'],
      application: ['name'],
      problem: ['title', 'priority', 'status'],
    };

    return fieldMap[entityType] || [];
  }

  /**
   * Get default field mappings for source system and entity type
   */
  getDefaultMappings(sourceSystem: string, entityType: EntityType): FieldMapping[] {
    const key = `${sourceSystem}_${entityType}`;

    const mappings: Record<string, FieldMapping[]> = {
      // ServiceNow Incident mappings
      servicenow_incident: [
        { sourceField: 'number', targetField: 'external_id', required: true },
        { sourceField: 'short_description', targetField: 'title', required: true, transformation: 'trim' },
        { sourceField: 'description', targetField: 'description', required: false },
        { sourceField: 'priority', targetField: 'priority', required: true },
        { sourceField: 'state', targetField: 'status', required: true },
        { sourceField: 'assigned_to', targetField: 'assigned_to_email', required: false },
        { sourceField: 'assignment_group', targetField: 'assigned_group', required: false },
        { sourceField: 'opened_at', targetField: 'created_at', required: false, transformation: 'date' },
        { sourceField: 'closed_at', targetField: 'closed_at', required: false, transformation: 'date' },
        { sourceField: 'impact', targetField: 'impact', required: false },
        { sourceField: 'urgency', targetField: 'urgency', required: false },
      ],

      // ServiceNow Request mappings
      servicenow_request: [
        { sourceField: 'number', targetField: 'external_id', required: true },
        { sourceField: 'short_description', targetField: 'title', required: true, transformation: 'trim' },
        { sourceField: 'description', targetField: 'description', required: false },
        { sourceField: 'priority', targetField: 'priority', required: true },
        { sourceField: 'state', targetField: 'status', required: true },
        { sourceField: 'requested_for', targetField: 'requested_for_email', required: false },
        { sourceField: 'assigned_to', targetField: 'assigned_to_email', required: false },
        { sourceField: 'opened_at', targetField: 'created_at', required: false, transformation: 'date' },
      ],

      // BMC Remedy Incident mappings
      bmc_remedy_incident: [
        { sourceField: 'Incident Number', targetField: 'external_id', required: true },
        { sourceField: 'Description', targetField: 'title', required: true, transformation: 'trim' },
        { sourceField: 'Detailed Description', targetField: 'description', required: false },
        { sourceField: 'Priority', targetField: 'priority', required: true },
        { sourceField: 'Status', targetField: 'status', required: true },
        { sourceField: 'Assigned To', targetField: 'assigned_to_email', required: false },
        { sourceField: 'Assigned Group', targetField: 'assigned_group', required: false },
        { sourceField: 'Submit Date', targetField: 'created_at', required: false, transformation: 'date' },
        { sourceField: 'Impact', targetField: 'impact', required: false },
        { sourceField: 'Urgency', targetField: 'urgency', required: false },
      ],

      // Jira Issue mappings
      jira_incident: [
        { sourceField: 'key', targetField: 'external_id', required: true },
        { sourceField: 'fields.summary', targetField: 'title', required: true, transformation: 'trim' },
        { sourceField: 'fields.description', targetField: 'description', required: false },
        { sourceField: 'fields.priority.id', targetField: 'priority', required: true },
        { sourceField: 'fields.status.name', targetField: 'status', required: true },
        { sourceField: 'fields.assignee.emailAddress', targetField: 'assigned_to_email', required: false },
        { sourceField: 'fields.reporter.emailAddress', targetField: 'reporter_email', required: false },
        { sourceField: 'fields.created', targetField: 'created_at', required: false, transformation: 'date' },
        { sourceField: 'fields.updated', targetField: 'updated_at', required: false, transformation: 'date' },
      ],

      // Generic CSV mappings (minimal)
      generic_csv_incident: [
        { sourceField: 'id', targetField: 'external_id', required: true },
        { sourceField: 'title', targetField: 'title', required: true, transformation: 'trim' },
        { sourceField: 'description', targetField: 'description', required: false },
        { sourceField: 'priority', targetField: 'priority', required: true },
        { sourceField: 'status', targetField: 'status', required: true },
      ],
    };

    return mappings[key] || [];
  }

  /**
   * Suggest field mappings based on column names
   * @param _entityType - Reserved for entity-specific mappings in future versions
   */
  suggestMappings(headers: string[], _entityType: EntityType): FieldMapping[] {
    const suggestions: FieldMapping[] = [];

    // Common field name variations
    const fieldPatterns: Record<string, string[]> = {
      title: ['title', 'summary', 'subject', 'short_description', 'description', 'brief'],
      description: ['description', 'details', 'long_description', 'notes', 'detailed_description'],
      priority: ['priority', 'pri', 'severity'],
      status: ['status', 'state', 'stage'],
      assigned_to_email: ['assigned_to', 'assignee', 'assigned', 'owner', 'responsible'],
      created_at: ['created', 'created_at', 'opened', 'opened_at', 'submit_date', 'created_date'],
      updated_at: ['updated', 'updated_at', 'modified', 'modified_at', 'last_modified'],
    };

    for (const header of headers) {
      const lowerHeader = header.toLowerCase().trim();

      for (const [targetField, patterns] of Object.entries(fieldPatterns)) {
        if (patterns.some(pattern => lowerHeader.includes(pattern))) {
          suggestions.push({
            sourceField: header,
            targetField,
            required: ['title', 'priority', 'status'].includes(targetField),
          });
          break;
        }
      }
    }

    return suggestions;
  }
}

export const fieldMapper = new FieldMapper();
