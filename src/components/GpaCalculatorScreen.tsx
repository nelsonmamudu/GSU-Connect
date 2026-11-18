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
      toneClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300',
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
      toneClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
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
        toneClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
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
          className="min-h-[40px] px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Profile</span>
        </button>
      </div>

      <section
        aria-label="GSU 5.0 GPA and CGPA Calculator"
        className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                GSU 5.0 GPA / CGPA Calculator
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A=5 · B=4 · C=3 · D=2 · E=1 · F=0
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={!hasEnteredAnyData}
              onClick={handleCopyGpaSummary}
              className="min-h-[34px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedGpa ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
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
              className="min-h-[34px] px-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50 text-xs font-semibold text-emerald-800 dark:text-emerald-300 cursor-pointer"
            >
              Roll to Prior
            </button>
            <button
              type="button"
              onClick={() => setGpaState(EMPTY_GPA_STATE)}
              className="min-h-[34px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Device-only storage notice */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
          <Info className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
          <span>
            Calculator data is saved only on this device. Clearing your browser data or signing in on another device will not carry these entries over.
          </span>
        </div>

        {/* Live Score Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-3.5 border border-slate-100 dark:border-slate-800">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Semester GPA
            </p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {gpaMetrics.semUnits > 0 ? (
                <>
                  {gpaMetrics.semesterGpa.toFixed(2)}
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                    {' '}
                    / 5.00
                  </span>
                </>
              ) : (
                '—'
              )}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {gpaMetrics.semUnits > 0
                ? `${gpaMetrics.semUnits} units · ${gpaMetrics.semPoints} pts`
                : 'No semester courses yet'}
            </p>
          </div>

          <div className="rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 p-3.5 border border-emerald-200/70 dark:border-emerald-900/60">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              Cumulative CGPA
            </p>
            <p className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200 mt-1 tabular-nums">
              {hasEnteredAnyData ? (
                <>
                  {displayCgpa.toFixed(2)}
                  <span className="text-xs font-semibold text-emerald-700/70 dark:text-emerald-400/70">
                    {' '}
                    / 5.00
                  </span>
                </>
              ) : (
                '—'
              )}
            </p>
            <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-0.5 tabular-nums">
              {hasEnteredAnyData ? `${gpaMetrics.totalUnits} total units` : 'Add courses or prior standing'}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-3.5 border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
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
          <span className="font-semibold text-slate-500 dark:text-slate-400 mr-1">
            Grade Mix:
          </span>
          {(['A', 'B', 'C', 'D', 'E', 'F'] as GsuGradeLetter[]).map((g) => (
            <span
              key={g}
              className={`px-2 py-0.5 rounded-lg font-mono font-bold tabular-nums border ${
                gpaMetrics.gradeCounts[g] > 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/70 dark:border-slate-800 text-slate-400 dark:text-slate-500'
              }`}
            >
              {g}:{gpaMetrics.gradeCounts[g]}
            </span>
          ))}
        </div>

        {/* Prior Cumulative Standing (Optional) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
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
              className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
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
              className={`w-full min-h-[40px] px-3 rounded-xl border bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none ${
                gpaMetrics.priorCgpaInvalid
                  ? 'border-rose-400 dark:border-rose-600 focus:border-rose-500'
                  : 'border-slate-200 dark:border-slate-700 focus:border-emerald-600'
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
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
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
              className="min-h-[34px] px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Course</span>
            </button>
          </div>

          {gpaState.courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-5 text-center space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
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
                    className="grid grid-cols-12 gap-2 items-center bg-slate-50/80 dark:bg-slate-800/50 rounded-2xl p-2 border border-slate-100 dark:border-slate-800"
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
                      className="col-span-12 sm:col-span-4 min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
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
                      className="col-span-4 sm:col-span-3 min-h-[38px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
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
                      className="col-span-4 sm:col-span-3 min-h-[38px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                    >
                      {(['A', 'B', 'C', 'D', 'E', 'F'] as GsuGradeLetter[]).map((g) => (
                        <option key={g} value={g}>
                          {g} ({GSU_GRADE_POINTS[g]})
                        </option>
                      ))}
                    </select>

                    <div className="col-span-4 sm:col-span-2 flex items-center justify-end gap-1">
                      <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-500 dark:text-slate-400 px-1.5">
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
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
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
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Target CGPA after these units
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-x-auto">
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
                      ? 'bg-emerald-700 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Current CGPA compared to {gpaState.targetCgpa.toFixed(2)} target</span>
              <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {hasEnteredAnyData ? displayCgpa.toFixed(2) : '—'} / {gpaState.targetCgpa.toFixed(2)} ({targetProgressPct}%)
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-300"
                style={{ width: `${targetProgressPct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="sm:w-48 shrink-0">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
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
                className={`w-full min-h-[38px] px-3 rounded-xl border bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none ${
                  gpaMetrics.upcomingUnitsInvalid
                    ? 'border-rose-400 dark:border-rose-600 focus:border-rose-500'
                    : 'border-slate-200 dark:border-slate-700 focus:border-emerald-600'
                }`}
              />
              {gpaMetrics.upcomingUnitsInvalid && (
                <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                  Must be between 1 and 200 units.
                </p>
              )}
            </div>

            <div className="flex-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 px-3.5 py-2.5">
              {!gpaMetrics.hasUpcomingUnits ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enter your upcoming credit units to see the average GPA needed to hit {gpaState.targetCgpa.toFixed(2)}.
                </p>
              ) : gpaMetrics.requiredAvg > 5 ? (
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    Needs {gpaMetrics.requiredAvg.toFixed(2)} GPA over next {gpaMetrics.upcomingU} units
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Exceeds 5.00 max in {gpaMetrics.upcomingU} units — add more upcoming credit units or pick a different target.
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {alreadyAtTarget
                        ? `On track! Keep ≥ ${safeRequiredAvg.toFixed(2)} GPA over next ${gpaMetrics.upcomingU} units`
                        : `Target ${gpaState.targetCgpa.toFixed(2)}: Need ${safeRequiredAvg.toFixed(2)} GPA over next ${gpaMetrics.upcomingU} units`}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
