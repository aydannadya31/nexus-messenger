import { UserProfile } from '../types';

export type EngineName = 'livekit' | 'daily' | 'websocket' | 'firestore' | 'agora';

export interface CallEngineOptions {
  userId: string;
  userDisplayName?: string;
  serverUrl: string; // our Node.js server (token gen + WS relay)
  roomId?: string;   // shared channel/room name for both sides
}

export interface CallSession {
  engineName: EngineName;
  localStream?: MediaStream;
  remoteStream?: MediaStream;

  /** End the call and clean up */
  end(): Promise<void>;
  /** Mute/unmute local mic */
  setMuted(muted: boolean): void;
  /** True if media is flowing */
  isConnected(): boolean;
}

export interface CallEngine {
  name: EngineName;
  label: string;

  /**
   * Create a new call (caller side).
   * Returns a session or null if engine unavailable.
   */
  createCall(calleeId: string, opts: CallEngineOptions): Promise<CallSession | null>;

  /**
   * Join an existing call (callee side).
   * Returns a session or null if engine unavailable.
   */
  joinCall(callId: string, callerId: string, opts: CallEngineOptions): Promise<CallSession | null>;

  /**
   * Check if this engine is usable in current browser.
   */
  isSupported(): boolean;
}
