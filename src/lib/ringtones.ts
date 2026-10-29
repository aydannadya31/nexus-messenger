export interface Ringtone {
  id: string;
  durationMs: number;
  play: (ctx: AudioContext) => void;
}

type Wave = OscillatorType;
interface Note { f: number; t: number; d: number; type?: Wave; v?: number }

const schedule = (ctx: AudioContext, notes: Note[]) => {
  const t0 = ctx.currentTime + 0.03;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.f, t0 + n.t);
    g.gain.setValueAtTime(0.0001, t0 + n.t);
    g.gain.exponentialRampToValueAtTime(n.v ?? 0.3, t0 + n.t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t + n.d);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0 + n.t);
    osc.stop(t0 + n.t + n.d + 0.05);
  }
};

const sirenPlay = (ctx: AudioContext) => {
  const t0 = ctx.currentTime + 0.03;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, t0);
  osc.frequency.linearRampToValueAtTime(1000, t0 + 0.5);
  osc.frequency.linearRampToValueAtTime(400, t0 + 1.0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 1.15);
};

export const RINGTONES: Ringtone[] = [
  {
    id: 'classic',
    durationMs: 1500,
    play: (ctx) => schedule(ctx, [
      { f: 440, t: 0, d: 0.22, type: 'square', v: 0.35 },
      { f: 480, t: 0.1, d: 0.22, type: 'square', v: 0.35 },
      { f: 440, t: 0.45, d: 0.22, type: 'square', v: 0.4 },
      { f: 480, t: 0.55, d: 0.22, type: 'square', v: 0.4 },
      { f: 440, t: 0.95, d: 0.35, type: 'square', v: 0.45 },
      { f: 480, t: 1.05, d: 0.35, type: 'square', v: 0.45 },
    ]),
  },
  {
    id: 'digital',
    durationMs: 1000,
    play: (ctx) => schedule(ctx, [1046, 1318, 1568, 2093, 1568, 1318, 1046, 1318, 1568, 2093]
      .map((f, i) => ({ f, t: i * 0.08, d: 0.1, type: 'square' as Wave, v: 0.32 }))),
  },
  {
    id: 'marimba',
    durationMs: 1300,
    play: (ctx) => schedule(ctx, [523, 659, 784, 880, 784, 659]
      .map((f, i) => ({ f, t: i * 0.18, d: 0.25, type: 'triangle' as Wave, v: 0.45 }))),
  },
  {
    id: 'chime',
    durationMs: 1800,
    play: (ctx) => schedule(ctx, [
      { f: 2093, t: 0, d: 1.2, v: 0.28 },
      { f: 1568, t: 0.15, d: 1.2, v: 0.28 },
      { f: 1318, t: 0.3, d: 1.2, v: 0.28 },
      { f: 1046, t: 0.45, d: 1.3, v: 0.32 },
    ]),
  },
  {
    id: 'pulse',
    durationMs: 1100,
    play: (ctx) => schedule(ctx, [0, 0.25, 0.5, 0.75].flatMap((t) => [
      { f: 100, t, d: 0.12, type: 'square' as Wave, v: 0.5 },
      { f: 150, t, d: 0.12, v: 0.3 },
    ])),
  },
  { id: 'siren', durationMs: 1200, play: sirenPlay },
  {
    id: 'trill',
    durationMs: 1000,
    play: (ctx) => schedule(ctx, Array.from({ length: 14 }, (_, i) => ({
      f: i % 2 ? 988 : 880, t: i * 0.07, d: 0.06, type: 'square' as Wave, v: 0.32,
    }))),
  },
  {
    id: 'sonar',
    durationMs: 1600,
    play: (ctx) => schedule(ctx, [
      { f: 220, t: 0, d: 0.5, v: 0.45 },
      { f: 440, t: 0, d: 0.4, v: 0.12 },
      { f: 220, t: 0.35, d: 0.45, v: 0.25 },
      { f: 220, t: 0.7, d: 0.4, v: 0.12 },
    ]),
  },
  {
    id: 'upbeat',
    durationMs: 1000,
    play: (ctx) => schedule(ctx, [
      { f: 65, t: 0, d: 0.6, v: 0.2 },
      ...[523, 659, 784, 1046, 784, 659].map((f, i) => ({ f, t: i * 0.1, d: 0.12, type: 'triangle' as Wave, v: 0.42 })),
    ]),
  },
  {
    id: 'alarm',
    durationMs: 1050,
    play: (ctx) => schedule(ctx, Array.from({ length: 10 }, (_, i) => ({
      f: i % 2 ? 800 : 1000, t: i * 0.1, d: 0.09, type: 'square' as Wave, v: 0.38,
    }))),
  },
];

export const DEFAULT_AUDIO_RINGTONE = 'classic';
export const DEFAULT_VIDEO_RINGTONE = 'digital';

export const getRingtone = (id: string): Ringtone =>
  RINGTONES.find((r) => r.id === id) || RINGTONES[0];

export const playRingtonePreview = (id: string) => {
  const AC: typeof AudioContext | undefined = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  const rt = getRingtone(id);
  const ctx = new AC();
  rt.play(ctx);
  window.setTimeout(() => { ctx.close(); }, rt.durationMs + 400);
};
