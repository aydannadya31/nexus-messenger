import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, deleteDoc, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useToast } from '../lib/toast';
import { useAuth } from './AuthProvider';
import { useI18n } from '../lib/i18n';
import { COUNTRIES } from './BroadcastModal';
import { Radio, Send, Clock, Trash } from 'lucide-react';
import { cn } from '../lib/utils';

export const AdminBroadcastTab: React.FC = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [bcCountry, setBcCountry] = useState('ALL');
  const [bcText, setBcText] = useState('');
  const [bcSending, setBcSending] = useState(false);
  const [bcHistory, setBcHistory] = useState<{ id: string; text: string; country: string; senderName: string; createdAt: string }[]>([]);
  const [bcSelected, setBcSelected] = useState<Set<string>>(new Set());

  const loadBcHistory = async () => {
    if (!user) return;
    try {
      const snap = await getDocs(query(collection(db, 'broadcastMessages'), limit(100)));
      const rows = snap.docs.map(d => {
        const v = d.data();
        return { id: d.id, text: String(v.text || ''), country: String(v.country || 'ALL'), senderName: String(v.senderName || ''), createdAt: String(v.createdAt || '') };
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setBcHistory(rows);
    } catch (err) {
      console.error('Broadcast history error:', err);
    }
  };

  const sendBroadcast = async () => {
    if (!user || !bcText.trim()) return;
    setBcSending(true);
    try {
      await addDoc(collection(db, 'broadcastMessages'), {
        text: bcText.trim(), senderId: user.uid, senderName: 'Sistem', senderPhoto: '',
        country: bcCountry, isSystem: true, timestamp: serverTimestamp(), createdAt: new Date().toISOString()
      });
      setBcText('');
      addToast(t('adm.broadcastSent'), 'success');
      loadBcHistory();
    } catch (err) {
      console.error('Broadcast error:', err);
      addToast(t('adm.bulkFail'), 'error');
    } finally { setBcSending(false); }
  };

  const resendBroadcast = async (m: { text: string; country: string }) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'broadcastMessages'), {
        text: m.text, senderId: user.uid, senderName: 'Sistem', senderPhoto: '',
        country: m.country, isSystem: true, timestamp: serverTimestamp(), createdAt: new Date().toISOString()
      });
      addToast(t('adm.bcResent'), 'success');
      loadBcHistory();
    } catch (err) {
      console.error('Broadcast resend error:', err);
      addToast(t('adm.bulkFail'), 'error');
    }
  };

  const deleteBroadcasts = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map(id => deleteDoc(doc(db, 'broadcastMessages', id))));
      setBcSelected(new Set());
      addToast(t('adm.bcDeleted'), 'success');
      loadBcHistory();
    } catch (err) {
      console.error('Broadcast delete error:', err);
      addToast(t('adm.bulkFail'), 'error');
    }
  };

  useEffect(() => {
    loadBcHistory();
  }, [user]);

  return (
    <div className="flex-1 flex gap-6 p-6 min-h-0">
      <div className="flex-1 overflow-y-auto custom-scrollbar min-w-0">
        <h2 className="text-lg font-black text-white mb-2 flex items-center gap-2">
          <Radio size={20} className="text-sky-400" /> {t('adm.broadcastTitle')}
        </h2>
        <p className="text-[10px] text-slate-500 font-bold mb-6">{t('adm.broadcastDesc')}</p>
        <div className="max-w-2xl space-y-4">
          <select value={bcCountry} onChange={(e) => setBcCountry(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-sky-500/30 transition-all">
            <option value="ALL">{t('adm.broadcastAllWorld')}</option>
            {COUNTRIES.map(c => (<option key={c.code} value={c.code}>{c.name}</option>))}
          </select>
          <textarea value={bcText} onChange={(e) => setBcText(e.target.value)} rows={3}
            placeholder={t('adm.broadcastPlaceholder')}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-sky-500/30 transition-all resize-none" />
          <button onClick={sendBroadcast} disabled={bcSending || !bcText.trim()}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5">
            <Send size={14} /> {t('side.adminMsgSend')}
          </button>
        </div>
      </div>
      <div className="w-96 flex flex-col min-h-0 border-l border-slate-800 pl-6">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h3 className="text-sm font-black text-white flex items-center gap-1.5 shrink-0">
            <Clock size={14} className="text-sky-400" /> {t('adm.bcHistory')}
          </h3>
          {bcHistory.length > 0 && (
            <div className="flex gap-3 shrink-0">
              <button
                onClick={() => setBcSelected(bcSelected.size === bcHistory.length ? new Set() : new Set(bcHistory.map(m => m.id)))}
                className="text-[10px] font-bold text-slate-400 hover:text-white transition-all">
                {t('adm.bcAllSelect')}
              </button>
              <button
                onClick={() => deleteBroadcasts(Array.from(bcSelected))}
                disabled={bcSelected.size === 0}
                className="text-[10px] font-bold text-red-400 hover:text-red-300 disabled:opacity-40 transition-all">
                {t('adm.bcDeleteSelected')} ({bcSelected.size})
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 space-y-2">
          {bcHistory.length === 0 && (
            <p className="text-xs text-slate-500 font-bold">{t('adm.bcEmpty')}</p>
          )}
          {bcHistory.map(m => (
            <div key={m.id} className={cn("p-3 rounded-xl border transition-all", bcSelected.has(m.id) ? "bg-sky-600/10 border-sky-600/40" : "bg-slate-800/60 border-slate-700")}>
              <div className="flex items-start gap-2">
                <input type="checkbox" checked={bcSelected.has(m.id)}
                  onChange={() => { const n = new Set(bcSelected); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); setBcSelected(n); }}
                  className="mt-1 accent-sky-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-bold break-words">{m.text}</p>
                  <p className="text-[9px] text-slate-500 font-bold mt-1">
                    {m.senderName ? `👤 ${m.senderName} • ` : ''}
                    {m.country === 'ALL' ? `🌍 ${t('adm.broadcastAllWorld')}` : m.country}
                    {m.createdAt ? ` • ${new Date(m.createdAt).toLocaleString('tr-TR')}` : ''}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => resendBroadcast(m)} title={t('adm.bcResend')}
                    className="p-1.5 rounded-lg bg-sky-600/20 text-sky-400 hover:bg-sky-600 hover:text-white transition-all">
                    <Send size={12} />
                  </button>
                  <button onClick={() => deleteBroadcasts([m.id])} title={t('adm.remove')}
                    className="p-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-all">
                    <Trash size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
