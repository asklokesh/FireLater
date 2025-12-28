'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  AlertCircle,
  Clock,
  Loader2,
  Eye,
  CheckCircle,
  XCircle,
  FileText,
  User,
  ChevronLeft,
  MessageSquare,
  Forward,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useServiceRequests,
  ServiceRequest,
  useApproveRequest,
  useRejectRequest,
  useDelegateApproval,
  useUsers,
} from '@/hooks/useApi';

const priorityColors: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-800', label: 'Critical' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'High' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Medium' },
  low: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Low' },
};

interface ApprovalModalProps {
  request: ServiceRequest | null;
  action: 'approve' | 'reject' | null;
  onClose: () => void;
  onSubmit: (comments: string) => void;
  isLoading: boolean;
}

function ApprovalModal({ request, action, onClose, onSubmit, isLoading }: ApprovalModalProps) {
  const [comments, setComments] = useState('');

  if (!request || !action) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(comments);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {action === 'approve' ? 'Approve Request' : 'Reject Request'}
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            {action === 'approve'
              ? `Are you sure you want to approve ${request.request_number}?`
              : `Are you sure you want to reject ${request.request_number}?`}
          </p>

          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-gray-900">{request.catalog_item_name}</p>
            <p className="text-xs text-gray-500 mt-1">Requested by: {request.requester_name}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comments {action === 'reject' && <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={action === 'approve' ? 'Optional approval comments...' : 'Please provide a reason for rejection...'}
                required={action === 'reject'}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={action === 'approve' ? 'primary' : 'danger'}
                disabled={isLoading || (action === 'reject' && !comments.trim())}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : action === 'approve' ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

interface DelegationModalProps {
  request: ServiceRequest | null;
  onClose: () => void;
  onSubmit: (delegateTo: string, comments: string) => void;
  isLoading: boolean;
}

function DelegationModal({ request, onClose, onSubmit, isLoading }: DelegationModalProps) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [comments, setComments] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const { data: usersData } = useUsers({ search: userSearch, limit: 10 });
  const users = usersData?.data ?? [];

  if (!request) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUserId) {
      onSubmit(selectedUserId, comments);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Delegate Approval
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Delegate the approval of {request.request_number} to another user
          </p>

          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-gray-900">{request.catalog_item_name}</p>
            <p className="text-xs text-gray-500 mt-1">Requested by: {request.requester_name}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Delegate to <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Search for a user..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              />
              {users.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md">
                  {users.map((user: { id: string; name: string; email: string }) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(user.id);
                        setUserSearch(user.name);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center ${
                        selectedUserId === user.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 mr-2">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comments
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Optional comments for the delegate..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !selectedUserId}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Delegating...
                  </>
                ) : (
                  <>
                    <Forward className="h-4 w-4 mr-2" />
                    Delegate
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function PendingApprovalsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [delegationRequest, setDelegationRequest] = useState<ServiceRequest | null>(null);

  const { data, isLoading, error, refetch } = useServiceRequests({
    page,
    limit: 20,
    status: 'pending_approval',
    search: searchQuery || undefined,
  });

  const requests = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 };

  const approveMutation = useApproveRequest();
  const rejectMutation = useRejectRequest();
  const delegateMutation = useDelegateApproval();

  const handleOpenModal = (request: ServiceRequest, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setActionType(action);
  };

  const handleCloseModal = () => {
    setSelectedRequest(null);
    setActionType(null);
  };

  const handleSubmitApproval = async (comments: string) => {
    if (!selectedRequest || !actionType) return;

    try {
      // Note: In a real implementation, we'd need to get the actual approval ID
      // For now, using request.id as a placeholder
      const approvalId = selectedRequest.id; // This should be the actual approval record ID

      if (actionType === 'approve') {
        await approveMutation.mutateAsync({
          requestId: selectedRequest.id,
          approvalId,
          comments: comments || undefined,
        });
      } else {
        await rejectMutation.mutateAsync({
          requestId: selectedRequest.id,
          approvalId,
          comments,
        });
      }
      handleCloseModal();
      refetch();
    } catch (error) {
      console.error(`Failed to ${actionType} request:`, error);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === requests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(requests.map((r: ServiceRequest) => r.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;

    const confirmMessage = `Are you sure you want to approve ${selectedIds.size} request(s)?`;
    if (!window.confirm(confirmMessage)) return;

    for (const id of selectedIds) {
      try {
        await approveMutation.mutateAsync({
          requestId: id,
          approvalId: id, // Placeholder
          comments: 'Bulk approved',
        });
      } catch (error) {
        console.error(`Failed to approve request ${id}:`, error);
      }
    }
    setSelectedIds(new Set());
    refetch();
  };

  const handleDelegateSubmit = async (delegateTo: string, comments: string) => {
    if (!delegationRequest) return;

    try {
      // Note: In a real implementation, we'd need to get the actual approval ID
      const approvalId = delegationRequest.id;

      await delegateMutation.mutateAsync({
        requestId: delegationRequest.id,
        approvalId,
        delegateTo,
        comments: comments || undefined,
      });
      setDelegationRequest(null);
      refetch();
    } catch (error) {
      console.error('Failed to delegate approval:', error);
    }
  };

  const getWaitingTime = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));

    if (diffHours < 1) return 'Less than an hour';
    if (diffHours < 24) return `${diffHours}h`;
    const days = Math.floor(diffHours / 24);
    return `${days}d ${diffHours % 24}h`;
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">Error loading pending approvals</h3>
        <p className="text-red-600">Please try refreshing the page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/requests">
            <Button variant="ghost" size="sm">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Requests
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>
            <p className="mt-1 text-sm text-gray-500">
              Review and approve service requests awaiting your decision
            </p>
          </div>
        </div>
        {selectedIds.size > 0 && (
          <Button onClick={handleBulkApprove}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Approve Selected ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search pending approvals..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-xl font-semibold text-gray-900">{pagination.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500">Critical/High Priority</p>
              <p className="text-xl font-semibold text-gray-900">
                {requests.filter((r: ServiceRequest) => r.priority === 'critical' || r.priority === 'high').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500">Selected</p>
              <p className="text-xl font-semibold text-gray-900">{selectedIds.size}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Approvals Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">Loading pending approvals...</span>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === requests.length && requests.length > 0}
                      onChange={handleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Request
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Requester
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Waiting
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requests.map((request: ServiceRequest) => {
                  const priority = request.priority || 'medium';
                  const priorityStyle = priorityColors[priority] || priorityColors.medium;
                  const isSelected = selectedIds.has(request.id);

                  return (
                    <tr key={request.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectOne(request.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start">
                          <FileText className="h-5 w-5 mr-3 mt-0.5 text-gray-400" />
                          <div>
                            <Link
                              href={`/requests/${request.id}`}
                              className="text-sm font-medium text-blue-600 hover:text-blue-800"
                            >
                              {request.request_number}
                            </Link>
                            <p className="text-sm text-gray-900 mt-1">{request.catalog_item_name}</p>
                            {request.notes && (
                              <p className="text-xs text-gray-500 mt-1 flex items-center">
                                <MessageSquare className="h-3 w-3 mr-1" />
                                {request.notes.substring(0, 50)}...
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityStyle.bg} ${priorityStyle.text}`}
                        >
                          {priorityStyle.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                            {request.requester_name?.charAt(0) || <User className="h-4 w-4" />}
                          </div>
                          <div className="ml-2">
                            <p className="text-sm text-gray-900">{request.requester_name || 'Unknown'}</p>
                            {request.requested_for_name && request.requested_for_name !== request.requester_name && (
                              <p className="text-xs text-gray-500">For: {request.requested_for_name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-500">
                          <Clock className="h-4 w-4 mr-1" />
                          {getWaitingTime(request.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => router.push(`/requests/${request.id}`)}
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDelegationRequest(request)}
                            title="Delegate approval"
                          >
                            <Forward className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleOpenModal(request, 'approve')}
                            title="Approve"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => handleOpenModal(request, 'reject')}
                            title="Reject"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {requests.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">All caught up!</h3>
                <p className="text-gray-500">No pending approvals at this time</p>
              </div>
            )}

            {/* Pagination */}
            {requests.length > 0 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {requests.length} of {pagination.total} pending approvals
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Approval Modal */}
      <ApprovalModal
        request={selectedRequest}
        action={actionType}
        onClose={handleCloseModal}
        onSubmit={handleSubmitApproval}
        isLoading={approveMutation.isPending || rejectMutation.isPending}
      />

      {/* Delegation Modal */}
      <DelegationModal
        request={delegationRequest}
        onClose={() => setDelegationRequest(null)}
        onSubmit={handleDelegateSubmit}
        isLoading={delegateMutation.isPending}
      />
    </div>
  );
}
