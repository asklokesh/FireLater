'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Filter,
  ChevronDown,
  User,
  Mail,
  Shield,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usersApi } from '@/lib/api';

interface UserData {
  id: string;
  name: string;
  email: string;
  roles?: string[];
  status: string;
  last_login_at?: string | null;
  created_at: string;
}

const roleColors: Record<string, { bg: string; text: string; label: string }> = {
  admin: { bg: 'bg-error-subtle', text: 'text-error', label: 'Admin' },
  manager: { bg: 'bg-info-subtle', text: 'text-info', label: 'Manager' },
  itil_agent: { bg: 'bg-info-subtle', text: 'text-foreground', label: 'ITIL Agent' },
  user: { bg: 'bg-background', text: 'text-foreground', label: 'User' },
};

const statusColors: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  active: { bg: 'bg-success-subtle', text: 'text-success', icon: CheckCircle },
  inactive: { bg: 'bg-background', text: 'text-foreground', icon: XCircle },
  pending: { bg: 'bg-warning-subtle', text: 'text-warning', icon: Clock },
};

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [users, setUsers] = useState<UserData[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 20;

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params: Record<string, string | number> = {
        page,
        limit,
      };
      if (searchQuery) params.search = searchQuery;
      if (statusFilter !== 'all') params.status = statusFilter;

      const response = await usersApi.list(params);
      setUsers(response.data || []);
      setTotal(response.pagination?.total || 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load users';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [page, searchQuery, statusFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Filter by role on frontend since API may not support it
  const filteredUsers = users.filter((user) => {
    if (roleFilter === 'all') return true;
    const userRole = user.roles?.[0] || 'user';
    return userRole === roleFilter;
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeCount = users.filter((u) => u.status === 'active').length;
  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const adminCount = users.filter((u) => u.roles?.includes('admin')).length;

  if (isLoading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 p-4 text-sm text-error bg-error-subtle rounded-lg">
          <XCircle className="h-4 w-4" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-error hover:text-error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted">
            Manage user accounts and permissions
          </p>
        </div>
        <Link href="/admin/users/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-info-subtle flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">Total Users</p>
              <p className="text-2xl font-semibold text-foreground">{total}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-success-subtle flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">Active</p>
              <p className="text-2xl font-semibold text-foreground">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-warning-subtle flex items-center justify-center">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">Pending</p>
              <p className="text-2xl font-semibold text-foreground">{pendingCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-surface rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-error-subtle flex items-center justify-center">
              <Shield className="h-5 w-5 text-error" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-muted">Admins</p>
              <p className="text-2xl font-semibold text-foreground">{adminCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-surface rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="itil_agent">ITIL Agent</option>
                <option value="user">User</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-border-strong rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-surface rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-background">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                Primary Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                All Roles
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                Last Login
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-border">
            {filteredUsers.map((user) => {
              const userRole = user.roles?.[0] || 'user';
              const StatusIcon = statusColors[user.status]?.icon || Clock;
              const roleConfig = roleColors[userRole] || roleColors.user;
              const statusConfig = statusColors[user.status] || statusColors.pending;
              return (
                <tr key={user.id} className="hover:bg-surface-hover">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center text-sm font-medium text-secondary">
                        {user.name?.charAt(0) || '?'}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-foreground">{user.name}</div>
                        <div className="text-sm text-muted flex items-center">
                          <Mail className="h-3 w-3 mr-1" />
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleConfig.bg} ${roleConfig.text}`}
                    >
                      {roleConfig.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                    {user.roles?.join(', ') || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
                    >
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {user.status?.charAt(0).toUpperCase() + user.status?.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                    {formatDate(user.last_login_at || null)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button className="text-muted hover:text-secondary">
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <User className="h-12 w-12 text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No users found</h3>
            <p className="text-muted">Try adjusting your search or filters</p>
          </div>
        )}

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div className="text-sm text-muted">
            Showing {filteredUsers.length} of {total} users
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * limit >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
