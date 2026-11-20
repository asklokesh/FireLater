'use client';

import { useT, useOptionalIntl } from '@/i18n/useT';
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
  scheduled: { bg: 'bg-primary-subtle', text: 'text-primary', label: 'sScheduled' },
  in_progress: { bg: 'bg-warning-subtle', text: 'text-warning', label: 'sInProgress' },
  completed: { bg: 'bg-success-subtle', text: 'text-success', label: 'sCompleted' },
  cancelled: { bg: 'bg-surface-hover', text: 'text-foreground', label: 'sCancelled' },
};

const riskColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-success-subtle', text: 'text-success' },
  medium: { bg: 'bg-warning-subtle', text: 'text-warning' },
  high: { bg: 'bg-warning-subtle', text: 'text-warning' },
  critical: { bg: 'bg-error-subtle', text: 'text-error' },
};

const roleLabels: Record<CabAttendeeRole, string> = {
  chair: 'rChair',
  member: 'rMember',
  guest: 'rGuest',
};

const decisionColors: Record<CabDecision, { bg: string; text: string; label: string }> = {
  approved: { bg: 'bg-success-subtle', text: 'text-success', label: 'dApproved' },
  rejected: { bg: 'bg-error-subtle', text: 'text-error', label: 'dRejected' },
  deferred: { bg: 'bg-warning-subtle', text: 'text-warning', label: 'dDeferred' },
};

type TabType = 'overview' | 'attendees' | 'agenda' | 'decisions' | 'action-items' | 'minutes';

