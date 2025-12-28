'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Users,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Filter,
  Loader2,
  AlertCircle,
  Play,
  MapPin,
  Video,
  ChevronRight,
  Trash2,
  Edit,
  X,
  Send,
  ClipboardList,
  MessageSquare,
  ListTodo,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCabMeetings,
  useCabMeeting,
  useCreateCabMeeting,
  useUpdateCabMeeting,
  useDeleteCabMeeting,
  useStartCabMeeting,
  useCompleteCabMeeting,
  useCabMeetingAttendees,
  useAddCabAttendee,
  useRemoveCabAttendee,
  useCabMeetingChanges,
  useAddCabChange,
  useRemoveCabChange,
  useGenerateAgenda,
  useUpdateAgenda,
  useRecordDecision,
  useCabActionItems,
  useAddActionItem,
  useUpdateActionItem,
  useDeleteActionItem,
  useSaveMinutes,
  useDistributeMinutes,
  useUsers,
  useChanges,
  CabMeeting,
  CabMeetingStatus,
  CabAttendeeRole,
  CabDecision,
  CabMeetingChange,
  CabAttendee,
  CabActionItem,
} from '@/hooks/useApi';

const statusColors: Record<CabMeetingStatus, { bg: string; text: string; label: string }> = {
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Scheduled' },
  in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'In Progress' },
  completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Cancelled' },
};

const riskColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-green-100', text: 'text-green-800' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800' },
  critical: { bg: 'bg-red-100', text: 'text-red-800' },
};

const roleLabels: Record<CabAttendeeRole, string> = {
  chair: 'Chair',
  member: 'Member',
  guest: 'Guest',
};

const decisionColors: Record<CabDecision, { bg: string; text: string; label: string }> = {
  approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'Approved' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' },
  deferred: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Deferred' },
};

type TabType = 'overview' | 'attendees' | 'agenda' | 'decisions' | 'action-items' | 'minutes';

