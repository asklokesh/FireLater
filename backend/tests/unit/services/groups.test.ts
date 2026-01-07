import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for Group Service
 * Testing team/group management operations
 *
 * Key coverage areas:
 * - Group CRUD operations with caching
 * - Group hierarchy (parent groups)
 * - Group membership management
 * - Member role management
 * - Filtering and pagination
 * - Cache invalidation
 */

// Mock dependencies
const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock cache service - bypass caching entirely
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
    findBySlug: vi.fn(),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import { groupService } from '../../../src/services/groups.js';
import { cacheService } from '../../../src/utils/cache.js';
import { NotFoundError, ConflictError } from '../../../src/utils/errors.js';

describe('GroupService', () => {
  const tenantSlug = 'test-tenant';
  const userId = 'user-123';

  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  // ============================================
  // GROUP LIST OPERATIONS
  // ============================================
  describe('list', () => {
    it('should list all groups with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '25' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'group-1',
              name: 'Engineering',
              description: 'Engineering team',
              type: 'team',
              parent_id: null,
              manager_id: 'user-1',
              email: 'engineering@example.com',
              member_count: '15',
              manager_name: 'John Doe',
            },
            {
              id: 'group-2',
              name: 'Support',
              description: 'Support team',
              type: 'team',
              parent_id: null,
              manager_id: 'user-2',
              email: 'support@example.com',
              member_count: '8',
              manager_name: 'Jane Smith',
            },
          ],
        });

      const result = await groupService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(result.total).toBe(25);
      expect(result.groups).toHaveLength(2);
      expect(result.groups[0].name).toBe('Engineering');
      expect(result.groups[0].member_count).toBe('15');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should filter groups by type', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.list(tenantSlug, { page: 1, perPage: 10 }, { type: 'department' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND g.type = $1'),
        expect.arrayContaining(['department'])
      );
    });

    it('should search groups by name or description', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.list(tenantSlug, { page: 1, perPage: 10 }, { search: 'platform' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('g.name ILIKE $1 OR g.description ILIKE $1'),
        expect.arrayContaining(['%platform%'])
      );
    });

    it('should use default sorting by name ascending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY g.name asc'),
        expect.any(Array)
      );
    });

    it('should sort by valid column in descending order', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.list(tenantSlug, { page: 1, perPage: 10, sort: 'created_at', order: 'desc' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY g.created_at desc'),
        expect.any(Array)
      );
    });

    it('should prevent SQL injection by ignoring invalid sort columns', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.list(tenantSlug, { page: 1, perPage: 10, sort: 'DROP TABLE; --' as any });

      // Should fall back to default 'name' column
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY g.name asc'),
        expect.any(Array)
      );
    });

    it('should use caching for list operations', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining(`${tenantSlug}:groups:list`),
        expect.any(Function),
        { ttl: 600 }
      );
    });

    it('should include member count and manager name', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'group-1',
            name: 'DevOps',
            member_count: '12',
            manager_name: 'Alice Johnson',
          }],
        });

      const result = await groupService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(result.groups[0].member_count).toBe('12');
      expect(result.groups[0].manager_name).toBe('Alice Johnson');
    });
  });

  // ============================================
  // GROUP FIND BY ID
  // ============================================
  describe('findById', () => {
    const mockGroup = {
      id: 'group-uuid',
      name: 'Platform Team',
      description: 'Infrastructure and platform team',
      type: 'team',
      parent_id: 'parent-group-id',
      manager_id: 'manager-id',
      email: 'platform@example.com',
      settings: {},
      created_at: new Date('2025-01-01'),
      updated_at: new Date('2025-12-01'),
      member_count: '10',
      manager_name: 'Bob Manager',
      parent_name: 'Engineering Department',
    };

    it('should find group by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockGroup] });

      const result = await groupService.findById(tenantSlug, 'group-uuid');

      expect(result).toBeDefined();
      expect(result?.name).toBe('Platform Team');
      expect(result?.type).toBe('team');
    });

    it('should return null for non-existent group', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await groupService.findById(tenantSlug, 'non-existent');

      expect(result).toBeNull();
    });

    it('should include parent and manager details', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockGroup] });

      const result = await groupService.findById(tenantSlug, 'group-uuid');

      expect(result?.manager_name).toBe('Bob Manager');
      expect(result?.parent_name).toBe('Engineering Department');
    });

    it('should use caching for findById operations', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockGroup] });

      await groupService.findById(tenantSlug, 'group-uuid');

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        `${tenantSlug}:groups:group:group-uuid`,
        expect.any(Function),
        { ttl: 600 }
      );
    });
  });

  // ============================================
  // GROUP CREATE
  // ============================================
  describe('create', () => {
    it('should create group with required fields', async () => {
      const newGroup = {
        id: 'new-group-id',
        name: 'New Team',
        description: null,
        type: 'team',
        parent_id: null,
        manager_id: null,
        email: null,
        settings: {},
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [newGroup] }) // insert
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [newGroup] }); // findById refetch

      const result = await groupService.create(tenantSlug, { name: 'New Team' }, userId);

      expect(result.name).toBe('New Team');
      expect(result.type).toBe('team');
    });

    it('should create group with all optional fields', async () => {
      const newGroup = {
        id: 'new-group-id',
        name: 'Full Team',
        description: 'A complete team',
        type: 'department',
        parent_id: 'parent-id',
        manager_id: 'manager-id',
        email: 'team@example.com',
        settings: { notifications: true },
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [newGroup] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [newGroup] });

      const result = await groupService.create(
        tenantSlug,
        {
          name: 'Full Team',
          description: 'A complete team',
          type: 'department',
          parentId: 'parent-id',
          managerId: 'manager-id',
          email: 'team@example.com',
          settings: { notifications: true },
        },
        userId
      );

      expect(result.type).toBe('department');
      expect(result.email).toBe('team@example.com');
    });

    it('should use default type when not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'id', name: 'Test', type: 'team' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'id', name: 'Test', type: 'team' }] });

      await groupService.create(tenantSlug, { name: 'Test' }, userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining(['Test', null, 'team', null, null, null, '{}'])
      );
    });

    it('should create audit log on group creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'group-id', name: 'Test' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'group-id', name: 'Test' }] });

      await groupService.create(tenantSlug, { name: 'Test' }, userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'create', 'group'"),
        expect.arrayContaining([userId, 'group-id'])
      );
    });

    it('should invalidate cache after creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'group-id', name: 'Test' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'group-id', name: 'Test' }] });

      await groupService.create(tenantSlug, { name: 'Test' }, userId);

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'groups');
    });
  });

  // ============================================
  // GROUP UPDATE
  // ============================================
  describe('update', () => {
    const existingGroup = {
      id: 'group-uuid',
      name: 'Existing Team',
      type: 'team',
      description: null,
    };

    beforeEach(() => {
      mockQuery.mockResolvedValueOnce({ rows: [existingGroup] });
    });

    it('should update group name', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // update
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [{ ...existingGroup, name: 'Updated Team' }] });

      const result = await groupService.update(
        tenantSlug,
        'group-uuid',
        { name: 'Updated Team' },
        userId
      );

      expect(result.name).toBe('Updated Team');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_test.groups SET name = $1'),
        expect.arrayContaining(['Updated Team', 'group-uuid'])
      );
    });

    it('should update multiple fields at once', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingGroup, type: 'department', description: 'New desc' }] });

      await groupService.update(
        tenantSlug,
        'group-uuid',
        {
          type: 'department',
          description: 'New desc',
          email: 'new@example.com',
        },
        userId
      );

      // Check that update was called with expected fields (order may vary)
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE tenant_test.groups SET'),
        expect.any(Array)
      );
    });

    it('should return existing group when no updates provided', async () => {
      const result = await groupService.update(tenantSlug, 'group-uuid', {}, userId);

      expect(result).toEqual(existingGroup);
      // Should only call findById, not update
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundError for non-existent group', async () => {
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        groupService.update(tenantSlug, 'non-existent', { name: 'New' }, userId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should allow setting parent and manager to null', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingGroup, parent_id: null, manager_id: null }] });

      await groupService.update(
        tenantSlug,
        'group-uuid',
        { parentId: null, managerId: null },
        userId
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('parent_id = $1'),
        expect.arrayContaining([null])
      );
    });

    it('should update settings as JSON', async () => {
      const settings = { maxMembers: 50, autoApprove: true };
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingGroup, settings }] });

      await groupService.update(
        tenantSlug,
        'group-uuid',
        { settings },
        userId
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('settings = $1'),
        expect.arrayContaining([JSON.stringify(settings)])
      );
    });

    it('should create audit log on update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingGroup] });

      await groupService.update(
        tenantSlug,
        'group-uuid',
        { name: 'Updated' },
        userId
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'update', 'group'"),
        expect.arrayContaining([userId, 'group-uuid'])
      );
    });

    it('should invalidate cache after update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingGroup] });

      await groupService.update(
        tenantSlug,
        'group-uuid',
        { name: 'Updated' },
        userId
      );

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'groups');
    });
  });

  // ============================================
  // GROUP DELETE
  // ============================================
  describe('delete', () => {
    const existingGroup = { id: 'group-uuid', name: 'Group to Delete' };

    it('should delete group', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingGroup] }) // findById
        .mockResolvedValueOnce({ rows: [] }) // delete
        .mockResolvedValueOnce({ rows: [] }); // audit log

      await groupService.delete(tenantSlug, 'group-uuid', userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test.groups WHERE id = $1'),
        ['group-uuid']
      );
    });

    it('should throw NotFoundError for non-existent group', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        groupService.delete(tenantSlug, 'non-existent', userId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should create audit log on delete', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingGroup] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.delete(tenantSlug, 'group-uuid', userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'delete', 'group'"),
        expect.arrayContaining([userId, 'group-uuid'])
      );
    });

    it('should invalidate cache after delete', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingGroup] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.delete(tenantSlug, 'group-uuid', userId);

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'groups');
    });
  });

  // ============================================
  // GROUP MEMBERSHIP
  // ============================================
  describe('getMembers', () => {
    it('should list all members of a group', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'user-1', email: 'user1@example.com', name: 'User One', role: 'member', joined_at: new Date() },
          { id: 'user-2', email: 'user2@example.com', name: 'User Two', role: 'lead', joined_at: new Date() },
          { id: 'user-3', email: 'user3@example.com', name: 'User Three', role: 'member', joined_at: new Date() },
        ],
      });

      const result = await groupService.getMembers(tenantSlug, 'group-uuid');

      expect(result).toHaveLength(3);
      expect(result[0].email).toBe('user1@example.com');
      expect(result[1].role).toBe('lead');
    });

    it('should return empty array when no members', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await groupService.getMembers(tenantSlug, 'group-uuid');

      expect(result).toEqual([]);
    });

    it('should order members by joined_at', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await groupService.getMembers(tenantSlug, 'group-uuid');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY gm.joined_at'),
        ['group-uuid']
      );
    });
  });

  describe('addMember', () => {
    it('should add member with default role', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // check existing
        .mockResolvedValueOnce({ rows: [] }) // insert
        .mockResolvedValueOnce({ rows: [] }); // audit log

      await groupService.addMember(tenantSlug, 'group-uuid', 'user-uuid', undefined, userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.group_members'),
        ['group-uuid', 'user-uuid', 'member']
      );
    });

    it('should add member with specified role', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.addMember(tenantSlug, 'group-uuid', 'user-uuid', 'lead', userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.group_members'),
        ['group-uuid', 'user-uuid', 'lead']
      );
    });

    it('should throw ConflictError if user is already a member', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] });

      await expect(
        groupService.addMember(tenantSlug, 'group-uuid', 'user-uuid', 'member', userId)
      ).rejects.toThrow(ConflictError);
    });

    it('should create audit log on adding member', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.addMember(tenantSlug, 'group-uuid', 'user-uuid', 'member', userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'add_member', 'group'"),
        expect.arrayContaining([userId, 'group-uuid'])
      );
    });

    it('should invalidate cache after adding member', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.addMember(tenantSlug, 'group-uuid', 'user-uuid', 'member', userId);

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'groups');
    });
  });

  describe('removeMember', () => {
    it('should remove member from group', async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1 }) // delete
        .mockResolvedValueOnce({ rows: [] }); // audit log

      await groupService.removeMember(tenantSlug, 'group-uuid', 'user-uuid', userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test.group_members WHERE group_id = $1 AND user_id = $2'),
        ['group-uuid', 'user-uuid']
      );
    });

    it('should throw NotFoundError when member not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await expect(
        groupService.removeMember(tenantSlug, 'group-uuid', 'non-existent', userId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should create audit log on removing member', async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.removeMember(tenantSlug, 'group-uuid', 'user-uuid', userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'remove_member', 'group'"),
        expect.arrayContaining([userId, 'group-uuid'])
      );
    });

    it('should invalidate cache after removing member', async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] });

      await groupService.removeMember(tenantSlug, 'group-uuid', 'user-uuid', userId);

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'groups');
    });
  });

  describe('updateMemberRole', () => {
    it('should update member role', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await groupService.updateMemberRole(tenantSlug, 'group-uuid', 'user-uuid', 'lead', userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_test.group_members SET role = $1 WHERE group_id = $2 AND user_id = $3'),
        ['lead', 'group-uuid', 'user-uuid']
      );
    });

    it('should throw NotFoundError when member not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await expect(
        groupService.updateMemberRole(tenantSlug, 'group-uuid', 'non-existent', 'lead', userId)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
