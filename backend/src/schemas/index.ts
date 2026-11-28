/**
 * Central Zod schema registry.
 *
 * Every endpoint schema lives in this directory. `schemaRegistry` maps
 * "METHOD /full/path" (Fastify route pattern, including the /v1/<module> prefix)
 * to its schemas; the validation plugin applies registered schemas automatically
 * to any route that does not call `app.validate(...)` itself.
 */
import { z, type ZodTypeAny } from 'zod';
import * as auth from './auth.js';
import * as issues from './issues.js';
import * as sod from './sod.js';
import * as makerChecker from './maker-checker.js';
import * as recertification from './recertification.js';
import * as attachments from './attachments.js';
import * as migration from './migration.js';
import * as q from './queries.js';
import * as vendorRisk from './vendor-risk.js';
import * as email from './email.js';
import * as integrations from './integrations.js';
import * as sla from './sla.js';
import * as workflow from './workflow.js';
import * as applications from './applications.js';
import * as assets from './assets.js';
import * as bulk from './bulk.js';
import * as catalog from './catalog.js';
import * as changes from './changes.js';
import * as cloud from './cloud.js';
import * as complianceReports from './compliance-reports.js';
import * as dataSecurity from './data-security.js';
import * as emergencyChange from './emergency-change.js';
import * as groups from './groups.js';
import * as health from './health.js';
import * as knowledge from './knowledge.js';
import * as notifications from './notifications.js';
import * as oncall from './oncall.js';
import * as pam from './pam.js';
import * as problems from './problems.js';
import * as regulatorySla from './regulatory-sla.js';
import * as reporting from './reporting.js';
import * as requests from './requests.js';
import * as roles from './roles.js';
import * as search from './search.js';
import * as settings from './settings.js';
import * as users from './users.js';
import * as sso from './sso.js';

export * from './common.js';
import { textIdSchema } from './common.js';
export * as authSchemas from './auth.js';
export * as issueSchemas from './issues.js';
export * as sodSchemas from './sod.js';
export * as makerCheckerSchemas from './maker-checker.js';
export * as recertificationSchemas from './recertification.js';
export * as attachmentsSchemas from './attachments.js';
export * as auditSchemas from './audit.js';
export * as migrationSchemas from './migration.js';
export * as querySchemas from './queries.js';
export * as vendorRiskSchemas from './vendor-risk.js';
export * as emailSchemas from './email.js';
export * as integrationsSchemas from './integrations.js';
export * as slaSchemas from './sla.js';
export * as workflowSchemas from './workflow.js';
export * as applicationsSchemas from './applications.js';
export * as assetsSchemas from './assets.js';
export * as bulkSchemas from './bulk.js';
export * as catalogSchemas from './catalog.js';
export * as changesSchemas from './changes.js';
export * as cloudSchemas from './cloud.js';
export * as complianceReportsSchemas from './compliance-reports.js';
export * as dataSecuritySchemas from './data-security.js';
export * as emergencyChangeSchemas from './emergency-change.js';
export * as groupsSchemas from './groups.js';
export * as healthSchemas from './health.js';
export * as knowledgeSchemas from './knowledge.js';
export * as notificationsSchemas from './notifications.js';
export * as oncallSchemas from './oncall.js';
export * as pamSchemas from './pam.js';
export * as problemsSchemas from './problems.js';
export * as regulatorySlaSchemas from './regulatory-sla.js';
export * as reportingSchemas from './reporting.js';
export * as requestsSchemas from './requests.js';
export * as rolesSchemas from './roles.js';
export * as searchSchemas from './search.js';
export * as settingsSchemas from './settings.js';
export * as usersSchemas from './users.js';
export * as clientErrorsSchemas from './client-errors.js';
export * as ssoSchemas from './sso.js';

export interface RouteSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  /** convention paging-key checks to run next to an explicit query schema (GET routes) */
  alsoQuery?: ZodTypeAny;
}