export default function CabMeetingsPage() {
  const cb = useT('cab');
  const intl = useOptionalIntl();
  const loc = intl?.locale ?? 'en-US';
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
    return date.toLocaleDateString(loc, {
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
    if (!window.confirm(cb('confirmDelete'))) return;
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
          <div className="flex items-center space-x-2 text-sm text-muted mb-1">
            <Link href="/changes" className="hover:text-secondary">{cb('changes')}</Link>
            <ChevronRight className="h-4 w-4" />
            <span>{cb('title')}</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{cb('title')}</h1>
          <p className="mt-1 text-sm text-muted">
            {cb('subtitle')}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {cb('scheduleMeeting')}
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">{cb('allStatuses')}</option>
              <option value="scheduled">{cb('sScheduled')}</option>
              <option value="in_progress">{cb('sInProgress')}</option>
              <option value="completed">{cb('sCompleted')}</option>
              <option value="cancelled">{cb('sCancelled')}</option>
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-2" />
            {showFilters ? cb('hideFilters') : cb('moreFilters')}
          </Button>
        </div>

        {showFilters && (
          <div className="px-6 py-3 border-b border-border bg-surface-hover flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-secondary">{cb('from')}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 border border-border-strong rounded text-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm text-secondary">{cb('to')}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 border border-border-strong rounded text-sm"
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
              {cb('clearFilters')}
            </Button>
          </div>
        )}

        {/* Meetings Table */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64">
            <AlertCircle className="h-12 w-12 text-error mb-4" />
            <p className="text-muted">{cb('loadFailed')}</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <Calendar className="h-12 w-12 text-muted mb-4" />
            <h3 className="text-lg font-medium text-foreground">{cb('noMeetings')}</h3>
            <p className="text-muted mt-1">{cb('noMeetingsHint')}</p>
            <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {cb('scheduleMeeting')}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    {cb('colMeeting')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    {cb('colDateTime')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    {cb('colStatus')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    {cb('colOrganizer')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    {cb('colAttendees')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                    {cb('changes')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                    {cb('colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-border">
                {meetings.map((meeting: CabMeeting) => {
                  const status = statusColors[meeting.status] || statusColors.scheduled;
                  return (
                    <tr
                      key={meeting.id}
                      className="hover:bg-surface-hover cursor-pointer"
                      onClick={() => openMeetingDetail(meeting)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Calendar className="h-5 w-5 text-muted mr-3" />
                          <div>
                            <div className="text-sm font-medium text-foreground">{meeting.title}</div>
                            {(meeting.location || meeting.meeting_link) && (
                              <div className="text-xs text-muted flex items-center mt-1">
                                {meeting.location && (
                                  <span className="flex items-center mr-3">
                                    <MapPin className="h-3 w-3 mr-1" />
                                    {meeting.location}
                                  </span>
                                )}
                                {meeting.meeting_link && (
                                  <span className="flex items-center">
                                    <Video className="h-3 w-3 mr-1" />
                                    {cb('virtual')}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">{formatDate(meeting.meeting_date)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                          {cb(status.label)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-foreground">{meeting.organizer_name || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-muted">
                          <Users className="h-4 w-4 mr-1" />
                          {meeting.attendee_count || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-muted">
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
                          className="text-primary hover:text-primary"
                        >
                          {cb('view')}
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
          <div className="bg-surface rounded-xl shadow-sm-xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">{cb('scheduleTitle')}</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="text-muted hover:text-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  Title <span className="text-error">*</span>
                </label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={cb('titlePh')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{cb('description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={3}
                  placeholder={cb('descPh')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">
                    Start Date/Time <span className="text-error">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.meetingDate}
                    onChange={(e) => setFormData({ ...formData, meetingDate: e.target.value })}
                    className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{cb('endDateTime')}</label>
                  <input
                    type="datetime-local"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{cb('location')}</label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder={cb('locationPh')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{cb('meetingLink')}</label>
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
                {cb('cancel')}
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
                {cb('createMeeting')}
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
  const cb = useT('cab');
  const { data: meeting, isLoading } = useCabMeeting(meetingId);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-surface rounded-xl shadow-sm-xl p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!meeting) return null;

  const status = statusColors[meeting.status] || statusColors.scheduled;

  const tabs = [
    { id: 'overview' as TabType, label: cb('tabOverview'), icon: Calendar },
    { id: 'attendees' as TabType, label: cb('tabAttendees'), icon: Users },
    { id: 'agenda' as TabType, label: cb('tabAgenda'), icon: ClipboardList },
    { id: 'decisions' as TabType, label: cb('tabDecisions'), icon: CheckCircle },
    { id: 'action-items' as TabType, label: cb('tabActionItems'), icon: ListTodo },
    { id: 'minutes' as TabType, label: cb('tabMinutes'), icon: MessageSquare },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl shadow-sm-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <Calendar className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">{meeting.title}</h2>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.text}`}>
                {cb(status.label)}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {meeting.status === 'scheduled' && (
              <Button size="sm" onClick={onStart}>
                <Play className="h-4 w-4 mr-1" />
                {cb('start')}
              </Button>
            )}
            {meeting.status === 'in_progress' && (
              <Button size="sm" onClick={onComplete}>
                <CheckCircle className="h-4 w-4 mr-1" />
                {cb('complete')}
              </Button>
            )}
            {!isEditing && meeting.status !== 'completed' && meeting.status !== 'cancelled' && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-1" />
                {cb('edit')}
              </Button>
            )}
            {isEditing && (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  {cb('cancel')}
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
        <div className="border-b border-border flex-shrink-0">
          <nav className="flex px-6 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-4 border-b-2 text-sm font-medium whitespace-nowrap flex items-center ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-primary'
                    : 'border-transparent text-muted hover:text-secondary hover:border-border-strong'
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
        <div className="px-6 py-4 border-t border-border flex justify-between flex-shrink-0">
          <Button variant="danger" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            {cb('deleteMeeting')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {cb('close')}
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
  const cb = useT('cab');
  const intl = useOptionalIntl();
  const loc = intl?.locale ?? 'en-US';
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(loc, {
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
          <label className="block text-sm font-medium text-secondary mb-1">{cb('titleLabel')}</label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary mb-1">{cb('description')}</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">{cb('startDateTime')}</label>
            <input
              type="datetime-local"
              value={formData.meetingDate}
              onChange={(e) => setFormData({ ...formData, meetingDate: e.target.value })}
              className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">{cb('endDateTime')}</label>
            <input
              type="datetime-local"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary mb-1">{cb('location')}</label>
          <Input
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-secondary mb-1">{cb('meetingLink')}</label>
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
        <div className="bg-primary-subtle rounded-lg p-4">
          <div className="text-2xl font-bold text-primary">{meeting.changes_count || 0}</div>
          <div className="text-sm text-primary">{cb('totalChanges')}</div>
        </div>
        <div className="bg-success-subtle rounded-lg p-4">
          <div className="text-2xl font-bold text-success">{meeting.attendee_count || 0}</div>
          <div className="text-sm text-success">{cb('colAttendees')}</div>
        </div>
        <div className="bg-warning-subtle rounded-lg p-4">
          <div className="text-2xl font-bold text-warning">-</div>
          <div className="text-sm text-warning">{cb('pending')}</div>
        </div>
        <div className="bg-info-subtle rounded-lg p-4">
          <div className="text-2xl font-bold text-info">-</div>
          <div className="text-sm text-info">{cb('actionItems')}</div>
        </div>
      </div>

      {/* Meeting Details */}
      <div className="bg-surface-hover rounded-lg p-4">
        <h3 className="text-sm font-medium text-foreground mb-4">{cb('meetingDetails')}</h3>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-muted">{cb('dateTime')}</dt>
            <dd className="mt-1 flex items-center text-sm text-foreground">
              <Calendar className="h-4 w-4 mr-2 text-muted" />
              {formatDate(meeting.meeting_date)}
            </dd>
          </div>
          {meeting.end_date && (
            <div>
              <dt className="text-sm text-muted">{cb('endTime')}</dt>
              <dd className="mt-1 flex items-center text-sm text-foreground">
                <Clock className="h-4 w-4 mr-2 text-muted" />
                {formatDate(meeting.end_date)}
              </dd>
            </div>
          )}
          {meeting.location && (
            <div>
              <dt className="text-sm text-muted">{cb('location')}</dt>
              <dd className="mt-1 flex items-center text-sm text-foreground">
                <MapPin className="h-4 w-4 mr-2 text-muted" />
                {meeting.location}
              </dd>
            </div>
          )}
          {meeting.meeting_link && (
            <div>
              <dt className="text-sm text-muted">{cb('meetingLink')}</dt>
              <dd className="mt-1 flex items-center text-sm text-primary">
                <Video className="h-4 w-4 mr-2 text-muted" />
                <a href={meeting.meeting_link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {cb('joinMeeting')}
                </a>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-muted">{cb('organizer')}</dt>
            <dd className="mt-1 flex items-center text-sm text-foreground">
              <Users className="h-4 w-4 mr-2 text-muted" />
              {meeting.organizer_name || '-'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Description */}
      {meeting.description && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-2">{cb('description')}</h3>
          <p className="text-sm text-secondary whitespace-pre-wrap">{meeting.description}</p>
        </div>
      )}
    </div>
  );
}

// Attendees Tab
function AttendeesTab({ meetingId, meeting }: { meetingId: string; meeting: CabMeeting }) {
  const cb = useT('cab');
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
            {cb('addAttendee')}
          </Button>
        </div>
      )}

      {showAddUser && (
        <div className="bg-surface-hover rounded-lg p-4">
          <div className="flex items-end space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary mb-1">{cb('user')}</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">{cb('selectUser')}</option>
                {users.map((user: { id: string; name: string }) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">{cb('role')}</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as CabAttendeeRole)}
                className="px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="chair">{cb('rChair')}</option>
                <option value="member">{cb('rMember')}</option>
                <option value="guest">{cb('rGuest')}</option>
              </select>
            </div>
            <Button onClick={handleAddAttendee} disabled={!selectedUserId || addAttendee.isPending}>
              {addAttendee.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
            </Button>
            <Button variant="outline" onClick={() => setShowAddUser(false)}>{cb('cancel')}</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : attendees.length === 0 ? (
        <div className="text-center py-8 text-muted">
          {cb('noAttendees')}
        </div>
      ) : (
        <div className="space-y-2">
          {attendees.map((attendee) => (
            <div key={attendee.id} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white text-sm font-medium">
                  {attendee.user_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{attendee.user_name || cb('unknown')}</div>
                  <div className="text-xs text-muted">{attendee.user_email || ''}</div>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-surface-hover text-secondary">
                  {cb(roleLabels[attendee.role])}
                </span>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleRemoveAttendee(attendee.id)}
                  className="text-error hover:text-error"
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
  const cb = useT('cab');
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
          <h3 className="text-sm font-medium text-foreground">{cb('changesToReview')}</h3>
          {canEdit && (
            <Button size="sm" onClick={() => setShowAddChange(true)}>
              <Plus className="h-4 w-4 mr-1" />
              {cb('addChange')}
            </Button>
          )}
        </div>

        {showAddChange && (
          <div className="bg-surface-hover rounded-lg p-4 mb-4">
            <div className="flex items-end space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-secondary mb-1">{cb('change')}</label>
                <select
                  value={selectedChangeId}
                  onChange={(e) => setSelectedChangeId(e.target.value)}
                  className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">{cb('selectChange')}</option>
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
              <Button variant="outline" onClick={() => setShowAddChange(false)}>{cb('cancel')}</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : changes.length === 0 ? (
          <div className="text-center py-8 text-muted">
            {cb('noChangesAdded')}
          </div>
        ) : (
          <div className="space-y-2">
            {changes.map((change, index) => {
              const risk = riskColors[change.change_risk_level || 'medium'] || riskColors.medium;
              return (
                <div key={change.id} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-muted w-6">{index + 1}.</span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-primary">{change.change_number}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${risk.bg} ${risk.text}`}>
                          {change.change_risk_level || 'medium'}
                        </span>
                        {change.decision && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${decisionColors[change.decision].bg} ${decisionColors[change.decision].text}`}>
                            {cb(decisionColors[change.decision].label)}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-foreground">{change.change_title}</div>
                      <div className="text-xs text-muted">{cb('requester', { name: change.requester_name || '-' })}</div>
                    </div>
                  </div>
                  {canEdit && !change.decision && (
                    <button
                      onClick={() => handleRemoveChange(change.change_id)}
                      className="text-error hover:text-error"
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
          <h3 className="text-sm font-medium text-foreground">{cb('meetingAgenda')}</h3>
          <div className="flex space-x-2">
            {canEdit && !editingAgenda && (
              <>
                <Button variant="outline" size="sm" onClick={handleGenerateAgenda} disabled={generateAgenda.isPending}>
                  {generateAgenda.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                  {cb('generate')}
                </Button>
                <Button size="sm" onClick={() => setEditingAgenda(true)}>
                  <Edit className="h-4 w-4 mr-1" />
                  {cb('edit')}
                </Button>
              </>
            )}
            {editingAgenda && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditingAgenda(false)}>{cb('cancel')}</Button>
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
            className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            rows={15}
            placeholder={cb('agendaPh')}
          />
        ) : (
          <div className="bg-surface-hover rounded-lg p-4 min-h-[200px]">
            {meeting.agenda ? (
              <pre className="text-sm text-secondary whitespace-pre-wrap font-sans">{meeting.agenda}</pre>
            ) : (
              <p className="text-sm text-muted italic">{cb('noAgenda')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Decisions Tab
function DecisionsTab({ meetingId, meeting }: { meetingId: string; meeting: CabMeeting }) {
  const cb = useT('cab');
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
        <div className="bg-warning-subtle border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-warning">
            {cb('startToRecord')}
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : changes.length === 0 ? (
        <div className="text-center py-8 text-muted">
          {cb('noChangesToReview')}
        </div>
      ) : (
        <div className="space-y-4">
          {changes.map((change) => {
            const risk = riskColors[change.change_risk_level || 'medium'] || riskColors.medium;
            const isSelected = selectedChange?.id === change.id;

            return (
              <div
                key={change.id}
                className={`p-4 border rounded-lg ${isSelected ? 'border-blue-500 bg-primary-subtle' : 'border-border'}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-primary">{change.change_number}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${risk.bg} ${risk.text}`}>
                        {cb('riskSuffix', { risk: change.change_risk_level || 'medium' })}
                      </span>
                    </div>
                    <h4 className="text-sm font-medium text-foreground mt-1">{change.change_title}</h4>
                    <p className="text-xs text-muted mt-1">{cb('requester', { name: change.requester_name || '-' })}</p>
                  </div>

                  {change.decision ? (
                    <div className="text-right">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${decisionColors[change.decision].bg} ${decisionColors[change.decision].text}`}>
                        {change.decision === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {change.decision === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                        {change.decision === 'deferred' && <Clock className="h-3 w-3 mr-1" />}
                        {cb(decisionColors[change.decision].label)}
                      </span>
                      {change.decided_by_name && (
                        <p className="text-xs text-muted mt-1">by {change.decided_by_name}</p>
                      )}
                      {change.decision_notes && (
                        <p className="text-xs text-muted mt-1 italic">&quot;{change.decision_notes}&quot;</p>
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
                      {cb('recordDecision')}
                    </Button>
                  ) : (
                    <span className="text-sm text-muted">{cb('pending')}</span>
                  )}
                </div>

                {isSelected && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-secondary mb-2">{cb('decision')}</label>
                        <div className="flex space-x-2">
                          <Button
                            variant={decision === 'approved' ? 'primary' : 'outline'}
                            size="sm"
                            onClick={() => setDecision('approved')}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {cb('approve')}
                          </Button>
                          <Button
                            variant={decision === 'rejected' ? 'danger' : 'outline'}
                            size="sm"
                            onClick={() => setDecision('rejected')}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            {cb('reject')}
                          </Button>
                          <Button
                            variant={decision === 'deferred' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => setDecision('deferred')}
                          >
                            <Clock className="h-4 w-4 mr-1" />
                            {cb('defer')}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-secondary mb-1">{cb('notes')}</label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          rows={2}
                          placeholder={cb('notesPh')}
                        />
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button variant="outline" size="sm" onClick={() => setSelectedChange(null)}>
                          {cb('cancel')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleRecordDecision}
                          disabled={!decision || recordDecision.isPending}
                        >
                          {recordDecision.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : null}
                          {cb('saveDecision')}
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
  const cb = useT('cab');
  const intl = useOptionalIntl();
  const loc = intl?.locale ?? 'en-US';
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
          {cb('addActionItem')}
        </Button>
      </div>

      {showAddForm && (
        <div className="bg-surface-hover rounded-lg p-4">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">{cb('description')}</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={cb('actionPh')}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{cb('assignee')}</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">{cb('unassigned')}</option>
                  {users.map((user: { id: string; name: string }) => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{cb('dueDate')}</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>{cb('cancel')}</Button>
              <Button size="sm" onClick={handleAddItem} disabled={!description || addActionItem.isPending}>
                {addActionItem.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {cb('add')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : actionItems.length === 0 ? (
        <div className="text-center py-8 text-muted">
          {cb('noActionItems')}
        </div>
      ) : (
        <div className="space-y-2">
          {actionItems.map((item) => (
            <div key={item.id} className="flex items-start space-x-3 p-3 bg-surface-hover rounded-lg">
              <button
                onClick={() => handleToggleStatus(item)}
                className={`mt-0.5 flex-shrink-0 ${item.status === 'completed' ? 'text-success' : 'text-muted'}`}
              >
                <CheckCircle className="h-5 w-5" />
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.status === 'completed' ? 'text-muted line-through' : 'text-foreground'}`}>
                  {item.description}
                </p>
                <div className="flex items-center space-x-4 mt-1 text-xs text-muted">
                  {item.assignee_name && (
                    <span className="flex items-center">
                      <Users className="h-3 w-3 mr-1" />
                      {item.assignee_name}
                    </span>
                  )}
                  {item.due_date && (
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {new Date(item.due_date).toLocaleDateString(loc)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(item.id)}
                className="text-error hover:text-error"
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
  const cb = useT('cab');
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
        <h3 className="text-sm font-medium text-foreground">{cb('meetingMinutes')}</h3>
        <div className="flex space-x-2">
          {!isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-1" />
                {cb('edit')}
              </Button>
              {meeting.minutes && (
                <Button size="sm" onClick={handleDistribute} disabled={distributeMinutes.isPending}>
                  {distributeMinutes.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  {cb('distribute')}
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>{cb('cancel')}</Button>
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
          className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
          rows={20}
          placeholder={cb('minutesPh')}
        />
      ) : (
        <div className="bg-surface-hover rounded-lg p-4 min-h-[300px]">
          {meeting.minutes ? (
            <pre className="text-sm text-secondary whitespace-pre-wrap font-sans">{meeting.minutes}</pre>
          ) : (
            <p className="text-sm text-muted italic">{cb('noMinutes')}</p>
          )}
        </div>
      )}
    </div>
  );
}
