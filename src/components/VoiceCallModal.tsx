import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Volume2,
} from 'lucide-react';
import {
  addCallCandidate,
  logVoiceCallMessage,
  subscribeToVoiceCall,
  updateCallSession,
} from '../services/supabaseService';
import { AppUser, formatCompactLevelLabel, VoiceCallSession } from '../types';
import { RoleBadge } from './RoleBadge';
import { UserAvatar } from './UserAvatar';

interface VoiceCallModalProps {
  currentUser: AppUser;
  callSession: VoiceCallSession;
  peerUser?: AppUser | null;
  onClose: () => void;
}

const TURN_URL = import.meta.env.VITE_TURN_URL?.trim();
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME?.trim();
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL?.trim();

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    ...(TURN_URL
      ? [
          {
            urls: TURN_URL.split(',').map((u: string) => u.trim()).filter(Boolean),
            ...(TURN_USERNAME ? { username: TURN_USERNAME } : {}),
            ...(TURN_CREDENTIAL ? { credential: TURN_CREDENTIAL } : {}),
          },
        ]
      : []),
  ],
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function resolveAvatarProps(
  user?: AppUser | null,
  serializedAvatar?: string
): { photoURL?: string; avatarId?: string } {
  if (user) {
    return { photoURL: user.photoURL, avatarId: user.avatarId };
  }
  if (!serializedAvatar) return {};
  if (serializedAvatar.startsWith('preset:')) {
    return { avatarId: serializedAvatar.slice('preset:'.length) };
  }
  if (
    serializedAvatar.startsWith('http://') ||
    serializedAvatar.startsWith('https://') ||
    serializedAvatar.startsWith('data:image/')
  ) {
    return { photoURL: serializedAvatar };
  }
  return {};
}

