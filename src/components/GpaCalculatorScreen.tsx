import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Calculator,
  CheckCircle2,
  Copy,
  Info,
  Plus,
  RotateCcw,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  GpaCourseEntry,
  GSU_GRADE_POINTS,
  GsuGradeLetter,
} from '../types';

interface GpaCalculatorScreenProps {
  userId: string;
  userName: string;
  onBack: () => void;
}

interface StoredGpaState {
  courses: GpaCourseEntry[];
  priorUnits: string;
  priorCgpa: string;
  targetCgpa: number;
  upcomingUnits: string;
}

const EMPTY_GPA_STATE: StoredGpaState = {
  courses: [],
  priorUnits: '',
  priorCgpa: '',
  targetCgpa: 4.5,
  upcomingUnits: '',
};

const VALID_TARGETS = [4.5, 3.5, 2.5];

function isLegacySeededDemo(parsed: Partial<StoredGpaState>): boolean {
  if (!Array.isArray(parsed.courses) || parsed.courses.length !== 4) return false;
  const sig = parsed.courses.map((c) => `${c.id}:${c.code}:${c.units}:${c.grade}`).join('|');
  return (
    sig === 'c1:GST 101:2:A|c2:Course 2:3:B|c3:Course 3:3:A|c4:Course 4:2:B' &&
    (parsed.priorUnits === '0' || parsed.priorUnits === '') &&
    (parsed.priorCgpa === '0' || parsed.priorCgpa === '')
  );
}

function getGsuStanding(gpa: number): { label: string; toneClass: string } {
  if (gpa >= 4.5) {
    return {
      label: 'First Class Honours',
      toneClass: 'bg-brand-subtle text-brand dark:bg-brand-subtle/80 dark:text-brand',
    };
  }
  if (gpa >= 3.5) {
    return {
      label: 'Second Class Upper (2:1)',
      toneClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300',
    };
  }
  if (gpa >= 2.5) {
    return {
      label: 'Second Class Lower (2:2)',
      toneClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
    };
  }
  if (gpa >= 1.5) {
    return {
      label: 'Third Class',
      toneClass: 'bg-orange-100 text-orange-800 dark:bg-orange-950/80 dark:text-orange-300',
    };
  }
  if (gpa >= 1.0) {
    return {
      label: 'Pass',
      toneClass: 'bg-sunken text-ink-soft dark:bg-sunken dark:text-ink-soft',
    };
  }
  return {
    label: 'Below Pass',
    toneClass: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300',
  };
}

function describeGradeMixHint(requiredGpa: number): string {
  if (requiredGpa <= 0) return 'Keep passing your remaining courses';
  if (requiredGpa >= 4.8) return "Aim for straight A's across your courses";
  if (requiredGpa >= 4.35) return "Mostly A's with only 1–2 B's";
  if (requiredGpa >= 3.85) return "Strong mix of A's and B's";
  if (requiredGpa >= 3.2) return "Solid B's with a few A's";
  if (requiredGpa >= 2.5) return "Consistent B's and C's";
  return 'Maintain at least C grades and above';
}

