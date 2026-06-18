import { LiveKitEngine } from './LiveKitEngine';
import { AgoraEngine } from './AgoraEngine';
import { DailyEngine } from './DailyEngine';
import { WebSocketRelayEngine } from './WebSocketRelayEngine';
import { CallEngine, CallEngineOptions, CallSession, EngineName } from './types';

export type CallEventType = 'engine_change' | 'connected' | 'disconnected' | 'error' | 'engine_attempt' | 'engine_failed';
export type CallEventHandler = (type: CallEventType, data?: any) => void;

export class CallEngineManager {
  readonly engines: CallEngine[] = [];
  private currentSession: CallSession | null = null;
  private currentEngineName: EngineName | null = null;
  private listeners: CallEventHandler[] = [];

  constructor() {
    this.engines = [
      new LiveKitEngine(),
      new AgoraEngine(),
      new WebSocketRelayEngine(),
    ];
  }

  on(handler: CallEventHandler) {
    this.listeners.push(handler);
  }

  off(handler: CallEventHandler) {
    this.listeners = this.listeners.filter(h => h !== handler);
  }

  private emit(type: CallEventType, data?: any) {
    this.listeners.forEach(h => h(type, data));
  }

  get currentEngine(): EngineName | null {
    return this.currentEngineName;
  }

  get session(): CallSession | null {
    return this.currentSession;
  }

  /** Stop all media tracks from any failed engine attempts to free the mic. */
  private releaseMediaTracks() {
    // Request and immediately release to flush any stale tracks
    navigator.mediaDevices?.getUserMedia({ audio: true })
      .then(stream => stream.getTracks().forEach(t => t.stop()))
      .catch(() => { /* no mic available, nothing to release */ });
  }

  private async diagnoseMic() {
    try {
      const perm = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log(`[CallEngine] Mic permission status: ${perm.state}`);
    } catch {
      // Permissions API not supported — try getUserMedia probe instead
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('[CallEngine] Mic probe: OK');
        probe.getTracks().forEach(t => t.stop());
      } catch (err: any) {
        console.warn('[CallEngine] Mic probe FAILED:', err?.message || err);
      }
    }
  }

  async startCall(calleeId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    const failures: { engine: string; label: string; reason: string }[] = [];

    this.diagnoseMic();

    for (const engine of this.engines) {
      if (!engine.isSupported()) {
        console.log(`[CallEngine] ${engine.label} not supported, skipping`);
        failures.push({ engine: engine.name, label: engine.label, reason: 'not supported' });
        continue;
      }

      this.emit('engine_change', engine.name);
      this.emit('engine_attempt', engine.name);
      console.log(`[CallEngine] trying ${engine.label}...`);

      try {
        const session = await engine.createCall(calleeId, opts);
        if (session) {
          this.currentSession = session;
          this.currentEngineName = engine.name;
          this.emit('connected', engine.name);
          console.log(`[CallEngine] connected via ${engine.label}`);
          return session;
        }
        console.log(`[CallEngine] ${engine.label} returned null (no error thrown)`);
        failures.push({ engine: engine.name, label: engine.label, reason: 'returned null' });
        this.emit('engine_failed', { engine: engine.name, reason: 'returned null' });
      } catch (err: any) {
        const reason = err?.message || String(err) || 'unknown error';
        console.warn(`[CallEngine] ${engine.label} threw:`, err);
        failures.push({ engine: engine.name, label: engine.label, reason });
        this.emit('engine_failed', { engine: engine.name, reason });
      }
      this.releaseMediaTracks();
    }

    const detailMsg = failures.map(f => `${f.label}: ${f.reason}`).join(' | ');
    console.error(`[CallEngine] All engines failed: ${detailMsg}`);
    this.emit('error', `Tüm arama motorları başarısız oldu — ${detailMsg}`);
    return null;
  }

  async joinCall(callId: string, callerId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    const failures: { engine: string; label: string; reason: string }[] = [];

    this.diagnoseMic();

    for (const engine of this.engines) {
      if (!engine.isSupported()) {
        console.log(`[CallEngine] ${engine.label} not supported, skipping`);
        failures.push({ engine: engine.name, label: engine.label, reason: 'not supported' });
        continue;
      }

      this.emit('engine_change', engine.name);
      this.emit('engine_attempt', engine.name);
      console.log(`[CallEngine] trying ${engine.label}...`);

      try {
        const session = await engine.joinCall(callId, callerId, opts);
        if (session) {
          this.currentSession = session;
          this.currentEngineName = engine.name;
          this.emit('connected', engine.name);
          console.log(`[CallEngine] connected via ${engine.label}`);
          return session;
        }
        console.log(`[CallEngine] ${engine.label} returned null (no error thrown)`);
        failures.push({ engine: engine.name, label: engine.label, reason: 'returned null' });
        this.emit('engine_failed', { engine: engine.name, reason: 'returned null' });
      } catch (err: any) {
        const reason = err?.message || String(err) || 'unknown error';
        console.warn(`[CallEngine] ${engine.label} threw:`, err);
        failures.push({ engine: engine.name, label: engine.label, reason });
        this.emit('engine_failed', { engine: engine.name, reason });
      }
      this.releaseMediaTracks();
    }

    const detailMsg = failures.map(f => `${f.label}: ${f.reason}`).join(' | ');
    console.error(`[CallEngine] All engines failed: ${detailMsg}`);
    this.emit('error', `Tüm arama motorları başarısız oldu — ${detailMsg}`);
    return null;
  }

  async endCall() {
    if (this.currentSession) {
      await this.currentSession.end();
      this.currentSession = null;
    }
    this.currentEngineName = null;
    this.emit('disconnected');
  }
}