export const schemaRegistry: Record<string, RouteSchemas> = {
  'POST /v1/auth/login': { body: auth.loginSchema },
  'POST /v1/auth/refresh': { body: auth.refreshSchema },
  'PUT /v1/auth/password': { body: auth.changePasswordSchema },
  'POST /v1/auth/forgot-password': { body: auth.forgotPasswordSchema },
  'POST /v1/auth/reset-password': { body: auth.resetPasswordSchema },
  'POST /v1/auth/verify-email': { body: auth.verifyEmailSchema },
  'POST /v1/auth/resend-verification': { body: auth.resendVerificationSchema },

  'GET /v1/issues': { query: issues.listIssuesQuerySchema },
  'GET /v1/issues/:id': { params: issues.issueIdParamSchema },
  'POST /v1/issues': { body: issues.createIssueSchema },
  'PUT /v1/issues/:id': { params: issues.issueIdParamSchema, body: issues.updateIssueSchema },
  'POST /v1/issues/:id/assign': { params: issues.issueIdParamSchema, body: issues.assignSchema },
  'POST /v1/issues/:id/escalate': { params: issues.issueIdParamSchema },
  'POST /v1/issues/:id/resolve': { params: issues.issueIdParamSchema, body: issues.resolveSchema },
  'POST /v1/issues/:id/close': { params: issues.issueIdParamSchema },
  'POST /v1/issues/:id/reopen': { params: issues.issueIdParamSchema },
  'POST /v1/issues/:id/status': { params: issues.issueIdParamSchema, body: issues.statusChangeSchema },
  'GET /v1/issues/:id/comments': { params: issues.issueIdParamSchema },
  'POST /v1/issues/:id/comments': { params: issues.issueIdParamSchema, body: issues.commentSchema },
  'GET /v1/issues/:id/worklogs': { params: issues.issueIdParamSchema },
  'POST /v1/issues/:id/worklogs': { params: issues.issueIdParamSchema, body: issues.worklogSchema },
  'GET /v1/issues/:id/history': { params: issues.issueIdParamSchema },
  'GET /v1/issues/:id/problem': { params: issues.issueIdParamSchema },
  'POST /v1/issues/:id/problem': { params: issues.issueIdParamSchema, body: issues.linkProblemSchema },
  'DELETE /v1/issues/:id/problem': { params: issues.issueIdParamSchema },

  // --- remaining modules (generated from each route's validate() call) ---
  'GET /v1/applications/:id': { params: applications.appIdParamSchema },
  'POST /v1/applications': { body: applications.createApplicationSchema },
  'PUT /v1/applications/:id': { params: applications.appIdParamSchema, body: applications.updateApplicationSchema },
  'DELETE /v1/applications/:id': { params: applications.appIdParamSchema },
  'GET /v1/applications/:id/health': { params: applications.appIdParamSchema },
  'GET /v1/applications/:id/environments': { params: applications.appIdParamSchema },
  'POST /v1/applications/:id/environments': { params: applications.appIdParamSchema, body: applications.createEnvironmentSchema },
  'PUT /v1/applications/:id/environments/:envId': { params: applications.appEnvParamSchema, body: applications.updateEnvironmentSchema },
  'DELETE /v1/applications/:id/environments/:envId': { params: applications.appEnvParamSchema },
  'GET /v1/assets/:id': { params: assets.assetIdSchema },
  'PUT /v1/assets/:id': { params: assets.assetIdSchema },
  'DELETE /v1/assets/:id': { params: assets.assetIdSchema },
  'GET /v1/bulk/jobs/:id': { params: bulk.jobIdParamSchema },
  'GET /v1/catalog/categories/:id': { params: catalog.categoryIdParamSchema },
  'POST /v1/catalog/categories': { body: catalog.createCategorySchema },
  'PUT /v1/catalog/categories/:id': { params: catalog.categoryIdParamSchema, body: catalog.updateCategorySchema },
  'DELETE /v1/catalog/categories/:id': { params: catalog.categoryIdParamSchema },
  'GET /v1/catalog/items/:id': { params: catalog.itemIdParamSchema },
  'POST /v1/catalog/items': { body: catalog.createItemSchema },
  'PUT /v1/catalog/items/:id': { params: catalog.itemIdParamSchema, body: catalog.updateItemSchema },
  'DELETE /v1/catalog/items/:id': { params: catalog.itemIdParamSchema },
  'GET /v1/changes/change-windows/:id': { params: changes.idParamSchema },
  'POST /v1/changes/change-windows': { body: changes.createWindowSchema },
  'PUT /v1/changes/change-windows/:id': { params: changes.idParamSchema, body: changes.updateWindowSchema },
  'DELETE /v1/changes/change-windows/:id': { params: changes.idParamSchema },
  'GET /v1/changes/change-templates/:id': { params: changes.idParamSchema },
  'POST /v1/changes/change-templates': { body: changes.createTemplateSchema },
  'PUT /v1/changes/change-templates/:id': { params: changes.idParamSchema, body: changes.updateTemplateSchema },
  'DELETE /v1/changes/change-templates/:id': { params: changes.idParamSchema },
  'GET /v1/changes/:id': { params: changes.idParamSchema },
  'POST /v1/changes': { body: changes.createChangeSchema },
  'PUT /v1/changes/:id': { params: changes.idParamSchema, body: changes.updateChangeSchema },
  'DELETE /v1/changes/:id': { params: changes.idParamSchema },
  'POST /v1/changes/:id/submit': { params: changes.idParamSchema },
  'POST /v1/changes/:id/approve': { params: changes.idParamSchema },
  'POST /v1/changes/:id/reject': { params: changes.idParamSchema },
  'POST /v1/changes/:id/schedule': { params: changes.idParamSchema },
  'POST /v1/changes/:id/start': { params: changes.idParamSchema },
  'POST /v1/changes/:id/complete': { params: changes.idParamSchema },
  'POST /v1/changes/:id/fail': { params: changes.idParamSchema },
  'POST /v1/changes/:id/rollback': { params: changes.idParamSchema },
  'GET /v1/changes/:id/approvals': { params: changes.idParamSchema },
  'GET /v1/changes/:id/history': { params: changes.idParamSchema },
  'GET /v1/changes/:id/tasks': { params: changes.idParamSchema },
  'POST /v1/changes/:id/tasks': { params: changes.idParamSchema, body: changes.createTaskSchema },
  'PUT /v1/changes/:id/tasks/:taskId': { params: changes.idTaskParamSchema, body: changes.updateTaskSchema },
  'POST /v1/changes/:id/tasks/:taskId/start': { params: changes.idTaskParamSchema },
  'POST /v1/changes/:id/tasks/:taskId/complete': { params: changes.idTaskParamSchema },
  'DELETE /v1/changes/:id/tasks/:taskId': { params: changes.idTaskParamSchema },
  'GET /v1/changes/:id/comments': { params: changes.idParamSchema },
  'POST /v1/changes/:id/comments': { params: changes.idParamSchema, body: changes.commentSchema },
  'GET /v1/changes/cab-meetings/:id': { params: changes.idParamSchema },
  'POST /v1/changes/cab-meetings': { body: changes.createCabMeetingSchema },
  'PUT /v1/changes/cab-meetings/:id': { params: changes.idParamSchema, body: changes.updateCabMeetingSchema },
  'DELETE /v1/changes/cab-meetings/:id': { params: changes.idParamSchema },
  'GET /v1/changes/cab-meetings/:id/attendees': { params: changes.idParamSchema },
  'POST /v1/changes/cab-meetings/:id/attendees': { params: changes.idParamSchema, body: changes.addAttendeeSchema },
  'DELETE /v1/changes/cab-meetings/:id/attendees/:userId': { params: changes.idUserParamSchema },
  'PUT /v1/changes/cab-meetings/:id/attendees/:userId': { params: changes.idUserParamSchema, body: changes.updateAttendeeSchema },
  'GET /v1/changes/cab-meetings/:id/changes': { params: changes.idParamSchema },
  'POST /v1/changes/cab-meetings/:id/changes': { params: changes.idParamSchema, body: changes.addMeetingChangeSchema },
  'DELETE /v1/changes/cab-meetings/:id/changes/:changeId': { params: changes.idChangeParamSchema },
  'PUT /v1/changes/cab-meetings/:id/changes/:changeId': { params: changes.idChangeParamSchema, body: changes.updateMeetingChangeSchema },
  'POST /v1/changes/cab-meetings/:id/start': { params: changes.idParamSchema },
  'POST /v1/changes/cab-meetings/:id/complete': { params: changes.idParamSchema },
  'POST /v1/changes/cab-meetings/:id/cancel': { params: changes.idParamSchema },
  'POST /v1/changes/cab-meetings/:id/generate-agenda': { params: changes.idParamSchema },
  'POST /v1/changes/cab-meetings/:id/minutes': { params: changes.idParamSchema, body: changes.saveMinutesSchema },
  'POST /v1/changes/cab-meetings/:id/decisions': { params: changes.idParamSchema, body: changes.recordDecisionSchema },
  'POST /v1/changes/cab-meetings/:id/action-items': { params: changes.idParamSchema, body: changes.addActionItemSchema },
  'GET /v1/cloud/accounts/:id': { params: cloud.accountIdParamSchema },
  'POST /v1/cloud/accounts': { body: cloud.createAccountSchema },
  'PUT /v1/cloud/accounts/:id': { params: cloud.accountIdParamSchema, body: cloud.updateAccountSchema },
  'DELETE /v1/cloud/accounts/:id': { params: cloud.accountIdParamSchema },
  'POST /v1/cloud/accounts/:id/test': { params: cloud.accountIdParamSchema },
  'GET /v1/cloud/resources/:id': { params: cloud.resourceIdParamSchema },
  'POST /v1/cloud/resources/:id/map': { params: cloud.resourceIdParamSchema, body: cloud.mapResourceSchema },
  'DELETE /v1/cloud/resources/:id/map': { params: cloud.resourceIdParamSchema },
  'GET /v1/cloud/applications/:applicationId/resources': { params: cloud.applicationIdParamSchema },
  'GET /v1/cloud/applications/:applicationId/costs': { params: cloud.applicationIdParamSchema, query: cloud.applicationCostsQuerySchema },
  'POST /v1/cloud/mapping-rules': { body: cloud.createMappingRuleSchema },
  'DELETE /v1/cloud/mapping-rules/:id': { params: cloud.mappingRuleIdParamSchema },
  'POST /v1/compliance-reports/compliance-reports/generate': { body: complianceReports.generateReportSchema },
  'POST /v1/compliance-reports/compliance-reports/schedules': { body: complianceReports.createScheduleSchema },
  'PUT /v1/compliance-reports/compliance-reports/schedules/:id': { params: complianceReports.idParamSchema, body: complianceReports.updateScheduleSchema },
  'PUT /v1/data-security/settings': { body: dataSecurity.updateSettingsSchema },
  'POST /v1/data-security/classifications': { body: dataSecurity.addClassificationSchema },
  'POST /v1/data-security/unmask': { body: dataSecurity.unmaskSchema },
  'POST /v1/emergency-changes': { body: emergencyChange.createEmergencyChangeSchema },
  'GET /v1/emergency-changes/:id': { params: emergencyChange.idParamSchema },
  'POST /v1/emergency-changes/:id/review': { params: emergencyChange.idParamSchema, body: emergencyChange.postHocReviewSchema },
  'GET /v1/groups/:id': { params: groups.groupIdParamSchema },
  'POST /v1/groups': { body: groups.createGroupSchema },
  'PUT /v1/groups/:id': { params: groups.groupIdParamSchema, body: groups.updateGroupSchema },
  'DELETE /v1/groups/:id': { params: groups.groupIdParamSchema },
  'GET /v1/groups/:id/members': { params: groups.groupIdParamSchema },
  'POST /v1/groups/:id/members': { params: groups.groupIdParamSchema, body: groups.addMemberSchema },
  'DELETE /v1/groups/:id/members/:userId': { params: groups.groupMemberParamSchema },
  'GET /v1/health/config/:tier': { params: health.tierParamSchema },
  'PUT /v1/health/config/:tier': { params: health.tierParamSchema, body: health.updateConfigSchema },
  'GET /v1/health/applications/:applicationId': { params: health.applicationIdParamSchema },
  'GET /v1/health/applications/:applicationId/history': { params: health.applicationIdParamSchema, query: health.historyQuerySchema },
  'POST /v1/health/applications/:applicationId/calculate': { params: health.applicationIdParamSchema },
  'POST /v1/kb': { body: knowledge.createArticleSchema },
  'PUT /v1/kb/:articleId': { body: knowledge.updateArticleSchema },
  'POST /v1/kb/:articleId/feedback': { body: knowledge.articleFeedbackSchema },
  'POST /v1/notifications/:id/read': { params: notifications.notificationIdParamSchema },
  'DELETE /v1/notifications/:id': { params: notifications.notificationIdParamSchema },
  'PUT /v1/notifications/preferences': { body: notifications.updatePreferenceSchema },
  'POST /v1/notifications/channels': { body: notifications.createChannelSchema },
  'PUT /v1/notifications/channels/:id': { params: notifications.channelIdParamSchema, body: notifications.updateChannelSchema },
  'PUT /v1/notifications/templates/:eventType/:channelType': { params: notifications.templateParamSchema, body: notifications.updateTemplateSchema },
  'GET /v1/oncall/schedules/:id': { params: oncall.idParamSchema },
  'POST /v1/oncall/schedules': { body: oncall.createScheduleSchema },
  'PUT /v1/oncall/schedules/:id': { params: oncall.idParamSchema, body: oncall.updateScheduleSchema },
  'DELETE /v1/oncall/schedules/:id': { params: oncall.idParamSchema },
  'GET /v1/oncall/schedules/:id/rotations': { params: oncall.idParamSchema },
  'POST /v1/oncall/schedules/:id/rotations': { params: oncall.idParamSchema, body: oncall.addToRotationSchema },
  'PUT /v1/oncall/schedules/:id/rotations/:rotationId': { params: oncall.idRotationParamSchema },
  'DELETE /v1/oncall/schedules/:id/rotations/:rotationId': { params: oncall.idRotationParamSchema },
  'POST /v1/oncall/schedules/:id/shifts': { params: oncall.idParamSchema, body: oncall.createShiftSchema },
  'POST /v1/oncall/schedules/:id/override': { params: oncall.idParamSchema, body: oncall.createOverrideSchema },
  'DELETE /v1/oncall/schedules/:id/shifts/:shiftId': { params: oncall.idShiftParamSchema },
  'GET /v1/oncall/schedules/:id/applications': { params: oncall.idParamSchema },
  'POST /v1/oncall/schedules/:id/applications': { params: oncall.idParamSchema },
  'DELETE /v1/oncall/schedules/:id/applications/:applicationId': { params: oncall.idAppParamSchema },
  'GET /v1/oncall/escalation-policies/:id': { params: oncall.idParamSchema },
  'POST /v1/oncall/escalation-policies': { body: oncall.createPolicySchema },
  'PUT /v1/oncall/escalation-policies/:id': { params: oncall.idParamSchema, body: oncall.updatePolicySchema },
  'DELETE /v1/oncall/escalation-policies/:id': { params: oncall.idParamSchema },
  'GET /v1/oncall/escalation-policies/:id/steps': { params: oncall.idParamSchema },
  'POST /v1/oncall/escalation-policies/:id/steps': { params: oncall.idParamSchema, body: oncall.addStepSchema },
  'PUT /v1/oncall/escalation-policies/:id/steps/:stepId': { params: oncall.idStepParamSchema },
  'DELETE /v1/oncall/escalation-policies/:id/steps/:stepId': { params: oncall.idStepParamSchema },
  'GET /v1/oncall/shift-swaps/:id': { params: oncall.idParamSchema },
  'POST /v1/oncall/shift-swaps': { body: oncall.createShiftSwapSchema },
  'PUT /v1/oncall/shift-swaps/:id': { params: oncall.idParamSchema, body: oncall.updateShiftSwapSchema },
  'POST /v1/oncall/shift-swaps/:id/cancel': { params: oncall.idParamSchema },
  'POST /v1/oncall/shift-swaps/:id/accept': { params: oncall.idParamSchema },
  'POST /v1/oncall/shift-swaps/:id/reject': { params: oncall.idParamSchema },
  'POST /v1/oncall/shift-swaps/:id/admin-approve': { params: oncall.idParamSchema },
  'POST /v1/oncall/schedules/:scheduleId/ical/subscribe': { params: oncall.scheduleIdParamSchema },
  'DELETE /v1/oncall/schedules/:scheduleId/ical/subscribe': { params: oncall.scheduleIdParamSchema },
  'POST /v1/pam/grants': { body: pam.requestGrantSchema },
  'GET /v1/pam/grants': { query: pam.listGrantsQuerySchema },
  'POST /v1/pam/grants/:id/activity': { body: pam.activitySchema },
  'GET /v1/pam/summary': { query: pam.summaryQuerySchema },
  'GET /v1/problems/:id': { params: problems.problemIdParamSchema },
  'POST /v1/problems': { body: problems.createProblemSchema },
  'PUT /v1/problems/:id': { params: problems.problemIdParamSchema, body: problems.updateProblemSchema },
  'DELETE /v1/problems/:id': { params: problems.problemIdParamSchema },
  'PUT /v1/problems/:id/status': { params: problems.problemIdParamSchema, body: problems.statusChangeSchema },
  'POST /v1/problems/:id/assign': { params: problems.problemIdParamSchema, body: problems.assignSchema },
  'GET /v1/problems/:id/comments': { params: problems.problemIdParamSchema },
  'POST /v1/problems/:id/comments': { params: problems.problemIdParamSchema, body: problems.commentSchema },
  'GET /v1/problems/:id/worklogs': { params: problems.problemIdParamSchema },
  'POST /v1/problems/:id/worklogs': { params: problems.problemIdParamSchema, body: problems.worklogSchema },
  'GET /v1/problems/:id/issues': { params: problems.problemIdParamSchema },
  'POST /v1/problems/:id/issues': { params: problems.problemIdParamSchema, body: problems.linkIssueSchema },
  'DELETE /v1/problems/:id/issues/:issueId': { params: problems.problemIssueParamSchema },
  'GET /v1/problems/:id/history': { params: problems.problemIdParamSchema },
  'POST /v1/problems/:id/convert-to-known-error': { params: problems.problemIdParamSchema },
  'POST /v1/regulatory-sla/incidents/:incidentId/classify': { params: regulatorySla.incidentRefParamSchema, body: regulatorySla.classifyIncidentSchema },
  'GET /v1/regulatory-sla/incidents/:incidentId/clocks': { params: regulatorySla.incidentRefParamSchema },
  'POST /v1/regulatory-sla/clocks/:clockId/notify': { body: regulatorySla.recordNotificationSchema },
  'GET /v1/regulatory-sla/summary': { query: regulatorySla.summaryQuerySchema },
  'POST /v1/regulatory-sla/frameworks': { body: regulatorySla.createFrameworkSchema },
  'POST /v1/regulatory-sla/frameworks/:id/deadlines': { body: regulatorySla.createDeadlineSchema },
  'GET /v1/reports/templates/:id': { params: reporting.idParamSchema },
  'PUT /v1/reports/templates/:id': { params: reporting.idParamSchema },
  'DELETE /v1/reports/templates/:id': { params: reporting.idParamSchema },
  'GET /v1/reports/schedules/:id': { params: reporting.idParamSchema },
  'PUT /v1/reports/schedules/:id': { params: reporting.idParamSchema },
  'DELETE /v1/reports/schedules/:id': { params: reporting.idParamSchema },
  'GET /v1/reports/executions/:id': { params: reporting.idParamSchema },
  'DELETE /v1/reports/saved/:id': { params: reporting.idParamSchema },
  'PUT /v1/reports/widgets/:id': { params: reporting.idParamSchema },
  'DELETE /v1/reports/widgets/:id': { params: reporting.idParamSchema },
  'GET /v1/requests/:id': { params: requests.requestIdParamSchema },
  'POST /v1/requests': { body: requests.createRequestSchema },
  'PUT /v1/requests/:id': { params: requests.requestIdParamSchema, body: requests.updateRequestSchema },
  'POST /v1/requests/:id/assign': { params: requests.requestIdParamSchema, body: requests.assignRequestSchema },
  'POST /v1/requests/:id/start': { params: requests.requestIdParamSchema },
  'POST /v1/requests/:id/complete': { params: requests.requestIdParamSchema, body: requests.completeRequestSchema },
  'POST /v1/requests/:id/cancel': { params: requests.requestIdParamSchema, body: requests.cancelRequestSchema },
  'GET /v1/requests/:id/approvals': { params: requests.requestIdParamSchema },
  'POST /v1/requests/:id/approvals/:approvalId/approve': { params: requests.requestApprovalParamSchema, body: requests.approvalActionSchema },
  'POST /v1/requests/:id/approvals/:approvalId/reject': { params: requests.requestApprovalParamSchema, body: requests.approvalActionSchema },
  'GET /v1/requests/:id/comments': { params: requests.requestIdParamSchema },
  'POST /v1/requests/:id/comments': { params: requests.requestIdParamSchema, body: requests.addCommentSchema },
  'GET /v1/requests/:id/history': { params: requests.requestIdParamSchema },
  'GET /v1/roles/:id': { params: roles.roleIdParamSchema },
  'POST /v1/roles': { body: roles.createRoleSchema },
  'PUT /v1/roles/:id': { params: roles.roleIdParamSchema, body: roles.updateRoleSchema },
  'DELETE /v1/roles/:id': { params: roles.roleIdParamSchema },
  'GET /v1/search': { query: search.searchQuerySchema },
  'GET /v1/search/suggest': { query: search.suggestQuerySchema },
  'GET /v1/search/history': { query: search.historyQuerySchema },
  'DELETE /v1/search/history/:id': { params: search.idParamSchema },
  'POST /v1/search/templates': { body: search.templateSchema },
  'GET /v1/search/templates/:id': { params: search.idParamSchema },
  'PATCH /v1/search/templates/:id': { params: search.idParamSchema },
  'DELETE /v1/search/templates/:id': { params: search.idParamSchema },
  'POST /v1/search/templates/:id/use': { params: search.idParamSchema },
  'GET /v1/search/analytics': { query: search.analyticsQuerySchema },
  'PUT /v1/settings': { body: settings.updateSettingsSchema },
  'GET /v1/users/:id': { params: users.userIdParamSchema },
  'POST /v1/users': { body: users.createUserSchema },
  'PUT /v1/users/:id': { params: users.userIdParamSchema, body: users.updateUserSchema },
  'DELETE /v1/users/:id': { params: users.userIdParamSchema },
  'GET /v1/users/:id/groups': { params: users.userIdParamSchema },
  'PUT /v1/users/:id/roles': { params: users.userIdParamSchema, body: users.assignRolesSchema },
  'POST /v1/email/webhook/inbound/:tenantSlug': { body: email.genericInboundSchema },
  'POST /v1/email/configs': { body: email.emailConfigSchema },
  'PATCH /v1/email/configs/:id': { body: email.updateEmailConfigSchema },
  'PATCH /v1/integrations/api-keys/:id': { body: integrations.updateApiKeySchema },
  'PATCH /v1/integrations/webhooks/:id': { body: integrations.updateWebhookSchema },
  'POST /v1/integrations': { body: integrations.createIntegrationSchema },
  'PATCH /v1/integrations/:id': { body: integrations.updateIntegrationSchema },
  'POST /v1/sla/policies': { body: sla.slaPolicySchema },
  'PATCH /v1/sla/policies/:id': { body: sla.updateSlaPolicySchema },
  'POST /v1/sla/policies/:policyId/targets': { body: sla.slaTargetSchema },
  'PATCH /v1/sla/targets/:id': { body: sla.updateSlaTargetSchema },
  'POST /v1/workflows/rules': { body: workflow.createWorkflowRuleSchema },
  'PATCH /v1/workflows/rules/:id': { body: workflow.updateWorkflowRuleSchema },
  'POST /v1/vendor-risk/vendors': { body: vendorRisk.createVendorSchema },
  'PUT /v1/vendor-risk/vendors/:id': { body: vendorRisk.updateVendorSchema },
  'POST /v1/vendor-risk/vendors/:id/applications': { body: vendorRisk.linkApplicationSchema },
  'DELETE /v1/vendor-risk/vendors/:id/applications/:appId': { params: vendorRisk.vendorAppLinkParamSchema },
  'GET /v1/vendor-risk/applications/:appId/vendors': { params: vendorRisk.appRefParamSchema },
  'POST /v1/vendor-risk/vendors/:id/reviews': { body: vendorRisk.createReviewSchema },
  'PUT /v1/vendor-risk/vendors/reviews/:reviewId': { body: vendorRisk.updateReviewSchema },

  // --- query schemas for list/report routes that read specific filters ---
  'GET /v1/changes': { query: q.changesFilterQuerySchema },
  'GET /v1/changes/cab-meetings': { query: q.changesFilterQuerySchema },
  'GET /v1/changes/cab-meetings/upcoming': { query: q.changesFilterQuerySchema },
  'GET /v1/changes/change-windows': { query: q.changeWindowsQuerySchema },
  'GET /v1/changes/change-windows/upcoming': { query: q.upcomingDaysQuerySchema },
  'GET /v1/compliance-reports/compliance-reports/runs': { query: q.dashboardQuerySchema },
  'GET /v1/dashboard/activity': { query: q.dashboardQuerySchema },
  'GET /v1/dashboard/changes/upcoming': { query: q.dashboardQuerySchema },
  'GET /v1/dashboard/cloud/costs': { query: q.dashboardQuerySchema },
  'GET /v1/dashboard/health/critical': { query: q.dashboardQuerySchema },
  'GET /v1/dashboard/requests/by-item': { query: q.dashboardQuerySchema },
  'GET /v1/dashboard/trends/changes': { query: q.dashboardQuerySchema },
  'GET /v1/dashboard/trends/issues': { query: q.dashboardQuerySchema },
  'GET /v1/email/logs': { query: q.emailLogsQuerySchema },
  'GET /v1/emergency-changes': { query: q.emergencyChangesQuerySchema },
  'GET /v1/integrations/:id/logs': { query: q.dashboardQuerySchema },
  'GET /v1/integrations/webhooks/:id/deliveries': { query: q.dashboardQuerySchema },
  'GET /v1/kb': { query: q.knowledgeFilterQuerySchema },
  'GET /v1/kb/search': { query: q.knowledgeFilterQuerySchema },
  'GET /v1/oncall/schedules': { query: q.oncallSchedulesQuerySchema },
  'GET /v1/oncall/shift-swaps': { query: q.shiftSwapsQuerySchema },
  'GET /v1/oncall/who-is-on-call': { query: q.whoIsOnCallQuerySchema },
  'GET /v1/reports/dashboard/activity': { query: q.dashboardQuerySchema },
  'GET /v1/reports/dashboard/changes/success-rate': { query: q.dashboardQuerySchema },
  'GET /v1/reports/dashboard/changes/upcoming': { query: q.dashboardQuerySchema },
  'GET /v1/reports/dashboard/costs/trends': { query: q.dashboardQuerySchema },
  'GET /v1/reports/dashboard/health/critical': { query: q.dashboardQuerySchema },
  'GET /v1/reports/dashboard/issues/trends': { query: q.dashboardQuerySchema },
  'GET /v1/reports/dashboard/requests/by-item': { query: q.dashboardQuerySchema },
  'GET /v1/reports/executions': { query: q.reportExecutionsQuerySchema },
  'GET /v1/reports/templates': { query: q.reportTemplatesQuerySchema },
  'GET /v1/sla/config': { query: q.slaConfigQuerySchema },
  'GET /v1/sla/policies': { query: q.slaPoliciesQuerySchema },
  'GET /v1/sla/stats': { query: q.slaStatsQuerySchema },
  'GET /v1/users': { query: q.usersQuerySchema },
  'GET /v1/vendor-risk/vendors': { query: q.vendorsQuerySchema },
  'GET /v1/workflows/logs': { query: q.workflowLogsQuerySchema },
  'GET /v1/workflows/rules': { query: q.workflowRulesQuerySchema },
  'GET /v1/ws': { query: q.wsQuerySchema },
  'GET /v1/oncall/schedules/:id/shifts': { params: oncall.idParamSchema, query: q.oncallShiftsQuerySchema },
  'GET /v1/oncall/shift-swaps/schedule/:scheduleId/stats': { params: oncall.scheduleIdParamSchema, query: q.shiftSwapStatsQuerySchema },
  'GET /v1/oncall/schedules/:scheduleId/ical': { params: oncall.scheduleIdParamSchema, query: q.oncallIcalQuerySchema },
  'GET /v1/oncall/schedules/:scheduleId/ical/subscribe/:token': { params: oncall.scheduleIdTokenParamSchema, query: q.oncallIcalQuerySchema },
  'GET /v1/requests/assigned': { query: requests.listRequestsQuerySchema },
  'GET /v1/requests/my': { query: requests.listRequestsQuerySchema },

  // --- hand-written schemas for routes that previously trusted raw input ---
  'POST /v1/sod/policies': { body: sod.createSodPolicySchema },
  'PUT /v1/sod/policies/:id': { body: sod.updateSodPolicySchema },
  'POST /v1/sod/evaluate': { body: sod.evaluateSodSchema },
  'POST /v1/maker-checker/operations': { body: makerChecker.createOperationSchema },
  'POST /v1/maker-checker/operations/:id/approve': { body: makerChecker.decisionCommentSchema },
  'POST /v1/maker-checker/operations/:id/reject': { body: makerChecker.decisionCommentSchema },
  'PUT /v1/maker-checker/config/:operationType': { body: makerChecker.upsertOperationConfigSchema },
  'POST /v1/recertification/campaigns': { body: recertification.createCampaignSchema },
  'POST /v1/recertification/items/:id/decide': { body: recertification.decideItemSchema },
  'POST /v1/attachments/upload-url': { body: attachments.uploadUrlSchema },
  'POST /v1/attachments/confirm-upload': { body: attachments.confirmUploadSchema },
  'POST /v1/sso/callback/:tenantSlug/:providerId': { body: sso.samlCallbackBodySchema },

  'GET /v1/migration/:jobId': { params: migration.jobIdParamSchema },
  'POST /v1/migration/:jobId/execute': { params: migration.jobIdParamSchema, body: migration.executeMigrationBodySchema },
  'POST /v1/migration/templates': { body: migration.saveMappingTemplateSchema },
  'POST /v1/integrations/api-keys/validate': { body: integrations.validateApiKeySchema },
  'POST /v1/email/test': { body: email.testEmailSchema },
  'POST /v1/workflows/rules/:id/test': { body: workflow.testRuleSchema },
  'POST /v1/reports/execute': { body: reporting.executeReportSchema },
  'POST /v1/reports/saved': { body: reporting.saveReportSchema },
  'POST /v1/reports/templates': { body: reporting.createTemplateSchema },
  'POST /v1/reports/schedules': { body: reporting.createScheduleSchema },
  'POST /v1/reports/widgets': { body: reporting.createWidgetSchema },
  'POST /v1/pam/grants/:id/approve': { body: pam.approveGrantSchema.optional() },
  'POST /v1/pam/grants/:id/revoke': { body: pam.revokeGrantSchema.optional() },
  'PUT /v1/pam/config/:privilegeType': { body: pam.upsertConfigSchema.optional() },
  'POST /v1/search/query': { body: search.searchBodySchema.optional() },
};

