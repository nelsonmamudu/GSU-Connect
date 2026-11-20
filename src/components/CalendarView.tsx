import React, { useMemo, useState } from 'react';
import {
  Building2,
  CalendarDays,
  Clock,
  Download,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '../services/supabaseService';
import { downloadCalendarEventIcs } from '../utils/fileHelpers';
import {
  AppUser,
  CALENDAR_EVENT_TYPE_LABELS,
  CALENDAR_LEVELS,
  CalendarEvent,
  CalendarEventType,
  CalendarLevel,
  DepartmentItem,
} from '../types';
import { RoleBadge } from './RoleBadge';

interface CalendarViewProps {
  currentUser: AppUser;
  events: CalendarEvent[];
  departments: DepartmentItem[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

const EVENT_TYPE_STYLES: Record<
  CalendarEventType,
  { card: string; dot: string; label: string }
> = {
  exam: {
    card: 'bg-rose-50/70 dark:bg-rose-950/25 border-rose-200/90 dark:border-rose-900/70',
    dot: 'bg-rose-600 dark:bg-rose-400',
    label: 'text-rose-700 dark:text-rose-300',
  },
  seminar: {
    card: 'bg-indigo-50/60 dark:bg-indigo-950/25 border-indigo-200/90 dark:border-indigo-900/70',
    dot: 'bg-indigo-600 dark:bg-indigo-400',
    label: 'text-indigo-700 dark:text-indigo-300',
  },
  deadline: {
    card: 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-200/90 dark:border-amber-900/70',
    dot: 'bg-amber-600 dark:bg-amber-400',
    label: 'text-amber-700 dark:text-amber-300',
  },
  campus_event: {
    card: 'bg-brand-subtle/60 dark:bg-brand-subtle/25 border-success-line/90 dark:border-success-line/70',
    dot: 'bg-brand dark:bg-brand-subtle',
    label: 'text-brand dark:text-brand',
  },
};

function formatCalendarDateHeading(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getRelativeDayTag(dateKey: string, todayKey: string): string | null {
  if (dateKey === todayKey) return 'Today';
  if (dateKey < todayKey) return 'Past';
  const [y1, m1, d1] = todayKey.split('-').map(Number);
  const [y2, m2, d2] = dateKey.split('-').map(Number);
  if ([y1, m1, d1, y2, m2, d2].some(Number.isNaN)) return null;
  const diffDays = Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000
  );
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays <= 14) return `In ${diffDays} days`;
  return null;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  currentUser,
  events,
  departments,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) => {
  const canManage = ['admin', 'classRep', 'deptHelper', 'lecturer'].includes(currentUser.role);
  const isAdmin = currentUser.role === 'admin';

  const [scopeTab, setScopeTab] = useState<'all' | 'mine' | 'exams'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CalendarEventType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPast, setShowPast] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Modal form fields
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<CalendarEventType>('exam');
  const [date, setDate] = useState(getTodayDateString());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [venue, setVenue] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [department, setDepartment] = useState(currentUser.department || 'All GSU');
  const [level, setLevel] = useState<CalendarLevel>('All');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const todayStr = getTodayDateString();

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events
      .filter((ev) => {
        if (!showPast && ev.date < todayStr) return false;
        if (
          scopeTab === 'mine' &&
          ev.department !== currentUser.department &&
          ev.department !== 'All GSU'
        ) {
          return false;
        }
        if (scopeTab === 'exams' && ev.eventType !== 'exam') return false;
        if (typeFilter !== 'all' && ev.eventType !== typeFilter) return false;
        if (!q) return true;
        return (
          ev.title.toLowerCase().includes(q) ||
          ev.courseCode.toLowerCase().includes(q) ||
          ev.venue.toLowerCase().includes(q) ||
          ev.department.toLowerCase().includes(q) ||
          ev.description.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const dateDiff = a.date.localeCompare(b.date);
        if (dateDiff !== 0) return dateDiff;
        return a.startTime.localeCompare(b.startTime);
      });
  }, [events, showPast, todayStr, scopeTab, currentUser.department, typeFilter, searchQuery]);

  const groupedDates = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const ev of filteredEvents) {
      const list = groups.get(ev.date);
      if (list) {
        list.push(ev);
      } else {
        groups.set(ev.date, [ev]);
      }
    }
    return Array.from(groups.entries());
  }, [filteredEvents]);

  const openCreateModal = () => {
    setEditingEvent(null);
    setTitle('');
    setEventType('exam');
    setDate(getTodayDateString());
    setStartTime('09:00');
    setEndTime('11:00');
    setVenue('');
    setCourseCode('');
    setDepartment(currentUser.department || 'All GSU');
    setLevel(
      currentUser.level === 'Staff' ? 'All' : (currentUser.level as CalendarLevel)
    );
    setDescription('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (ev: CalendarEvent) => {
    setEditingEvent(ev);
    setTitle(ev.title);
    setEventType(ev.eventType);
    setDate(ev.date);
    setStartTime(ev.startTime);
    setEndTime(ev.endTime);
    setVenue(ev.venue);
    setCourseCode(ev.courseCode);
    setDepartment(ev.department);
    setLevel(ev.level);
    setDescription(ev.description);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    if (endTime && endTime <= startTime) {
      setFormError('End time must be after start time.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title,
        description,
        eventType,
        date,
        startTime,
        endTime,
        venue,
        courseCode,
        department: canManage ? department : currentUser.department,
        level,
      };
      if (editingEvent) {
        await updateCalendarEvent(currentUser, editingEvent.id, payload);
      } else {
        await createCalendarEvent(currentUser, payload);
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save timetable entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ev: CalendarEvent) => {
    if (busyId) return;
    setBannerError(null);
    setBusyId(ev.id);
    try {
      await deleteCalendarEvent(ev.id);
      if (confirmDeleteId === ev.id) setConfirmDeleteId(null);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to delete entry.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header Banner */}
      <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-base sm:text-lg font-bold text-ink">
            Campus Calendar & Exam Timetable
          </h2>
          <p className="text-xs text-ink-muted">
            Track upcoming exams, departmental seminars, registration deadlines, and university events.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[44px] px-4 rounded-2xl bg-brand hover:bg-brand-strong text-on-brand text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Timetable Entry</span>
          </button>
        )}
      </div>

      {/* Filters & Color Legend */}
      <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-2xl bg-sunken self-start">
            <button
              type="button"
              onClick={() => setScopeTab('all')}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                scopeTab === 'all'
                  ? 'bg-white dark:bg-surface text-ink dark:text-ink shadow-2xs'
                  : 'text-ink-body dark:text-ink-soft'
              }`}
            >
              All Campus
            </button>
            <button
              type="button"
              onClick={() => setScopeTab('mine')}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                scopeTab === 'mine'
                  ? 'bg-white dark:bg-surface text-ink dark:text-ink shadow-2xs'
                  : 'text-ink-body dark:text-ink-soft'
              }`}
            >
              My Department
            </button>
            <button
              type="button"
              onClick={() => setScopeTab('exams')}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                scopeTab === 'exams'
                  ? 'bg-white dark:bg-surface text-rose-700 dark:text-rose-300 shadow-2xs'
                  : 'text-ink-body dark:text-ink-soft'
              }`}
            >
              Exams Only
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-ink-body dark:text-ink-soft cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)}
              className="w-4 h-4 rounded accent-brand cursor-pointer"
            />
            <span>Include past dates</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="relative sm:col-span-8">
            <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search course code, hall/venue, department, or event title..."
              aria-label="Search calendar events"
              className="w-full min-h-[44px] pl-10 pr-10 rounded-2xl border border-line bg-sunken/70 dark:bg-sunken/80 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:bg-white dark:focus:bg-sunken focus:border-brand"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear calendar search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-ink-muted hover:text-ink-soft cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="sm:col-span-4">
            <label htmlFor="calTypeFilter" className="sr-only">
              Filter by event type
            </label>
            <select
              id="calTypeFilter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | CalendarEventType)}
              className="w-full min-h-[44px] px-3.5 rounded-2xl border border-line bg-surface dark:bg-sunken text-xs sm:text-sm font-medium text-ink dark:text-ink-soft focus:outline-none focus:border-brand"
            >
              <option value="all">All Event Types</option>
              {(Object.keys(CALENDAR_EVENT_TYPE_LABELS) as CalendarEventType[]).map((key) => (
                <option key={key} value={key}>
                  {CALENDAR_EVENT_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Clean Color Key */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[11px] text-ink-muted">
          {(Object.keys(CALENDAR_EVENT_TYPE_LABELS) as CalendarEventType[]).map((key) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${EVENT_TYPE_STYLES[key].dot}`} />
              <span>{CALENDAR_EVENT_TYPE_LABELS[key]}</span>
            </span>
          ))}
        </div>
      </div>

      {bannerError && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-3 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{bannerError}</span>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="text-red-500 hover:text-red-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Chronological Timetable List */}
      {groupedDates.length === 0 ? (
        <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-brand-subtle dark:bg-brand-subtle/60 text-brand flex items-center justify-center mx-auto">
            <CalendarDays className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-ink">
            No scheduled events found
          </h3>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            {canManage
              ? 'Post upcoming exam dates, departmental seminars, or registration deadlines for students.'
              : 'Upcoming department exams and campus schedules posted by admins, lecturers, or class reps will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedDates.map(([dateKey, dayEvents]) => {
            const isPast = dateKey < todayStr;
            const relTag = getRelativeDayTag(dateKey, todayStr);
            return (
              <section key={dateKey} className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-2">
                    <span>{formatCalendarDateHeading(dateKey)}</span>
                    {relTag && (
                      <span
                        className={`text-[11px] normal-case ${
                          relTag === 'Today'
                            ? 'font-bold text-brand dark:text-brand'
                            : relTag === 'Tomorrow'
                              ? 'font-semibold text-indigo-700 dark:text-indigo-300'
                              : relTag === 'Past'
                                ? 'font-medium text-ink-muted dark:text-ink-muted'
                                : 'font-medium text-ink-muted dark:text-ink-muted'
                        }`}
                      >
                        · {relTag}
                      </span>
                    )}
                  </h3>
                  <span className="text-[11px] font-mono text-ink-muted">
                    {dayEvents.length} {dayEvents.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {dayEvents.map((ev) => {
                    const style = EVENT_TYPE_STYLES[ev.eventType] || EVENT_TYPE_STYLES.campus_event;
                    const canModifyEntry =
                      isAdmin || (canManage && ev.authorId === currentUser.uid);

                    return (
                      <article
                        key={ev.id}
                        className={`rounded-2xl border p-4 space-y-2.5 ${style.card} ${
                          isPast ? 'opacity-75' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs">
                              <span
                                className={`inline-flex items-center gap-1.5 font-bold ${style.label}`}
                              >
                                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                                <span>{CALENDAR_EVENT_TYPE_LABELS[ev.eventType]}</span>
                              </span>
                              {ev.courseCode && (
                                <>
                                  <span className="text-ink-muted" aria-hidden="true">
                                    ·
                                  </span>
                                  <span className="font-mono font-bold text-ink">
                                    {ev.courseCode}
                                  </span>
                                </>
                              )}
                              <span className="text-ink-muted" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-medium text-ink-body dark:text-ink-soft">
                                {ev.level === 'All' ? 'All Levels' : `${ev.level}L`}
                              </span>
                            </div>

                            <h4 className="text-sm sm:text-base font-bold text-ink leading-snug">
                              {ev.title}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => downloadCalendarEventIcs(ev)}
                              aria-label={`Add ${ev.title} to device calendar (.ics)`}
                              title="Save to device calendar (.ics)"
                              className="min-h-[36px] px-2.5 rounded-xl flex items-center gap-1 text-xs font-semibold text-ink-body dark:text-ink-soft hover:text-brand hover:bg-white/80 dark:hover:bg-sunken/80 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">.ics</span>
                            </button>

                            {canModifyEntry && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(ev)}
                                  aria-label={`Edit ${ev.title}`}
                                  title="Edit entry"
                                  className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-ink-muted hover:text-ink hover:bg-white/70 dark:hover:bg-sunken/70 cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                {confirmDeleteId === ev.id ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(ev)}
                                      disabled={busyId === ev.id}
                                      className="min-h-[32px] px-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold cursor-pointer"
                                    >
                                      {busyId === ev.id ? '...' : 'Confirm'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="min-h-[32px] px-2 rounded-lg bg-white/80 dark:bg-sunken text-[11px] font-semibold text-ink-body dark:text-ink-soft cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(ev.id)}
                                    disabled={busyId === ev.id}
                                    aria-label={`Delete ${ev.title}`}
                                    title="Delete entry"
                                    className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-ink-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-white/70 dark:hover:bg-sunken/70 cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {ev.description && (
                          <p className="text-xs text-ink-soft leading-relaxed whitespace-pre-line">
                            {ev.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-ink-body dark:text-ink-soft">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="inline-flex items-center gap-1.5 font-mono">
                              <Clock className="w-3.5 h-3.5 text-ink-muted" />
                              <span>
                                {ev.startTime}
                                {ev.endTime ? ` – ${ev.endTime}` : ''}
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-ink-muted" />
                              <span>{ev.venue}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-ink-muted" />
                              <span>{ev.department}</span>
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                            <span>Posted by {ev.authorName}</span>
                            <RoleBadge role={ev.authorRole} />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="min-h-[40px] px-5 rounded-2xl border border-line bg-surface hover:bg-sunken disabled:opacity-60 text-xs font-semibold text-ink-soft transition-colors cursor-pointer"
          >
            {loadingMore ? 'Loading more...' : 'Load more calendar events'}
          </button>
        </div>
      )}

      {/* Create / Edit Entry Modal */}
      {modalOpen && canManage && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-canvas/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-surface border border-transparent dark:border-line rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">
                {editingEvent ? 'Update Timetable Entry' : 'New Timetable / Event Entry'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close calendar dialog"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 p-3 text-xs text-red-700 dark:text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="calType"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Entry Type
                  </label>
                  <select
                    id="calType"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as CalendarEventType)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                  >
                    {(Object.keys(CALENDAR_EVENT_TYPE_LABELS) as CalendarEventType[]).map((key) => (
                      <option key={key} value={key}>
                        {CALENDAR_EVENT_TYPE_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="calCourseCode"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Course Code (optional)
                  </label>
                  <input
                    id="calCourseCode"
                    type="text"
                    maxLength={20}
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    placeholder="e.g., PHYS 401"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink uppercase focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="calTitle"
                  className="block text-xs font-semibold text-ink-soft mb-1"
                >
                  Title
                </label>
                <input
                  id="calTitle"
                  type="text"
                  required
                  maxLength={140}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., First Semester Exam / Departmental Seminar"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="calDate"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Date
                  </label>
                  <input
                    id="calDate"
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>

                <div>
                  <label
                    htmlFor="calStart"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Start Time
                  </label>
                  <input
                    id="calStart"
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>

                <div>
                  <label
                    htmlFor="calEnd"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    End Time (optional)
                  </label>
                  <input
                    id="calEnd"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="calVenue"
                  className="block text-xs font-semibold text-ink-soft mb-1"
                >
                  Venue / Hall
                </label>
                <input
                  id="calVenue"
                  type="text"
                  required
                  maxLength={100}
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="e.g., Faculty of Science Twin Lecture Theatre"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="calDept"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Department Scope
                  </label>
                  {isAdmin ? (
                    <select
                      id="calDept"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                    >
                      <option value="All GSU">All GSU (University-wide)</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  ) : canManage ? (
                    <select
                      id="calDept"
                      value={department === 'All GSU' ? 'All GSU' : currentUser.department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                    >
                      <option value={currentUser.department}>{currentUser.department} (your department)</option>
                      <option value="All GSU">All GSU (University-wide)</option>
                    </select>
                  ) : (
                    <input
                      id="calDept"
                      type="text"
                      readOnly
                      value={currentUser.department}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-sunken dark:bg-sunken/50 text-sm text-ink-body dark:text-ink-soft"
                    />
                  )}
                </div>

                <div>
                  <label
                    htmlFor="calLevel"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Target Level
                  </label>
                  <select
                    id="calLevel"
                    value={level}
                    onChange={(e) => setLevel(e.target.value as CalendarLevel)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                  >
                    {CALENDAR_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl === 'All' ? 'All Levels' : `${lvl} Level`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="calDesc"
                  className="block text-xs font-semibold text-ink-soft mb-1"
                >
                  Details / Instructions (optional)
                </label>
                <textarea
                  id="calDesc"
                  rows={2}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Bring ID card, exam clearance slip, or lab coat..."
                  className="w-full p-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 min-h-[44px] rounded-xl border border-line text-sm font-semibold text-ink-soft hover:bg-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 min-h-[44px] rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-sm font-semibold cursor-pointer"
                >
                  {saving ? 'Saving...' : editingEvent ? 'Save Changes' : 'Post Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