export default function CabMeetingsPage() {
  // Filters state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isEditing, setIsEditing] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    meetingDate: '',
    endDate: '',
    location: '',
    meetingLink: '',
  });

  // Query hooks
  const { data: meetingsData, isLoading, error } = useCabMeetings({
    status: statusFilter !== 'all' ? statusFilter as CabMeetingStatus : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const meetings = meetingsData?.data || [];

  // Mutation hooks
  const createMeeting = useCreateCabMeeting();
  const updateMeeting = useUpdateCabMeeting();
  const deleteMeeting = useDeleteCabMeeting();
  const startMeeting = useStartCabMeeting();
  const completeMeeting = useCompleteCabMeeting();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleCreateMeeting = async () => {
    try {
      await createMeeting.mutateAsync({
        title: formData.title,
        description: formData.description || undefined,
        meetingDate: formData.meetingDate,
        endDate: formData.endDate || undefined,
        location: formData.location || undefined,
        meetingLink: formData.meetingLink || undefined,
      });
      setShowCreateModal(false);
      resetForm();
    } catch (err) {
      console.error('Failed to create meeting:', err);
    }
  };

  const handleUpdateMeeting = async () => {
    if (!selectedMeetingId) return;
    try {
      await updateMeeting.mutateAsync({
        id: selectedMeetingId,
        data: {
          title: formData.title,
          description: formData.description || undefined,
          meetingDate: formData.meetingDate,
          endDate: formData.endDate || undefined,
          location: formData.location || undefined,
          meetingLink: formData.meetingLink || undefined,
        },
      });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update meeting:', err);
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this meeting?')) return;
    try {
      await deleteMeeting.mutateAsync(id);
      setShowDetailModal(false);
      setSelectedMeetingId(null);
    } catch (err) {
      console.error('Failed to delete meeting:', err);
    }
  };

  const handleStartMeeting = async (id: string) => {
    try {
      await startMeeting.mutateAsync(id);
    } catch (err) {
      console.error('Failed to start meeting:', err);
    }
  };

  const handleCompleteMeeting = async (id: string) => {
    try {
      await completeMeeting.mutateAsync(id);
    } catch (err) {
      console.error('Failed to complete meeting:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      meetingDate: '',
      endDate: '',
      location: '',
      meetingLink: '',
    });
  };

  const openMeetingDetail = (meeting: CabMeeting) => {
    setSelectedMeetingId(meeting.id);
    setFormData({
      title: meeting.title,
      description: meeting.description || '',
      meetingDate: meeting.meeting_date ? meeting.meeting_date.slice(0, 16) : '',
      endDate: meeting.end_date ? meeting.end_date.slice(0, 16) : '',
      location: meeting.location || '',
      meetingLink: meeting.meeting_link || '',
    });
    setActiveTab('overview');
    setIsEditing(false);
    setShowDetailModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2 text-sm text-gray-500 mb-1">
            <Link href="/changes" className="hover:text-gray-700">Changes</Link>
            <ChevronRight className="h-4 w-4" />
            <span>CAB Meetings</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">CAB Meetings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage Change Advisory Board meetings, agendas, and decisions
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Schedule Meeting
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-2" />
            {showFilters ? 'Hide Filters' : 'More Filters'}
          </Button>
        </div>

        {showFilters && (
          <div className="px-6 py-3 border-b border-gray-200 bg-gray-50 flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">From:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">To:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setStatusFilter('all');
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}

        {/* Meetings Table */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-gray-500">Failed to load meetings</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Calendar className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No meetings found</h3>
            <p className="text-gray-500 mt-1">Schedule a CAB meeting to get started</p>
            <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Schedule Meeting
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Meeting
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date/Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organizer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Attendees
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Changes
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {meetings.map((meeting: CabMeeting) => {
                  const status = statusColors[meeting.status] || statusColors.scheduled;
                  return (
                    <tr
                      key={meeting.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => openMeetingDetail(meeting)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{meeting.title}</div>
                            {(meeting.location || meeting.meeting_link) && (
                              <div className="text-xs text-gray-500 flex items-center mt-1">
                                {meeting.location && (
                                  <span className="flex items-center mr-3">
                                    <MapPin className="h-3 w-3 mr-1" />
                                    {meeting.location}
                                  </span>
                                )}
                                {meeting.meeting_link && (
                                  <span className="flex items-center">
                                    <Video className="h-3 w-3 mr-1" />
                                    Virtual
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(meeting.meeting_date)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{meeting.organizer_name || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-500">
                          <Users className="h-4 w-4 mr-1" />
                          {meeting.attendee_count || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-500">
                          <FileText className="h-4 w-4 mr-1" />
                          {meeting.changes_count || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openMeetingDetail(meeting);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Meeting Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Schedule CAB Meeting</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Weekly CAB Meeting"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Meeting description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date/Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.meetingDate}
                    onChange={(e) => setFormData({ ...formData, meetingDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date/Time</label>
                  <input
                    type="datetime-local"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Conference Room A"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Link</label>
                <Input
                  value={formData.meetingLink}
                  onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })}
                  placeholder="e.g., https://meet.google.com/..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="outline" onClick={() => {
                setShowCreateModal(false);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateMeeting}
                disabled={!formData.title || !formData.meetingDate || createMeeting.isPending}
              >
                {createMeeting.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create Meeting
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Meeting Detail Modal */}
      {showDetailModal && selectedMeetingId && (
        <MeetingDetailModal
          meetingId={selectedMeetingId}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          formData={formData}
          setFormData={setFormData}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedMeetingId(null);
          }}
          onUpdate={handleUpdateMeeting}
          onDelete={() => handleDeleteMeeting(selectedMeetingId)}
          onStart={() => handleStartMeeting(selectedMeetingId)}
          onComplete={() => handleCompleteMeeting(selectedMeetingId)}
          isUpdating={updateMeeting.isPending}
        />
      )}
    </div>
  );
}

// Meeting Detail Modal Component
interface MeetingDetailModalProps {
  meetingId: string;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  formData: {
    title: string;
    description: string;
    meetingDate: string;
    endDate: string;
    location: string;
    meetingLink: string;
  };
  setFormData: (data: {
    title: string;
    description: string;
    meetingDate: string;
    endDate: string;
    location: string;
    meetingLink: string;
  }) => void;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  onStart: () => void;
  onComplete: () => void;
  isUpdating: boolean;
}

function MeetingDetailModal({
  meetingId,
  isEditing,
  setIsEditing,
  formData,
  setFormData,
  activeTab,
  setActiveTab,
  onClose,
  onUpdate,
  onDelete,
  onStart,
  onComplete,
  isUpdating,
}: MeetingDetailModalProps) {
  const { data: meeting, isLoading } = useCabMeeting(meetingId);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  if (!meeting) return null;

  const status = statusColors[meeting.status] || statusColors.scheduled;

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: Calendar },
    { id: 'attendees' as TabType, label: 'Attendees', icon: Users },
    { id: 'agenda' as TabType, label: 'Agenda', icon: ClipboardList },
    { id: 'decisions' as TabType, label: 'Decisions', icon: CheckCircle },
    { id: 'action-items' as TabType, label: 'Action Items', icon: ListTodo },
    { id: 'minutes' as TabType, label: 'Minutes', icon: MessageSquare },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <Calendar className="h-6 w-6 text-blue-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{meeting.title}</h2>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.text}`}>
                {status.label}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {meeting.status === 'scheduled' && (
              <Button size="sm" onClick={onStart}>
                <Play className="h-4 w-4 mr-1" />
                Start
              </Button>
            )}
            {meeting.status === 'in_progress' && (
              <Button size="sm" onClick={onComplete}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Complete
              </Button>
            )}
            {!isEditing && meeting.status !== 'completed' && meeting.status !== 'cancelled' && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            )}
            {isEditing && (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={onUpdate} disabled={isUpdating}>
                  {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 flex-shrink-0">
          <nav className="flex px-6 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-4 border-b-2 text-sm font-medium whitespace-nowrap flex items-center ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <OverviewTab
              meeting={meeting}
              isEditing={isEditing}
              formData={formData}
              setFormData={setFormData}
            />
          )}
          {activeTab === 'attendees' && <AttendeesTab meetingId={meetingId} meeting={meeting} />}
          {activeTab === 'agenda' && <AgendaTab meetingId={meetingId} meeting={meeting} />}
          {activeTab === 'decisions' && <DecisionsTab meetingId={meetingId} meeting={meeting} />}
          {activeTab === 'action-items' && <ActionItemsTab meetingId={meetingId} />}
          {activeTab === 'minutes' && <MinutesTab meetingId={meetingId} meeting={meeting} />}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between flex-shrink-0">
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Meeting
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

// Overview Tab
function OverviewTab({
  meeting,
  isEditing,
  formData,
  setFormData,
}: {
  meeting: CabMeeting;
  isEditing: boolean;
  formData: {
    title: string;
    description: string;
    meetingDate: string;
    endDate: string;
    location: string;
    meetingLink: string;
  };
  setFormData: (data: typeof formData) => void;
}) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isEditing) {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date/Time</label>
            <input
              type="datetime-local"
              value={formData.meetingDate}
              onChange={(e) => setFormData({ ...formData, meetingDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date/Time</label>
            <input
              type="datetime-local"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <Input
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Link</label>
          <Input
            value={formData.meetingLink}
            onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-700">{meeting.changes_count || 0}</div>
          <div className="text-sm text-blue-600">Total Changes</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-700">{meeting.attendee_count || 0}</div>
          <div className="text-sm text-green-600">Attendees</div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-700">-</div>
          <div className="text-sm text-yellow-600">Pending</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-700">-</div>
          <div className="text-sm text-purple-600">Action Items</div>
        </div>
      </div>

      {/* Meeting Details */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Meeting Details</h3>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-gray-500">Date & Time</dt>
            <dd className="mt-1 flex items-center text-sm text-gray-900">
              <Calendar className="h-4 w-4 mr-2 text-gray-400" />
              {formatDate(meeting.meeting_date)}
            </dd>
          </div>
          {meeting.end_date && (
            <div>
              <dt className="text-sm text-gray-500">End Time</dt>
              <dd className="mt-1 flex items-center text-sm text-gray-900">
                <Clock className="h-4 w-4 mr-2 text-gray-400" />
                {formatDate(meeting.end_date)}
              </dd>
            </div>
          )}
          {meeting.location && (
            <div>
              <dt className="text-sm text-gray-500">Location</dt>
              <dd className="mt-1 flex items-center text-sm text-gray-900">
                <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                {meeting.location}
              </dd>
            </div>
          )}
          {meeting.meeting_link && (
            <div>
              <dt className="text-sm text-gray-500">Meeting Link</dt>
              <dd className="mt-1 flex items-center text-sm text-blue-600">
                <Video className="h-4 w-4 mr-2 text-gray-400" />
                <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Join Meeting
                </a>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-gray-500">Organizer</dt>
            <dd className="mt-1 flex items-center text-sm text-gray-900">
              <Users className="h-4 w-4 mr-2 text-gray-400" />
              {meeting.organizer_name || '-'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Description */}
      {meeting.description && (
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-2">Description</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{meeting.description}</p>
        </div>
      )}
    </div>
  );
}

// Attendees Tab
function AttendeesTab({ meetingId, meeting }: { meetingId: string; meeting: CabMeeting }) {
  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<CabAttendeeRole>('member');

  const { data: attendeesData, isLoading } = useCabMeetingAttendees(meetingId);
  const { data: usersData } = useUsers();
  const addAttendee = useAddCabAttendee();
  const removeAttendee = useRemoveCabAttendee();

  const attendees: CabAttendee[] = attendeesData?.data || [];
  const users = usersData?.data || [];

  const handleAddAttendee = async () => {
    if (!selectedUserId) return;
    try {
      await addAttendee.mutateAsync({
        meetingId,
        userId: selectedUserId,
        role: selectedRole,
      });
      setSelectedUserId('');
      setShowAddUser(false);
    } catch (err) {
      console.error('Failed to add attendee:', err);
    }
  };

  const handleRemoveAttendee = async (attendeeId: string) => {
    try {
      await removeAttendee.mutateAsync({ meetingId, attendeeId });
    } catch (err) {
      console.error('Failed to remove attendee:', err);
    }
  };

  const canEdit = meeting.status !== 'completed' && meeting.status !== 'cancelled';

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowAddUser(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Attendee
          </Button>
        </div>
      )}

      {showAddUser && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-end space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a user...</option>
                {users.map((user: { id: string; name: string }) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as CabAttendeeRole)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="chair">Chair</option>
                <option value="member">Member</option>
                <option value="guest">Guest</option>
              </select>
            </div>
            <Button onClick={handleAddAttendee} disabled={!selectedUserId || addAttendee.isPending}>
              {addAttendee.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
            </Button>
            <Button variant="outline" onClick={() => setShowAddUser(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      ) : attendees.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No attendees added yet
        </div>
      ) : (
        <div className="space-y-2">
          {attendees.map((attendee) => (
            <div key={attendee.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                  {attendee.user_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{attendee.user_name || 'Unknown'}</div>
                  <div className="text-xs text-gray-500">{attendee.user_email || ''}</div>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                  {roleLabels[attendee.role]}
                </span>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleRemoveAttendee(attendee.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Agenda Tab
function AgendaTab({ meetingId, meeting }: { meetingId: string; meeting: CabMeeting }) {
  const [showAddChange, setShowAddChange] = useState(false);
  const [selectedChangeId, setSelectedChangeId] = useState('');
  const [editingAgenda, setEditingAgenda] = useState(false);
  const [agendaText, setAgendaText] = useState(meeting.agenda || '');

  const { data: changesData, isLoading } = useCabMeetingChanges(meetingId);
  const { data: allChangesData } = useChanges({ status: 'review' }); // Changes needing CAB review
  const addChange = useAddCabChange();
  const removeChange = useRemoveCabChange();
  const generateAgenda = useGenerateAgenda();
  const updateAgenda = useUpdateAgenda();

  const changes: CabMeetingChange[] = changesData?.data || [];
  const availableChanges = allChangesData?.data || [];

  const canEdit = meeting.status !== 'completed' && meeting.status !== 'cancelled';

  const handleAddChange = async () => {
    if (!selectedChangeId) return;
    try {
      await addChange.mutateAsync({ meetingId, changeId: selectedChangeId });
      setSelectedChangeId('');
      setShowAddChange(false);
    } catch (err) {
      console.error('Failed to add change:', err);
    }
  };

  const handleRemoveChange = async (changeId: string) => {
    try {
      await removeChange.mutateAsync({ meetingId, changeId });
    } catch (err) {
      console.error('Failed to remove change:', err);
    }
  };

  const handleGenerateAgenda = async () => {
    try {
      await generateAgenda.mutateAsync(meetingId);
    } catch (err) {
      console.error('Failed to generate agenda:', err);
    }
  };

  const handleSaveAgenda = async () => {
    try {
      await updateAgenda.mutateAsync({ meetingId, agenda: agendaText });
      setEditingAgenda(false);
    } catch (err) {
      console.error('Failed to save agenda:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Changes to Review */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-900">Changes to Review</h3>
          {canEdit && (
            <Button size="sm" onClick={() => setShowAddChange(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Change
            </Button>
          )}
        </div>

        {showAddChange && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="flex items-end space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Change</label>
                <select
                  value={selectedChangeId}
                  onChange={(e) => setSelectedChangeId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a change...</option>
                  {availableChanges.map((change: { id: string; change_number?: string; title: string }) => (
                    <option key={change.id} value={change.id}>
                      {change.change_number || change.id} - {change.title}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={handleAddChange} disabled={!selectedChangeId || addChange.isPending}>
                {addChange.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
              </Button>
              <Button variant="outline" onClick={() => setShowAddChange(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : changes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No changes added to this meeting
          </div>
        ) : (
          <div className="space-y-2">
            {changes.map((change, index) => {
              const risk = riskColors[change.change_risk_level || 'medium'] || riskColors.medium;
              return (
                <div key={change.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-blue-600">{change.change_number}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${risk.bg} ${risk.text}`}>
                          {change.change_risk_level || 'medium'}
                        </span>
                        {change.decision && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${decisionColors[change.decision].bg} ${decisionColors[change.decision].text}`}>
                            {decisionColors[change.decision].label}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-900">{change.change_title}</div>
                      <div className="text-xs text-gray-500">Requester: {change.requester_name || '-'}</div>
                    </div>
                  </div>
                  {canEdit && !change.decision && (
                    <button
                      onClick={() => handleRemoveChange(change.change_id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agenda Text */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-900">Meeting Agenda</h3>
          <div className="flex space-x-2">
            {canEdit && !editingAgenda && (
              <>
                <Button variant="outline" size="sm" onClick={handleGenerateAgenda} disabled={generateAgenda.isPending}>
                  {generateAgenda.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                  Generate
                </Button>
                <Button size="sm" onClick={() => setEditingAgenda(true)}>
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              </>
            )}
            {editingAgenda && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditingAgenda(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveAgenda} disabled={updateAgenda.isPending}>
                  {updateAgenda.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </>
            )}
          </div>
        </div>

        {editingAgenda ? (
          <textarea
            value={agendaText}
            onChange={(e) => setAgendaText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            rows={15}
            placeholder="Enter meeting agenda..."
          />
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 min-h-[200px]">
            {meeting.agenda ? (
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{meeting.agenda}</pre>
            ) : (
              <p className="text-sm text-gray-500 italic">No agenda generated yet. Click &quot;Generate&quot; to create one from the changes list.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Decisions Tab
function DecisionsTab({ meetingId, meeting }: { meetingId: string; meeting: CabMeeting }) {
  const [selectedChange, setSelectedChange] = useState<CabMeetingChange | null>(null);
  const [decision, setDecision] = useState<CabDecision | ''>('');
  const [notes, setNotes] = useState('');

  const { data: changesData, isLoading } = useCabMeetingChanges(meetingId);
  const recordDecision = useRecordDecision();

  const changes: CabMeetingChange[] = changesData?.data || [];
  const canEdit = meeting.status === 'in_progress';

  const handleRecordDecision = async () => {
    if (!selectedChange || !decision) return;
    try {
      await recordDecision.mutateAsync({
        meetingId,
        changeId: selectedChange.change_id,
        decision,
        notes: notes || undefined,
      });
      setSelectedChange(null);
      setDecision('');
      setNotes('');
    } catch (err) {
      console.error('Failed to record decision:', err);
    }
  };

  return (
    <div className="space-y-4">
      {!canEdit && meeting.status !== 'completed' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-700">
            Start the meeting to record decisions.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      ) : changes.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No changes to review. Add changes in the Agenda tab.
        </div>
      ) : (
        <div className="space-y-4">
          {changes.map((change) => {
            const risk = riskColors[change.change_risk_level || 'medium'] || riskColors.medium;
            const isSelected = selectedChange?.id === change.id;

            return (
              <div
                key={change.id}
                className={`p-4 border rounded-lg ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-blue-600">{change.change_number}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${risk.bg} ${risk.text}`}>
                        {change.change_risk_level || 'medium'} risk
                      </span>
                    </div>
                    <h4 className="text-sm font-medium text-gray-900 mt-1">{change.change_title}</h4>
                    <p className="text-xs text-gray-500 mt-1">Requester: {change.requester_name || '-'}</p>
                  </div>

                  {change.decision ? (
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${decisionColors[change.decision].bg} ${decisionColors[change.decision].text}`}>
                        {change.decision === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {change.decision === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                        {change.decision === 'deferred' && <Clock className="h-3 w-3 mr-1" />}
                        {decisionColors[change.decision].label}
                      </span>
                      {change.decided_by_name && (
                        <p className="text-xs text-gray-500 mt-1">by {change.decided_by_name}</p>
                      )}
                      {change.decision_notes && (
                        <p className="text-xs text-gray-500 mt-1 italic">&quot;{change.decision_notes}&quot;</p>
                      )}
                    </div>
                  ) : canEdit ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedChange(change);
                        setDecision('');
                        setNotes('');
                      }}
                    >
                      Record Decision
                    </Button>
                  ) : (
                    <span className="text-sm text-gray-500">Pending</span>
                  )}
                </div>

                {isSelected && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                        <div className="flex space-x-2">
                          <Button
                            variant={decision === 'approved' ? 'primary' : 'outline'}
                            size="sm"
                            onClick={() => setDecision('approved')}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant={decision === 'rejected' ? 'danger' : 'outline'}
                            size="sm"
                            onClick={() => setDecision('rejected')}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                          <Button
                            variant={decision === 'deferred' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => setDecision('deferred')}
                          >
                            <Clock className="h-4 w-4 mr-1" />
                            Defer
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={2}
                          placeholder="Add notes about the decision..."
                        />
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedChange(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleRecordDecision}
                          disabled={!decision || recordDecision.isPending}
                        >
                          {recordDecision.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : null}
                          Save Decision
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Action Items Tab
function ActionItemsTab({ meetingId }: { meetingId: string }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');

  const { data: actionItemsData, isLoading } = useCabActionItems(meetingId);
  const { data: usersData } = useUsers();
  const addActionItem = useAddActionItem();
  const updateActionItem = useUpdateActionItem();
  const deleteActionItem = useDeleteActionItem();

  const actionItems: CabActionItem[] = actionItemsData?.data || [];
  const users = usersData?.data || [];

  const handleAddItem = async () => {
    if (!description) return;
    try {
      await addActionItem.mutateAsync({
        meetingId,
        description,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate || undefined,
      });
      setDescription('');
      setAssigneeId('');
      setDueDate('');
      setShowAddForm(false);
    } catch (err) {
      console.error('Failed to add action item:', err);
    }
  };

  const handleToggleStatus = async (item: CabActionItem) => {
    try {
      await updateActionItem.mutateAsync({
        meetingId,
        itemId: item.id,
        data: { status: item.status === 'open' ? 'completed' : 'open' },
      });
    } catch (err) {
      console.error('Failed to update action item:', err);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await deleteActionItem.mutateAsync({ meetingId, itemId });
    } catch (err) {
      console.error('Failed to delete action item:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Action Item
        </Button>
      </div>

      {showAddForm && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What needs to be done?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {users.map((user: { id: string; name: string }) => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAddItem} disabled={!description || addActionItem.isPending}>
                {addActionItem.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      ) : actionItems.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No action items yet
        </div>
      ) : (
        <div className="space-y-2">
          {actionItems.map((item) => (
            <div key={item.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
              <button
                onClick={() => handleToggleStatus(item)}
                className={`mt-0.5 flex-shrink-0 ${item.status === 'completed' ? 'text-green-500' : 'text-gray-400'}`}
              >
                <CheckCircle className="h-5 w-5" />
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                  {item.description}
                </p>
                <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                  {item.assignee_name && (
                    <span className="flex items-center">
                      <Users className="h-3 w-3 mr-1" />
                      {item.assignee_name}
                    </span>
                  )}
                  {item.due_date && (
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {new Date(item.due_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(item.id)}
                className="text-red-600 hover:text-red-800"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Minutes Tab
function MinutesTab({ meetingId, meeting }: { meetingId: string; meeting: CabMeeting }) {
  const [isEditing, setIsEditing] = useState(false);
  const [minutesText, setMinutesText] = useState(meeting.minutes || '');

  const saveMinutes = useSaveMinutes();
  const distributeMinutes = useDistributeMinutes();

  const handleSave = async () => {
    try {
      await saveMinutes.mutateAsync({ meetingId, minutes: minutesText });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save minutes:', err);
    }
  };

  const handleDistribute = async () => {
    try {
      await distributeMinutes.mutateAsync(meetingId);
    } catch (err) {
      console.error('Failed to distribute minutes:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Meeting Minutes</h3>
        <div className="flex space-x-2">
          {!isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              {meeting.minutes && (
                <Button size="sm" onClick={handleDistribute} disabled={distributeMinutes.isPending}>
                  {distributeMinutes.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  Distribute
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saveMinutes.isPending}>
                {saveMinutes.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <textarea
          value={minutesText}
          onChange={(e) => setMinutesText(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          rows={20}
          placeholder="Enter meeting minutes..."
        />
      ) : (
        <div className="bg-gray-50 rounded-lg p-4 min-h-[300px]">
          {meeting.minutes ? (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{meeting.minutes}</pre>
          ) : (
            <p className="text-sm text-gray-500 italic">No minutes recorded yet. Click &quot;Edit&quot; to add minutes.</p>
          )}
        </div>
      )}
    </div>
  );
}
