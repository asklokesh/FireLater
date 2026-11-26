import { z } from 'zod';

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  reportType: z.string().min(1),
  queryConfig: z.record(z.unknown()).optional(),
  filters: z.record(z.unknown()).optional(),
  groupings: z.array(z.string()).optional(),
  metrics: z.array(z.string()).optional(),
  chartConfig: z.record(z.unknown()).optional(),
  outputFormat: z.enum(['json', 'csv', 'pdf', 'excel']).optional(),
  includeCharts: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export const createScheduleSchema = z.object({
  templateId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  scheduleType: z.enum(['daily', 'weekly', 'monthly', 'custom']),
  cronExpression: z.string().optional(),
  timezone: z.string().optional(),
  deliveryMethod: z.enum(['email', 'webhook', 'slack']),
  recipients: z.array(z.string()),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  webhookUrl: z.string().url().optional(),
  slackChannel: z.string().optional(),
  outputFormat: z.enum(['json', 'csv', 'pdf', 'excel']).optional(),
  customFilters: z.record(z.unknown()).optional(),
  dateRangeType: z.string().optional(),
});

export const createWidgetSchema = z.object({
  widgetType: z.enum(['chart', 'stat', 'table', 'list']),
  title: z.string().max(255).optional(),
  positionX: z.number().int().min(0).optional(),
  positionY: z.number().int().min(0).optional(),
  width: z.number().int().min(1).max(12).optional(),
  height: z.number().int().min(1).max(12).optional(),
  dataSource: z.string().min(1),
  filters: z.record(z.unknown()).optional(),
  refreshInterval: z.number().int().min(60).optional(),
  chartType: z.enum(['line', 'bar', 'pie', 'donut', 'area']).optional(),
  chartConfig: z.record(z.unknown()).optional(),
  colorScheme: z.string().optional(),
  showLegend: z.boolean().optional(),
});

// Parameter validation schemas
export const idParamSchema = z.object({
  id: z.string().uuid(),
});
