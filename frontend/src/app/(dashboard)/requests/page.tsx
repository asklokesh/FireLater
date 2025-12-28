'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  ChevronDown,
  AlertCircle,
  Clock,
  MoreHorizontal,
  Loader2,
  Eye,
  CheckCircle,
  XCircle,
  Play,
  FileText,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuItem, DropdownMenuDivider } from '@/components/ui/dropdown-menu';
import {
  useServiceRequests,
  ServiceRequest,
  useStartServiceRequest,
  useCompleteServiceRequest,
  useCancelServiceRequest,
} from '@/hooks/useApi';

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  submitted: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Submitted' },
  pending_approval: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending Approval' },
  approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'Approved' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' },
  assigned: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Assigned' },
  in_progress: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'In Progress' },
  pending: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Pending' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Completed' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Cancelled' },
};

const priorityColors: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-800', label: 'Critical' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'High' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Medium' },
  low: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Low' },
};

export default function RequestsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useServiceRequests({
    page,
    limit: 20,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    priority: priorityFilter !== 'all' ? priorityFilter : undefined,
    search: searchQuery || undefined,
  });

  const requests = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 };

  const startMutation = useStartServiceRequest();
  const completeMutation = useCompleteServiceRequest();
  const cancelMutation = useCancelServiceRequest();

  const handleStart = async (requestId: string) => {
    try {
      await startMutation.mutateAsync(requestId);
      refetch();
    } catch (error) {
      console.error('Failed to start request:', error);
    }
  };

  const handleComplete = async (requestId: string) => {
    try {
      await completeMutation.mutateAsync({ id: requestId });
      refetch();
    } catch (error) {
      console.error('Failed to complete request:', error);
    }
  };

  const handleCancel = async (requestId: string, requestNumber: string) => {
    const reason = window.prompt(`Enter cancellation reason for ${requestNumber}:`);
    if (reason) {
      try {
        await cancelMutation.mutateAsync({ id: requestId, reason });
        refetch();
      } catch (error) {
        console.error('Failed to cancel request:', error);
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">Error loading service requests</h3>
        <p className="text-red-600">Please try refreshing the page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Requests</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage all service requests
          </p>
        </div>
        <div className="flex space-x-3">
          <Link href="/requests/approvals">
            <Button variant="outline">
              <CheckCircle className="h-4 w-4 mr-2" />
              Pending Approvals
            </Button>
          </Link>
          <Link href="/catalog">
            <Button>
              <FileText className="h-4 w-4 mr-2" />
              Service Catalog
            </Button>
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by request number or catalog item..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="submitted">Submitted</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Requests Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-500">Loading requests...</span>
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Request
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Catalog Item
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Requester
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requests.map((request: ServiceRequest) => {
                  const priority = request.priority || 'medium';
                  const status = request.status || 'submitted';
                  const priorityStyle = priorityColors[priority] || priorityColors.medium;
                  const statusStyle = statusColors[status] || statusColors.submitted;

                  return (
                    <tr key={request.id} className="hover:bg-gray-50">
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
                            {request.notes && (
                              <p className="text-xs text-gray-500 mt-1 truncate max-w-xs">
                                {request.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm text-gray-900">{request.catalog_item_name}</p>
                          {request.catalog_item_category && (
                            <p className="text-xs text-gray-500">{request.catalog_item_category}</p>
                          )}
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
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                        >
                          {statusStyle.label}
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
                          {formatDate(request.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <DropdownMenu
                          trigger={
                            <button className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                              <MoreHorizontal className="h-5 w-5" />
                            </button>
                          }
                        >
                          <DropdownMenuItem onClick={() => router.push(`/requests/${request.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuDivider />
                          {(request.status === 'approved' || request.status === 'assigned') && (
                            <DropdownMenuItem onClick={() => handleStart(request.id)}>
                              <Play className="h-4 w-4 mr-2" />
                              Start Fulfillment
                            </DropdownMenuItem>
                          )}
                          {request.status === 'in_progress' && (
                            <DropdownMenuItem onClick={() => handleComplete(request.id)}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Mark Complete
                            </DropdownMenuItem>
                          )}
                          {!['completed', 'cancelled', 'rejected'].includes(request.status) && (
                            <>
                              <DropdownMenuDivider />
                              <DropdownMenuItem
                                variant="danger"
                                onClick={() => handleCancel(request.id, request.request_number)}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Cancel Request
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {requests.length === 0 && (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No requests found</h3>
                <p className="text-gray-500 mb-4">Try adjusting your search or filters</p>
                <Link href="/catalog">
                  <Button>Browse Service Catalog</Button>
                </Link>
              </div>
            )}

            {/* Pagination */}
            {requests.length > 0 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {requests.length} of {pagination.total} requests
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
    </div>
  );
}
