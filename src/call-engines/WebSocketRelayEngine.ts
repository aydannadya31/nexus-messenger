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

      // --- Audio setup (shared) ---
      const audioCtx = new AudioContext();
      // Ensure AudioContext is running (browser autoplay policy)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => console.log('[WSRelay] AudioContext resumed'))
          .catch(e => console.warn('[WSRelay] AudioContext resume failed:', e));
      }

      // --- Receive audio: queue incoming PCM chunks and play continuously ---
      const playQueue: Float32Array[] = [];
      let isPlaying = false;

      const scheduleNext = () => {
        if (isPlaying || playQueue.length === 0 || ended) return;
        isPlaying = true;
        const chunk = playQueue.shift()!;
        const buf = audioCtx.createBuffer(1, chunk.length, audioCtx.sampleRate);
        buf.getChannelData(0).set(chunk);
        const source = audioCtx.createBufferSource();
        source.buffer = buf;
        source.connect(audioCtx.destination);
        source.onended = () => {
          isPlaying = false;
          scheduleNext();
        };
        source.start();
      };

      // --- Send audio: capture raw PCM via ScriptProcessorNode ---
      let recorder: MediaRecorder | null = null;
      const startSending = () => {
        try {
          // Try ScriptProcessorNode for raw PCM capture
          const micSource = audioCtx.createMediaStreamSource(stream);
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            if (ended || ws.readyState !== WebSocket.OPEN) return;
            const pcm = e.inputBuffer.getChannelData(0);
            // Copy to avoid sending shared AudioBuffer memory
            const copy = new Float32Array(pcm);
            ws.send(copy.buffer);
          };
          micSource.connect(processor);
          processor.connect(audioCtx.destination);
          console.log('[WSRelay] sending raw PCM via ScriptProcessorNode');
        } catch (e) {
          // Fallback: MediaRecorder
          console.warn('[WSRelay] ScriptProcessorNode failed, using MediaRecorder:', e);
          try {
            recorder = new MediaRecorder(stream, {
              mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus' : 'audio/webm',
            });
            recorder.ondataavailable = (e) => {
              if (e.data.size > 0 && ws.readyState === WebSocket.OPEN && !ended) {
                e.data.arrayBuffer().then(buf => ws.send(buf));
              }
            };
            recorder.start(1000);
            console.log('[WSRelay] sending chunks via MediaRecorder');
          } catch (e2) {
            console.warn('[WSRelay] MediaRecorder also failed:', e2);
          }
        }
      };

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

              // Build session object and start sending audio
              const ses: CallSession = {
                engineName: 'websocket',
                localStream: stream,
                remoteStream: undefined,
                async end() {
                  ended = true;
                  if (recorder && recorder.state !== 'inactive') recorder.stop();
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
              };

              startSending();
              resolve(ses);
            }
          } catch { /* ignore parse errors */ }
        } else if (ev.data instanceof ArrayBuffer || ev.data instanceof Blob) {
          // Incoming PCM data (Float32Array raw bytes)
          const processChunk = async (buf: ArrayBuffer) => {
            try {
              // Try raw PCM first (Float32Array)
              const floatLen = Math.floor(buf.byteLength / 4);
              if (floatLen > 0 && floatLen * 4 === buf.byteLength) {
                const pcm = new Float32Array(buf);
                playQueue.push(pcm);
                scheduleNext();
                return;
              }
              // Fallback: try decodeAudioData (for MediaRecorder WebM chunks)
              const audioBuf = await audioCtx.decodeAudioData(buf.slice(0));
              const pcmData = audioBuf.getChannelData(0);
              playQueue.push(pcmData);
              scheduleNext();
            } catch (e) {
              console.warn('[WSRelay] audio decode failed:', e);
            }
          };

          if (ev.data instanceof Blob) {
            ev.data.arrayBuffer().then(processChunk);
          } else {
            processChunk(ev.data);
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
