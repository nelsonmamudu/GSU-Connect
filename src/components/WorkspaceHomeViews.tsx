import {
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Car,
  Clock3,
  Compass,
  GraduationCap,
  MessageSquare,
  Megaphone,
  ShoppingBag,
  Sparkles,
  Users,
} from 'lucide-react';
import type {
  AcademicResource,
  Announcement,
  AppUser,
  CalendarEvent,
  CampusStatus,
  ChatThread,
  MarketplaceListing,
  RideErrandPost,
} from '../types';

type HomeTab =
  | 'today'
  | 'chats'
  | 'study'
  | 'campus'
  | 'repository'
  | 'calendar'
  | 'announcements'
  | 'people'
  | 'marketplace'
  | 'rides'
  | 'statuses'
  | 'confessions'
  | 'profile';

type HomeIcon = typeof CalendarDays;

interface WorkspaceHomeViewsProps {
  currentUser: AppUser;
  calendarEvents: CalendarEvent[];
  announcements: Announcement[];
  chats: ChatThread[];
  unreadCounts: Record<string, number>;
  resources: AcademicResource[];
  statuses: CampusStatus[];
  marketplaceListings: MarketplaceListing[];
  rideErrands: RideErrandPost[];
  onNavigate: (tab: HomeTab) => void;
}

const formatEventDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-NG', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const formatCreatedDate = (value?: Announcement['createdAt']) => {
  const date = value?.toDate();
  return date
    ? date.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })
    : '';
};

