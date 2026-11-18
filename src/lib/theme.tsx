import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeColors = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentFg: string;
  accentHover: string;
  border: string;
  bubbleMine: string;
  bubbleTheirs: string;
};

export type ThemePreset = { id: string; colors: ThemeColors };

const base = (c: Partial<ThemeColors>): ThemeColors => ({
  bg: '#f8fafc',
  surface: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  accent: '#2563eb',
  accentFg: '#ffffff',
  accentHover: '#1d4ed8',
  border: '#e2e8f0',
  bubbleMine: '#2563eb',
  bubbleTheirs: '#ffffff',
  ...c,
});

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'default', colors: base({}) },
  { id: 'night', colors: base({ bg: '#020617', surface: '#0f172a', text: '#f1f5f9', muted: '#94a3b8', accent: '#3b82f6', accentHover: '#60a5fa', border: '#1e293b', bubbleMine: '#2563eb', bubbleTheirs: '#1e293b' }) },
  { id: 'ocean', colors: base({ bg: '#f0f9ff', surface: '#ffffff', text: '#082f49', muted: '#64748b', accent: '#0284c7', accentHover: '#0369a1', border: '#e0f2fe', bubbleMine: '#0284c7', bubbleTheirs: '#ffffff' }) },
  { id: 'forest', colors: base({ bg: '#f0fdf4', surface: '#ffffff', text: '#052e16', muted: '#57534e', accent: '#16a34a', accentHover: '#15803d', border: '#dcfce7', bubbleMine: '#16a34a', bubbleTheirs: '#ffffff' }) },
  { id: 'sunset', colors: base({ bg: '#fff7ed', surface: '#ffffff', text: '#431407', muted: '#78716c', accent: '#ea580c', accentHover: '#c2410c', border: '#ffedd5', bubbleMine: '#ea580c', bubbleTheirs: '#ffffff' }) },
  { id: 'lavender', colors: base({ bg: '#faf5ff', surface: '#ffffff', text: '#3b0764', muted: '#7c3aed', accent: '#9333ea', accentHover: '#7e22ce', border: '#f3e8ff', bubbleMine: '#9333ea', bubbleTheirs: '#ffffff' }) },
  { id: 'cherry', colors: base({ bg: '#fef2f2', surface: '#ffffff', text: '#450a0a', muted: '#7f1d1d', accent: '#dc2626', accentHover: '#b91c1c', border: '#fee2e2', bubbleMine: '#dc2626', bubbleTheirs: '#ffffff' }) },
  { id: 'gold', colors: base({ bg: '#fffbeb', surface: '#ffffff', text: '#451a03', muted: '#78350f', accent: '#d97706', accentHover: '#b45309', border: '#fef3c7', bubbleMine: '#d97706', bubbleTheirs: '#ffffff' }) },
  { id: 'mint', colors: base({ bg: '#ecfeff', surface: '#ffffff', text: '#083344', muted: '#0e7490', accent: '#0d9488', accentHover: '#0f766e', border: '#cffafe', bubbleMine: '#0d9488', bubbleTheirs: '#ffffff' }) },
  { id: 'rose', colors: base({ bg: '#fdf2f8', surface: '#ffffff', text: '#500724', muted: '#9d174d', accent: '#db2777', accentHover: '#be185d', border: '#fce7f3', bubbleMine: '#db2777', bubbleTheirs: '#ffffff' }) },
  { id: 'graphite', colors: base({ bg: '#f5f5f4', surface: '#fafaf9', text: '#1c1917', muted: '#78716c', accent: '#292524', accentHover: '#44403c', border: '#e7e5e4', bubbleMine: '#292524', bubbleTheirs: '#ffffff' }) },
];

const STORAGE_KEY = 'nexus.theme';

function applyColors(colors: ThemeColors) {
  const el = document.documentElement;
  el.setAttribute('data-nexus-theme', 'custom');
  el.style.setProperty('--t-bg', colors.bg);
  el.style.setProperty('--t-surface', colors.surface);
  el.style.setProperty('--t-text', colors.text);
  el.style.setProperty('--t-muted', colors.muted);
  el.style.setProperty('--t-accent', colors.accent);
  el.style.setProperty('--t-accent-fg', colors.accentFg);
  el.style.setProperty('--t-accent-hover', colors.accentHover);
  el.style.setProperty('--t-border', colors.border);
  el.style.setProperty('--t-bubble-mine', colors.bubbleMine);
  el.style.setProperty('--t-bubble-theirs', colors.bubbleTheirs);
}

function clearColors() {
  const el = document.documentElement;
  el.removeAttribute('data-nexus-theme');
  ['--t-bg', '--t-surface', '--t-text', '--t-muted', '--t-accent', '--t-accent-fg', '--t-accent-hover', '--t-border', '--t-bubble-mine', '--t-bubble-theirs']
    .forEach(v => el.style.removeProperty(v));
}

type ThemeCtx = {
  colors: ThemeColors | null;
  setColors: (c: ThemeColors | null) => void;
};

const Ctx = createContext<ThemeCtx>({ colors: null, setColors: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colors, setColorsState] = useState<ThemeColors | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ThemeColors) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (colors) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
      applyColors(colors);
    } else {
      localStorage.removeItem(STORAGE_KEY);
      clearColors();
    }
  }, [colors]);

  return <Ctx.Provider value={{ colors, setColors: setColorsState }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
