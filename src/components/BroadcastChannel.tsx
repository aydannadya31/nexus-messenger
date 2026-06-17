import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ArrowLeft, Radio, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

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
  { code: 'SRB', name: 'Serbia' }, { code: 'HRV', name: 'Croatia' }, { code: 'BIH', name: 'Bosnia and Herzegovina' },
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

interface BroadcastMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  country: string;
  timestamp: any;
  createdAt: string;
}

interface BroadcastChannelProps {
  onBack?: () => void;
}

const BroadcastChannel: React.FC<BroadcastChannelProps> = ({ onBack }) => {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [countryFilter, setCountryFilter] = useState(profile?.country || '');

  useEffect(() => {
    localStorage.setItem('broadcastLastRead', new Date().toISOString());
  }, []);

  useEffect(() => {
    setCountryFilter(prev => prev || profile?.country || '');
  }, [profile?.country]);

  useEffect(() => {
    const q = query(collection(db, 'broadcastMessages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as BroadcastMessage)));
    });
    return () => unsub();
  }, []);

  const filteredMessages = countryFilter
    ? messages.filter(m => m.country === countryFilter)
    : messages;

  return (
    <div className="flex-1 flex flex-col bg-white">
      <header className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-white flex items-center gap-3 shrink-0">
        {onBack && (
          <button onClick={onBack} className="p-1.5 mr-1.5 sm:hidden text-slate-500 hover:bg-slate-100 rounded-lg shrink-0">
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
          <Radio size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-slate-900 truncate">📢 Broadcast Kanalı</h2>
          <div className="flex items-center gap-1 mt-0.5">
            <Globe size={10} className="text-blue-500 shrink-0" />
            <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
              className="text-[9px] font-bold text-slate-400 bg-transparent border-none outline-none appearance-none cursor-pointer p-0 m-0">
              <option value="">Tüm Ülkeler</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4">
        <AnimatePresence>
          {filteredMessages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-50 rounded-2xl p-4 border border-slate-100"
            >
              <div className="flex items-center gap-3 mb-3">
                <img
                  src={msg.senderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`}
                  alt={msg.senderName}
                  className="w-8 h-8 rounded-full bg-slate-200"
                />
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">{msg.senderName}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{msg.country} • {msg.createdAt ? format(new Date(msg.createdAt), 'dd.MM HH:mm') : ''}</p>
                </div>
              </div>
              <p className="text-sm font-medium text-slate-700 leading-relaxed">{msg.text}</p>
            </motion.div>
          ))}
        </AnimatePresence>
        {filteredMessages.length === 0 && (
          <div className="text-center py-16">
            <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <Radio size={28} className="text-slate-400" />
            </div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Henüz broadcast mesajı yok</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BroadcastChannel;
