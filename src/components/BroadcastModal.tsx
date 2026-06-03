import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, doc, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { UserProfile, Chat } from '../types';
import { X, Search, Send, Check, Radio, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface BroadcastModalProps {
  onClose: () => void;
}

export const BroadcastModal: React.FC<BroadcastModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [existingChats, setExistingChats] = useState<Chat[]>([]);
  const [chatDetails, setChatDetails] = useState<Record<string, UserProfile>>({});
  
  const [selectedTargets, setSelectedTargets] = useState<{ id: string; type: 'user' | 'chat'; name: string }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);
      try {
        // Fetch existing chats to include groups
        const chatsQuery = query(
          collection(db, 'chats'),
          where('participants', 'array-contains', user.uid)
        );
        const chatSnapshot = await getDocs(chatsQuery);
        const myChats = chatSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Chat));
        setExistingChats(myChats);

        // Fetch some users for new private broadcasts
        const usersQuery = query(
          collection(db, 'users'),
          where('uid', '!=', user.uid),
          limit(30)
        );
        const userSnapshot = await getDocs(usersQuery);
        const allUsers = userSnapshot.docs.map(d => d.data() as UserProfile);
        setUsers(allUsers);
        
        // Also map user details for private chats
        const details: Record<string, UserProfile> = {};
        allUsers.forEach(u => details[u.uid] = u);
        setChatDetails(details);

      } catch (error) {
        console.error("Broadcast data fetch error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const toggleTarget = (id: string, type: 'user' | 'chat', name: string) => {
    if (selectedTargets.find(t => t.id === id)) {
      setSelectedTargets(selectedTargets.filter(t => t.id !== id));
    } else {
      setSelectedTargets([...selectedTargets, { id, type, name }]);
    }
  };

  const handleBroadcast = async () => {
    if (!user || !message.trim() || selectedTargets.length === 0) return;
    setSending(true);
    
    try {
      const timestamp = serverTimestamp();
      
      for (const target of selectedTargets) {
        let chatId = '';

        if (target.type === 'chat') {
          chatId = target.id;
        } else {
          // It's a user - check for existing private chat or create one
          const chatsRef = collection(db, 'chats');
          const q = query(chatsRef, 
            where('participants', 'array-contains', user.uid),
            where('type', '==', 'private')
          );
          const snapshot = await getDocs(q);
          
          let existingId = null;
          snapshot.forEach(d => {
            const data = d.data();
            if (data.participants.includes(target.id)) {
              existingId = d.id;
            }
          });

          if (existingId) {
            chatId = existingId;
          } else {
            const newChat = await addDoc(chatsRef, {
              participants: [user.uid, target.id],
              type: 'private',
              updatedAt: timestamp,
              lastMessage: null
            });
            chatId = newChat.id;
          }
        }

        // Send message to the specific chat
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          text: message.trim(),
          senderId: user.uid,
          timestamp,
          type: 'text',
          status: 'sent'
        });

        // Update chat head
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: {
            text: message.trim(),
            senderId: user.uid,
            senderName: user.displayName,
            timestamp
          },
          updatedAt: timestamp
        });
      }

      onClose();
    } catch (error) {
      console.error("Broadcast send error:", error);
    } finally {
      setSending(false);
    }
  };

  const filteredItems = [
    ...existingChats.filter(c => c.type === 'group').map(c => ({
      id: c.id,
      type: 'chat' as const,
      name: c.groupMetadata?.name || 'Grup',
      photoURL: c.groupMetadata?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${c.id}`,
      subtitle: `${c.participants.length} katılımcı`
    })),
    ...users.map(u => ({
      id: u.uid,
      type: 'user' as const,
      name: u.displayName,
      photoURL: u.photoURL,
      subtitle: u.uin ? `#${u.uin}` : u.email
    }))
  ].filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    item.subtitle.toLowerCase().includes(search.toLowerCase())
  );

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
            <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest mt-1">
              {selectedTargets.length} hedef seçildi
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-hidden flex flex-col flex-1">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Grup veya kişi ara..." 
              className="w-full bg-slate-100 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold text-slate-900 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-10 h-10 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Data Syncing...</p>
              </div>
            ) : filteredItems.length > 0 ? (
              filteredItems.map(item => {
                const isSelected = !!selectedTargets.find(t => t.id === item.id);
                return (
                  <div 
                    key={item.id}
                    onClick={() => toggleTarget(item.id, item.type, item.name)}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border-2",
                      isSelected 
                        ? "bg-blue-50 border-blue-500 shadow-lg shadow-blue-500/5 scale-[1.01]" 
                        : "hover:bg-slate-50 border-transparent hover:border-slate-100"
                    )}
                  >
                    <div className="relative">
                      <img src={item.photoURL} alt={item.name} className="w-12 h-12 rounded-[1rem] bg-slate-100 object-cover" />
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-blue-600 rounded-lg border-2 border-white flex items-center justify-center shadow-md">
                          <Check size={14} className="text-white" />
                        </div>
                      )}
                      {item.type === 'chat' && !isSelected && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-slate-200 rounded-lg flex items-center justify-center text-slate-500">
                          <Users size={12} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-slate-900">{item.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{item.subtitle}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-20">
                <p className="text-sm font-black text-slate-300 uppercase tracking-widest">Sonuç Bulunamadı</p>
              </div>
            )}
          </div>
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
              disabled={sending || !message.trim() || selectedTargets.length === 0}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white p-6 rounded-2xl shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center shrink-0 active:scale-95"
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
