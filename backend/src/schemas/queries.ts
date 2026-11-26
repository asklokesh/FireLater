import { z } from 'zod';

/**
 * Query-string schemas for list/report GET routes that read specific filters.
 * All keys are optional and unknown keys pass through; empty values (`?x=`)
 * are treated as "not provided".
 */
const empty = (v: unknown) => (v === '' ? undefined : v);
const int = (min: number, max: number) => z.preprocess(empty, z.coerce.number().int().min(min).max(max).optional());
const str = (max = 200) => z.preprocess(empty, z.string().max(max).optional());
const uuid = () => z.preprocess(empty, z.string().uuid().optional());
const flag = () => z.preprocess(empty, z.enum(['true', 'false', '1', '0']).optional());
const date = () => str(64);

const paging = { page: int(1, 1_000_000), per_page: int(1, 1000), limit: int(1, 100_000), offset: int(0, 10_000_000) };
const obj = <T extends z.ZodRawShape>(shape: T) => z.object({ ...paging, ...shape }).passthrough();

export const changesFilterQuerySchema = obj({
  status: str(50), type: str(50), application_id: uuid(), requester_id: uuid(), implementer_id: uuid(),
  risk_level: str(50), search: str(1000), q: str(1000),
});
export const changeWindowsQuerySchema = obj({ type: str(50), status: str(50) });
export const upcomingDaysQuerySchema = obj({ days: int(1, 3650) });
export const dashboardQuerySchema = obj({ days: int(1, 3650), months: int(1, 120) });
export const emailLogsQuerySchema = obj({ configId: uuid(), action: str(100), success: flag() });
export const emergencyChangesQuerySchema = obj({ post_review_status: str(50) });
export const knowledgeFilterQuerySchema = obj({
  category: str(100), status: str(50), type: str(50), visibility: str(50), q: str(1000), search: str(1000),
});
export const oncallSchedulesQuerySchema = obj({ group_id: uuid(), is_active: flag() });
export const oncallShiftsQuerySchema = obj({ start_date: date(), end_date: date() });
export const oncallIcalQuerySchema = obj({ from: date(), to: date(), user_id: uuid() });
export const shiftSwapsQuerySchema = obj({
  schedule_id: uuid(), status: str(50), requester_id: uuid(), offered_to_user_id: uuid(),
  from_date: date(), to_date: date(),
});
export const shiftSwapStatsQuerySchema = obj({ from_date: date(), to_date: date() });
export const whoIsOnCallQuerySchema = obj({ schedule_id: uuid(), application_id: uuid() });
export const reportExecutionsQuerySchema = obj({ template_id: uuid(), status: str(50) });
export const reportTemplatesQuerySchema = obj({ report_type: str(100), is_public: flag() });
export const slaConfigQuerySchema = obj({ entityType: z.preprocess(empty, z.enum(['issue', 'problem']).optional()) });
export const slaPoliciesQuerySchema = obj({ entityType: str(50), isActive: flag() });
export const slaStatsQuerySchema = obj({ startDate: date(), endDate: date(), entityType: str(50) });
export const usersQuerySchema = obj({ status: str(50), search: str(1000), q: str(1000) });
export const vendorsQuerySchema = obj({ riskTier: str(50), isActive: flag() });
export const workflowLogsQuerySchema = obj({ ruleId: uuid(), entityType: str(100), entityId: str(100) });
export const workflowRulesQuerySchema = obj({ entityType: str(100), triggerType: str(100), isActive: flag() });
export const wsQuerySchema = obj({ token: str(4096) });