// ---------------------------------------------------------------------------
// Convention-based defaults for routes without an explicit entry above.
//  - path params: `id`, `appId`, `incidentId`, `userId` must be UUIDs; every other
//    param is a non-empty, whitespace-free string up to 255 chars. A route whose param of one
//    of these names is NOT a UUID column must register an explicit params schema above
//    (regulatory-sla incidentId and vendor-risk appId are VARCHAR(255) references).
//  - GET query: optional numeric paging keys must be numbers, free-text keys are length-capped
//  - POST/PUT/PATCH/DELETE body: must be a JSON object when present
// ---------------------------------------------------------------------------
const UUID_PARAMS = new Set(['id', 'appId', 'incidentId', 'userId']);
const stringParam = textIdSchema;

/** Treat an empty query value (`?page=`) as "not provided". */
const emptyAsUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalInt = (min: number, max: number) =>
  z.preprocess(emptyAsUndefined, z.coerce.number().int().min(min).max(max).optional());

export const defaultQuerySchema = z.object({
  page: optionalInt(1, 1_000_000),
  per_page: optionalInt(1, 10_000),
  limit: optionalInt(1, 100_000),
  offset: optionalInt(0, 10_000_000),
  search: z.string().max(1000).optional(),
  q: z.string().max(1000).optional(),
}).passthrough();

