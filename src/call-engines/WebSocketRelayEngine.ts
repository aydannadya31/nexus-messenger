import { CallEngine, CallEngineOptions, CallSession } from './types';

export class WebSocketRelayEngine implements CallEngine {
  name = 'websocket' as const;
  label = 'WebSocket Relay';

  isSupported(): boolean {
    return typeof WebSocket !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async createCall(_calleeId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    if (!this.isSupported()) {
      console.warn('[WSRelay] not supported (no WebSocket or getUserMedia)');
      return null;
    }
    return this.connect(opts, 'caller');
  }

  async joinCall(_callId: string, _callerId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    if (!this.isSupported()) {
      console.warn('[WSRelay] not supported (no WebSocket or getUserMedia)');
      return null;
    }
    return this.connect(opts, 'callee');
  }

  private async connect(opts: CallEngineOptions, role: 'caller' | 'callee'): Promise<CallSession | null> {
    const roomId = opts.roomId || `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[WSRelay] connecting as ${role} to room ${roomId}...`);

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((e) => {
      console.warn('[WSRelay] getUserMedia failed:', e?.message || e);
      return null;
    });
    if (!stream) {
      console.warn('[WSRelay] no audio stream available (mic permission denied or device busy)');
      return null;
    }
    console.log('[WSRelay] getUserMedia OK, audio track obtained');

    const wsUrl = opts.serverUrl.replace(/^http/, 'ws') + '/ws';
    console.log(`[WSRelay] connecting WebSocket to ${wsUrl}...`);

    return new Promise((resolve) => {
      let ws: WebSocket;
      let resolved = false;
      let ended = false;

      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        console.warn('[WSRelay] WebSocket constructor threw:', e);
        stream.getTracks().forEach(t => t.stop());
        resolve(null);
        return;
      }

      const audioCtx = new AudioContext();
      let remoteStream: MediaStream | undefined;

      ws.onopen = () => {
        console.log('[WSRelay] WebSocket open, sending join...');
        ws.send(JSON.stringify({
          type: 'join',
          room: roomId,
          userId: opts.userId,
          role,
        }));
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'room_joined' && !resolved) {
              console.log('[WSRelay] room_joined received, starting audio relay');
              resolved = true;

              const recorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                  ? 'audio/webm;codecs=opus' : 'audio/webm',
              });
              recorder.ondataavailable = (e) => {
                if (e.data.size > 0 && ws.readyState === WebSocket.OPEN && !ended) {
                  e.data.arrayBuffer().then(buf => ws.send(buf));
                }
              };
              recorder.start(1000);

              resolve({
                engineName: 'websocket',
                localStream: stream,
                remoteStream,
                async end() {
                  ended = true;
                  recorder.stop();
                  stream.getTracks().forEach(t => t.stop());
                  ws.close();
                  audioCtx.close();
                },
                setMuted(muted: boolean) {
                  stream.getAudioTracks().forEach(t => (t.enabled = !muted));
                },
                isConnected() {
                  return !ended && ws.readyState === WebSocket.OPEN;
                },
              });
            }
          } catch { /* ignore parse errors */ }
        } else if (ev.data instanceof ArrayBuffer || ev.data instanceof Blob) {
          const playChunk = async (buf: ArrayBuffer) => {
            try {
              const audioBuf = await audioCtx.decodeAudioData(buf);
              const source = audioCtx.createBufferSource();
              source.buffer = audioBuf;
              source.connect(audioCtx.destination);
              source.start();
            } catch { /* skip unplayable chunks */ }
          };

          if (ev.data instanceof Blob) {
            ev.data.arrayBuffer().then(playChunk);
          } else {
            playChunk(ev.data);
          }
        }
      };

      ws.onerror = (e) => {
        console.warn('[WSRelay] WebSocket error event:', e);
        if (!resolved) {
          resolved = true;
          stream.getTracks().forEach(t => t.stop());
          resolve(null);
        }
      };

      ws.onclose = (e) => {
        console.warn(`[WSRelay] WebSocket closed (code=${e.code}, reason=${e.reason})`);
        if (!resolved) {
          resolved = true;
          stream.getTracks().forEach(t => t.stop());
          resolve(null);
        }
      };

      setTimeout(() => {
        if (!resolved) {
          console.warn('[WSRelay] timeout waiting for room_joined (10s)');
          resolved = true;
          stream.getTracks().forEach(t => t.stop());
          ws.close();
          resolve(null);
        }
      }, 10000);
    });
  }
}
