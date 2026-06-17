import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { CallEngine, CallEngineOptions, CallSession } from './types';

export class DailyEngine implements CallEngine {
  name = 'daily' as const;
  label = 'Daily.co';

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  private async createRoom(serverUrl: string) {
    const res = await fetch(`${serverUrl}/api/daily/room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ url: string }>;
  }

  async createCall(_calleeId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    if (!this.isSupported()) return null;
    const room = await this.createRoom(opts.serverUrl);
    if (!room) return null;
    return this.joinRoom(room.url, opts);
  }

  async joinCall(_callId: string, _callerId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    if (!this.isSupported()) return null;
    return this.joinRoom(_callId, opts);
  }

  private async joinRoom(roomUrl: string, opts: CallEngineOptions): Promise<CallSession | null> {
    const call: DailyCall = DailyIframe.createCallObject({ videoSource: false });

    try {
      await call.join({ url: roomUrl, userName: opts.userDisplayName || opts.userId });
      call.setLocalVideo(false);

      let localStream: MediaStream | undefined;
      let remoteStream: MediaStream | undefined;
      let ended = false;

      const onParticipant = () => {
        const participants = call.participants();
        if (!localStream) {
          const local = Object.values(participants).find((p: any) => p.local);
          if (local?.tracks?.audio?.persistentTrack) {
            localStream = new MediaStream([local.tracks.audio.persistentTrack]);
          }
        }
        if (!remoteStream) {
          const remote = Object.values(participants).find((p: any) => !p.local);
          if (remote?.tracks?.audio?.persistentTrack) {
            remoteStream = new MediaStream([remote.tracks.audio.persistentTrack]);
          }
        }
      };

      call.on('participant-updated', onParticipant);
      call.on('track-started', onParticipant);

      return {
        engineName: 'daily',
        localStream,
        remoteStream,
        async end() {
          ended = true;
          call.off('participant-updated', onParticipant);
          call.off('track-started', onParticipant);
          call.destroy();
        },
        setMuted(muted: boolean) {
          call.setLocalAudio(!muted);
        },
        isConnected() {
          return !ended;
        },
      };
    } catch (err) {
      console.warn('Daily join failed:', err);
      call.destroy();
      return null;
    }
  }
}
