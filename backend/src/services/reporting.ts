import { PaginationParams } from '../types/index.js';

// Stub implementations for reporting services
// These will need to be fully implemented later

interface ReportTemplate {
  id: string;
  name: string;
  report_type: string;
  created_by: string;
  created_at: Date;
}

interface ScheduledReport {
  id: string;
  name: string;
  template_id: string;
  created_by: string;
  created_at: Date;
  is_active: boolean;
  parameters?: Record<string, unknown>;
  output_format?: string;
  schedule?: string;
  last_run?: Date;
}

interface ReportExecution {
  id: string;
  template_id: string;
  status: string;
  executed_by: string;
  created_at: Date;
}

interface SavedReport {
  id: string;
  name: string;
  report_type: string;
  user_id: string;
  created_at: Date;
}

interface DashboardWidget {
  id: string;
  widget_type: string;
  title?: string;
  user_id: string;
  created_at: Date;
}

class ReportTemplateService {
  async list(
    _tenantSlug: string,
    _pagination: PaginationParams,
    _filters?: { reportType?: string; isPublic?: boolean }
  ): Promise<{ templates: ReportTemplate[]; total: number }> {
    return { templates: [], total: 0 };
  }

  async findById(_tenantSlug: string, _id: string): Promise<ReportTemplate | null> {
    return null;
  }

  async create(tenantSlug: string, userId: string, data: any): Promise<any> {
    return {
      id: '123e4567-e89b-12d3-a456-426614174000',
      ...data,
      tenantSlug,
      created_by: userId,
      created_at: new Date(),
    };
  }

  async update(_tenantSlug: string, id: string, _data: unknown): Promise<ReportTemplate> {
    return {
      id,
      name: 'Updated Template',
      report_type: 'test',
      created_by: 'test-user',
      created_at: new Date(),
    };
  }

  async delete(_tenantSlug: string, _id: string): Promise<void> {
    // Stub - no-op
  }
}

class ScheduledReportService {
  async list(_tenantSlug: string, _pagination: PaginationParams): Promise<{ schedules: ScheduledReport[]; total: number }> {
    return { schedules: [], total: 0 };
  }

  async findById(_tenantSlug: string, _id: string): Promise<ScheduledReport | null> {
    return null;
  }

  async getById(tenantSlug: string, id: string): Promise<ScheduledReport | null> {
    return this.findById(tenantSlug, id);
  }

  async create(_tenantSlug: string, userId: string, _data: unknown): Promise<ScheduledReport> {
    return {
      id: '123e4567-e89b-12d3-a456-426614174001',
      name: 'Test Schedule',
      template_id: 'template-123',
      created_by: userId,
      created_at: new Date(),
      is_active: true,
      parameters: {},
      output_format: 'json',
    };
  }

  async update(_tenantSlug: string, id: string, _data: unknown): Promise<ScheduledReport> {
    return {
      id,
      name: 'Updated Schedule',
      template_id: 'template-123',
      created_by: 'test-user',
      created_at: new Date(),
      is_active: true,
      parameters: {},
      output_format: 'json',
    };
  }

  async delete(_tenantSlug: string, _id: string): Promise<void> {
    // Stub - no-op
  }

  async updateLastRun(_tenantSlug: string, _id: string): Promise<void> {
    // Stub implementation
  }

  async getDueReports(_tenantSlug: string): Promise<ScheduledReport[]> {
    return [];
  }
}

class ReportExecutionService {
  async list(
    _tenantSlug: string,
    _pagination: PaginationParams,
    _filters?: { templateId?: string; status?: string }
  ): Promise<{ executions: ReportExecution[]; total: number }> {
    return { executions: [], total: 0 };
  }

  async findById(_tenantSlug: string, _id: string): Promise<ReportExecution | null> {
    return null;
  }

  async execute(
    _tenantSlug: string,
    userId: string,
    templateId: string,
    _options?: {
      outputFormat?: string;
      dateRangeStart?: Date;
      dateRangeEnd?: Date;
      filters?: Record<string, unknown>;
    }
  ): Promise<{ execution: ReportExecution; data?: unknown }> {
    return {
      execution: {
        id: '123e4567-e89b-12d3-a456-426614174002',
        template_id: templateId,
        status: 'completed',
        executed_by: userId,
        created_at: new Date(),
      },
      data: {},
    };
  }
}

class SavedReportService {
  async list(_tenantSlug: string, _userId: string): Promise<SavedReport[]> {
    return [];
  }

  async create(_tenantSlug: string, userId: string, _data: unknown): Promise<SavedReport> {
    return {
      id: '123e4567-e89b-12d3-a456-426614174003',
      name: 'Saved Report',
      report_type: 'test',
      user_id: userId,
      created_at: new Date(),
    };
  }

  async delete(_tenantSlug: string, _userId: string, _id: string): Promise<void> {
    // Stub - no-op
  }
}

class DashboardWidgetService {
  async list(_tenantSlug: string, _userId: string): Promise<DashboardWidget[]> {
    return [];
  }

  async create(_tenantSlug: string, userId: string, _data: unknown): Promise<DashboardWidget> {
    return {
      id: '123e4567-e89b-12d3-a456-426614174004',
      widget_type: 'chart',
      user_id: userId,
      created_at: new Date(),
    };
  }

  async update(_tenantSlug: string, userId: string, id: string, _data: unknown): Promise<DashboardWidget> {
    return {
      id,
      widget_type: 'chart',
      user_id: userId,
      created_at: new Date(),
    };
  }

  async delete(_tenantSlug: string, _userId: string, _id: string): Promise<void> {
    // Stub - no-op
  }
}

export const reportTemplateService = new ReportTemplateService();
export const scheduledReportService = new ScheduledReportService();
export const reportExecutionService = new ReportExecutionService();
export const savedReportService = new SavedReportService();
export const dashboardWidgetService = new DashboardWidgetService();
