'use client';

import { useT, useOptionalIntl } from '@/i18n/useT';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  Users,
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Phone,
  Loader2,
  AlertCircle,
  Save,
  X,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { oncallApi, usersApi, groupsApi } from '@/lib/api';

interface ScheduleData {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  rotation_type: 'daily' | 'weekly' | 'custom';
  rotation_interval: number;
  handoff_time: string;
  handoff_day: number | null;
  is_active: boolean;
  group_id: string | null;
  group_name: string | null;
  created_at: string;
  updated_at: string;
}

interface RotationMember {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  position: number;
  created_at: string;
}

interface ShiftData {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  start_time: string;
  end_time: string;
  is_override: boolean;
  notes: string | null;
}

interface UserData {
  id: string;
  name: string;
  email: string;
}

interface GroupData {
  id: string;
  name: string;
}

const rotationTypeLabels: Record<string, string> = {
  daily: 'rDaily',
  weekly: 'rWeekly',
  custom: 'rCustom',
};

export default function ScheduleEditorPage() {
  const se = useT('scheduleEditor');
  const intl = useOptionalIntl();
  const loc = intl?.locale ?? 'en-US';
  const params = useParams();
  const scheduleId = params.id as string;

  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [rotationMembers, setRotationMembers] = useState<RotationMember[]>([]);
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    timezone: 'America/New_York',
    rotation_type: 'weekly' as 'daily' | 'weekly' | 'custom',
    rotation_interval: 1,
    handoff_time: '09:00',
    handoff_day: 1,
    is_active: true,
    group_id: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  // Calendar view state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [_viewMode, _setViewMode] = useState<'week' | 'month'>('week');

  // Add member modal
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Override modal
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideForm, setOverrideForm] = useState({
    userId: '',
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '09:00',
    notes: '',
  });
  const [isCreatingOverride, setIsCreatingOverride] = useState(false);

  const loadSchedule = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await oncallApi.getSchedule(scheduleId);
      setSchedule(data);
      setEditForm({
        name: data.name,
        description: data.description || '',
        timezone: data.timezone,
        rotation_type: data.rotation_type,
        rotation_interval: data.rotation_interval,
        handoff_time: data.handoff_time,
        handoff_day: data.handoff_day || 1,
        is_active: data.is_active,
        group_id: data.group_id || '',
      });
    } catch (err) {
      console.error('Failed to load schedule:', err);
      setError(se('loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [scheduleId, se]);

  const loadRotationMembers = useCallback(async () => {
    try {
      const response = await oncallApi.getRotations(scheduleId);
      setRotationMembers(response.data || []);
    } catch (err) {
      console.error('Failed to load rotation members:', err);
    }
  }, [scheduleId]);

  const loadShifts = useCallback(async () => {
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(currentDate);
    endDate.setDate(endDate.getDate() + 30);

    try {
      const response = await oncallApi.getShifts(scheduleId, {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      });
      setShifts(response.data || []);
    } catch (err) {
      console.error('Failed to load shifts:', err);
    }
  }, [scheduleId, currentDate]);

  const loadUsers = useCallback(async () => {
    try {
      const response = await usersApi.list({ limit: 100 });
      setUsers(response.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const response = await groupsApi.list({ limit: 100 });
      setGroups(response.data || []);
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
    loadRotationMembers();
    loadShifts();
    loadUsers();
    loadGroups();
  }, [loadSchedule, loadRotationMembers, loadShifts, loadUsers, loadGroups]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await oncallApi.updateSchedule(scheduleId, {
        name: editForm.name,
        description: editForm.description || undefined,
        timezone: editForm.timezone,
        rotationType: editForm.rotation_type as 'daily' | 'weekly' | 'bi_weekly' | 'custom' | undefined,
        rotationLength: editForm.rotation_interval,
        handoffTime: editForm.handoff_time,
        handoffDay: editForm.rotation_type === 'weekly' ? editForm.handoff_day : undefined,
        isActive: editForm.is_active,
        groupId: editForm.group_id || undefined,
      });
      setIsEditing(false);
      loadSchedule();
    } catch (err) {
      console.error('Failed to save schedule:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedUserId) return;

    try {
      setIsAddingMember(true);
      await oncallApi.addToRotation(scheduleId, selectedUserId, rotationMembers.length);
      setShowAddMember(false);
      setSelectedUserId('');
      loadRotationMembers();
    } catch (err) {
      console.error('Failed to add member:', err);
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (rotationId: string) => {
    if (!confirm(se('confirmRemove'))) return;

    try {
      await oncallApi.removeFromRotation(scheduleId, rotationId);
      loadRotationMembers();
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  const handleCreateOverride = async () => {
    if (!overrideForm.userId || !overrideForm.startDate || !overrideForm.endDate) return;

    try {
      setIsCreatingOverride(true);
      await oncallApi.createOverride(scheduleId, {
        userId: overrideForm.userId,
        startTime: `${overrideForm.startDate}T${overrideForm.startTime}:00`,
        endTime: `${overrideForm.endDate}T${overrideForm.endTime}:00`,
        reason: overrideForm.notes || undefined,
      });
      setShowOverrideModal(false);
      setOverrideForm({
        userId: '',
        startDate: '',
        startTime: '09:00',
        endDate: '',
        endTime: '09:00',
        notes: '',
      });
      loadShifts();
    } catch (err) {
      console.error('Failed to create override:', err);
    } finally {
      setIsCreatingOverride(false);
    }
  };

  const getWeekDays = () => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getShiftForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return shifts.find((s) => {
      const shiftStart = s.start_time.split('T')[0];
      const shiftEnd = s.end_time.split('T')[0];
      return dateStr >= shiftStart && dateStr < shiftEnd;
    });
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentDate(newDate);
  };

  const _formatDate = (date: Date) => {
    return date.toLocaleDateString(loc, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !schedule) {
    return (
      <div className="bg-error-subtle border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle className="h-12 w-12 bg-error-subtle0 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-error mb-2">{error || se('notFound')}</h3>
        <Link href="/oncall">
          <Button variant="outline">{se('backToOncall')}</Button>
        </Link>
      </div>
    );
  }

  const weekDays = getWeekDays();
  const availableUsers = users.filter(
    (u) => !rotationMembers.some((m) => m.user_id === u.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <Link href="/oncall" className="mt-1">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-foreground">
                {isEditing ? (
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    className="text-2xl font-bold"
                  />
                ) : (
                  schedule.name
                )}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                schedule.is_active ? 'bg-success-subtle text-success' : 'bg-background text-foreground'
              }`}>
                {schedule.is_active ? se('active') : se('inactive')}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {se('rotationSuffix', { type: se(rotationTypeLabels[schedule.rotation_type]), timezone: schedule.timezone })}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                <X className="h-4 w-4 mr-2" />
                {se('cancel')}
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {se('save')}
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Edit className="h-4 w-4 mr-2" />
              {se('editSchedule')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Calendar */}
        <div className="lg:col-span-2 space-y-6">
          {/* Calendar Header */}
          <div className="bg-surface rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button onClick={() => navigateWeek('prev')} className="p-1 hover:bg-background rounded">
                  <ChevronLeft className="h-5 w-5 text-secondary" />
                </button>
                <h2 className="text-lg font-medium text-foreground">
                  {weekDays[0].toLocaleDateString(loc, { month: 'long', year: 'numeric' })}
                </h2>
                <button onClick={() => navigateWeek('next')} className="p-1 hover:bg-background rounded">
                  <ChevronRight className="h-5 w-5 text-secondary" />
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                  {se('today')}
                </Button>
                <Button onClick={() => setShowOverrideModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {se('addOverride')}
                </Button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="p-6">
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day) => {
                  const shift = getShiftForDate(day);
                  const today = isToday(day);

                  return (
                    <div
                      key={day.toISOString()}
                      className={`border rounded-xl p-3 min-h-[100px] ${
                        today ? 'border-blue-500 bg-primary-subtle' : 'border-border'
                      }`}
                    >
                      <div className="text-xs text-muted">
                        {day.toLocaleDateString(loc, { weekday: 'short' })}
                      </div>
                      <div className={`text-lg font-medium ${today ? 'text-primary' : 'text-foreground'}`}>
                        {day.getDate()}
                      </div>
                      {shift && (
                        <div className={`mt-2 p-2 rounded text-xs ${
                          shift.is_override ? 'bg-warning-subtle text-warning' : 'bg-success-subtle text-success'
                        }`}>
                          <div className="font-medium">{shift.user_name}</div>
                          {shift.is_override && (
                            <div className="text-xs opacity-75">{se('override')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Edit Form (when editing) */}
          {isEditing && (
            <div className="bg-surface rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-medium text-foreground mb-4">{se('settings')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{se('description')}</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{se('timezone')}</label>
                  <select
                    value={editForm.timezone}
                    onChange={(e) => setEditForm((p) => ({ ...p, timezone: e.target.value }))}
                    className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="America/New_York">{se('tzEastern')}</option>
                    <option value="America/Chicago">{se('tzCentral')}</option>
                    <option value="America/Denver">{se('tzMountain')}</option>
                    <option value="America/Los_Angeles">{se('tzPacific')}</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{se('rotationType')}</label>
                  <select
                    value={editForm.rotation_type}
                    onChange={(e) => setEditForm((p) => ({ ...p, rotation_type: e.target.value as typeof editForm.rotation_type }))}
                    className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="daily">{se('rDaily')}</option>
                    <option value="weekly">{se('rWeekly')}</option>
                    <option value="custom">{se('rCustom')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{se('handoffTime')}</label>
                  <input
                    type="time"
                    value={editForm.handoff_time}
                    onChange={(e) => setEditForm((p) => ({ ...p, handoff_time: e.target.value }))}
                    className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                {editForm.rotation_type === 'weekly' && (
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-1">{se('handoffDay')}</label>
                    <select
                      value={editForm.handoff_day}
                      onChange={(e) => setEditForm((p) => ({ ...p, handoff_day: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value={0}>{se('sun')}</option>
                      <option value={1}>{se('mon')}</option>
                      <option value={2}>{se('tue')}</option>
                      <option value={3}>{se('wed')}</option>
                      <option value={4}>{se('thu')}</option>
                      <option value={5}>{se('fri')}</option>
                      <option value={6}>{se('sat')}</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{se('assignmentGroup')}</label>
                  <select
                    value={editForm.group_id}
                    onChange={(e) => setEditForm((p) => ({ ...p, group_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">{se('noGroup')}</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.checked }))}
                    className="h-4 w-4 text-primary rounded mr-2"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium text-secondary">
                    {se('isActive')}
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Rotation Members */}
        <div className="space-y-6">
          <div className="bg-surface rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-medium text-foreground">{se('rotationMembers')}</h3>
              <Button size="sm" onClick={() => setShowAddMember(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6">
              {rotationMembers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted mx-auto mb-4" />
                  <p className="text-muted">{se('noMembers')}</p>
                  <Button variant="outline" className="mt-4" onClick={() => setShowAddMember(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {se('addMember')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {rotationMembers.sort((a, b) => a.position - b.position).map((member, idx) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-surface-hover rounded-xl"
                    >
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-primary-subtle flex items-center justify-center text-sm font-medium text-primary">
                          {idx + 1}
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-foreground">{member.user_name}</div>
                          <div className="text-xs text-muted">{member.user_email}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="bg-error-subtle0 hover:text-error"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Who's On-Call Now */}
          <div className="bg-surface rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">{se('currentlyOncall')}</h3>
            </div>
            <div className="p-6">
              {shifts.find((s) => {
                const now = new Date();
                return new Date(s.start_time) <= now && now < new Date(s.end_time);
              }) ? (
                (() => {
                  const currentShift = shifts.find((s) => {
                    const now = new Date();
                    return new Date(s.start_time) <= now && now < new Date(s.end_time);
                  })!;
                  return (
                    <div className="flex items-center">
                      <div className="h-12 w-12 rounded-full bg-success-subtle flex items-center justify-center">
                        <Phone className="h-6 w-6 text-success" />
                      </div>
                      <div className="ml-4">
                        <div className="font-medium text-foreground">{currentShift.user_name}</div>
                        <div className="text-sm text-muted">{currentShift.user_email}</div>
                        {currentShift.is_override && (
                          <span className="text-xs bg-warning-subtle text-warning px-2 py-0.5 rounded">
                            {se('override')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-muted text-center">{se('noOneOncall')}</p>
              )}
            </div>
          </div>

          {/* Schedule Info */}
          <div className="bg-surface rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">{se('scheduleInfo')}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{se('rotation')}</span>
                <span className="font-medium text-foreground flex items-center">
                  <RefreshCw className="h-4 w-4 mr-1 text-muted" />
                  {se(rotationTypeLabels[schedule.rotation_type])}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{se('handoff')}</span>
                <span className="font-medium text-foreground flex items-center">
                  <Clock className="h-4 w-4 mr-1 text-muted" />
                  {schedule.handoff_time}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{se('timezone')}</span>
                <span className="font-medium text-foreground">{schedule.timezone}</span>
              </div>
              {schedule.group_name && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">{se('group')}</span>
                  <span className="font-medium text-foreground flex items-center">
                    <Users className="h-4 w-4 mr-1 text-muted" />
                    {schedule.group_name}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl shadow-sm-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">{se('addMemberTitle')}</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-secondary mb-1">{se('selectUser')}</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">{se('selectUserPh')}</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowAddMember(false)}>
                {se('cancel')}
              </Button>
              <Button onClick={handleAddMember} disabled={!selectedUserId || isAddingMember}>
                {isAddingMember ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                {se('addMember')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl shadow-sm-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">{se('createOverride')}</h2>
            <p className="text-sm text-secondary mb-4">
              {se('overrideHelp')}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{se('user')}</label>
                <select
                  value={overrideForm.userId}
                  onChange={(e) => setOverrideForm((p) => ({ ...p, userId: e.target.value }))}
                  className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">{se('selectUserPh')}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{se('startDate')}</label>
                  <input
                    type="date"
                    value={overrideForm.startDate}
                    onChange={(e) => setOverrideForm((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{se('startTime')}</label>
                  <input
                    type="time"
                    value={overrideForm.startTime}
                    onChange={(e) => setOverrideForm((p) => ({ ...p, startTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{se('endDate')}</label>
                  <input
                    type="date"
                    value={overrideForm.endDate}
                    onChange={(e) => setOverrideForm((p) => ({ ...p, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary mb-1">{se('endTime')}</label>
                  <input
                    type="time"
                    value={overrideForm.endTime}
                    onChange={(e) => setOverrideForm((p) => ({ ...p, endTime: e.target.value }))}
                    className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">{se('notesOptional')}</label>
                <textarea
                  value={overrideForm.notes}
                  onChange={(e) => setOverrideForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  placeholder={se('overridePh')}
                  className="w-full px-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <Button variant="outline" onClick={() => setShowOverrideModal(false)}>
                {se('cancel')}
              </Button>
              <Button
                onClick={handleCreateOverride}
                disabled={!overrideForm.userId || !overrideForm.startDate || !overrideForm.endDate || isCreatingOverride}
              >
                {isCreatingOverride ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                {se('createOverrideBtn')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
