import { Room, RoomEvent, Track } from 'livekit-client';
import { CallEngine, CallEngineOptions, CallSession } from './types';

export class LiveKitEngine implements CallEngine {
  name = 'livekit' as const;
  label = 'LiveKit Cloud';

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  private async requestToken(room: string, identity: string, serverUrl: string) {
    const res = await fetch(`${serverUrl}/api/livekit/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, identity }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ token: string; wsUrl: string }>;
  }

  async createCall(_calleeId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    const roomName = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const data = await this.requestToken(roomName, opts.userId, opts.serverUrl);
    if (!data) return null;
    return this.connectRoom(data.wsUrl, data.token, opts);
  }

  async joinCall(callId: string, _callerId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    const data = await this.requestToken(callId, opts.userId, opts.serverUrl);
    if (!data) return null;
    return this.connectRoom(data.wsUrl, data.token, opts);
  }

  private async connectRoom(wsUrl: string, token: string, opts: CallEngineOptions): Promise<CallSession | null> {
    if (!this.isSupported()) return null;

    const room = new Room({ adaptiveStream: true, dynacast: true });

    try {
      await room.connect(wsUrl, token);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await room.localParticipant.publishTrack(stream.getAudioTracks()[0], {
        source: Track.Source.Microphone,
      });

      let remoteStream: MediaStream | undefined;
      const onSub = (track: Track) => {
        if (track.kind === 'audio' && !remoteStream) {
          remoteStream = new MediaStream([track.mediaStreamTrack]);
        }
      };
      room.on(RoomEvent.TrackSubscribed, onSub);

      return {
        engineName: 'livekit',
        localStream: stream,
        remoteStream,
        async end() {
          room.off(RoomEvent.TrackSubscribed, onSub);
          stream.getTracks().forEach(t => t.stop());
          room.disconnect();
        },
        setMuted(muted: boolean) {
          stream.getAudioTracks().forEach(t => (t.enabled = !muted));
        },
        isConnected() {
          return room.state === 'connected';
        },
      };
    } catch (err) {
      console.warn('LiveKit connect failed:', err);
      room.disconnect();
      return null;
    }
  }
}
