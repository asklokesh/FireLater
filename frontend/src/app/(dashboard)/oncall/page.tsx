'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import {
  Plus,
  Phone,
  Clock,
  User,
  Calendar,
  AlertTriangle,
  ChevronRight,
  Shield,
  Loader2,
  ArrowRightLeft,
  X,
  Check,
  XCircle,
  Send,
  Eye,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useOncallSchedules,
  useWhoIsOnCall,
  useIssues,
  useMySwapRequests,
  useAvailableSwaps,
  useCreateSwapRequest,
  useCancelSwapRequest,
  useAcceptSwap,
  useRejectSwap,
  useUsers,
  ShiftSwapRequest,
  ShiftSwapStatus,
} from '@/hooks/useApi';

// Local interfaces for type safety
interface OncallUser {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface OncallSchedule {
  id: string;
  name: string;
  description?: string;
  timezone?: string;
  rotation_period_days?: number;
  current_on_call?: OncallUser;
  next_on_call?: OncallUser;
  rotation_end?: string;
  escalation_policy?: {
    id: string;
    name: string;
  };
  is_active?: boolean;
}

interface Issue {
  id: string;
  number: string;
  title: string;
  priority: string;
  state: string;
  assigned_to?: {
    id: string;
    name: string;
  };
  created_at: string;
  acknowledged_at?: string;
}

interface OncallEntry {
  schedule_id: string;
  schedule_name: string;
  user?: OncallUser;
  start_time?: string;
  end_time?: string;
}

const severityColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-primary-subtle', text: 'text-primary' },
  medium: { bg: 'bg-warning-subtle', text: 'text-warning' },
  high: { bg: 'bg-warning-subtle', text: 'text-warning' },
  critical: { bg: 'bg-error-subtle', text: 'text-error' },
};

const swapStatusColors: Record<ShiftSwapStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-warning-subtle', text: 'text-warning', label: 'Pending' },
  accepted: { bg: 'bg-success-subtle', text: 'text-success', label: 'Accepted' },
  rejected: { bg: 'bg-error-subtle', text: 'text-error', label: 'Rejected' },
  cancelled: { bg: 'bg-background', text: 'text-foreground', label: 'Cancelled' },
  expired: { bg: 'bg-background', text: 'text-secondary', label: 'Expired' },
  completed: { bg: 'bg-primary-subtle', text: 'text-primary', label: 'Completed' },
};

