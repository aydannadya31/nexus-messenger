import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { X, Radio, Send, Globe } from 'lucide-react';
import { motion } from 'motion/react';

const COUNTRIES: { code: string; name: string }[] = [
  { code: 'TUR', name: 'Türkiye' }, { code: 'USA', name: 'United States' }, { code: 'GBR', name: 'United Kingdom' },
  { code: 'DEU', name: 'Germany' }, { code: 'FRA', name: 'France' }, { code: 'ITA', name: 'Italy' },
  { code: 'ESP', name: 'Spain' }, { code: 'RUS', name: 'Russia' }, { code: 'CHN', name: 'China' },
  { code: 'JPN', name: 'Japan' }, { code: 'KOR', name: 'South Korea' }, { code: 'IND', name: 'India' },
  { code: 'BRA', name: 'Brazil' }, { code: 'CAN', name: 'Canada' }, { code: 'AUS', name: 'Australia' },
  { code: 'NLD', name: 'Netherlands' }, { code: 'SWE', name: 'Sweden' }, { code: 'NOR', name: 'Norway' },
  { code: 'DNK', name: 'Denmark' }, { code: 'FIN', name: 'Finland' }, { code: 'CHE', name: 'Switzerland' },
  { code: 'AUT', name: 'Austria' }, { code: 'POL', name: 'Poland' }, { code: 'UKR', name: 'Ukraine' },
  { code: 'GRC', name: 'Greece' }, { code: 'EGY', name: 'Egypt' }, { code: 'ZAF', name: 'South Africa' },
  { code: 'ARE', name: 'United Arab Emirates' }, { code: 'SAU', name: 'Saudi Arabia' },
  { code: 'MEX', name: 'Mexico' }, { code: 'ARG', name: 'Argentina' }, { code: 'IRN', name: 'Iran' },
  { code: 'IDN', name: 'Indonesia' }, { code: 'MYS', name: 'Malaysia' }, { code: 'SGP', name: 'Singapore' },
  { code: 'PHL', name: 'Philippines' }, { code: 'VNM', name: 'Vietnam' }, { code: 'THA', name: 'Thailand' },
  { code: 'PRT', name: 'Portugal' }, { code: 'ROU', name: 'Romania' }, { code: 'BGR', name: 'Bulgaria' },
  { code: 'SRC', name: 'Serbia' }, { code: 'HRV', name: 'Croatia' }, { code: 'BIH', name: 'Bosnia and Herzegovina' },
  { code: 'ALB', name: 'Albania' }, { code: 'GEO', name: 'Georgia' }, { code: 'AZE', name: 'Azerbaijan' },
  { code: 'KAZ', name: 'Kazakhstan' }, { code: 'ISR', name: 'Israel' }, { code: 'MAR', name: 'Morocco' },
  { code: 'PAK', name: 'Pakistan' }, { code: 'BGD', name: 'Bangladesh' }, { code: 'NGA', name: 'Nigeria' },
  { code: 'KEN', name: 'Kenya' }, { code: 'COL', name: 'Colombia' }, { code: 'CHL', name: 'Chile' },
  { code: 'PER', name: 'Peru' }, { code: 'CUB', name: 'Cuba' }, { code: 'IRL', name: 'Ireland' },
  { code: 'NZL', name: 'New Zealand' }, { code: 'HUN', name: 'Hungary' }, { code: 'CZE', name: 'Czech Republic' },
  { code: 'SVK', name: 'Slovakia' }, { code: 'SVN', name: 'Slovenia' }, { code: 'LTU', name: 'Lithuania' },
  { code: 'LVA', name: 'Latvia' }, { code: 'EST', name: 'Estonia' }, { code: 'BLR', name: 'Belarus' },
  { code: 'MDA', name: 'Moldova' }, { code: 'MKD', name: 'North Macedonia' }, { code: 'MNE', name: 'Montenegro' },
];

interface BroadcastModalProps { onClose: () => void }

export const BroadcastModal: React.FC<BroadcastModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [country, setCountry] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [canSend, setCanSend] = useState(true);
  const [remainingToday, setRemainingToday] = useState(2);
  const [cooldownText, setCooldownText] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.data();
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayMs = today.getTime();

        let count = 0;
        let lastMs = 0;
        if (data?.broadcastHistory) {
          for (const ts of data.broadcastHistory) {
            const d = ts?.toDate ? ts.toDate() : new Date(ts);
            if (d.getTime() >= todayMs) count++;
          }
          if (data.broadcastHistory.length > 0) {
            const last = data.broadcastHistory[data.broadcastHistory.length - 1];
            lastMs = last?.toDate ? last.toDate().getTime() : new Date(last).getTime();
          }
        }

        const dailyOk = count < 2;
        const timeSince = Date.now() - lastMs;
        const cooldownOk = lastMs === 0 || timeSince >= 6 * 60 * 60 * 1000;

        setCanSend(dailyOk && cooldownOk);
        setRemainingToday(2 - count);

        if (!cooldownOk) {
          const wait = (6 * 60 * 60 * 1000) - timeSince;
          setCooldownText(`${Math.floor(wait / (60 * 60 * 1000))}s ${Math.floor((wait % (60 * 60 * 1000)) / (60 * 1000))}dk`);
        } else {
          setCooldownText('');
        }
      } catch (err) {
        console.error(err);
        setCanSend(true);
      }
    })();
  }, [user]);

  const handleBroadcast = async () => {
    if (!user || !message.trim() || !country || !canSend) return;
    setError('');
    setSending(true);
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'broadcastMessages'), {
        text: message.trim(), senderId: user.uid, senderName: user.displayName,
        senderPhoto: user.photoURL || '', country, timestamp: serverTimestamp(), createdAt: now
      });
      const snap = await getDoc(doc(db, 'users', user.uid));
      const hist = snap.data()?.broadcastHistory || [];
      await updateDoc(doc(db, 'users', user.uid), { broadcastHistory: [...hist, now] });
      onClose();
    } catch (err: any) {
      console.error("Broadcast error:", err);
      setError(err?.message || 'Bilinmeyen hata');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-blue-600 text-white">
          <div>
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2"><Radio size={24} className="animate-pulse" /> Broadcast Mesajı</h2>
            <p className="text-blue-100 text-[9px] font-bold uppercase tracking-widest mt-1">Günde {remainingToday}/2 gönderim hakkı</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="p-6 space-y-4">
          <select value={country} onChange={e => setCountry(e.target.value)}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-4 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 transition-all">
            <option value="">Hedef ülke seçin...</option>
            {COUNTRIES.map(c => (<option key={c.code} value={c.code}>{c.name}</option>))}
          </select>

          {!canSend && (
            <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl">
              <p className="text-xs font-bold text-amber-700">
                ⚠️ Broadcast gönderilemiyor.
                {remainingToday <= 0 ? ' Günlük limite ulaştınız (2/2).' : ` Bekleme süresi: ${cooldownText}`}
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl">
              <p className="text-xs font-bold text-red-700">Hata: {error}</p>
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100">
          <div className="flex gap-4">
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Broadcast mesajınızı yazın..." rows={2}
              className="flex-1 bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-blue-500 outline-none transition-all resize-none shadow-sm" />
            <button onClick={handleBroadcast}
              disabled={sending || !message.trim() || !country || !canSend}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white p-6 rounded-2xl shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center shrink-0 active:scale-95">
              {sending ? <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={24} />}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