function SectionTitle({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800/70 dark:text-emerald-300/80">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-slate-950 dark:text-white sm:text-xl">
          {title}
        </h2>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/60"
        >
          {action.label}
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function CountCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: HomeIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <span className="font-display text-2xl font-bold tabular-nums text-slate-950 dark:text-white">{value}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}

function ShortcutCard({
  icon: Icon,
  label,
  detail,
  onClick,
}: {
  icon: HomeIcon;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[92px] w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30 dark:focus-visible:ring-offset-slate-950"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 transition-colors group-hover:bg-emerald-100 group-hover:text-emerald-900 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-emerald-950 dark:group-hover:text-emerald-200">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{detail}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-emerald-800 dark:group-hover:text-emerald-300" aria-hidden="true" />
    </button>
  );
}

export function TodayView(props: WorkspaceHomeViewsProps) {
  const {
    currentUser,
    calendarEvents,
    announcements,
    chats,
    unreadCounts,
    resources,
    onNavigate,
  } = props;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const upcomingEvents = [...calendarEvents]
    .filter((event) => event.date >= todayKey)
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
    .slice(0, 3);
  const latestAnnouncement = [...announcements].sort((a, b) => {
    const aTime = a.createdAt?.toMillis() ?? 0;
    const bTime = b.createdAt?.toMillis() ?? 0;
    return bTime - aTime;
  })[0];
  const unreadTotal = Object.values(unreadCounts).reduce((total, value) => total + value, 0);
  const unreadThreads = chats.filter((chat) => (unreadCounts[chat.id] || 0) > 0).length;
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = today.toLocaleDateString('en-NG', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-7 sm:space-y-9">
      <section className="relative overflow-hidden rounded-[28px] bg-[#0B3F35] p-5 text-white shadow-[0_20px_60px_-35px_rgba(7,54,44,0.7)] sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-2 -top-6 h-40 w-40 rounded-full border border-white/10" />
        <div className="relative max-w-2xl">
          <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-emerald-100/80">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-300" />
            GOMBE STATE UNIVERSITY · {dateLabel.toUpperCase()}
          </p>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {greeting}, {currentUser.fullName.split(' ')[0]}.
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-emerald-50/80 sm:text-base">
            Your campus day, at a glance. Pick up where you left off or see what is coming up.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#0B3F35] transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B3F35]"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Open timetable
            </button>
            <button
              type="button"
              onClick={() => onNavigate('chats')}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/25 px-4 text-sm font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              {unreadTotal > 0 ? `${unreadTotal} unread messages` : 'Go to chats'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <CountCard icon={MessageSquare} label="Unread messages" value={String(unreadTotal)} hint={unreadThreads ? `Across ${unreadThreads} conversations` : 'You are all caught up'} />
        <CountCard icon={CalendarDays} label="Coming up" value={String(upcomingEvents.length)} hint={upcomingEvents.length ? 'Events and deadlines on your calendar' : 'Nothing scheduled yet'} />
        <CountCard icon={BookOpen} label="Study resources" value={String(resources.length)} hint="Materials in the repository" />
      </section>

      <div className="grid gap-7 lg:grid-cols-[1.25fr_0.75fr] lg:gap-8">
        <section className="space-y-4">
          <SectionTitle eyebrow="Your schedule" title="Coming up" action={{ label: 'Full timetable', onClick: () => onNavigate('calendar') }} />
          {upcomingEvents.length ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
              {upcomingEvents.map((event, index) => (
                <div key={event.id} className={`flex gap-4 p-4 sm:p-5 ${index ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}>
                  <div className="w-14 shrink-0 text-center">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">{event.date === todayKey ? 'Today' : formatEventDate(event.date).split(',')[0]}</span>
                    <span className="mt-1 block font-display text-xl font-bold text-slate-900 dark:text-white">{event.date === todayKey ? '•' : new Date(`${event.date}T12:00:00`).getDate()}</span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">{new Date(`${event.date}T12:00:00`).toLocaleDateString('en-NG', { month: 'short' })}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{event.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{event.startTime}{event.endTime ? `–${event.endTime}` : ''}</span>
                      {event.venue && <span>{event.venue}</span>}
                    </p>
                    {event.courseCode && <span className="mt-2 inline-flex rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">{event.courseCode}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 dark:border-slate-700 dark:bg-slate-900/60">
              <CalendarDays className="h-5 w-5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">Your calendar is clear</p>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">When classes, exams, or campus events are added, you will find them here.</p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <SectionTitle eyebrow="Official updates" title="From campus" action={{ label: 'All updates', onClick: () => onNavigate('announcements') }} />
          {latestAnnouncement ? (
            <button
              type="button"
              onClick={() => onNavigate('announcements')}
              className="w-full rounded-2xl border border-slate-200/80 bg-white p-5 text-left transition-colors hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-800"
            >
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200"><Megaphone className="h-3.5 w-3.5" aria-hidden="true" />{latestAnnouncement.scope || 'University notice'}</span>
              <span className="mt-4 block text-base font-bold leading-snug text-slate-900 dark:text-slate-100">{latestAnnouncement.title}</span>
              <span className="mt-2 line-clamp-3 block text-sm leading-6 text-slate-600 dark:text-slate-300">{latestAnnouncement.body}</span>
              <span className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>{latestAnnouncement.authorName}</span>
                <span>{formatCreatedDate(latestAnnouncement.createdAt)}</span>
              </span>
            </button>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 dark:border-slate-700 dark:bg-slate-900/60">
              <Bell className="h-5 w-5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">No new notices</p>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">Official announcements will appear here when they are posted.</p>
            </div>
          )}
        </section>
      </div>

      <section className="space-y-4">
        <SectionTitle eyebrow="Quick access" title="Your campus, one tap away" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ShortcutCard icon={MessageSquare} label="Chats" detail={unreadTotal ? `${unreadTotal} unread across ${unreadThreads} conversations` : 'Messages, groups, and calls'} onClick={() => onNavigate('chats')} />
          <ShortcutCard icon={BookOpen} label="Study resources" detail={`${resources.length} materials in the repository`} onClick={() => onNavigate('repository')} />
          <ShortcutCard icon={Users} label="People" detail="Find classmates and start a conversation" onClick={() => onNavigate('people')} />
          <ShortcutCard icon={Compass} label="Campus life" detail="Updates, rides, and student marketplace" onClick={() => onNavigate('campus')} />
        </div>
      </section>
    </div>
  );
}

export function StudyHubView({ currentUser, calendarEvents, resources, onNavigate }: WorkspaceHomeViewsProps) {
  const upcomingCount = calendarEvents.filter((event) => event.date >= new Date().toISOString().slice(0, 10)).length;
  return (
    <div className="space-y-7 sm:space-y-9">
      <header className="max-w-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800/70 dark:text-emerald-300/80">Study</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Your academic toolkit</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Course materials and your timetable, organized for {currentUser.department || 'your department'}.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <CountCard icon={BookOpen} label="Repository materials" value={String(resources.length)} hint="Past questions, notes, and guides" />
        <CountCard icon={CalendarDays} label="Upcoming schedule" value={String(upcomingCount)} hint="Classes, exams, and deadlines" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <HubFeature icon={BookOpen} eyebrow="Shared by your campus" title="Course repository" detail="Find past questions, lecture notes, and study guides shared by the GSU community." actionLabel="Browse resources" onClick={() => onNavigate('repository')} />
        <HubFeature icon={CalendarDays} eyebrow="Stay prepared" title="Calendar & timetable" detail="Keep exams, academic deadlines, and campus events in one clear view." actionLabel="Open timetable" onClick={() => onNavigate('calendar')} />
        <HubFeature icon={GraduationCap} eyebrow="Your progress" title="Profile & GPA calculator" detail="Review your academic profile and use the GPA tools already in your account." actionLabel="Open profile" onClick={() => onNavigate('profile')} />
        <HubFeature icon={MessageSquare} eyebrow="Learn together" title="Class conversations" detail="Ask a question or pick up the discussion in your course groups." actionLabel="Open chats" onClick={() => onNavigate('chats')} />
      </div>
    </div>
  );
}

export function CampusHubView({ statuses, announcements, marketplaceListings, rideErrands, onNavigate }: WorkspaceHomeViewsProps) {
  const activeListings = marketplaceListings.filter((listing) => listing.status === 'available').length;
  const openRides = rideErrands.filter((post) => post.status === 'open').length;
  return (
    <div className="space-y-7 sm:space-y-9">
      <header className="max-w-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800/70 dark:text-emerald-300/80">Campus</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Life at GSU</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Stay in the loop, find your people, and make campus life a little easier.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <CountCard icon={Megaphone} label="Official notices" value={String(announcements.length)} hint="From campus and departments" />
        <CountCard icon={Sparkles} label="Student updates" value={String(statuses.length)} hint="Recent community posts" />
        <CountCard icon={ShoppingBag} label="Marketplace" value={String(activeListings)} hint={`${openRides} rides or errands open`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <HubFeature icon={Megaphone} eyebrow="Official information" title="Campus updates" detail="Announcements from the university and your department, with clear official labeling." actionLabel="Read announcements" onClick={() => onNavigate('announcements')} />
        <HubFeature icon={Users} eyebrow="Find your community" title="People directory" detail="Discover students in your department and connect through a direct message." actionLabel="Browse people" onClick={() => onNavigate('people')} />
        <HubFeature icon={ShoppingBag} eyebrow="Buy, sell, swap" title="Student marketplace" detail="Browse available listings shared by other students." actionLabel="Explore listings" onClick={() => onNavigate('marketplace')} />
        <HubFeature icon={Car} eyebrow="Get around and help out" title="Rides & errands" detail="Find a ride, share a trip, or help someone with a campus errand." actionLabel="View rides & errands" onClick={() => onNavigate('rides')} />
        <HubFeature icon={Sparkles} eyebrow="Community" title="Student updates" detail="See what classmates are sharing. Posts remain distinct from official notices." actionLabel="View updates" onClick={() => onNavigate('statuses')} />
        <HubFeature icon={Compass} eyebrow="Community space" title="Confessions & campus gist" detail="Join student conversations, with reporting and moderation controls in place." actionLabel="Explore community" onClick={() => onNavigate('confessions')} />
      </div>
    </div>
  );
}

function HubFeature({
  icon: Icon,
  eyebrow,
  title,
  detail,
  actionLabel,
  onClick,
}: {
  icon: HomeIcon;
  eyebrow: string;
  title: string;
  detail: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[184px] flex-col rounded-2xl border border-slate-200/80 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-950/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-800 dark:focus-visible:ring-offset-slate-950"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <span className="mt-4 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800/70 dark:text-emerald-300/80">{eyebrow}</span>
      <span className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100">{title}</span>
      <span className="mt-1 flex-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{detail}</span>
      <span className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">{actionLabel}<ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" /></span>
    </button>
  );
}
