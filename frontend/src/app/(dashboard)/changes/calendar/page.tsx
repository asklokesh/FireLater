'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  List,
  AlertCircle,
  Clock,
  User,
  Server,
  Loader2,
  Plus,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { changesApi } from '@/lib/api';

interface ChangeData {
  id: string;
  change_id: string;
  title: string;
  type: string;
  status: string;
  risk_level: string;
  scheduled_start: string;
  scheduled_end: string;
  assigned_to_name: string | null;
  application_name: string | null;
}

const riskColors: Record<string, { bg: string; border: string; text: string }> = {
  low: { bg: 'bg-success-subtle', border: 'border-success', text: 'text-success' },
  medium: { bg: 'bg-warning-subtle', border: 'border-warning', text: 'text-warning' },
  high: { bg: 'bg-error-subtle', border: 'border-error', text: 'text-error' },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-surface-hover', text: 'text-foreground' },
  submitted: { bg: 'bg-primary-subtle', text: 'text-primary' },
  approved: { bg: 'bg-success-subtle', text: 'text-success' },
  scheduled: { bg: 'bg-primary-subtle', text: 'text-primary' },
  implementing: { bg: 'bg-warning-subtle', text: 'text-warning' },
  completed: { bg: 'bg-success-subtle', text: 'text-success' },
  failed: { bg: 'bg-error-subtle', text: 'text-error' },
  cancelled: { bg: 'bg-surface-hover', text: 'text-foreground' },
};