export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  currentUser,
  callSession,
  peerUser,
  onClose,
}) => {
  const isCaller = callSession.callerId === currentUser.uid;
  const [liveCall, setLiveCall] = useState<VoiceCallSession>(callSession);

  const peerName =
    peerUser?.fullName || (isCaller ? liveCall.receiverName : liveCall.callerName);
  const peerDepartment =
    peerUser?.department ||
    (isCaller ? liveCall.receiverDepartment : liveCall.callerDepartment) ||
    '';
  const peerAvatarProps = resolveAvatarProps(
    peerUser,
    isCaller ? liveCall.receiverAvatar : liveCall.callerAvatar
  );

  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [offerPublished, setOfferPublished] = useState(Boolean(callSession.offer));
  const [rtcConnectionState, setRtcConnectionState] = useState<
    'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed'
  >('idle');
  const [accepting, setAccepting] = useState(false);
  const [micWarning, setMicWarning] = useState<string | null>(null);
  const [ringtoneNeedsTap, setRingtoneNeedsTap] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const processedCandidateIdsRef = useRef<Set<string>>(new Set());
  const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const appliedRemoteSdpRef = useRef<boolean>(false);
  const offerSentRef = useRef<boolean>(false);
  const answerSentRef = useRef<boolean>(false);
  const pendingAcceptRef = useRef<boolean>(false);
  const hasLoggedCallRef = useRef<boolean>(false);
  const elapsedSecRef = useRef<number>(0);
  const speakerOnRef = useRef<boolean>(false);

  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);

  useEffect(() => {
    speakerOnRef.current = speakerOn;
  }, [speakerOn]);

  const cleanupRtc = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  const flushPendingRemoteCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    while (pendingRemoteCandidatesRef.current.length > 0) {
      const next = pendingRemoteCandidatesRef.current.shift();
      if (!next) continue;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(next));
      } catch {
        // Ignore stale/invalid ICE candidate
      }
    }
  }, []);

  // Synthesized Web Audio API ringtone (incoming) & ringback tone (outgoing)
  useEffect(() => {
    if (liveCall.status !== 'ringing') {
      setRingtoneNeedsTap(false);
      return;
    }
    if (isCaller && !offerPublished) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    let ctx: AudioContext | null = null;
    let intervalId: number | null = null;
    let cancelled = false;

    const playIncomingPattern = (audioCtx: AudioContext) => {
      if (audioCtx.state !== 'running') return;
      const now = audioCtx.currentTime;
      const notes = [
        { freq: 659.25, start: 0, dur: 0.16 },
        { freq: 783.99, start: 0.19, dur: 0.16 },
        { freq: 987.77, start: 0.38, dur: 0.24 },
        { freq: 783.99, start: 0.68, dur: 0.22 },
      ];
      notes.forEach(({ freq, start, dur }) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + start);
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.14, now + start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + start);
        osc.stop(now + start + dur + 0.02);
      });
    };

    const playOutgoingRingback = (audioCtx: AudioContext) => {
      if (audioCtx.state !== 'running') return;
      const now = audioCtx.currentTime;
      [440, 480].forEach((freq) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.04);
        gain.gain.setValueAtTime(0.05, now + 0.9);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 1.1);
      });
    };

    const startAudio = async () => {
      try {
        ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => undefined);
        }
        if (cancelled) {
          ctx.close().catch(() => undefined);
          return;
        }
        if (ctx.state === 'suspended' && !isCaller) {
          setRingtoneNeedsTap(true);
        } else {
          setRingtoneNeedsTap(false);
          if (isCaller) {
            playOutgoingRingback(ctx);
          } else {
            playIncomingPattern(ctx);
          }
        }

        intervalId = window.setInterval(() => {
          if (!ctx || cancelled) return;
          if (ctx.state === 'running') {
            setRingtoneNeedsTap(false);
            if (isCaller) {
              playOutgoingRingback(ctx);
            } else {
              playIncomingPattern(ctx);
            }
          }
        }, isCaller ? 3400 : 2400);
      } catch {
        // AudioContext unavailable
      }
    };

    const resumeOnGesture = async () => {
      if (!ctx || cancelled || ctx.state !== 'suspended') return;
      await ctx.resume().catch(() => undefined);
      if ((ctx.state as AudioContextState) === 'running') {
        setRingtoneNeedsTap(false);
        if (isCaller) {
          playOutgoingRingback(ctx);
        } else {
          playIncomingPattern(ctx);
        }
      }
    };

    startAudio();
    window.addEventListener('pointerdown', resumeOnGesture);
    window.addEventListener('keydown', resumeOnGesture);

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', resumeOnGesture);
      window.removeEventListener('keydown', resumeOnGesture);
      if (intervalId !== null) window.clearInterval(intervalId);
      if (ctx) {
        ctx.close().catch(() => undefined);
      }
    };
  }, [isCaller, liveCall.status, offerPublished]);

  // Subscribe to call updates & remote WebRTC signaling via Supabase Realtime
  useEffect(() => {
    const unsub = subscribeToVoiceCall(callSession.id, currentUser.uid, isCaller, {
      onCallUpdate: (data) => {
        setLiveCall((prev) => ({
          ...prev,
          status: data.status,
          offer: data.offer ?? prev.offer,
          answer: data.answer ?? prev.answer,
          acceptedAt: data.acceptedAt ?? prev.acceptedAt,
          updatedAt: data.updatedAt ?? prev.updatedAt,
        }));
        if (data.offer) setOfferPublished(true);
      },
      onRemoteCandidate: (candidateId, candidateJson) => {
        if (processedCandidateIdsRef.current.has(candidateId)) return;
        processedCandidateIdsRef.current.add(candidateId);
        try {
          const ice = JSON.parse(candidateJson) as RTCIceCandidateInit;
          if (pcRef.current && pcRef.current.remoteDescription) {
            pcRef.current.addIceCandidate(new RTCIceCandidate(ice)).catch(() => undefined);
          } else {
            pendingRemoteCandidatesRef.current.push(ice);
          }
        } catch {
          // Ignore malformed ICE candidate
        }
      },
    });
    return () => unsub();
  }, [callSession.id, currentUser.uid, isCaller]);

  // Live call duration timer when accepted
  useEffect(() => {
    if (liveCall.status !== 'accepted') return;
    setElapsedSec(0);
    const id = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [liveCall.status]);

  // Adjust remote audio output volume when Speaker toggle changes
  useEffect(() => {
    const audioEl = remoteAudioRef.current;
    if (!audioEl) return;
    audioEl.volume = speakerOn ? 1.0 : 0.55;
  }, [speakerOn]);

  // Auto-mark missed after 40s of unanswered ringing by caller + log missed call
  useEffect(() => {
    if (!isCaller || liveCall.status !== 'ringing') return;
    const timeout = window.setTimeout(async () => {
      try {
        await updateCallSession(liveCall.id, { status: 'missed' });
        if (!hasLoggedCallRef.current) {
          hasLoggedCallRef.current = true;
          await logVoiceCallMessage({
            callId: liveCall.id,
            dmChatId: liveCall.dmChatId,
            peerId: liveCall.receiverId,
            actor: currentUser,
            outcome: 'missed',
          });
        }
      } catch {
        // Ignore timeout cleanup failure
      }
    }, 40_000);
    return () => window.clearTimeout(timeout);
  }, [isCaller, liveCall.id, liveCall.dmChatId, liveCall.receiverId, liveCall.status, currentUser]);

  // Clean up RTC and auto-close shortly after terminal state
  useEffect(() => {
    if (
      liveCall.status === 'ended' ||
      liveCall.status === 'declined' ||
      liveCall.status === 'missed'
    ) {
      cleanupRtc();
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleEsc);
      const t = window.setTimeout(() => onClose(), 1800);
      return () => {
        window.removeEventListener('keydown', handleEsc);
        window.clearTimeout(t);
      };
    }
  }, [liveCall.status, cleanupRtc, onClose]);

  const attachPeerHandlers = useCallback(
    (pc: RTCPeerConnection, role: 'caller' | 'receiver') => {
      pc.ontrack = (event) => {
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.volume = speakerOnRef.current ? 1.0 : 0.55;
          remoteAudioRef.current.play().catch(() => undefined);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addCallCandidate(
            callSession.id,
            role,
            currentUser.uid,
            JSON.stringify(event.candidate.toJSON())
          ).catch(() => undefined);
        }
      };

      const syncConnectionState = () => {
        const state = pc.connectionState;
        const iceState = pc.iceConnectionState;
        if (state === 'connected' || iceState === 'connected' || iceState === 'completed') {
          setRtcConnectionState('connected');
        } else if (state === 'failed' || iceState === 'failed') {
          setRtcConnectionState('failed');
        } else if (state === 'disconnected' || iceState === 'disconnected') {
          setRtcConnectionState('disconnected');
        } else if (state === 'connecting' || state === 'new' || iceState === 'checking') {
          setRtcConnectionState('connecting');
        }
      };

      pc.onconnectionstatechange = syncConnectionState;
      pc.oniceconnectionstatechange = syncConnectionState;
    },
    [callSession.id, currentUser.uid]
  );

  // Initialize peer connection for caller immediately on mount
  useEffect(() => {
    if (!isCaller || offerSentRef.current) return;
    offerSentRef.current = true;

    let cancelled = false;
    const startCallerRtc = async () => {
      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;
        setRtcConnectionState('connecting');
        attachPeerHandlers(pc, 'caller');

        let hasAudioTrack = false;
        if (navigator.mediaDevices?.getUserMedia) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (cancelled) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            localStreamRef.current = stream;
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));
            hasAudioTrack = stream.getAudioTracks().length > 0;
          } catch {
            setMicWarning('Microphone unavailable. Call signaling active in listen-only mode.');
          }
        } else {
          setMicWarning('Microphone API unavailable in this browser.');
        }

        if (!hasAudioTrack && typeof pc.addTransceiver === 'function') {
          pc.addTransceiver('audio', { direction: 'recvonly' });
        }

        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        if (!cancelled && offer.sdp) {
          await updateCallSession(callSession.id, {
            offer: JSON.stringify({ type: offer.type, sdp: offer.sdp }),
          });
          setOfferPublished(true);
        }
      } catch {
        setMicWarning('Voice signaling initialized without local audio.');
        setOfferPublished(true);
      }
    };

    startCallerRtc();
    return () => {
      cancelled = true;
    };
  }, [isCaller, callSession.id, attachPeerHandlers]);

  // Apply remote answer on caller side
  useEffect(() => {
    if (!isCaller || !liveCall.answer || appliedRemoteSdpRef.current || !pcRef.current) {
      return;
    }
    try {
      const parsed = JSON.parse(liveCall.answer) as RTCSessionDescriptionInit;
      appliedRemoteSdpRef.current = true;
      pcRef.current
        .setRemoteDescription(new RTCSessionDescription(parsed))
        .then(() => flushPendingRemoteCandidates())
        .catch(() => undefined);
    } catch {
      // Ignore malformed SDP
    }
  }, [isCaller, liveCall.answer, flushPendingRemoteCandidates]);

  // Complete receiver accept flow
  const completeReceiverAccept = useCallback(
    async (offerJson: string) => {
      if (answerSentRef.current) return;
      answerSentRef.current = true;
      setAccepting(true);
      try {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;
        setRtcConnectionState('connecting');
        attachPeerHandlers(pc, 'receiver');

        if (navigator.mediaDevices?.getUserMedia) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          } catch {
            setMicWarning('Microphone unavailable. Connected in listen-only mode.');
          }
        } else {
          setMicWarning('Microphone API unavailable in this browser.');
        }

        const parsedOffer = JSON.parse(offerJson) as RTCSessionDescriptionInit;
        await pc.setRemoteDescription(new RTCSessionDescription(parsedOffer));
        appliedRemoteSdpRef.current = true;
        await flushPendingRemoteCandidates();

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await updateCallSession(liveCall.id, {
          status: 'accepted',
          answer: JSON.stringify({ type: answer.type, sdp: answer.sdp }),
          setAcceptedAt: true,
        });
      } catch {
        await updateCallSession(liveCall.id, {
          status: 'accepted',
          setAcceptedAt: true,
        }).catch(() => undefined);
      } finally {
        setAccepting(false);
        pendingAcceptRef.current = false;
      }
    },
    [attachPeerHandlers, flushPendingRemoteCandidates, liveCall.id]
  );

  // If receiver clicked Accept just before caller published offer, resume automatically
  useEffect(() => {
    if (!isCaller && pendingAcceptRef.current && liveCall.offer && !answerSentRef.current) {
      completeReceiverAccept(liveCall.offer);
    }
  }, [isCaller, liveCall.offer, completeReceiverAccept]);

  // Remote ICE candidates are handled via subscribeToVoiceCall Realtime channel above

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRtc();
    };
  }, [cleanupRtc]);

  const handleAnswerCall = async () => {
    if (answerSentRef.current || accepting) return;
    if (liveCall.offer) {
      await completeReceiverAccept(liveCall.offer);
    } else {
      pendingAcceptRef.current = true;
      setAccepting(true);
    }
  };

  const handleDeclineCall = async () => {
    cleanupRtc();
    try {
      await updateCallSession(liveCall.id, { status: 'declined' });
      if (!hasLoggedCallRef.current) {
        hasLoggedCallRef.current = true;
        await logVoiceCallMessage({
          callId: liveCall.id,
          dmChatId: liveCall.dmChatId,
          peerId: isCaller ? liveCall.receiverId : liveCall.callerId,
          actor: currentUser,
          outcome: 'declined',
        });
      }
    } catch {
      // Close smoothly even if network glitches
    }
    onClose();
  };

  const handleEndCall = async () => {
    const finalElapsed = elapsedSecRef.current;
    const wasAccepted = liveCall.status === 'accepted';
    cleanupRtc();

    try {
      if (wasAccepted) {
        await updateCallSession(liveCall.id, { status: 'ended' });
        if (!hasLoggedCallRef.current) {
          hasLoggedCallRef.current = true;
          await logVoiceCallMessage({
            callId: liveCall.id,
            dmChatId: liveCall.dmChatId,
            peerId: isCaller ? liveCall.receiverId : liveCall.callerId,
            actor: currentUser,
            outcome: 'completed',
            durationSec: finalElapsed,
          });
        }
      } else {
        await updateCallSession(liveCall.id, { status: 'missed' });
        if (!hasLoggedCallRef.current) {
          hasLoggedCallRef.current = true;
          await logVoiceCallMessage({
            callId: liveCall.id,
            dmChatId: liveCall.dmChatId,
            peerId: isCaller ? liveCall.receiverId : liveCall.callerId,
            actor: currentUser,
            outcome: isCaller ? 'cancelled' : 'missed',
          });
        }
      }
    } catch {
      // Close smoothly even if network glitches
    }
    onClose();
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
    }
  };

  const handleToggleSpeaker = async () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    const audioEl = remoteAudioRef.current as
      | (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> })
      | null;
    if (audioEl) {
      audioEl.volume = next ? 1.0 : 0.55;
      if (typeof audioEl.setSinkId === 'function' && navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const outputs = devices.filter((d) => d.kind === 'audiooutput');
          if (outputs.length > 1) {
            const preferred = next
              ? outputs.find((d) => /speaker|default/i.test(d.label)) || outputs[0]
              : outputs.find((d) => /earpiece|head|communications/i.test(d.label)) || outputs[0];
            if (preferred?.deviceId) {
              await audioEl.setSinkId(preferred.deviceId).catch(() => undefined);
            }
          }
        } catch {
          // Ignore sink switch failures on unsupported browsers
        }
      }
    }
  };

  const connectionLabel = (() => {
    switch (liveCall.status) {
      case 'ringing':
        if (accepting) return 'Connecting...';
        if (!isCaller) return 'Incoming voice call...';
        return offerPublished ? 'Ringing...' : 'Calling...';
      case 'accepted':
        if (rtcConnectionState === 'failed') return 'Reconnecting audio...';
        return 'Connected';
      case 'declined':
        return 'Call declined';
      case 'missed':
        return 'No answer';
      case 'ended':
        return 'Call ended';
    }
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Voice call with ${peerName}`}
      className="fixed inset-0 z-[60] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4"
    >
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="w-full max-w-sm rounded-3xl bg-on-dark border border-on-dark p-7 text-center text-on-dark shadow-overlay space-y-6">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-on-dark-success">
            <PhoneIncoming className="w-3.5 h-3.5" />
            <span>GSU Connect Voice</span>
          </div>
          <p className="text-xs text-on-dark-muted">1-to-1 Campus Voice Call</p>
        </div>

        <div className="flex flex-col items-center space-y-3.5">
          <div
            className={`relative rounded-full p-1.5 ${
              liveCall.status === 'ringing'
                ? 'ring-4 ring-on-dark-success/40 animate-pulse'
                : liveCall.status === 'accepted'
                  ? 'ring-4 ring-on-dark-success/60'
                  : 'ring-2 ring-on-dark/40'
            }`}
          >
            <UserAvatar
              name={peerName}
              photoURL={peerAvatarProps.photoURL}
              avatarId={peerAvatarProps.avatarId}
              size="2xl"
              roundedClass="rounded-full"
              fallbackClassName="bg-on-dark-brand"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              <h3 className="text-xl font-bold text-on-dark">{peerName}</h3>
              {peerUser && <RoleBadge role={peerUser.role} inverted />}
            </div>
            {(peerDepartment || peerUser) && (
              <p className="text-xs text-on-dark-muted">
                {peerDepartment}
                {peerUser && (
                  <>
                    {' · '}
                    {formatCompactLevelLabel(peerUser.level, peerUser.is_alumni)}
                  </>
                )}
              </p>
            )}
            <div className="pt-1.5 space-y-0.5">
              <p className="text-sm font-semibold text-on-dark-success">
                {connectionLabel}
              </p>
              {liveCall.status === 'accepted' && (
                <p className="text-base font-mono font-bold text-on-dark tabular-nums">
                  {formatDuration(elapsedSec)}
                </p>
              )}
              {liveCall.status === 'accepted' && muted && (
                <p className="text-[11px] font-semibold text-on-dark-warn">
                  Microphone muted
                </p>
              )}
              {liveCall.status === 'ended' && elapsedSec > 0 && (
                <p className="text-xs font-mono text-on-dark-muted tabular-nums">
                  Duration {formatDuration(elapsedSec)}
                </p>
              )}
            </div>
          </div>
        </div>

        {ringtoneNeedsTap && !isCaller && liveCall.status === 'ringing' && (
          <p className="text-[11px] text-on-dark-success/90 bg-on-dark-success/10 border border-on-dark rounded-xl px-3 py-1.5">
            Tap anywhere to hear incoming ringtone
          </p>
        )}

        {micWarning && (
          <p className="text-[11px] text-on-dark-warn bg-on-dark-warn/10 border border-on-dark rounded-xl px-3 py-2">
            {micWarning}
          </p>
        )}

        {rtcConnectionState === 'failed' && (
          <p className="text-[11px] text-on-dark-danger bg-on-dark-danger/10 border border-on-dark rounded-xl px-3 py-2">
            Audio connection failed. One of the networks may be blocking direct peer-to-peer calls.
          </p>
        )}

        {!isCaller && liveCall.status === 'ringing' ? (
          <div className="flex items-center justify-center gap-10 pt-2">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                disabled={accepting}
                onClick={handleDeclineCall}
                aria-label="Decline call"
                className="w-15 h-15 rounded-full bg-on-dark-danger disabled:opacity-60 flex items-center justify-center shadow-overlay transition-transform active:scale-95 cursor-pointer"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
              <span className="text-xs font-medium text-on-dark-muted">Decline</span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                disabled={accepting}
                onClick={handleAnswerCall}
                aria-label="Accept call"
                className="w-15 h-15 rounded-full bg-on-dark-brand disabled:opacity-60 flex items-center justify-center shadow-overlay transition-transform active:scale-95 cursor-pointer"
              >
                <Phone className="w-6 h-6" />
              </button>
              <span className="text-xs font-medium text-on-dark-success">
                {accepting ? 'Connecting...' : 'Accept'}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-6 pt-2">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                aria-pressed={muted}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  muted
                    ? 'bg-white text-ink'
                    : 'bg-on-dark-danger/15 hover:bg-on-dark-danger/25 text-on-dark'
                }`}
              >
                {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <span className="text-[11px] font-medium text-on-dark-muted">
                {muted ? 'Unmute' : 'Mute'}
              </span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={handleEndCall}
                aria-label="End voice call"
                className="w-14 h-14 rounded-full bg-on-dark-danger flex items-center justify-center shadow-overlay transition-transform active:scale-95 cursor-pointer"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
              <span className="text-[11px] font-medium text-on-dark-danger">End</span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={handleToggleSpeaker}
                aria-label={speakerOn ? 'Turn speaker off' : 'Turn speaker on'}
                aria-pressed={speakerOn}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  speakerOn
                    ? 'bg-white text-ink'
                    : 'bg-on-dark-danger/15 hover:bg-on-dark-danger/25 text-on-dark'
                }`}
              >
                <Volume2 className="w-5 h-5" />
              </button>
              <span className="text-[11px] font-medium text-on-dark-muted">Speaker</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
