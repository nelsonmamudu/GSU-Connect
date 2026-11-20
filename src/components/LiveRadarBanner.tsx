import React, { useEffect, useState } from 'react';
import { MapPin, Timer, X } from 'lucide-react';
import { ChatThread, formatShortTime, RADAR_STATUS_LABELS, ROLE_LABELS } from '../types';

interface LiveRadarBannerProps {
  chat: ChatThread;
  canBroadcastRadar: boolean;
  radarSaving: boolean;
  onEdit: () => void;
  onClear: () => Promise<void> | void;
}

function formatCountdownText(
  isoLocal: string,
  nowTime: number
): { label: string; expired: boolean } | null {
  if (!isoLocal) return null;
  const targetMs = new Date(isoLocal).getTime();
  if (!Number.isFinite(targetMs)) return null;
  const diff = targetMs - nowTime;
  if (diff <= 0) return { label: 'Exam / session time reached', expired: true };
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return { label: `${days}d ${hours}h ${mins}m ${secs}s`, expired: false };
  if (hours > 0) return { label: `${hours}h ${mins}m ${secs}s`, expired: false };
  return { label: `${mins}m ${secs}s`, expired: false };
}

export const LiveRadarBanner: React.FC<LiveRadarBannerProps> = React.memo(
  ({ chat, canBroadcastRadar, radarSaving, onEdit, onClear }) => {
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [confirmingClear, setConfirmingClear] = useState(false);

    useEffect(() => {
      setConfirmingClear(false);
    }, [chat.id, chat.radarStatus]);

    useEffect(() => {
      if (!chat.radarExamAt) return;
      setNowMs(Date.now());
      const timer = window.setInterval(() => {
        setNowMs(Date.now());
      }, 1000);
      return () => window.clearInterval(timer);
    }, [chat.radarExamAt]);

    if (chat.type === 'dm' || !chat.radarStatus) return null;

    const status = chat.radarStatus;
    const countdown = chat.radarExamAt ? formatCountdownText(chat.radarExamAt, nowMs) : null;

    const paletteClass =
      status === 'class_cancelled'
        ? 'border-danger-line dark:border-danger/60 bg-danger-bg/90 dark:bg-danger-bg/40'
        : status === 'venue_changed'
          ? 'border-warn-line dark:border-warn/60 bg-warn-bg/90 dark:bg-warn-bg/35'
          : status === 'exam_countdown'
            ? 'border-info-line dark:border-info/60 bg-info-bg/90 dark:bg-info-bg/35'
            : 'border-success-line dark:border-success-line/60 bg-brand-subtle/90 dark:bg-brand-subtle/35';

    const badgeClass =
      status === 'class_cancelled'
        ? 'bg-danger text-danger-on'
        : status === 'venue_changed'
          ? 'bg-warn text-warn-on'
          : status === 'exam_countdown'
            ? 'bg-info text-info-on'
            : 'bg-brand text-on-brand';

    return (
      <div className={`shrink-0 px-3 sm:px-5 py-2.5 border-b ${paletteClass}`}>
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`px-2 py-0.5 rounded-lg text-[10.5px] font-bold inline-flex items-center gap-1 ${badgeClass}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-surface animate-pulse" />
                <span>{RADAR_STATUS_LABELS[status]}</span>
              </span>
              {chat.radarCourseCode && (
                <span className="px-2 py-0.5 rounded-lg bg-white/80 dark:bg-surface/80 border border-line/80 dark:border-line text-[11px] font-mono font-bold text-ink">
                  {chat.radarCourseCode}
                </span>
              )}
              {chat.radarVenue && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-brand" />
                  <span>{chat.radarVenue}</span>
                </span>
              )}
            </div>

            {chat.radarNote && (
              <p className="text-xs text-ink-soft leading-snug">
                {chat.radarNote}
              </p>
            )}

            {(chat.radarExamTitle || countdown) && (
              <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
                <span className="inline-flex items-center gap-1 font-semibold text-info">
                  <Timer className="w-3.5 h-3.5 shrink-0" />
                  <span>{chat.radarExamTitle || 'Upcoming Exam'}</span>
                </span>
                {countdown && (
                  <span
                    className={`px-2 py-0.5 rounded-lg font-mono text-[11px] font-bold tabular-nums ${
                      countdown.expired
                        ? 'bg-danger text-danger-on'
                        : 'bg-slate-900 dark:bg-sunken text-white'
                    }`}
                  >
                    {countdown.label}
                  </span>
                )}
              </div>
            )}

            <p className="text-[11px] text-ink-muted">
              Live Radar by{' '}
              <span className="font-semibold text-ink-soft">
                {chat.radarUpdatedByName || 'Moderator'}
              </span>
              {chat.radarUpdatedByRole ? ` (${ROLE_LABELS[chat.radarUpdatedByRole]})` : ''}
              {chat.radarUpdatedAt ? ` · ${formatShortTime(chat.radarUpdatedAt)}` : ''}
            </p>
          </div>

          {canBroadcastRadar && (
            <div className="flex items-center gap-1 shrink-0">
              {confirmingClear ? (
                <>
                  <button
                    type="button"
                    disabled={radarSaving}
                    onClick={async () => {
                      await onClear();
                      setConfirmingClear(false);
                    }}
                    className="min-h-[32px] px-2.5 rounded-lg bg-danger hover:bg-danger text-danger-on text-[11px] font-semibold cursor-pointer"
                  >
                    {radarSaving ? '...' : 'Clear'}
                  </button>
                  <button
                    type="button"
                    disabled={radarSaving}
                    onClick={() => setConfirmingClear(false)}
                    className="min-h-[32px] px-2 rounded-lg bg-white/90 dark:bg-surface/90 border border-line text-[11px] font-semibold text-ink-body dark:text-ink-soft cursor-pointer"
                  >
                    Keep
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onEdit}
                    className="min-h-[32px] px-2.5 rounded-lg bg-white/90 dark:bg-surface/90 border border-line/80 dark:border-line text-[11px] font-semibold text-ink-soft hover:bg-white cursor-pointer"
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    disabled={radarSaving}
                    onClick={() => setConfirmingClear(true)}
                    aria-label="Clear active radar"
                    title="Clear live radar"
                    className="min-w-[32px] min-h-[32px] rounded-lg flex items-center justify-center text-ink-muted hover:text-danger hover:text-danger hover:bg-white/80 dark:hover:bg-sunken/80 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);