export default function ChangeCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [changes, setChanges] = useState<ChangeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChange, setSelectedChange] = useState<ChangeData | null>(null);

  // Filters
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const loadChanges = useCallback(async () => {
    try {
      setIsLoading(true);

      // Calculate date range based on view
      const startDate = new Date(currentDate);
      const endDate = new Date(currentDate);

      if (viewMode === 'month') {
        startDate.setDate(1);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0);
      } else {
        startDate.setDate(startDate.getDate() - startDate.getDay());
        endDate.setDate(startDate.getDate() + 6);
      }

      // Extend range to include overlapping changes
      startDate.setDate(startDate.getDate() - 7);
      endDate.setDate(endDate.getDate() + 7);

      const response = await changesApi.list({
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        limit: 200,
      });

      setChanges(response.data || []);
    } catch (err) {
      console.error('Failed to load changes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, viewMode]);

  useEffect(() => {
    loadChanges();
  }, [loadChanges]);

  // Filter changes
  const filteredChanges = useMemo(() => {
    return changes.filter((change) => {
      if (riskFilter !== 'all' && change.risk_level !== riskFilter) return false;
      if (statusFilter !== 'all' && change.status !== statusFilter) return false;
      return true;
    });
  }, [changes, riskFilter, statusFilter]);

  // Get days for current month view
  const getMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Add days from previous month
    const startDay = firstDay.getDay();
    for (let i = startDay - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({ date, isCurrentMonth: false });
    }

    // Add days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    // Add days from next month to complete the grid
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({ date, isCurrentMonth: false });
    }

    return days;
  };

  // Get days for current week view
  const getWeekDays = () => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    return days;
  };

  // Get changes for a specific date
  const getChangesForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return filteredChanges.filter((change) => {
      const startDate = change.scheduled_start?.split('T')[0];
      const endDate = change.scheduled_end?.split('T')[0];
      return startDate && endDate && dateStr >= startDate && dateStr <= endDate;
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentDate(newDate);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const monthDays = getMonthDays();
  const weekDays = getWeekDays();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Change Calendar</h1>
          <p className="mt-1 text-sm text-muted">
            View scheduled changes on a calendar
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/changes/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Change
            </Button>
          </Link>
        </div>
      </div>

      {/* Calendar Controls */}
      <div className="bg-surface rounded-xl shadow-sm">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => viewMode === 'month' ? navigateMonth('prev') : navigateWeek('prev')}
              className="p-2 hover:bg-surface-hover rounded"
            >
              <ChevronLeft className="h-5 w-5 text-secondary" />
            </button>
            <h2 className="text-lg font-medium text-foreground min-w-[200px] text-center">
              {viewMode === 'month'
                ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : `Week of ${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              }
            </h2>
            <button
              onClick={() => viewMode === 'month' ? navigateMonth('next') : navigateWeek('next')}
              className="p-2 hover:bg-surface-hover rounded"
            >
              <ChevronRight className="h-5 w-5 text-secondary" />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
            <div className="flex border border-border-strong rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 text-sm ${
                  viewMode === 'month' ? 'bg-primary-subtle text-primary' : 'bg-surface text-secondary'
                }`}
              >
                <Calendar className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 text-sm ${
                  viewMode === 'week' ? 'bg-primary-subtle text-primary' : 'bg-surface text-secondary'
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="px-6 py-3 border-b border-border bg-surface-hover flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-secondary">Risk:</label>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="px-2 py-1 border border-border-strong rounded text-sm"
              >
                <option value="all">All</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm text-secondary">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1 border border-border-strong rounded text-sm"
              >
                <option value="all">All</option>
                <option value="approved">Approved</option>
                <option value="scheduled">Scheduled</option>
                <option value="implementing">Implementing</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        )}

        {/* Calendar Content */}
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : viewMode === 'month' ? (
          /* Month View */
          <div className="p-4">
            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-px bg-border">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="bg-background text-xs font-medium text-muted text-center py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-px bg-border">
              {monthDays.map(({ date, isCurrentMonth }, idx) => {
                const dayChanges = getChangesForDate(date);
                const today = isToday(date);

                return (
                  <div
                    key={idx}
                    className={`bg-surface p-2 min-h-[96px] ${
                      today ? 'ring-1 ring-inset ring-primary' : ''
                    }`}
                  >
                    <div className={`text-sm mb-1 ${
                      today ? 'font-bold text-primary' :
                      isCurrentMonth ? 'text-foreground' : 'text-muted'
                    }`}>
                      {date.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayChanges.slice(0, 3).map((change) => {
                        const risk = riskColors[change.risk_level] || riskColors.low;
                        return (
                          <Link
                            key={change.id}
                            href={`/changes/${change.id}`}
                            className={`block px-1.5 py-0.5 rounded text-xs truncate ${risk.bg} ${risk.text} hover:opacity-80`}
                            title={change.title}
                          >
                            {change.change_id}
                          </Link>
                        );
                      })}
                      {dayChanges.length > 3 && (
                        <div className="text-xs text-muted pl-1">
                          +{dayChanges.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Week View */
          <div className="p-4">
            <div className="grid grid-cols-7 gap-4">
              {weekDays.map((date, idx) => {
                const dayChanges = getChangesForDate(date);
                const today = isToday(date);

                return (
                  <div key={idx} className="space-y-2">
                    <div className={`text-center py-2 rounded ${
                      today ? 'bg-primary-subtle text-primary' : 'bg-surface-hover'
                    }`}>
                      <div className="text-xs text-muted">
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className={`text-lg font-medium ${today ? 'text-primary' : 'text-foreground'}`}>
                        {date.getDate()}
                      </div>
                    </div>
                    <div className="space-y-2 min-h-[300px]">
                      {dayChanges.map((change) => {
                        const risk = riskColors[change.risk_level] || riskColors.low;
                        const status = statusColors[change.status] || statusColors.draft;

                        return (
                          <Link
                            key={change.id}
                            href={`/changes/${change.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              setSelectedChange(change);
                            }}
                            className={`block p-2 rounded border ${risk.border} ${risk.bg} hover:shadow transition-shadow`}
                          >
                            <div className="text-xs font-medium text-foreground">{change.change_id}</div>
                            <div className="text-xs text-secondary truncate">{change.title}</div>
                            <div className="flex items-center justify-between mt-1">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${status.bg} ${status.text}`}>
                                {change.status}
                              </span>
                              <span className="text-xs text-muted">
                                {formatTime(change.scheduled_start)}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-surface rounded-xl shadow-sm p-4">
        <h3 className="text-sm font-medium text-secondary mb-3">Risk Levels</h3>
        <div className="flex items-center space-x-6">
          {Object.entries(riskColors).map(([risk, colors]) => (
            <div key={risk} className="flex items-center">
              <div className={`h-3 w-3 rounded ${colors.bg} ${colors.border} border mr-2`} />
              <span className="text-sm text-secondary capitalize">{risk}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Change Detail Modal */}
      {selectedChange && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl shadow-sm-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{selectedChange.change_id}</h2>
                <p className="text-sm text-muted">{selectedChange.title}</p>
              </div>
              <button
                onClick={() => setSelectedChange(null)}
                className="text-muted hover:text-secondary"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center text-sm">
                <AlertCircle className="h-4 w-4 text-muted mr-2" />
                <span className="text-secondary">Risk:</span>
                <span className={`ml-2 px-2 py-0.5 rounded text-xs ${riskColors[selectedChange.risk_level]?.bg || ''} ${riskColors[selectedChange.risk_level]?.text || ''}`}>
                  {selectedChange.risk_level}
                </span>
              </div>
              <div className="flex items-center text-sm">
                <Clock className="h-4 w-4 text-muted mr-2" />
                <span className="text-secondary">Status:</span>
                <span className={`ml-2 px-2 py-0.5 rounded text-xs ${statusColors[selectedChange.status]?.bg || ''} ${statusColors[selectedChange.status]?.text || ''}`}>
                  {selectedChange.status}
                </span>
              </div>
              <div className="flex items-center text-sm">
                <Calendar className="h-4 w-4 text-muted mr-2" />
                <span className="text-secondary">Scheduled:</span>
                <span className="ml-2 text-foreground">
                  {new Date(selectedChange.scheduled_start).toLocaleString()}
                </span>
              </div>
              {selectedChange.assigned_to_name && (
                <div className="flex items-center text-sm">
                  <User className="h-4 w-4 text-muted mr-2" />
                  <span className="text-secondary">Assignee:</span>
                  <span className="ml-2 text-foreground">{selectedChange.assigned_to_name}</span>
                </div>
              )}
              {selectedChange.application_name && (
                <div className="flex items-center text-sm">
                  <Server className="h-4 w-4 text-muted mr-2" />
                  <span className="text-secondary">Application:</span>
                  <span className="ml-2 text-foreground">{selectedChange.application_name}</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex space-x-3">
              <Link href={`/changes/${selectedChange.id}`} className="flex-1">
                <Button className="w-full">View Details</Button>
              </Link>
              <Button variant="outline" onClick={() => setSelectedChange(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
