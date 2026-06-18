import { LiveKitEngine } from './LiveKitEngine';
import { AgoraEngine } from './AgoraEngine';
import { DailyEngine } from './DailyEngine';
import { WebSocketRelayEngine } from './WebSocketRelayEngine';
import { CallEngine, CallEngineOptions, CallSession, EngineName } from './types';

export type CallEventType = 'engine_change' | 'connected' | 'disconnected' | 'error';
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

  async startCall(calleeId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    for (const engine of this.engines) {
      if (!engine.isSupported()) continue;
      this.emit('engine_change', engine.name);
      console.log(`[CallEngine] trying ${engine.label}...`);

      const session = await engine.createCall(calleeId, opts);
      if (session) {
        this.currentSession = session;
        this.currentEngineName = engine.name;
        this.emit('connected', engine.name);
        console.log(`[CallEngine] connected via ${engine.label}`);
        return session;
      }
    }

    this.emit('error', 'All call engines failed');
    return null;
  }

  async joinCall(callId: string, callerId: string, opts: CallEngineOptions): Promise<CallSession | null> {
    for (const engine of this.engines) {
      if (!engine.isSupported()) continue;
      this.emit('engine_change', engine.name);
      console.log(`[CallEngine] trying ${engine.label}...`);

      const session = await engine.joinCall(callId, callerId, opts);
      if (session) {
        this.currentSession = session;
        this.currentEngineName = engine.name;
        this.emit('connected', engine.name);
        console.log(`[CallEngine] connected via ${engine.label}`);
        return session;
      }
    }

    this.emit('error', 'All call engines failed');
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
