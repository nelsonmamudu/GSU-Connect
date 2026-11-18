import React, { useEffect, useId, useRef, useState } from 'react';
import { Mic, Pause, Play } from 'lucide-react';
import { getSignedChatFileUrl } from '../services/supabaseService';
import { formatAudioDuration } from '../types';

interface VoiceNotePlayerProps {
  src: string;
  durationSec?: number;
  inverted?: boolean;
}

const VOICE_PLAY_EVENT = 'gsu-voice-note-play';
const PLAYBACK_RATES = [1, 1.5, 2] as const;

function isDirectMediaUrl(value: string): boolean {
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('blob:')
  );
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  src,
  durationSec = 0,
  inverted = false,
}) => {
  const playerId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState(durationSec);
  const [rateIndex, setRateIndex] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string>(() =>
    isDirectMediaUrl(src) ? src : ''
  );

  const playbackRate = PLAYBACK_RATES[rateIndex];

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setResolvedDuration(durationSec);
    setPlaybackError(false);

    if (!src) {
      setResolvedSrc('');
      return;
    }
    if (isDirectMediaUrl(src)) {
      setResolvedSrc(src);
      return;
    }

    let cancelled = false;
    setResolvedSrc('');
    getSignedChatFileUrl(src)
      .then((signedUrl) => {
        if (!cancelled) setResolvedSrc(signedUrl);
      })
      .catch(() => {
        if (!cancelled) setPlaybackError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src, durationSec]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id && detail.id !== playerId && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    };
    window.addEventListener(VOICE_PLAY_EVENT, handleOtherPlay);
    return () => window.removeEventListener(VOICE_PLAY_EVENT, handleOtherPlay);
  }, [playerId]);

  const effectiveDuration =
    resolvedDuration > 0 ? resolvedDuration : durationSec > 0 ? durationSec : 0;

  const progressPct =
    effectiveDuration > 0
      ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100))
      : 0;

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    setPlaybackError(false);
    if (isPlaying) {
      el.pause();
      return;
    }
    el.playbackRate = playbackRate;
    window.dispatchEvent(new CustomEvent(VOICE_PLAY_EVENT, { detail: { id: playerId } }));
    el.play().catch((err) => {
      console.error('Audio playback failed:', err);
      setIsPlaying(false);
      setPlaybackError(true);
    });
  };

  const seekTo = (nextSec: number) => {
    const el = audioRef.current;
    if (!el || effectiveDuration <= 0) return;
    const clamped = Math.min(effectiveDuration, Math.max(0, nextSec));
    el.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (effectiveDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * effectiveDuration);
  };

  const handleSliderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (effectiveDuration <= 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      seekTo(currentTime + 5);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seekTo(currentTime - 5);
    } else if (e.key === 'Home') {
      e.preventDefault();
      seekTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      seekTo(effectiveDuration);
    }
  };

  const cycleSpeed = () => {
    setRateIndex((prev) => (prev + 1) % PLAYBACK_RATES.length);
  };

  return (
    <div
      className={`flex items-center gap-2.5 min-w-[215px] sm:min-w-[260px] py-1 ${
        inverted ? 'text-white' : 'text-slate-900 dark:text-slate-100'
      }`}
    >
      <audio
        ref={audioRef}
        src={resolvedSrc || undefined}
        preload="metadata"
        onPlay={() => {
          setPlaybackError(false);
          setIsPlaying(true);
          window.dispatchEvent(new CustomEvent(VOICE_PLAY_EVENT, { detail: { id: playerId } }));
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => {
          setIsPlaying(false);
          setPlaybackError(true);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={(e) => {
          const dur = e.currentTarget.duration;
          if (Number.isFinite(dur) && dur > 0) {
            setResolvedDuration(Math.round(dur));
          }
        }}
        onDurationChange={(e) => {
          const dur = e.currentTarget.duration;
          if (Number.isFinite(dur) && dur > 0) {
            setResolvedDuration(Math.round(dur));
          }
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
          inverted
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-emerald-700 hover:bg-emerald-800 text-white'
        }`}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek voice note"
          aria-valuemin={0}
          aria-valuemax={effectiveDuration}
          aria-valuenow={Math.round(currentTime)}
          onClick={handleSeek}
          onKeyDown={handleSliderKeyDown}
          className={`h-2 rounded-full overflow-hidden cursor-pointer focus:outline-none focus:ring-2 ${
            inverted
              ? 'bg-white/25 focus:ring-white/60'
              : 'bg-slate-200 dark:bg-slate-700 focus:ring-emerald-600'
          }`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-100 ${
              inverted ? 'bg-white' : 'bg-emerald-600 dark:bg-emerald-400'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div
          className={`flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums ${
            inverted ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <span className="inline-flex items-center gap-1 truncate">
            <Mic className="w-3 h-3 shrink-0" />
            <span>{playbackError ? 'Audio unavailable' : 'Voice note'}</span>
          </span>
          <div className="inline-flex items-center gap-1.5 shrink-0">
            <span>
              {isPlaying || currentTime > 0
                ? `${formatAudioDuration(currentTime)} / ${formatAudioDuration(effectiveDuration)}`
                : formatAudioDuration(effectiveDuration)}
            </span>
            <button
              type="button"
              onClick={cycleSpeed}
              aria-label={`Playback speed ${playbackRate}x`}
              title="Change playback speed"
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                inverted
                  ? 'bg-white/15 hover:bg-white/25 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
