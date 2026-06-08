import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, doc, limit, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { UserProfile } from '../types';
import { X, Radio, Send, Globe } from 'lucide-react';
import { motion } from 'motion/react';

const COUNTRIES: { code: string; name: string }[] = [
  { code: 'TUR', name: 'Türkiye' },
  { code: 'USA', name: 'United States' },
  { code: 'GBR', name: 'United Kingdom' },
  { code: 'DEU', name: 'Germany' },
  { code: 'FRA', name: 'France' },
  { code: 'ITA', name: 'Italy' },
  { code: 'ESP', name: 'Spain' },
  { code: 'RUS', name: 'Russia' },
  { code: 'CHN', name: 'China' },
  { code: 'JPN', name: 'Japan' },
  { code: 'KOR', name: 'South Korea' },
  { code: 'IND', name: 'India' },
  { code: 'BRA', name: 'Brazil' },
  { code: 'CAN', name: 'Canada' },
  { code: 'AUS', name: 'Australia' },
  { code: 'NLD', name: 'Netherlands' },
  { code: 'SWE', name: 'Sweden' },
  { code: 'NOR', name: 'Norway' },
  { code: 'DNK', name: 'Denmark' },
  { code: 'FIN', name: 'Finland' },
  { code: 'CHE', name: 'Switzerland' },
  { code: 'AUT', name: 'Austria' },
  { code: 'POL', name: 'Poland' },
  { code: 'UKR', name: 'Ukraine' },
  { code: 'GRC', name: 'Greece' },
  { code: 'EGY', name: 'Egypt' },
  { code: 'ZAF', name: 'South Africa' },
  { code: 'ARE', name: 'United Arab Emirates' },
  { code: 'SAU', name: 'Saudi Arabia' },
  { code: 'MEX', name: 'Mexico' },
  { code: 'ARG', name: 'Argentina' },
  { code: 'IRN', name: 'Iran' },
  { code: 'IDN', name: 'Indonesia' },
  { code: 'MYS', name: 'Malaysia' },
  { code: 'SGP', name: 'Singapore' },
  { code: 'PHL', name: 'Philippines' },
  { code: 'VNM', name: 'Vietnam' },
  { code: 'THA', name: 'Thailand' },
  { code: 'PRT', name: 'Portugal' },
  { code: 'ROU', name: 'Romania' },
  { code: 'BGR', name: 'Bulgaria' },
  { code: 'SRB', name: 'Serbia' },
  { code: 'HRV', name: 'Croatia' },
  { code: 'BIH', name: 'Bosnia and Herzegovina' },
  { code: 'ALB', name: 'Albania' },
  { code: 'GEO', name: 'Georgia' },
  { code: 'AZE', name: 'Azerbaijan' },
  { code: 'KAZ', name: 'Kazakhstan' },
  { code: 'ISR', name: 'Israel' },
  { code: 'MAR', name: 'Morocco' },
  { code: 'PAK', name: 'Pakistan' },
  { code: 'BGD', name: 'Bangladesh' },
  { code: 'NGA', name: 'Nigeria' },
  { code: 'KEN', name: 'Kenya' },
  { code: 'COL', name: 'Colombia' },
  { code: 'CHL', name: 'Chile' },
  { code: 'PER', name: 'Peru' },
  { code: 'CUB', name: 'Cuba' },
  { code: 'IRL', name: 'Ireland' },
  { code: 'NZL', name: 'New Zealand' },
  { code: 'HUN', name: 'Hungary' },
  { code: 'CZE', name: 'Czech Republic' },
  { code: 'SVK', name: 'Slovakia' },
  { code: 'SVN', name: 'Slovenia' },
  { code: 'LTU', name: 'Lithuania' },
  { code: 'LVA', name: 'Latvia' },
  { code: 'EST', name: 'Estonia' },
  { code: 'BLR', name: 'Belarus' },
  { code: 'MDA', name: 'Moldova' },
  { code: 'MKD', name: 'North Macedonia' },
  { code: 'MNE', name: 'Montenegro' },
];

interface BroadcastModalProps {
  onClose: () => void;
}