export const defaultBodySchema = z.record(z.unknown()).optional();

const derivedParamsCache = new Map<string, ZodTypeAny | undefined>();
export function deriveParamsSchema(url: string): ZodTypeAny | undefined {
  if (derivedParamsCache.has(url)) return derivedParamsCache.get(url);
  const names = [...url.matchAll(/:(\w+)(\?)?/g)].map((m) => ({ name: m[1], optional: m[2] === '?' }));
  let schema: ZodTypeAny | undefined;
  if (names.length) {
    const shape: Record<string, ZodTypeAny> = {};
    for (const { name, optional } of names) {
      const base: ZodTypeAny = UUID_PARAMS.has(name) ? z.string().uuid() : stringParam;
      shape[name] = optional ? base.optional() : base;
    }
    schema = z.object(shape).passthrough();
  }
  derivedParamsCache.set(url, schema);
  return schema;
}

export function lookupSchemas(method: string, url: string): RouteSchemas | undefined {
  const m = method.toUpperCase();
  const normalized = url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url;
  const explicit = schemaRegistry[`${m} ${normalized}`];
  const result: RouteSchemas = { ...explicit };
  if (!result.params) result.params = deriveParamsSchema(normalized);
  if (m === 'GET') {
    result.alsoQuery = defaultQuerySchema;
    if (!result.query) result.query = defaultQuerySchema;
  }
  if (!('body' in result) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) result.body = defaultBodySchema;
  return result.params || result.query || result.body ? result : undefined;
}
