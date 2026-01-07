import { describe, it, expect } from 'vitest';
import {
  commonSchemas,
  authSchemas,
  userSchemas,
  issueSchemas,
  changeSchemas,
  applicationSchemas,
  catalogSchemas,
  attachmentSchemas,
  auditSchemas,
  groupSchemas,
  notificationSchemas,
  allSchemas,
} from '../../../src/docs/schemas.js';

describe('OpenAPI Schema Definitions', () => {
  describe('Common Schemas', () => {
    it('should define Error schema', () => {
      expect(commonSchemas.Error).toBeDefined();
      expect(commonSchemas.Error.type).toBe('object');
      expect(commonSchemas.Error.properties.statusCode).toBeDefined();
      expect(commonSchemas.Error.properties.error).toBeDefined();
      expect(commonSchemas.Error.properties.message).toBeDefined();
    });

    it('should define PaginationParams schema', () => {
      expect(commonSchemas.PaginationParams).toBeDefined();
      expect(commonSchemas.PaginationParams.properties.page).toBeDefined();
      expect(commonSchemas.PaginationParams.properties.limit).toBeDefined();
    });

    it('should define PaginatedResponse schema', () => {
      expect(commonSchemas.PaginatedResponse).toBeDefined();
      expect(commonSchemas.PaginatedResponse.properties.data).toBeDefined();
      expect(commonSchemas.PaginatedResponse.properties.pagination).toBeDefined();
    });

    it('should define UUID schema', () => {
      expect(commonSchemas.UUID).toBeDefined();
      expect(commonSchemas.UUID.type).toBe('string');
      expect(commonSchemas.UUID.format).toBe('uuid');
    });

    it('should define Timestamp schema', () => {
      expect(commonSchemas.Timestamp).toBeDefined();
      expect(commonSchemas.Timestamp.type).toBe('string');
      expect(commonSchemas.Timestamp.format).toBe('date-time');
    });
  });

  describe('Auth Schemas', () => {
    it('should define LoginRequest schema', () => {
      expect(authSchemas.LoginRequest).toBeDefined();
      expect(authSchemas.LoginRequest.required).toContain('email');
      expect(authSchemas.LoginRequest.required).toContain('password');
    });

    it('should define LoginResponse schema', () => {
      expect(authSchemas.LoginResponse).toBeDefined();
      expect(authSchemas.LoginResponse.properties.accessToken).toBeDefined();
      expect(authSchemas.LoginResponse.properties.refreshToken).toBeDefined();
    });

    it('should define RegisterRequest schema', () => {
      expect(authSchemas.RegisterRequest).toBeDefined();
      expect(authSchemas.RegisterRequest.required).toContain('email');
      expect(authSchemas.RegisterRequest.required).toContain('name');
    });

    it('should define RefreshTokenRequest schema', () => {
      expect(authSchemas.RefreshTokenRequest).toBeDefined();
      expect(authSchemas.RefreshTokenRequest.required).toContain('refreshToken');
    });
  });

  describe('User Schemas', () => {
    it('should define User schema', () => {
      expect(userSchemas.User).toBeDefined();
      expect(userSchemas.User.properties.id).toBeDefined();
      expect(userSchemas.User.properties.email).toBeDefined();
      expect(userSchemas.User.properties.name).toBeDefined();
    });

    it('should define CreateUserRequest schema', () => {
      expect(userSchemas.CreateUserRequest).toBeDefined();
      expect(userSchemas.CreateUserRequest.required).toContain('email');
      expect(userSchemas.CreateUserRequest.required).toContain('name');
    });

    it('should define UpdateUserRequest schema', () => {
      expect(userSchemas.UpdateUserRequest).toBeDefined();
      expect(userSchemas.UpdateUserRequest.properties.name).toBeDefined();
    });
  });

  describe('Issue Schemas', () => {
    it('should define Issue schema', () => {
      expect(issueSchemas.Issue).toBeDefined();
      expect(issueSchemas.Issue.properties.id).toBeDefined();
      expect(issueSchemas.Issue.properties.short_description).toBeDefined();
      expect(issueSchemas.Issue.properties.state).toBeDefined();
    });

    it('should define Issue state enum', () => {
      expect(issueSchemas.Issue.properties.state.enum).toContain('new');
      expect(issueSchemas.Issue.properties.state.enum).toContain('in_progress');
      expect(issueSchemas.Issue.properties.state.enum).toContain('resolved');
      expect(issueSchemas.Issue.properties.state.enum).toContain('closed');
    });

    it('should define Issue priority range', () => {
      expect(issueSchemas.Issue.properties.priority.minimum).toBe(1);
      expect(issueSchemas.Issue.properties.priority.maximum).toBe(5);
    });

    it('should define CreateIssueRequest schema', () => {
      expect(issueSchemas.CreateIssueRequest).toBeDefined();
      expect(issueSchemas.CreateIssueRequest.required).toContain('short_description');
    });

    it('should define UpdateIssueRequest schema', () => {
      expect(issueSchemas.UpdateIssueRequest).toBeDefined();
      expect(issueSchemas.UpdateIssueRequest.properties.resolution_notes).toBeDefined();
    });
  });

  describe('Change Schemas', () => {
    it('should define Change schema', () => {
      expect(changeSchemas.Change).toBeDefined();
      expect(changeSchemas.Change.properties.id).toBeDefined();
      expect(changeSchemas.Change.properties.title).toBeDefined();
      expect(changeSchemas.Change.properties.type).toBeDefined();
    });

    it('should define Change type enum', () => {
      expect(changeSchemas.Change.properties.type.enum).toContain('standard');
      expect(changeSchemas.Change.properties.type.enum).toContain('normal');
      expect(changeSchemas.Change.properties.type.enum).toContain('emergency');
    });

    it('should define Change risk enum', () => {
      expect(changeSchemas.Change.properties.risk.enum).toContain('low');
      expect(changeSchemas.Change.properties.risk.enum).toContain('medium');
      expect(changeSchemas.Change.properties.risk.enum).toContain('high');
      expect(changeSchemas.Change.properties.risk.enum).toContain('critical');
    });

    it('should define CreateChangeRequest schema', () => {
      expect(changeSchemas.CreateChangeRequest).toBeDefined();
      expect(changeSchemas.CreateChangeRequest.required).toContain('title');
      expect(changeSchemas.CreateChangeRequest.required).toContain('description');
      expect(changeSchemas.CreateChangeRequest.required).toContain('start_date');
      expect(changeSchemas.CreateChangeRequest.required).toContain('end_date');
    });
  });

  describe('Application Schemas', () => {
    it('should define Application schema', () => {
      expect(applicationSchemas.Application).toBeDefined();
      expect(applicationSchemas.Application.properties.id).toBeDefined();
      expect(applicationSchemas.Application.properties.name).toBeDefined();
      expect(applicationSchemas.Application.properties.criticality).toBeDefined();
    });

    it('should define Application criticality enum', () => {
      expect(applicationSchemas.Application.properties.criticality.enum).toContain('low');
      expect(applicationSchemas.Application.properties.criticality.enum).toContain('medium');
      expect(applicationSchemas.Application.properties.criticality.enum).toContain('high');
      expect(applicationSchemas.Application.properties.criticality.enum).toContain('critical');
    });

    it('should define CreateApplicationRequest schema', () => {
      expect(applicationSchemas.CreateApplicationRequest).toBeDefined();
      expect(applicationSchemas.CreateApplicationRequest.required).toContain('name');
      expect(applicationSchemas.CreateApplicationRequest.required).toContain('short_name');
    });
  });

  describe('Catalog Schemas', () => {
    it('should define CatalogItem schema', () => {
      expect(catalogSchemas.CatalogItem).toBeDefined();
      expect(catalogSchemas.CatalogItem.properties.id).toBeDefined();
      expect(catalogSchemas.CatalogItem.properties.name).toBeDefined();
      expect(catalogSchemas.CatalogItem.properties.type).toBeDefined();
    });

    it('should define CatalogItem type enum', () => {
      expect(catalogSchemas.CatalogItem.properties.type.enum).toContain('service');
      expect(catalogSchemas.CatalogItem.properties.type.enum).toContain('hardware');
      expect(catalogSchemas.CatalogItem.properties.type.enum).toContain('software');
      expect(catalogSchemas.CatalogItem.properties.type.enum).toContain('access');
    });

    it('should define ServiceRequest schema', () => {
      expect(catalogSchemas.ServiceRequest).toBeDefined();
      expect(catalogSchemas.ServiceRequest.properties.id).toBeDefined();
      expect(catalogSchemas.ServiceRequest.properties.state).toBeDefined();
    });
  });

  describe('Attachment Schemas', () => {
    it('should define Attachment schema', () => {
      expect(attachmentSchemas.Attachment).toBeDefined();
      expect(attachmentSchemas.Attachment.properties.id).toBeDefined();
      expect(attachmentSchemas.Attachment.properties.filename).toBeDefined();
      expect(attachmentSchemas.Attachment.properties.entity_type).toBeDefined();
    });

    it('should define UploadUrlRequest schema', () => {
      expect(attachmentSchemas.UploadUrlRequest).toBeDefined();
      expect(attachmentSchemas.UploadUrlRequest.required).toContain('entityType');
      expect(attachmentSchemas.UploadUrlRequest.required).toContain('entityId');
      expect(attachmentSchemas.UploadUrlRequest.required).toContain('filename');
    });

    it('should define UploadUrlResponse schema', () => {
      expect(attachmentSchemas.UploadUrlResponse).toBeDefined();
      expect(attachmentSchemas.UploadUrlResponse.properties.uploadUrl).toBeDefined();
      expect(attachmentSchemas.UploadUrlResponse.properties.storageKey).toBeDefined();
    });

    it('should limit file size to 50MB', () => {
      expect(attachmentSchemas.UploadUrlRequest.properties.fileSize.maximum).toBe(52428800);
    });
  });

  describe('Audit Schemas', () => {
    it('should define AuditLog schema', () => {
      expect(auditSchemas.AuditLog).toBeDefined();
      expect(auditSchemas.AuditLog.properties.id).toBeDefined();
      expect(auditSchemas.AuditLog.properties.action).toBeDefined();
      expect(auditSchemas.AuditLog.properties.entity_type).toBeDefined();
    });

    it('should define AuditLog action enum', () => {
      expect(auditSchemas.AuditLog.properties.action.enum).toContain('create');
      expect(auditSchemas.AuditLog.properties.action.enum).toContain('update');
      expect(auditSchemas.AuditLog.properties.action.enum).toContain('delete');
      expect(auditSchemas.AuditLog.properties.action.enum).toContain('login');
      expect(auditSchemas.AuditLog.properties.action.enum).toContain('logout');
    });
  });

  describe('Group Schemas', () => {
    it('should define Group schema', () => {
      expect(groupSchemas.Group).toBeDefined();
      expect(groupSchemas.Group.properties.id).toBeDefined();
      expect(groupSchemas.Group.properties.name).toBeDefined();
      expect(groupSchemas.Group.properties.type).toBeDefined();
    });

    it('should define Group type enum', () => {
      expect(groupSchemas.Group.properties.type.enum).toContain('assignment');
      expect(groupSchemas.Group.properties.type.enum).toContain('approval');
      expect(groupSchemas.Group.properties.type.enum).toContain('support');
      expect(groupSchemas.Group.properties.type.enum).toContain('custom');
    });
  });

  describe('Notification Schemas', () => {
    it('should define Notification schema', () => {
      expect(notificationSchemas.Notification).toBeDefined();
      expect(notificationSchemas.Notification.properties.id).toBeDefined();
      expect(notificationSchemas.Notification.properties.user_id).toBeDefined();
      expect(notificationSchemas.Notification.properties.title).toBeDefined();
      expect(notificationSchemas.Notification.properties.message).toBeDefined();
      expect(notificationSchemas.Notification.properties.read).toBeDefined();
    });
  });

  describe('All Schemas Export', () => {
    it('should combine all schema definitions', () => {
      expect(allSchemas).toBeDefined();
      expect(allSchemas.Error).toBeDefined();
      expect(allSchemas.User).toBeDefined();
      expect(allSchemas.Issue).toBeDefined();
      expect(allSchemas.Change).toBeDefined();
      expect(allSchemas.Application).toBeDefined();
      expect(allSchemas.CatalogItem).toBeDefined();
      expect(allSchemas.Attachment).toBeDefined();
      expect(allSchemas.AuditLog).toBeDefined();
      expect(allSchemas.Group).toBeDefined();
      expect(allSchemas.Notification).toBeDefined();
    });

    it('should include common schemas in allSchemas', () => {
      expect(allSchemas.UUID).toBeDefined();
      expect(allSchemas.Timestamp).toBeDefined();
      expect(allSchemas.PaginationParams).toBeDefined();
    });

    it('should include auth schemas in allSchemas', () => {
      expect(allSchemas.LoginRequest).toBeDefined();
      expect(allSchemas.LoginResponse).toBeDefined();
      expect(allSchemas.RegisterRequest).toBeDefined();
    });
  });
});
