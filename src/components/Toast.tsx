import { useToast } from '../lib/toast';

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => removeToast(t.id)}
          className={`cursor-pointer px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold border backdrop-blur-sm transition-all animate-slide-up ${
            t.type === 'success'
              ? 'bg-emerald-500/90 text-white border-emerald-400'
              : t.type === 'error'
              ? 'bg-red-500/90 text-white border-red-400'
              : 'bg-slate-800/90 text-white border-slate-600'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