export const GpaCalculatorScreen: React.FC<GpaCalculatorScreenProps> = ({
  userId,
  userName,
  onBack,
}) => {
  const [copiedGpa, setCopiedGpa] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const gpaStorageKey = `gsu_gpa_calc_${userId}`;
  const [gpaState, setGpaState] = useState<StoredGpaState>(() => {
    try {
      const raw = localStorage.getItem(gpaStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredGpaState>;
        if (!isLegacySeededDemo(parsed)) {
          return {
            courses: Array.isArray(parsed.courses) ? parsed.courses : [],
            priorUnits: typeof parsed.priorUnits === 'string' && parsed.priorUnits !== '0' ? parsed.priorUnits : '',
            priorCgpa: typeof parsed.priorCgpa === 'string' && parsed.priorCgpa !== '0' ? parsed.priorCgpa : '',
            targetCgpa:
              typeof parsed.targetCgpa === 'number' && VALID_TARGETS.includes(parsed.targetCgpa)
                ? parsed.targetCgpa
                : 4.5,
            upcomingUnits: typeof parsed.upcomingUnits === 'string' ? parsed.upcomingUnits : '',
          };
        }
      }
    } catch {
      // Ignore storage access errors
    }
    return EMPTY_GPA_STATE;
  });

  useEffect(() => {
    try {
      localStorage.setItem(gpaStorageKey, JSON.stringify(gpaState));
    } catch {
      // Ignore storage quota errors
    }
  }, [gpaStorageKey, gpaState]);

  const gpaMetrics = useMemo(() => {
    let semUnits = 0;
    let semPoints = 0;
    for (const c of gpaState.courses) {
      const u = Math.max(0, Math.min(12, Math.round(Number(c.units) || 0)));
      const pts = GSU_GRADE_POINTS[c.grade] ?? 0;
      semUnits += u;
      semPoints += u * pts;
    }
    const semesterGpa = semUnits > 0 ? semPoints / semUnits : 0;

    const priorU = Math.max(0, Math.min(400, Number(gpaState.priorUnits) || 0));
    const priorG = Math.max(0, Math.min(5, Number(gpaState.priorCgpa) || 0));
    const priorPoints = priorU * priorG;

    const totalUnits = priorU + semUnits;
    const totalPoints = priorPoints + semPoints;
    const cumulativeCgpa = totalUnits > 0 ? totalPoints / totalUnits : 0;

    const rawUpcoming = gpaState.upcomingUnits.trim();
    const parsedUpcoming = Number(rawUpcoming);
    const hasUpcomingUnits =
      rawUpcoming !== '' && Number.isFinite(parsedUpcoming) && parsedUpcoming >= 1 && parsedUpcoming <= 200;
    const upcomingU = hasUpcomingUnits ? Math.round(parsedUpcoming) : 0;
    const requiredPoints =
      upcomingU > 0 ? gpaState.targetCgpa * (totalUnits + upcomingU) - totalPoints : 0;
    const requiredAvg = upcomingU > 0 ? requiredPoints / upcomingU : 0;

    const gradeCounts: Record<GsuGradeLetter, number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
      F: 0,
    };
    for (const c of gpaState.courses) {
      if (gradeCounts[c.grade] !== undefined) {
        gradeCounts[c.grade] += 1;
      }
    }

    const rawPriorCgpa = Number(gpaState.priorCgpa);
    const priorCgpaInvalid =
      gpaState.priorCgpa.trim() !== '' &&
      (!Number.isFinite(rawPriorCgpa) || rawPriorCgpa < 0 || rawPriorCgpa > 5);
    const upcomingUnitsInvalid =
      rawUpcoming !== '' &&
      (!Number.isFinite(parsedUpcoming) || parsedUpcoming < 1 || parsedUpcoming > 200);

    return {
      semUnits,
      semPoints,
      semesterGpa,
      totalUnits,
      totalPoints,
      cumulativeCgpa,
      hasUpcomingUnits,
      upcomingU,
      requiredAvg,
      gradeCounts,
      priorCgpaInvalid,
      upcomingUnitsInvalid,
    };
  }, [gpaState]);

  const hasEnteredAnyData = gpaMetrics.totalUnits > 0 || gpaMetrics.semUnits > 0;
  const displayCgpa =
    gpaMetrics.totalUnits > 0 ? gpaMetrics.cumulativeCgpa : gpaMetrics.semesterGpa;
  const currentStanding = hasEnteredAnyData
    ? getGsuStanding(displayCgpa)
    : {
        label: 'No courses entered yet',
        toneClass: 'bg-sunken text-ink-body dark:bg-sunken dark:text-ink-soft',
      };
  const alreadyAtTarget = displayCgpa >= gpaState.targetCgpa && gpaMetrics.totalUnits > 0;
  const safeRequiredAvg = Math.max(0, gpaMetrics.requiredAvg);
  const targetProgressPct =
    gpaState.targetCgpa > 0
      ? Math.min(100, Math.max(0, Math.round((displayCgpa / gpaState.targetCgpa) * 100)))
      : 0;

  const handleApplySemesterToPrior = () => {
    if (gpaMetrics.totalUnits === 0) return;
    setGpaState((prev) => ({
      ...prev,
      priorUnits: String(gpaMetrics.totalUnits),
      priorCgpa: gpaMetrics.cumulativeCgpa.toFixed(2),
      courses: [],
    }));
  };

  const handleCopyGpaSummary = async () => {
    const summaryLines = [
      `GSU GPA Summary — ${userName}`,
      `Semester GPA: ${gpaMetrics.semesterGpa.toFixed(2)} / 5.00 (${gpaMetrics.semUnits} units, ${gpaMetrics.semPoints} pts)`,
      `Cumulative CGPA: ${displayCgpa.toFixed(2)} / 5.00 (${gpaMetrics.totalUnits} total units) · ${currentStanding.label}`,
      ...gpaState.courses.map((c) => `• ${c.code || 'Course'}: ${c.units}u — Grade ${c.grade}`),
    ];
    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      setCopiedGpa(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedGpa(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[40px] px-3.5 rounded-xl bg-surface border border-line/80 dark:border-line hover:bg-sunken text-xs font-semibold text-ink-soft inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Profile</span>
        </button>
      </div>

      <section
        aria-label="GSU 5.0 GPA and CGPA Calculator"
        className="bg-surface rounded-3xl border border-line/80 dark:border-line p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-brand-subtle dark:bg-brand-subtle/60 text-brand flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-ink">
                GSU 5.0 GPA / CGPA Calculator
              </h2>
              <p className="text-xs text-ink-muted">
                A=5 · B=4 · C=3 · D=2 · E=1 · F=0
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={!hasEnteredAnyData}
              onClick={handleCopyGpaSummary}
              className="min-h-[34px] px-3 rounded-xl border border-line hover:bg-sunken disabled:opacity-50 text-xs font-semibold text-ink-body dark:text-ink-soft inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedGpa ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Summary</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleApplySemesterToPrior}
              disabled={gpaMetrics.semUnits === 0}
              title="Roll current semester units & points into Prior Standing and clear this semester's courses"
              className="min-h-[34px] px-3 rounded-xl border border-success-line bg-brand-subtle/70 dark:bg-brand-subtle/50 hover:bg-brand-subtle dark:hover:bg-brand-subtle/50 disabled:opacity-50 text-xs font-semibold text-brand cursor-pointer"
            >
              Roll to Prior
            </button>
            <button
              type="button"
              onClick={() => setGpaState(EMPTY_GPA_STATE)}
              className="min-h-[34px] px-3 rounded-xl border border-line hover:bg-sunken text-xs font-semibold text-ink-body dark:text-ink-soft inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Device-only storage notice */}
        <div className="rounded-2xl bg-sunken dark:bg-sunken/70 border border-line/70 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-ink-body dark:text-ink-soft">
          <Info className="w-4 h-4 text-ink-muted shrink-0 mt-0.5" />
          <span>
            Calculator data is saved only on this device. Clearing your browser data or signing in on another device will not carry these entries over.
          </span>
        </div>

        {/* Live Score Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-sunken dark:bg-sunken/70 p-3.5 border border-line">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Semester GPA
            </p>
            <p className="text-2xl font-extrabold text-ink mt-1 tabular-nums">
              {gpaMetrics.semUnits > 0 ? (
                <>
                  {gpaMetrics.semesterGpa.toFixed(2)}
                  <span className="text-xs font-semibold text-ink-muted">
                    {' '}
                    / 5.00
                  </span>
                </>
              ) : (
                '—'
              )}
            </p>
            <p className="text-[11px] text-ink-muted mt-0.5 tabular-nums">
              {gpaMetrics.semUnits > 0
                ? `${gpaMetrics.semUnits} units · ${gpaMetrics.semPoints} pts`
                : 'No semester courses yet'}
            </p>
          </div>

          <div className="rounded-2xl bg-brand-subtle/70 dark:bg-brand-subtle/40 p-3.5 border border-success-line/70 dark:border-success-line/60">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
              Cumulative CGPA
            </p>
            <p className="text-2xl font-extrabold text-brand mt-1 tabular-nums">
              {hasEnteredAnyData ? (
                <>
                  {displayCgpa.toFixed(2)}
                  <span className="text-xs font-semibold text-brand/70">
                    {' '}
                    / 5.00
                  </span>
                </>
              ) : (
                '—'
              )}
            </p>
            <p className="text-[11px] text-brand/80 mt-0.5 tabular-nums">
              {hasEnteredAnyData ? `${gpaMetrics.totalUnits} total units` : 'Add courses or prior standing'}
            </p>
          </div>

          <div className="rounded-2xl bg-sunken dark:bg-sunken/70 p-3.5 border border-line flex flex-col justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>Based on what you&apos;ve entered</span>
            </p>
            <div className="mt-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold ${currentStanding.toneClass}`}
              >
                {currentStanding.label}
              </span>
            </div>
          </div>
        </div>

        {/* Grade Distribution Summary */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="font-semibold text-ink-muted mr-1">
            Grade Mix:
          </span>
          {(['A', 'B', 'C', 'D', 'E', 'F'] as GsuGradeLetter[]).map((g) => (
            <span
              key={g}
              className={`px-2 py-0.5 rounded-lg font-mono font-bold tabular-nums border ${
                gpaMetrics.gradeCounts[g] > 0
                  ? 'bg-brand-subtle dark:bg-brand-subtle/60 border-success-line dark:border-success-line text-brand dark:text-brand'
                  : 'bg-sunken dark:bg-sunken/50 border-line/70 dark:border-line text-ink-muted dark:text-ink-muted'
              }`}
            >
              {g}:{gpaMetrics.gradeCounts[g]}
            </span>
          ))}
        </div>

        {/* Prior Cumulative Standing (Optional) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-ink-body dark:text-ink-soft mb-1">
              Prior Earned Units (before this semester)
            </label>
            <input
              type="number"
              min={0}
              max={400}
              step={1}
              value={gpaState.priorUnits}
              onChange={(e) =>
                setGpaState((prev) => ({ ...prev, priorUnits: e.target.value }))
              }
              placeholder="0"
              className="w-full min-h-[40px] px-3 rounded-xl border border-line bg-sunken text-sm text-ink tabular-nums focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-ink-body dark:text-ink-soft mb-1">
              Prior CGPA (0.00 – 5.00)
            </label>
            <input
              type="number"
              min={0}
              max={5}
              step={0.01}
              value={gpaState.priorCgpa}
              onChange={(e) =>
                setGpaState((prev) => ({ ...prev, priorCgpa: e.target.value }))
              }
              placeholder="0.00"
              className={`w-full min-h-[40px] px-3 rounded-xl border bg-sunken dark:bg-sunken text-sm text-ink dark:text-ink tabular-nums focus:outline-none ${
                gpaMetrics.priorCgpaInvalid
                  ? 'border-rose-400 dark:border-rose-600 focus:border-rose-500'
                  : 'border-line dark:border-line focus:border-brand'
              }`}
            />
            {gpaMetrics.priorCgpaInvalid && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                Enter a value between 0.00 and 5.00.
              </p>
            )}
          </div>
        </div>

        {/* Course Rows */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              This Semester Courses
            </p>
            <button
              type="button"
              onClick={() =>
                setGpaState((prev) => ({
                  ...prev,
                  courses: [
                    ...prev.courses,
                    {
                      id: `c_${Date.now()}_${prev.courses.length + 1}`,
                      code: '',
                      units: 3,
                      grade: 'A',
                    },
                  ],
                }))
              }
              className="min-h-[34px] px-3 rounded-xl bg-brand-subtle dark:bg-brand-subtle/60 hover:bg-brand-subtle dark:hover:bg-brand-subtle/60 text-brand text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Course</span>
            </button>
          </div>

          {gpaState.courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-sunken/70 dark:bg-sunken/30 p-5 text-center space-y-2">
              <p className="text-xs text-ink-muted">
                No courses added yet. Tap &ldquo;Add Course&rdquo; to enter your credit units and grades.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {gpaState.courses.map((course, idx) => {
                const rowPts =
                  Math.max(0, Math.round(Number(course.units) || 0)) *
                  (GSU_GRADE_POINTS[course.grade] ?? 0);
                return (
                  <div
                    key={course.id}
                    className="grid grid-cols-12 gap-2 items-center bg-sunken/80 dark:bg-sunken/50 rounded-2xl p-2 border border-line"
                  >
                    <input
                      type="text"
                      aria-label={`Course ${idx + 1} code`}
                      value={course.code}
                      maxLength={24}
                      onChange={(e) => {
                        const val = e.target.value;
                        setGpaState((prev) => ({
                          ...prev,
                          courses: prev.courses.map((item) =>
                            item.id === course.id ? { ...item, code: val } : item
                          ),
                        }));
                      }}
                      placeholder="e.g. GST 101"
                      className="col-span-12 sm:col-span-4 min-h-[38px] px-2.5 rounded-xl border border-line bg-surface text-xs font-semibold text-ink focus:outline-none focus:border-brand"
                    />

                    <select
                      aria-label={`Course ${idx + 1} units`}
                      value={course.units}
                      onChange={(e) => {
                        const units = Number(e.target.value);
                        setGpaState((prev) => ({
                          ...prev,
                          courses: prev.courses.map((item) =>
                            item.id === course.id ? { ...item, units } : item
                          ),
                        }));
                      }}
                      className="col-span-4 sm:col-span-3 min-h-[38px] px-2 rounded-xl border border-line bg-surface text-xs font-semibold text-ink focus:outline-none focus:border-brand"
                    >
                      {[1, 2, 3, 4, 5, 6].map((u) => (
                        <option key={u} value={u}>
                          {u} {u === 1 ? 'Unit' : 'Units'}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label={`Course ${idx + 1} grade`}
                      value={course.grade}
                      onChange={(e) => {
                        const grade = e.target.value as GsuGradeLetter;
                        setGpaState((prev) => ({
                          ...prev,
                          courses: prev.courses.map((item) =>
                            item.id === course.id ? { ...item, grade } : item
                          ),
                        }));
                      }}
                      className="col-span-4 sm:col-span-3 min-h-[38px] px-2 rounded-xl border border-line bg-surface text-xs font-bold text-ink focus:outline-none focus:border-brand"
                    >
                      {(['A', 'B', 'C', 'D', 'E', 'F'] as GsuGradeLetter[]).map((g) => (
                        <option key={g} value={g}>
                          {g} ({GSU_GRADE_POINTS[g]})
                        </option>
                      ))}
                    </select>

                    <div className="col-span-4 sm:col-span-2 flex items-center justify-end gap-1">
                      <span className="text-[11px] font-mono tabular-nums font-semibold text-ink-muted px-1.5">
                        {rowPts}pt
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setGpaState((prev) => ({
                            ...prev,
                            courses: prev.courses.filter((item) => item.id !== course.id),
                          }))
                        }
                        title={`Points: ${rowPts}`}
                        aria-label={`Remove course ${course.code || idx + 1}`}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Target Tracker */}
        <div className="rounded-2xl bg-sunken dark:bg-sunken/60 border border-line/70 dark:border-line p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-brand shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                Target CGPA after these units
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-surface border border-line overflow-x-auto">
              {[
                { value: 4.5, label: 'First Class (4.50+)' },
                { value: 3.5, label: '2:1 Upper (3.50+)' },
                { value: 2.5, label: '2:2 Lower (2.50+)' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setGpaState((prev) => ({ ...prev, targetCgpa: opt.value }))
                  }
                  className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    gpaState.targetCgpa === opt.value
                      ? 'bg-brand text-white'
                      : 'text-ink-body dark:text-ink-soft hover:bg-sunken dark:hover:bg-sunken'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-ink-muted">
              <span>Current CGPA compared to {gpaState.targetCgpa.toFixed(2)} target</span>
              <span className="font-semibold tabular-nums text-ink-soft">
                {hasEnteredAnyData ? displayCgpa.toFixed(2) : '—'} / {gpaState.targetCgpa.toFixed(2)} ({targetProgressPct}%)
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-sunken overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all duration-300"
                style={{ width: `${targetProgressPct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="sm:w-48 shrink-0">
              <label className="block text-[11px] font-semibold text-ink-body dark:text-ink-soft mb-1">
                Upcoming Credit Units
              </label>
              <input
                type="number"
                min={1}
                max={200}
                step={1}
                placeholder="e.g. 24"
                value={gpaState.upcomingUnits}
                onChange={(e) =>
                  setGpaState((prev) => ({ ...prev, upcomingUnits: e.target.value }))
                }
                className={`w-full min-h-[38px] px-3 rounded-xl border bg-white dark:bg-surface text-xs font-semibold text-ink dark:text-ink tabular-nums focus:outline-none ${
                  gpaMetrics.upcomingUnitsInvalid
                    ? 'border-rose-400 dark:border-rose-600 focus:border-rose-500'
                    : 'border-line dark:border-line focus:border-brand'
                }`}
              />
              {gpaMetrics.upcomingUnitsInvalid && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                  Must be between 1 and 200 units.
                </p>
              )}
            </div>

            <div className="flex-1 rounded-xl bg-surface border border-line/80 dark:border-line px-3.5 py-2.5">
              {!gpaMetrics.hasUpcomingUnits ? (
                <p className="text-xs text-ink-muted">
                  Enter your upcoming credit units to see the average GPA needed to hit {gpaState.targetCgpa.toFixed(2)}.
                </p>
              ) : gpaMetrics.requiredAvg > 5 ? (
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    Needs {gpaMetrics.requiredAvg.toFixed(2)} GPA over next {gpaMetrics.upcomingU} units
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    Exceeds 5.00 max in {gpaMetrics.upcomingU} units — add more upcoming credit units or pick a different target.
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-brand flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {alreadyAtTarget
                        ? `On track! Keep ≥ ${safeRequiredAvg.toFixed(2)} GPA over next ${gpaMetrics.upcomingU} units`
                        : `Target ${gpaState.targetCgpa.toFixed(2)}: Need ${safeRequiredAvg.toFixed(2)} GPA over next ${gpaMetrics.upcomingU} units`}
                    </span>
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {describeGradeMixHint(safeRequiredAvg)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