export const BroadcastModal: React.FC<BroadcastModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [country, setCountry] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [targetCount, setTargetCount] = useState(0);
  const [loadingCount, setLoadingCount] = useState(false);
  const [cooldownInfo, setCooldownInfo] = useState<{ canSend: boolean; remainingTime: string; remainingToday: number }>({ canSend: true, remainingTime: '', remainingToday: 2 });

  useEffect(() => {
    if (!user || !country) { setTargetCount(0); return; }
    setLoadingCount(true);
    const fetchCount = async () => {
      try {
        const q = query(collection(db, 'users'), where('country', '==', country));
        const snap = await getDocs(q);
        setTargetCount(snap.docs.length);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingCount(false);
      }
    };
    fetchCount();
  }, [user, country]);

  useEffect(() => {
    if (!user) return;
    const checkLimits = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const data = userDoc.data();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayMs = today.getTime();

        let broadcastCountToday = 0;
        let lastBroadcastMs = 0;

        if (data?.broadcastHistory) {
          for (const ts of data.broadcastHistory) {
            const d = ts?.toDate?.() || new Date(ts);
            if (d.getTime() >= todayMs) broadcastCountToday++;
          }
          if (data.broadcastHistory.length > 0) {
            const last = data.broadcastHistory[data.broadcastHistory.length - 1];
            lastBroadcastMs = last?.toDate?.()?.getTime() || new Date(last).getTime();
          }
        }

        const canSendByDaily = broadcastCountToday < 2;
        const timeSinceLast = Date.now() - lastBroadcastMs;
        const canSendByCooldown = lastBroadcastMs === 0 || timeSinceLast >= 6 * 60 * 60 * 1000;

        let remainingTime = '';
        if (!canSendByCooldown && lastBroadcastMs > 0) {
          const waitMs = (6 * 60 * 60 * 1000) - timeSinceLast;
          const hours = Math.floor(waitMs / (60 * 60 * 1000));
          const mins = Math.floor((waitMs % (60 * 60 * 1000)) / (60 * 1000));
          remainingTime = `${hours}s ${mins}dk`;
        }

        setCooldownInfo({
          canSend: canSendByDaily && canSendByCooldown,
          remainingTime,
          remainingToday: 2 - broadcastCountToday
        });
      } catch (err) {
        console.error(err);
      }
    };
    checkLimits();
  }, [user]);

  const handleBroadcast = async () => {
    if (!user || !message.trim() || !country || !cooldownInfo.canSend) return;
    setSending(true);
    try {
      const q = query(collection(db, 'users'), where('country', '==', country));
      const snap = await getDocs(q);
      const targetUsers = snap.docs.map(d => d.data() as UserProfile).filter(u => u.uid !== user.uid);

      const timestamp = serverTimestamp();

      for (const targetUser of targetUsers) {
        const chatsRef = collection(db, 'chats');
        const chatQuery = query(chatsRef, where('participants', 'array-contains', user.uid), where('type', '==', 'private'));
        const chatSnap = await getDocs(chatQuery);
        let chatId = '';
        chatSnap.forEach(d => {
          const data = d.data();
          if (data.participants.includes(targetUser.uid)) {
            chatId = d.id;
          }
        });
        if (!chatId) {
          const newChat = await addDoc(chatsRef, {
            participants: [user.uid, targetUser.uid],
            type: 'private',
            updatedAt: timestamp,
            lastMessage: null
          });
          chatId = newChat.id;
        }
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          text: message.trim(),
          senderId: user.uid,
          timestamp,
          type: 'text',
          status: 'sent',
          isBroadcast: true
        });
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: { text: message.trim(), senderId: user.uid, senderName: user.displayName, timestamp },
          updatedAt: timestamp
        });
      }

      // Update broadcast history
      const now = serverTimestamp();
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      const existingHistory = userDoc.data()?.broadcastHistory || [];
      await updateDoc(userRef, {
        broadcastHistory: [...existingHistory, now]
      });

      onClose();
    } catch (error) {
      console.error("Broadcast error:", error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-blue-600 text-white">
          <div>
            <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
              <Radio size={24} className="animate-pulse" />
              Broadcast Mesajı
            </h2>
            <p className="text-blue-100 text-[9px] font-bold uppercase tracking-widest mt-1">
              Günde {cooldownInfo.remainingToday}/2 gönderim hakkı
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-hidden flex flex-col flex-1">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Globe size={14} /> HEDEF ÜLKE
            </label>
            <select value={country} onChange={e => setCountry(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-4 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 transition-all">
              <option value="">Ülke seçin...</option>
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            {country && (
              <p className="text-xs font-bold text-slate-500">
                {loadingCount ? 'Hedef sayısı hesaplanıyor...' : `${targetCount} kullanıcıya gönderilecek`}
              </p>
            )}
          </div>

          {!cooldownInfo.canSend && (
            <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl">
              <p className="text-xs font-bold text-amber-700">
                ⚠️ Broadcast gönderilemiyor. 
                {cooldownInfo.remainingToday <= 0 
                  ? ' Günlük limitinize (2) ulaştınız.'
                  : ` Bir sonraki gönderim için ${cooldownInfo.remainingTime} beklemelisiniz.`
                }
                {cooldownInfo.remainingTime && ` (Kalan süre: ${cooldownInfo.remainingTime})`}
              </p>
            </div>
          )}

          {cooldownInfo.canSend && country && (
            <p className="text-xs font-bold text-blue-600 bg-blue-50 p-3 rounded-2xl border border-blue-100">
              ✅ Broadcast gönderime hazır. Gönderimler arası en az 6 saat olmalıdır.
            </p>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100">
          <div className="flex gap-4">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Broadcast mesajınızı yazın..."
              rows={2}
              className="flex-1 bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all resize-none shadow-sm"
            />
            <button
              onClick={handleBroadcast}
              disabled={sending || !message.trim() || !country || !cooldownInfo.canSend}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white p-6 rounded-2xl shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center shrink-0 active:scale-95"
              title={!cooldownInfo.canSend ? 'Broadcast limitine ulaşıldı' : 'Broadcast Gönder'}
            >
              {sending ? (
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send size={24} />
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
