import AgoraRTC, {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng';
import { CallEngine, CallEngineOptions, CallSession } from './types';

export class AgoraEngine implements CallEngine {
  name = 'agora' as const;
  label = 'Agora.io';

  private client: IAgoraRTCClient | null = null;
  private localTrack: IMicrophoneAudioTrack | null = null;

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  private async requestToken(channel: string, uid: number, serverUrl: string) {
    const res = await fetch(`${serverUrl}/api/agora/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, uid }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ token: string; appId: string }>;
  }

  async createCall(_calleeId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    const channel = opts.roomId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const uid = Math.floor(Math.random() * 100000);
    const data = await this.requestToken(channel, uid, opts.serverUrl);
    if (!data) return null;
    return this.connectChannel(data.appId, channel, data.token, uid, opts);
  }

  async joinCall(callId: string, _callerId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    const uid = Math.floor(Math.random() * 100000);
    const data = await this.requestToken(callId, uid, opts.serverUrl);
    if (!data) return null;
    return this.connectChannel(data.appId, callId, data.token, uid, opts);
  }

  private async connectChannel(
    appId: string,
    channel: string,
    token: string,
    uid: number,
    opts: CallEngineOptions,
  ): Promise<CallSession | null> {
    if (!this.isSupported()) return null;

    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this.client = client;

    try {
      await client.join(appId, channel, token, uid);

      const micTrack = await AgoraRTC.createMicrophoneAudioTrack();
      this.localTrack = micTrack;
      await client.publish(micTrack);

      let remoteStream: MediaStream | undefined;
      const onUserPublished = async (user: any, mediaType: 'audio' | 'video') => {
        if (mediaType === 'audio') {
          await client.subscribe(user, mediaType);
          if (user.audioTrack) {
            const stream = new MediaStream();
            stream.addTrack(user.audioTrack.getMediaStreamTrack());
            remoteStream = stream;
            user.audioTrack.play();
          }
        }
      };
      client.on('user-published', onUserPublished);

      // Also check for already-connected users
      for (const user of client.remoteUsers) {
        if (user.audioTrack) {
          const stream = new MediaStream();
          stream.addTrack(user.audioTrack.getMediaStreamTrack());
          remoteStream = stream;
          user.audioTrack.play();
        }
      }

      const engineName = 'agora';
      return {
        engineName,
        localStream: new MediaStream([micTrack.getMediaStreamTrack()]),
        remoteStream,
        async end() {
          client.off('user-published', onUserPublished);
          micTrack.stop();
          micTrack.close();
          client.remoteUsers.forEach(u => {
            if (u.audioTrack) u.audioTrack.stop();
          });
          await client.leave();
          this.client = null;
          this.localTrack = null;
        },
        setMuted(muted: boolean) {
          micTrack.setEnabled(!muted);
        },
        isConnected() {
          return client.connectionState === 'CONNECTED';
        },
      };
    } catch (err) {
      console.warn('Agora connect failed:', err);
      client.remoteUsers.forEach(u => {
        if (u.audioTrack) u.audioTrack.stop();
      });
      await client.leave().catch(() => {});
      this.client = null;
      this.localTrack = null;
      return null;
    }
  }
}
