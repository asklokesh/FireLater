import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

// ============================================
// TYPES
// ============================================

export interface SodPolicy {
  id: string;
  name: string;
  description?: string;
  conflicting_role_a: string;
  conflicting_role_b: string;
  entity_type: string;
  is_active: boolean;
}

export interface SodEvaluationResult {
  allowed: boolean;
  deniedByPolicy?: string;
  policyId?: string;
}

export interface EvaluateParams {
  actorId: string;
  actorRoles: string[];       // roles the actor already holds on this entity (e.g. ['requester'])
  attemptedRole: string;       // role they're trying to take (e.g. 'approver')
  entityType: string;
  entityId: string;
  action: string;
}

export interface RecordEvaluationParams {
  policyId: string | null;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  decision: 'allow' | 'deny';
  matchedRule?: string;
}

// ============================================
// SOD SERVICE
// ============================================

export class SodService {
  /**
   * Evaluate whether an actor can take on attemptedRole for the given entity.
   *
   * Loads all active SoD policies for the entity_type and checks whether any
   * policy forbids the combination of (actorRoles ∪ {attemptedRole}).
   *
   * Specifically: a conflict occurs when the actor already holds role_a and is
   * attempting to take role_b (or vice-versa) on the same entity.
   */
  async evaluate(tenantSlug: string, params: EvaluateParams): Promise<SodEvaluationResult> {
    const { actorId, actorRoles, attemptedRole, entityType, entityId, action } = params;
    const schema = tenantService.getSchemaName(tenantSlug);

    // Load active policies that match this entity type
    const policiesResult = await pool.query<{
      id: string;
      name: string;
      conflicting_role_a: string;
      conflicting_role_b: string;
    }>(
      `SELECT id, name, conflicting_role_a, conflicting_role_b
       FROM ${schema}.sod_policies
       WHERE entity_type = $1 AND is_active = true`,
      [entityType]
    );

    // Check each policy for a conflict
    for (const policy of policiesResult.rows) {
      const { id: policyId, name: policyName, conflicting_role_a, conflicting_role_b } = policy;

      // Conflict: actor holds role_a and attempts role_b, or holds role_b and attempts role_a
      const conflictsA =
        actorRoles.includes(conflicting_role_a) && attemptedRole === conflicting_role_b;
      const conflictsB =
        actorRoles.includes(conflicting_role_b) && attemptedRole === conflicting_role_a;

      if (conflictsA || conflictsB) {
        const matchedRule = `${conflicting_role_a}≠${conflicting_role_b}`;

        logger.warn(
          { tenantSlug, actorId, entityType, entityId, action, policyId, policyName },
          'SoD violation detected'
        );

        await this.recordEvaluation(tenantSlug, {
          policyId,
          actorId,
          entityType,
          entityId,
          action,
          decision: 'deny',
          matchedRule,
        });

        return {
          allowed: false,
          deniedByPolicy: policyName,
          policyId,
        };
      }
    }

    // No conflict found
    await this.recordEvaluation(tenantSlug, {
      policyId: null,
      actorId,
      entityType,
      entityId,
      action,
      decision: 'allow',
    });

    return { allowed: true };
  }

  /**
   * Persist an evaluation record to sod_evaluations for audit purposes.
   */
  async recordEvaluation(tenantSlug: string, params: RecordEvaluationParams): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const { policyId, actorId, entityType, entityId, action, decision, matchedRule } = params;

    try {
      await pool.query(
        `INSERT INTO ${schema}.sod_evaluations
           (policy_id, actor_id, entity_type, entity_id, action, decision, matched_rule)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [policyId ?? null, actorId, entityType, entityId, action, decision, matchedRule ?? null]
      );
    } catch (err) {
      // Log but don't throw — audit recording should never block the primary flow
      logger.error({ err, tenantSlug, actorId, entityId }, 'Failed to record SoD evaluation');
    }
  }

  // ============================================
  // POLICY CRUD
  // ============================================

  async listPolicies(tenantSlug: string): Promise<SodPolicy[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query<SodPolicy>(
      `SELECT id, name, description, conflicting_role_a, conflicting_role_b, entity_type, is_active
       FROM ${schema}.sod_policies
       ORDER BY entity_type, name`
    );

    return result.rows;
  }

  async createPolicy(tenantSlug: string, data: Omit<SodPolicy, 'id'>): Promise<SodPolicy> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const { name, description, conflicting_role_a, conflicting_role_b, entity_type, is_active } =
      data;

    if (!name || !conflicting_role_a || !conflicting_role_b || !entity_type) {
      throw new BadRequestError(
        'name, conflicting_role_a, conflicting_role_b, and entity_type are required'
      );
    }

    const result = await pool.query<SodPolicy>(
      `INSERT INTO ${schema}.sod_policies
         (name, description, conflicting_role_a, conflicting_role_b, entity_type, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, description, conflicting_role_a, conflicting_role_b, entity_type, is_active`,
      [name, description ?? null, conflicting_role_a, conflicting_role_b, entity_type, is_active ?? true]
    );

    logger.info({ tenantSlug, policyId: result.rows[0].id }, 'SoD policy created');
    return result.rows[0];
  }

  async updatePolicy(
    tenantSlug: string,
    id: string,
    data: Partial<SodPolicy>
  ): Promise<SodPolicy> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Build dynamic SET clause
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const allowed: Array<keyof Omit<SodPolicy, 'id'>> = [
      'name',
      'description',
      'conflicting_role_a',
      'conflicting_role_b',
      'entity_type',
      'is_active',
    ];

    for (const key of allowed) {
      if (key in data) {
        fields.push(`${key} = $${idx}`);
        values.push(data[key]);
        idx++;
      }
    }

    if (fields.length === 0) {
      throw new BadRequestError('No updatable fields provided');
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query<SodPolicy>(
      `UPDATE ${schema}.sod_policies
       SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, name, description, conflicting_role_a, conflicting_role_b, entity_type, is_active`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('SodPolicy', id);
    }

    logger.info({ tenantSlug, policyId: id }, 'SoD policy updated');
    return result.rows[0];
  }

  async deletePolicy(tenantSlug: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `DELETE FROM ${schema}.sod_policies WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('SodPolicy', id);
    }

    logger.info({ tenantSlug, policyId: id }, 'SoD policy deleted');
  }
}

export const sodService = new SodService();
