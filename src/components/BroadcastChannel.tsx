import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ArrowLeft, Radio } from 'lucide-react';

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

  useEffect(() => {
    const q = query(collection(db, 'broadcastMessages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as BroadcastMessage)));
    });
    return () => unsub();
  }, []);

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
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tüm kullanıcılara açık</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4">
        <AnimatePresence>
          {messages.map((msg) => (
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
        {messages.length === 0 && (
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
