import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Languages, RefreshCw, Send } from 'lucide-react';
import { LANGS, useI18n, type Lang, type LangCode } from '../lib/i18n';
import { translateText } from '../lib/translate';
import { cn } from '../lib/utils';

const KEY = 'nexus.translateTarget';
const DEBOUNCE = 800;

const langOf = (c: LangCode): Lang => LANGS.find(l => l.code === c) ?? { code: c, name: c, flag: c };
const flagOf = (c: LangCode) => `https://flagcdn.com/24x18/${langOf(c).flag}.png`;

/** Hedef dil localStorage'da tutulur: bir kez seçilince tüm sohbetlerde hatırlanır. */
export function useTranslateTarget() {
  const [target, setTargetState] = useState<LangCode | null>(() => {
    const v = localStorage.getItem(KEY);
    return LANGS.some(l => l.code === v) ? (v as LangCode) : null;
  });
  const setTarget = (v: LangCode | null) => {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
    setTargetState(v);
  };
  return { target, setTarget };
}

export function TranslateToggle({ source, target, onPick }: {
  source: LangCode;
  target: LangCode | null;
  onPick: (v: LangCode | null) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "p-1.5 sm:p-2 transition-colors",
          target ? "text-blue-500 bg-blue-50 dark:bg-blue-900/40 rounded-lg" : "text-slate-400 hover:text-slate-600"
        )}
        title={t('chat.trTitle')}
      >
        <Languages size={18} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 mb-2 z-[9999] w-48 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-1.5">
            {LANGS.filter(l => l.code !== source).map(l => (
              <button
                key={l.code}
                type="button"
                onClick={() => { onPick(l.code); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs font-bold transition-colors text-left",
                  target === l.code
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-900/40"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
              >
                <img src={flagOf(l.code)} alt="" className="w-4 h-3 rounded-sm shrink-0" />
                <span className="truncate">{l.name}</span>
              </button>
            ))}
            {target && (
              <button
                type="button"
                onClick={() => { onPick(null); setOpen(false); }}
                className="w-full px-2 py-1.5 mt-1 border-t border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-red-500 transition-colors text-left"
              >
                {t('chat.trOff')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function TranslateBox({ target, original, onSend }: {
  target: LangCode;
  original: string;
  onSend: (text: string) => void;
}) {
  const { t, lang: source } = useI18n();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [edited, setEdited] = useState(false);
  const [nonce, setNonce] = useState(0);
  const idRef = useRef(0);

  const sameLang = target === source;

  useEffect(() => {
    const clean = original.trim();
    if (sameLang || !clean || clean.split(/\s+/).length < 2) {
      setText(''); setBusy(false); setFailed(false); setEdited(false);
      return;
    }
    // Elle düzeltilmiş çeviri otomatik olarak ezilmez; ↻ ile yeniden çevrilir.
    if (edited) return;

    const id = ++idRef.current;
    const timer = window.setTimeout(() => {
      setBusy(true);
      setFailed(false);
      translateText(clean, source, target)
        .then(r => { if (id !== idRef.current) return; setText(r); setBusy(false); })
        .catch(() => { if (id !== idRef.current) return; setBusy(false); setFailed(true); });
    }, DEBOUNCE);

    return () => window.clearTimeout(timer);
  }, [original, target, source, sameLang, edited, nonce]);

  const send = () => {
    const clean = text.trim();
    if (!clean) return;
    onSend(clean);
    setText(''); setEdited(false); setFailed(false); setNonce(n => n + 1);
  };

  return (
    <div className="mb-1.5 rounded-2xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/60 dark:bg-blue-900/20 p-2 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center gap-1.5 mb-1">
        <img src={flagOf(source)} alt="" className="w-4 h-3 rounded-sm shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{langOf(source).name}</span>
        <ArrowRight size={12} className="text-slate-400 shrink-0" />
        <img src={flagOf(target)} alt="" className="w-4 h-3 rounded-sm shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 truncate">{langOf(target).name}</span>
        {busy && <span className="text-[9px] font-bold text-slate-400 shrink-0">{t('chat.trWorking')}</span>}
        {failed && <span className="text-[9px] font-bold text-red-500 shrink-0">{t('chat.trFailed')}</span>}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => { setEdited(false); setNonce(n => n + 1); }}
          title={t('chat.trRetry')}
          className="p-1 text-slate-400 hover:text-blue-600 transition-colors shrink-0"
        >
          <RefreshCw size={13} />
        </button>
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          title={t('chat.trSend')}
          className={cn(
            "p-1.5 rounded-lg transition-colors flex items-center justify-center shrink-0",
            text.trim() ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-200 text-slate-400 cursor-not-allowed"
          )}
        >
          <Send size={13} />
        </button>
      </div>

      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setEdited(true); }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        rows={1}
        placeholder={failed ? t('chat.trFailed') : sameLang ? t('chat.trSameLang') : t('chat.trPlaceholder')}
        className="w-full min-h-[38px] max-h-24 bg-transparent border-none focus:ring-0 resize-none text-sm px-1 py-0.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
      />
    </div>
  );
}
