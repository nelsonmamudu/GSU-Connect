import type { VoiceCallStatus } from '../types';

export type CallRtcState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

/**
 * User-facing call state. A call is only "Connected" once the browser reports
 * a live peer connection; an accepted signalling row on its own is not audio.
 */
export function describeCallConnection(
  status: VoiceCallStatus,
  rtc: CallRtcState,
  options: { isCaller: boolean; accepting: boolean; offerPublished: boolean }
): string {
  switch (status) {
    case 'ringing':
      if (options.accepting) return 'Connecting...';
      if (rtc === 'failed') return 'Call connection failed';
      if (!options.isCaller) return 'Incoming voice call...';
      return options.offerPublished ? 'Ringing...' : 'Calling...';
    case 'accepted':
      if (rtc === 'failed') return 'Audio connection failed';
      if (rtc === 'disconnected') return 'Audio disconnected';
      return rtc === 'connected' ? 'Connected' : 'Connecting audio...';
    case 'declined':
      return 'Call declined';
    case 'missed':
      return 'No answer';
    case 'ended':
      return 'Call ended';
    default:
      return 'Calling...';
  }
}

/** True only when the call can be billed/counted as connected audio time. */
export function isCallAudioLive(status: VoiceCallStatus, rtc: CallRtcState): boolean {
  return status === 'accepted' && rtc === 'connected';
}