// Create Swap Request Dialog
function CreateSwapDialog({
  isOpen,
  onClose,
  schedules,
  users,
}: {
  isOpen: boolean;
  onClose: () => void;
  schedules: OncallSchedule[];
  users: { id: string; name: string; email?: string }[];
}) {
  const [formData, setFormData] = useState({
    scheduleId: '',
    originalStart: '',
    originalEnd: '',
    offeredToUserId: '',
    reason: '',
    expiresAt: '',
    offerToSpecific: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createSwap = useCreateSwapRequest();

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.scheduleId) {
      newErrors.scheduleId = 'Please select a schedule';
    }
    if (!formData.originalStart) {
      newErrors.originalStart = 'Start date/time is required';
    }
    if (!formData.originalEnd) {
      newErrors.originalEnd = 'End date/time is required';
    }
    if (formData.originalStart && formData.originalEnd) {
      const start = new Date(formData.originalStart);
      const end = new Date(formData.originalEnd);
      if (end <= start) {
        newErrors.originalEnd = 'End must be after start';
      }
    }
    if (formData.offerToSpecific && !formData.offeredToUserId) {
      newErrors.offeredToUserId = 'Please select a user';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      await createSwap.mutateAsync({
        scheduleId: formData.scheduleId,
        originalStart: new Date(formData.originalStart).toISOString(),
        originalEnd: new Date(formData.originalEnd).toISOString(),
        offeredToUserId: formData.offerToSpecific ? formData.offeredToUserId : undefined,
        reason: formData.reason || undefined,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : undefined,
      });
      onClose();
      setFormData({
        scheduleId: '',
        originalStart: '',
        originalEnd: '',
        offeredToUserId: '',
        reason: '',
        expiresAt: '',
        offerToSpecific: false,
      });
    } catch {
      // Error handled by mutation
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-xl shadow-sm w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Request Shift Swap</h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-hover rounded">
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Schedule <span className="text-error">*</span>
            </label>
            <select
              value={formData.scheduleId}
              onChange={(e) => setFormData({ ...formData, scheduleId: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
                errors.scheduleId ? 'border-error' : 'border-border-strong'
              }`}
            >
              <option value="">Select a schedule</option>
              {schedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {schedule.name}
                </option>
              ))}
            </select>
            {errors.scheduleId && <p className="mt-1 text-sm text-error">{errors.scheduleId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                Shift Start <span className="text-error">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.originalStart}
                onChange={(e) => setFormData({ ...formData, originalStart: e.target.value })}
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
                  errors.originalStart ? 'border-error' : 'border-border-strong'
                }`}
              />
              {errors.originalStart && <p className="mt-1 text-sm text-error">{errors.originalStart}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                Shift End <span className="text-error">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.originalEnd}
                onChange={(e) => setFormData({ ...formData, originalEnd: e.target.value })}
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
                  errors.originalEnd ? 'border-error' : 'border-border-strong'
                }`}
              />
              {errors.originalEnd && <p className="mt-1 text-sm text-error">{errors.originalEnd}</p>}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="offerToSpecific"
              checked={formData.offerToSpecific}
              onChange={(e) => setFormData({ ...formData, offerToSpecific: e.target.checked })}
              className="h-4 w-4 text-primary focus:ring-primary/20 border-border rounded"
            />
            <label htmlFor="offerToSpecific" className="text-sm text-secondary">
              Offer to a specific person
            </label>
          </div>

          {formData.offerToSpecific && (
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">
                Offer To <span className="text-error">*</span>
              </label>
              <select
                value={formData.offeredToUserId}
                onChange={(e) => setFormData({ ...formData, offeredToUserId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${
                  errors.offeredToUserId ? 'border-error' : 'border-border-strong'
                }`}
              >
                <option value="">Select a user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} {user.email ? `(${user.email})` : ''}
                  </option>
                ))}
              </select>
              {errors.offeredToUserId && <p className="mt-1 text-sm text-error">{errors.offeredToUserId}</p>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Reason</label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              rows={3}
              placeholder="Why do you need to swap this shift?"
              className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Request Expires At</label>
            <input
              type="datetime-local"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <p className="mt-1 text-xs text-muted">Leave empty for no expiration</p>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createSwap.isPending}>
              <Send className="h-4 w-4 mr-2" />
              Submit Request
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Swap Detail Dialog
function SwapDetailDialog({
  swap,
  isOpen,
  onClose,
  isMyRequest,
}: {
  swap: ShiftSwapRequest | null;
  isOpen: boolean;
  onClose: () => void;
  isMyRequest: boolean;
}) {
  const [acceptMessage, setAcceptMessage] = useState('');
  const [rejectMessage, setRejectMessage] = useState('');
  const [showAcceptForm, setShowAcceptForm] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);

  const cancelSwap = useCancelSwapRequest();
  const acceptSwap = useAcceptSwap();
  const rejectSwap = useRejectSwap();

  if (!isOpen || !swap) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleCancel = async () => {
    try {
      await cancelSwap.mutateAsync(swap.id);
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  const handleAccept = async () => {
    try {
      await acceptSwap.mutateAsync({ id: swap.id, message: acceptMessage || undefined });
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  const handleReject = async () => {
    try {
      await rejectSwap.mutateAsync({ id: swap.id, message: rejectMessage || undefined });
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  const status = swapStatusColors[swap.status];
  const canAcceptOrReject = !isMyRequest && swap.status === 'pending';
  const canCancel = isMyRequest && swap.status === 'pending';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-xl shadow-sm w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center space-x-3">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Swap Request {swap.swap_number}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-hover rounded">
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Status</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
              {status.label}
            </span>
          </div>

          {/* Schedule */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Schedule</span>
            <span className="text-sm font-medium text-foreground">{swap.schedule_name}</span>
          </div>

          {/* Shift Dates */}
          <div className="bg-surface-hover rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Shift Start</span>
              <span className="text-sm font-medium text-foreground">{formatDate(swap.original_start)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Shift End</span>
              <span className="text-sm font-medium text-foreground">{formatDate(swap.original_end)}</span>
            </div>
          </div>

          {/* Requester */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Requested By</span>
            <span className="text-sm font-medium text-foreground">{swap.requester_name}</span>
          </div>

          {/* Offered To */}
          {swap.offered_to_name && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Offered To</span>
              <span className="text-sm font-medium text-foreground">{swap.offered_to_name}</span>
            </div>
          )}

          {/* Accepter */}
          {swap.accepter_name && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Accepted By</span>
              <span className="text-sm font-medium text-success">{swap.accepter_name}</span>
            </div>
          )}

          {/* Reason */}
          {swap.reason && (
            <div>
              <span className="text-sm text-muted">Reason</span>
              <p className="mt-1 text-sm text-foreground bg-surface-hover rounded-lg p-2">{swap.reason}</p>
            </div>
          )}

          {/* Expires At */}
          {swap.expires_at && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Expires At</span>
              <span className="text-sm font-medium text-foreground">{formatDate(swap.expires_at)}</span>
            </div>
          )}

          {/* Timeline */}
          <div className="border-t border-border pt-4">
            <h4 className="text-sm font-medium text-foreground mb-3">Timeline</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center space-x-2 text-secondary">
                <Clock className="h-4 w-4" />
                <span>Created {formatDate(swap.created_at)}</span>
              </div>
              {swap.status === 'accepted' && swap.responded_at && (
                <div className="flex items-center space-x-2 text-success">
                  <Check className="h-4 w-4" />
                  <span>Accepted {formatDate(swap.responded_at)}</span>
                </div>
              )}
              {swap.status === 'rejected' && swap.responded_at && (
                <div className="flex items-center space-x-2 text-error">
                  <XCircle className="h-4 w-4" />
                  <span>Rejected {formatDate(swap.responded_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Accept Form */}
          {showAcceptForm && canAcceptOrReject && (
            <div className="border-t border-border pt-4 space-y-3">
              <label className="block text-sm font-medium text-secondary">Message (optional)</label>
              <textarea
                value={acceptMessage}
                onChange={(e) => setAcceptMessage(e.target.value)}
                rows={2}
                placeholder="Add a message..."
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm"
              />
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAcceptForm(false)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAccept}
                  isLoading={acceptSwap.isPending}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Confirm Accept
                </Button>
              </div>
            </div>
          )}

          {/* Reject Form */}
          {showRejectForm && canAcceptOrReject && (
            <div className="border-t border-border pt-4 space-y-3">
              <label className="block text-sm font-medium text-secondary">Reason for rejection (optional)</label>
              <textarea
                value={rejectMessage}
                onChange={(e) => setRejectMessage(e.target.value)}
                rows={2}
                placeholder="Add a reason..."
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm"
              />
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRejectForm(false)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleReject}
                  isLoading={rejectSwap.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Confirm Reject
                </Button>
              </div>
            </div>
          )}

          {/* Actions */}
          {!showAcceptForm && !showRejectForm && (
            <div className="flex justify-end space-x-3 pt-4 border-t border-border">
              {canCancel && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleCancel}
                  isLoading={cancelSwap.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Cancel Request
                </Button>
              )}
              {canAcceptOrReject && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowRejectForm(true)}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button type="button" onClick={() => setShowAcceptForm(true)}>
                    <Check className="h-4 w-4 mr-2" />
                    Accept
                  </Button>
                </>
              )}
              {!canCancel && !canAcceptOrReject && (
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Shift Swaps Tab Component
function ShiftSwapsTab({ schedules }: { schedules: OncallSchedule[] }) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedSwap, setSelectedSwap] = useState<ShiftSwapRequest | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [isMyRequestDetail, setIsMyRequestDetail] = useState(false);
  const [activeSection, setActiveSection] = useState<'my-requests' | 'available'>('my-requests');

  const { data: myRequestsData, isLoading: myRequestsLoading } = useMySwapRequests();
  const { data: availableData, isLoading: availableLoading } = useAvailableSwaps();
  const { data: usersData } = useUsers();

  const myRequests: ShiftSwapRequest[] = myRequestsData?.data ?? [];
  const availableSwaps: ShiftSwapRequest[] = availableData?.data ?? [];
  const users = usersData?.data ?? [];

  const cancelSwap = useCancelSwapRequest();
  const acceptSwap = useAcceptSwap();
  const rejectSwap = useRejectSwap();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const openDetail = (swap: ShiftSwapRequest, isMyRequest: boolean) => {
    setSelectedSwap(swap);
    setIsMyRequestDetail(isMyRequest);
    setShowDetailDialog(true);
  };

  const handleQuickCancel = async (id: string) => {
    if (confirm('Are you sure you want to cancel this swap request?')) {
      await cancelSwap.mutateAsync(id);
    }
  };

  const handleQuickAccept = async (id: string) => {
    await acceptSwap.mutateAsync({ id });
  };

  const handleQuickReject = async (id: string) => {
    await rejectSwap.mutateAsync({ id });
  };

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveSection('my-requests')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              activeSection === 'my-requests'
                ? 'bg-primary-subtle text-primary'
                : 'text-secondary hover:bg-surface-hover'
            }`}
          >
            My Requests
            {myRequests.length > 0 && (
              <span className="ml-2 bg-primary text-white px-2 py-0.5 rounded-full text-xs">
                {myRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveSection('available')}
            className={`px-4 py-2 text-sm font-medium rounded-md ${
              activeSection === 'available'
                ? 'bg-primary-subtle text-primary'
                : 'text-secondary hover:bg-surface-hover'
            }`}
          >
            Available Swaps
            {availableSwaps.length > 0 && (
              <span className="ml-2 bg-success text-white px-2 py-0.5 rounded-full text-xs">
                {availableSwaps.length}
              </span>
            )}
          </button>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Request Swap
        </Button>
      </div>

      {/* My Swap Requests Section */}
      {activeSection === 'my-requests' && (
        <div className="bg-surface rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">My Swap Requests</h2>
            <p className="mt-1 text-sm text-muted">Swap requests you have created</p>
          </div>
          {myRequestsLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted">Loading your requests...</span>
            </div>
          ) : myRequests.length > 0 ? (
            <ul className="divide-y divide-border">
              {myRequests.map((swap) => {
                const status = swapStatusColors[swap.status];
                return (
                  <li key={swap.id} className="px-6 py-4 hover:bg-surface-hover">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                            {status.label}
                          </span>
                          <span className="text-sm font-medium text-foreground">{swap.schedule_name}</span>
                          <span className="text-xs text-muted">{swap.swap_number}</span>
                        </div>
                        <div className="mt-1 flex items-center space-x-4 text-sm text-secondary">
                          <span className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1" />
                            {formatDate(swap.original_start)} - {formatDate(swap.original_end)}
                          </span>
                          {swap.offered_to_name && (
                            <span className="flex items-center">
                              <User className="h-4 w-4 mr-1" />
                              Offered to: {swap.offered_to_name}
                            </span>
                          )}
                          {swap.accepter_name && (
                            <span className="flex items-center text-success">
                              <Check className="h-4 w-4 mr-1" />
                              Accepted by: {swap.accepter_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {swap.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleQuickCancel(swap.id)}
                            isLoading={cancelSwap.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDetail(swap, true)}
                        >
                          <Eye className="h-4 w-4 text-muted" />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-center py-12">
              <ArrowRightLeft className="h-12 w-12 text-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No swap requests</h3>
              <p className="text-muted mb-4">You have not created any swap requests yet</p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Request Swap
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Available Swaps Section */}
      {activeSection === 'available' && (
        <div className="bg-surface rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Available Swaps</h2>
            <p className="mt-1 text-sm text-muted">Swap requests you can accept</p>
          </div>
          {availableLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted">Loading available swaps...</span>
            </div>
          ) : availableSwaps.length > 0 ? (
            <ul className="divide-y divide-border">
              {availableSwaps.map((swap) => (
                <li key={swap.id} className="px-6 py-4 hover:bg-surface-hover">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-foreground">{swap.schedule_name}</span>
                        <span className="text-xs text-muted">{swap.swap_number}</span>
                      </div>
                      <div className="mt-1 flex items-center space-x-4 text-sm text-secondary">
                        <span className="flex items-center">
                          <User className="h-4 w-4 mr-1" />
                          {swap.requester_name}
                        </span>
                        <span className="flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          {formatDate(swap.original_start)} - {formatDate(swap.original_end)}
                        </span>
                        {swap.expires_at && (
                          <span className="flex items-center text-warning">
                            <Clock className="h-4 w-4 mr-1" />
                            Expires: {formatDate(swap.expires_at)}
                          </span>
                        )}
                      </div>
                      {swap.reason && (
                        <p className="mt-1 text-sm text-foreground italic">&quot;{swap.reason}&quot;</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickReject(swap.id)}
                        isLoading={rejectSwap.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-1 text-error" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleQuickAccept(swap.id)}
                        isLoading={acceptSwap.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDetail(swap, false)}
                      >
                        <Eye className="h-4 w-4 text-muted" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12">
              <ArrowRightLeft className="h-12 w-12 text-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No available swaps</h3>
              <p className="text-muted">There are no swap requests available for you to accept</p>
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <CreateSwapDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        schedules={schedules}
        users={users}
      />

      {/* Detail Dialog */}
      <SwapDetailDialog
        swap={selectedSwap}
        isOpen={showDetailDialog}
        onClose={() => {
          setShowDetailDialog(false);
          setSelectedSwap(null);
        }}
        isMyRequest={isMyRequestDetail}
      />
    </div>
  );
}

export default function OnCallPage() {
  const [activeTab, setActiveTab] = useState<'schedules' | 'incidents' | 'shifts' | 'swaps'>('schedules');

  const { data: schedulesData, isLoading: schedulesLoading, error: schedulesError } = useOncallSchedules({ is_active: true });
  const { data: whoIsOnCallData, isLoading: whoIsOnCallLoading } = useWhoIsOnCall();
  const { data: issuesData, isLoading: issuesLoading } = useIssues({ status: 'new' });

  const schedules = schedulesData?.data ?? [];
  const whoIsOnCall = whoIsOnCallData?.data ?? [];
  // Filter for high priority open issues as "active incidents"
  const activeIncidents = (issuesData?.data ?? []).filter(
    (issue: Issue) => issue.priority === 'critical' || issue.priority === 'high'
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeRemaining = (dateString?: string) => {
    if (!dateString) return 'No rotation scheduled';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h remaining`;
    if (diffHours > 0) return `${diffHours}h remaining`;
    return 'Ending soon';
  };

  if (schedulesError) {
    return (
      <div className="bg-error-subtle border border-error rounded-lg p-6 text-center">
        <Phone className="h-12 w-12 text-error mx-auto mb-4" />
        <h3 className="text-lg font-medium text-error mb-2">Error loading on-call data</h3>
        <p className="text-error">Please try refreshing the page</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">On-Call Management</h1>
          <p className="mt-1 text-sm text-muted">
            Manage on-call schedules and incidents
          </p>
        </div>
        <Link href="/oncall/schedules/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Schedule
          </Button>
        </Link>
      </div>

      {/* Active Incidents Alert */}
      {!issuesLoading && activeIncidents.length > 0 && (
        <div className="bg-error-subtle border border-error rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-error mr-2" />
            <span className="font-medium text-error">
              {activeIncidents.length} Active Incident{activeIncidents.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {activeIncidents.slice(0, 5).map((incident: Issue) => (
              <Link
                key={incident.id}
                href={`/issues/${incident.id}`}
                className="flex items-center justify-between p-2 bg-surface rounded-md hover:bg-surface-hover"
              >
                <div className="flex items-center space-x-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      severityColors[incident.priority]?.bg || 'bg-background'
                    } ${severityColors[incident.priority]?.text || 'text-foreground'}`}
                  >
                    {incident.priority?.toUpperCase()}
                  </span>
                  <span className="text-sm text-foreground">{incident.title}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {!incident.acknowledged_at && (
                    <span className="text-xs text-error font-medium">UNACKNOWLEDGED</span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('schedules')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'schedules'
                ? 'border-primary text-primary'
                : 'border-transparent text-secondary hover:text-foreground hover:border-border-strong'
            }`}
          >
            Schedules
          </button>
          <button
            onClick={() => setActiveTab('incidents')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'incidents'
                ? 'border-primary text-primary'
                : 'border-transparent text-secondary hover:text-foreground hover:border-border-strong'
            }`}
          >
            Incidents
            {activeIncidents.length > 0 && (
              <span className="ml-2 bg-error-subtle text-error py-0.5 px-2 rounded-full text-xs">
                {activeIncidents.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('shifts')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'shifts'
                ? 'border-primary text-primary'
                : 'border-transparent text-secondary hover:text-foreground hover:border-border-strong'
            }`}
          >
            Who is On-Call
          </button>
          <button
            onClick={() => setActiveTab('swaps')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
              activeTab === 'swaps'
                ? 'border-primary text-primary'
                : 'border-transparent text-secondary hover:text-foreground hover:border-border-strong'
            }`}
          >
            <ArrowRightLeft className="h-4 w-4 mr-1" />
            Shift Swaps
          </button>
        </nav>
      </div>

      {/* Schedules Tab */}
      {activeTab === 'schedules' && (
        schedulesLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted">Loading schedules...</span>
          </div>
        ) : schedules.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {schedules.map((schedule: OncallSchedule) => (
              <Link
                key={schedule.id}
                href={`/oncall/schedules/${schedule.id}`}
                className="bg-surface rounded-xl shadow-sm hover:shadow transition-shadow p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-lg bg-success-subtle flex items-center justify-center">
                    <Phone className="h-5 w-5 text-success" />
                  </div>
                  <span className="text-xs text-muted">
                    {formatTimeRemaining(schedule.rotation_end)}
                  </span>
                </div>

                <h3 className="mt-4 font-semibold text-foreground">{schedule.name}</h3>
                <p className="mt-1 text-sm text-muted">{schedule.description || 'No description'}</p>

                <div className="mt-4 space-y-3">
                  {schedule.current_on_call ? (
                    <div className="flex items-center">
                      <div className="h-8 w-8 rounded-full bg-success flex items-center justify-center text-white text-sm font-medium">
                        {schedule.current_on_call.name?.charAt(0) || '?'}
                      </div>
                      <div className="ml-3">
                        <p className="text-sm font-medium text-foreground">
                          {schedule.current_on_call.name}
                        </p>
                        <p className="text-xs text-muted">Currently on-call</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center text-sm text-muted">
                      <User className="h-4 w-4 mr-2" />
                      No one currently on-call
                    </div>
                  )}

                  <div className="flex items-center text-sm text-muted">
                    <Shield className="h-4 w-4 mr-2" />
                    {schedule.escalation_policy?.name || 'No escalation policy'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-surface rounded-xl shadow-sm p-12 text-center">
            <Phone className="h-12 w-12 text-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No schedules found</h3>
            <p className="text-muted">Create your first on-call schedule</p>
            <Link href="/oncall/schedules/new">
              <Button className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                New Schedule
              </Button>
            </Link>
          </div>
        )
      )}

      {/* Incidents Tab */}
      {activeTab === 'incidents' && (
        <div className="bg-surface rounded-xl shadow-sm overflow-hidden">
          {issuesLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted">Loading incidents...</span>
            </div>
          ) : activeIncidents.length > 0 ? (
            <ul className="divide-y divide-border">
              {activeIncidents.map((incident: Issue) => (
                <li key={incident.id}>
                  <Link
                    href={`/issues/${incident.id}`}
                    className="block hover:bg-surface-hover px-6 py-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              severityColors[incident.priority]?.bg || 'bg-background'
                            } ${severityColors[incident.priority]?.text || 'text-foreground'}`}
                          >
                            {incident.priority?.toUpperCase()}
                          </span>
                          <span className="text-sm font-medium text-primary">
                            {incident.number}
                          </span>
                          <span className="text-sm font-medium text-foreground">
                            {incident.title}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center space-x-4 text-sm text-secondary">
                          <span className="flex items-center">
                            <User className="h-4 w-4 mr-1" />
                            {incident.assigned_to?.name || 'Unassigned'}
                          </span>
                          <span className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            Opened {formatDate(incident.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {incident.acknowledged_at ? (
                          <span className="text-xs text-success font-medium">ACKNOWLEDGED</span>
                        ) : (
                          <span className="text-xs text-error font-medium">UNACKNOWLEDGED</span>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted" />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12">
              <Phone className="h-12 w-12 text-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No active incidents</h3>
              <p className="text-muted">All systems operational</p>
            </div>
          )}
        </div>
      )}

      {/* Who is On-Call Tab */}
      {activeTab === 'shifts' && (
        <div className="bg-surface rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Currently On-Call</h2>
          </div>
          {whoIsOnCallLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-muted">Loading on-call information...</span>
            </div>
          ) : whoIsOnCall.length > 0 ? (
            <ul className="divide-y divide-border">
              {whoIsOnCall.map((entry: OncallEntry) => (
                <li key={entry.schedule_id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{entry.schedule_name}</p>
                      {entry.user ? (
                        <div className="mt-1 flex items-center text-sm text-secondary">
                          <User className="h-4 w-4 mr-1" />
                          {entry.user.name}
                          {entry.user.phone && (
                            <span className="ml-2">({entry.user.phone})</span>
                          )}
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-muted italic">No one currently on-call</p>
                      )}
                      {entry.end_time && (
                        <div className="mt-1 flex items-center text-sm text-secondary">
                          <Calendar className="h-4 w-4 mr-1" />
                          Until {formatDate(entry.end_time)}
                        </div>
                      )}
                    </div>
                    <Link href={`/oncall/schedules/${entry.schedule_id}`}>
                      <Button variant="outline" size="sm">
                        View Schedule
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No on-call entries</h3>
              <p className="text-muted">Set up schedules to see who is on-call</p>
            </div>
          )}
        </div>
      )}

      {/* Shift Swaps Tab */}
      {activeTab === 'swaps' && <ShiftSwapsTab schedules={schedules} />}
    </div>
  );
}
