import { X, Palette, Languages, RotateCcw, Check } from 'lucide-react';
import { THEME_PRESETS, useTheme, type ThemeColors } from '../lib/theme';
import { LANGS, useI18n, flagUrl, type LangCode } from '../lib/i18n';

type PanelProps = { onClose: () => void };

const COLOR_FIELDS: { key: keyof ThemeColors; labelKey: string }[] = [
  { key: 'bg', labelKey: 'set.cBg' },
  { key: 'surface', labelKey: 'set.cSurface' },
  { key: 'text', labelKey: 'set.cText' },
  { key: 'muted', labelKey: 'set.cMuted' },
  { key: 'accent', labelKey: 'set.cAccent' },
  { key: 'bubbleMine', labelKey: 'set.cBubbleMine' },
  { key: 'bubbleTheirs', labelKey: 'set.cBubbleTheirs' },
  { key: 'border', labelKey: 'set.cBorder' },
];

function PanelShell({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto custom-scrollbar border border-slate-200 dark:border-slate-700 animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center">{icon}</span>
            <h3 className="text-base font-black text-slate-900 dark:text-slate-100">{title}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-all">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ThemePanel({ onClose }: PanelProps) {
  const { colors, setColors } = useTheme();
  const { t } = useI18n();

  const update = (key: keyof ThemeColors, value: string) => {
    const base: ThemeColors = colors || THEME_PRESETS[0].colors;
    const next = { ...base, [key]: value };
    if (key === 'accent') {
      next.accentHover = value;
    }
    setColors(next);
  };

  return (
    <PanelShell title={t('set.theme')} icon={<Palette size={18} />} onClose={onClose}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2.5">{t('set.presets')}</p>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {THEME_PRESETS.map((p, i) => {
          const active = JSON.stringify(colors || THEME_PRESETS[0].colors) === JSON.stringify(p.colors);
          return (
            <button
              key={p.id}
              onClick={() => setColors(i === 0 ? null : p.colors)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${active ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50' : 'border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}
            >
              <span className="flex -space-x-1.5 shrink-0">
                {[p.colors.accent, p.colors.bg, p.colors.surface].map((c, ci) => (
                  <span key={ci} className="w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 shadow-sm" style={{ backgroundColor: c }} />
                ))}
              </span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{t(`pre.${p.id}`)}</span>
              {active && <Check size={14} className="text-blue-600 shrink-0 ml-auto" />}
            </button>
          );
        })}
      </div>

      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2.5">{t('set.customize')}</p>
      <div className="space-y-1.5 mb-6">
        {COLOR_FIELDS.map(f => (
          <label key={f.key} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{t(f.labelKey)}</span>
            <input
              type="color"
              value={(colors || THEME_PRESETS[0].colors)[f.key]}
              onChange={e => update(f.key, e.target.value)}
              className="w-9 h-7 rounded-md border border-slate-200 dark:border-slate-600 bg-transparent cursor-pointer p-0"
            />
          </label>
        ))}
      </div>

      <button
        onClick={() => setColors(null)}
        className="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2"
      >
        <RotateCcw size={13} />
        {t('set.reset')}
      </button>
    </PanelShell>
  );
}

export function LanguagePanel({ onClose }: PanelProps) {
  const { lang, setLang } = useI18n();
  const { t } = useI18n();

  return (
    <PanelShell title={t('set.language')} icon={<Languages size={18} />} onClose={onClose}>
      <div className="space-y-1.5">
        {LANGS.map(l => {
          const active = lang === l.code;
          return (
            <button
              key={l.code}
              onClick={() => { setLang(l.code as LangCode); onClose(); }}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 transition-all text-left ${active ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <img src={flagUrl(l.flag)} alt="" width={24} height={18} className="rounded-[3px] shrink-0 shadow-sm" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{l.name}</span>
              {l.code === 'tr' && (
                <span className="ml-auto text-[8px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950 px-2 py-0.5 rounded-full">{t('set.primary')}</span>
              )}
              {active && l.code !== 'tr' && <Check size={16} className="ml-auto text-blue-600" />}
              {active && l.code === 'tr' && <Check size={16} className="text-blue-600 shrink-0" />}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 font-medium text-center mt-5">{t('set.moreLangs')}</p>
    </PanelShell>
  );
}
