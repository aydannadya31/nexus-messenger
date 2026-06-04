import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, logout } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { Chat, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { LogOut, MessageSquarePlus, Search, User as UserIcon, ChevronUp, Settings, Radio, Bot, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ProfileModal from './ProfileModal';

const StatusBullet: React.FC<{ status?: string; className?: string }> = ({ status, className }) => {
  const colors = {
    online: 'bg-green-500',
    away: 'bg-amber-500',
    busy: 'bg-red-500',
    default: 'bg-slate-300'
  };
  
  const color = colors[status as keyof typeof colors] || colors.default;

  return (
    <div className={cn("w-2.5 h-2.5 rounded-full border-2 border-white", color, className)} />
  );
};

interface SidebarProps {
  onSelectChat: (chatId: string) => void;
  selectedChatId?: string;
  onStartNewChat: () => void;
  onOpenBroadcast: () => void;
  onOpenAI?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onSelectChat, selectedChatId, onStartNewChat, onOpenBroadcast, onOpenAI }) => {
  const { user, profile } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatDetails, setChatDetails] = useState<Record<string, UserProfile>>({});
  const prevLastMessagesRef = useRef<Record<string, any>>({});
  const chatDetailsRef = useRef<Record<string, UserProfile>>({});

  useEffect(() => {
    if (!user) return;

    const profileUnsubs: (() => void)[] = [];

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Chat));
      
      // Play sound if new message arrived and not from me
      const prevMsgs = prevLastMessagesRef.current;
      const hasPrevState = Object.keys(prevMsgs).length > 0;
      const newLastMessages: Record<string, any> = {};

      for (const chat of chatList) {
        const lastMsg = chat.lastMessage;
        const prevMsg = prevMsgs[chat.id];
        newLastMessages[chat.id] = lastMsg;
        
        if (hasPrevState && lastMsg && (!prevMsg || lastMsg.timestamp?.toMillis() > prevMsg.timestamp?.toMillis())) {
          if (lastMsg.senderId !== user.uid) {
            const audio = new Audio('https://raw.githubusercontent.com/yemreak/icq-sounds/master/Sounds/Global/Uh-Oh.wav');
            audio.play().catch(e => console.log("Audio play blocked", e));
          }
        }
      }
      prevLastMessagesRef.current = newLastMessages;

      setChats(chatList);

      // Subscribe to profile changes for all private chat participants
      for (const chat of chatList) {
        if (chat.type === 'private') {
          const otherId = chat.participants.find(p => p !== user.uid);
          if (otherId && !chatDetailsRef.current[otherId]) {
            chatDetailsRef.current[otherId] = {} as UserProfile; // mark as loading
            (async (id) => {
              const unsub = onSnapshot(doc(db, 'users', id), (snap) => {
                if (snap.exists()) {
                  chatDetailsRef.current[id] = snap.data() as UserProfile;
                  setChatDetails({ ...chatDetailsRef.current });
                }
              });
              // Store unsub for cleanup
              profileUnsubs.push(unsub);
            })(otherId);
          }
        }
      }
    });

    return () => {
      unsubscribe();
      profileUnsubs.forEach(fn => fn());
    };
  }, [user]);

  const getChatInfo = (chat: Chat) => {
    if (chat.type === 'group') {
      return {
        name: chat.groupMetadata?.name || 'Grup',
        photoURL: chat.groupMetadata?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${chat.id}`,
        onlineStatus: undefined
      };
    }
    const otherId = chat.participants.find(p => p !== user?.uid);
    const other = otherId ? chatDetails[otherId] : null;
    return {
      name: other?.displayName || 'Yükleniyor...',
      photoURL: other?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${chat.id}`,
      onlineStatus: other?.onlineStatus
    };
  };

  const updateMyStatus = async (status: 'online' | 'away' | 'busy') => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        onlineStatus: status
      });
    } catch (error) {
      console.error("Status update error:", error);
    }
  };

  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const myStatus = profile?.onlineStatus || 'online';

  const [searchQuery, setSearchQuery] = useState('');
  const [showAdminMsg, setShowAdminMsg] = useState(false);
  const [adminMsgText, setAdminMsgText] = useState('');

  const filteredChats = chats.filter(chat => {
    if (!searchQuery) return true;
    const info = getChatInfo(chat);
    return info.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
           (info.onlineStatus && info.onlineStatus.includes(searchQuery.toLowerCase())) ||
           (chat.type === 'private' && chat.participants.some(p => {
             const u = chatDetails[p];
             return u?.uin?.includes(searchQuery);
           }));
  });

  return (
    <div className="flex flex-col h-full bg-white sm:border-r border-slate-200 w-full sm:max-w-[350px]">
       {/* Sidebar Header */}
      <header className="p-4 sm:p-6 space-y-3 sm:space-y-4 shadow-sm z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mesajlar</h1>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={onOpenBroadcast}
            className="p-2.5 bg-blue-50 hover:bg-blue-100 rounded-xl text-blue-600 transition-all active:scale-95 group relative"
            title="Broadcast Message"
          >
            <Radio size={20} />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
          </button>
          <button 
            onClick={onStartNewChat}
            className="p-2.5 bg-slate-100/50 hover:bg-slate-100 rounded-xl text-slate-600 transition-all active:scale-95"
          >
            <MessageSquarePlus size={20} />
          </button>
          <button 
            onClick={onOpenAI}
            className="p-2.5 bg-purple-50 hover:bg-purple-100 rounded-xl text-purple-600 transition-all active:scale-95"
            title="Nexus AI Asistan"
          >
            <Bot size={20} />
          </button>
          <button 
            onClick={() => setShowAdminMsg(true)}
            className="p-2.5 bg-amber-50 hover:bg-amber-100 rounded-xl text-amber-600 transition-all active:scale-95"
            title="Yöneticiye Mesaj Gönder"
          >
            <MessageSquarePlus size={20} />
          </button>
          <button 
            onClick={() => logout()}
            className="p-2.5 bg-slate-100/50 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-red-500 transition-all active:scale-95"
          >
            <LogOut size={20} />
          </button>
        </div>
        
        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
          <input 
            type="text" 
            placeholder="Ara veya yeni sohbet başlat" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-100/50 border border-slate-100 rounded-2xl py-3 pl-10 pr-4 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all outline-none"
          />
        </div>
      </header>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-20">
        {filteredChats.map(chat => {
          const info = getChatInfo(chat);
          const isSelected = selectedChatId === chat.id;
          
          return (
            <div 
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={cn(
                "px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 cursor-pointer transition-colors",
                isSelected 
                  ? "bg-blue-50 border-r-4 border-blue-500" 
                  : "hover:bg-slate-50"
              )}
            >
              <div className="w-12 h-12 bg-slate-200 rounded-full flex-shrink-0 relative shadow-sm">
                <img 
                  src={info.photoURL} 
                  alt={info.name} 
                  className="w-full h-full object-cover rounded-full"
                />
                {chat.type === 'private' && (
                  <StatusBullet 
                    status={info.onlineStatus} 
                    className="absolute bottom-0 right-0 w-3.5 h-3.5" 
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className={cn(
                      "text-sm font-semibold truncate",
                      isSelected ? "text-blue-600" : "text-slate-900"
                    )}>
                      {info.name}
                    </h2>
                    {chat.type === 'private' && info.onlineStatus && (
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter shrink-0",
                        info.onlineStatus === 'online' ? "bg-green-100 text-green-600" : 
                        info.onlineStatus === 'away' ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"
                      )}>
                        {info.onlineStatus === 'online' ? 'Çevrimiçi' : info.onlineStatus === 'away' ? 'Uzakta' : 'Meşgul'}
                      </span>
                    )}
                  </div>
                  {chat.lastMessage?.timestamp && (
                    <span className={cn(
                      "text-[10px] font-medium ml-2",
                      isSelected ? "text-blue-600" : "text-slate-400"
                    )}>
                       {formatDistanceToNow(chat.updatedAt.toDate(), { addSuffix: false })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {chat.lastMessage?.senderName && chat.type === 'group' && (
                    <span className="font-bold mr-1">{chat.lastMessage.senderName}:</span>
                  )}
                  {chat.lastMessage?.text || 'Henüz mesaj yok'}
                </p>
              </div>
            </div>
          );
        })}
        {filteredChats.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center mt-10">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">
               {searchQuery ? <Search size={32} /> : <UserIcon size={32} />}
            </div>
            <p className="text-sm text-slate-500">
              {searchQuery ? 'Sonuç bulunamadı' : 'Henüz sohbet yok'}
            </p>
            {!searchQuery && (
              <button 
                onClick={onStartNewChat}
                className="mt-4 text-xs text-blue-600 font-semibold hover:underline"
              >
                İlk Mesajını Gönder
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer Profile */}
      <footer className="p-4 sm:p-6 border-t border-slate-100 bg-white shrink-0 relative">
        {showStatusMenu && (
          <div className="absolute bottom-full left-6 mb-2 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-20 w-40 animate-in fade-in slide-in-from-bottom-2">
            {(['online', 'away', 'busy'] as const).map(s => (
              <button
                key={s}
                onClick={() => {
                  updateMyStatus(s);
                  setShowStatusMenu(false);
                }}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-xs font-bold text-slate-700"
              >
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  s === 'online' ? "bg-green-500" : s === 'away' ? "bg-amber-500" : "bg-red-500"
                )} />
                {s === 'online' ? 'Çevrimiçi' : s === 'away' ? 'Uzakta' : 'Meşgul'}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => setShowProfileModal(true)}>
              <div className="relative">
                <img 
                  src={profile?.photoURL || user?.photoURL || ''} 
                  alt="Profile" 
                  className="w-10 h-10 rounded-xl bg-slate-900 object-cover shadow-sm group-hover:ring-2 group-hover:ring-blue-500/20 transition-all"
                />
                <StatusBullet 
                  status={myStatus} 
                  className="absolute -bottom-1 -right-1 w-3.5 h-3.5" 
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-xl flex items-center justify-center transition-colors">
                  <Settings size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-slate-900 truncate max-w-[100px]">
                  {profile?.displayName || user?.displayName}
                </span>
                <span className="text-[9px] font-black text-blue-500 tracking-tighter uppercase">
                  { profile?.uin || '...' }
                </span>
                <span className="text-[10px] text-slate-400 truncate max-w-[100px]">
                  {profile?.about || 'Durum yok'}
                </span>
              </div>
            </div>
          <button 
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all border border-slate-100 active:scale-95"
          >
            <span className={cn(
              "text-[10px] font-black uppercase tracking-wider",
              myStatus === 'online' ? "text-green-600" : myStatus === 'away' ? "text-amber-600" : "text-red-600"
            )}>
              {myStatus === 'online' ? 'Aktif' : myStatus === 'away' ? 'Uzakta' : 'Meşgul'}
            </span>
            <ChevronUp size={12} className={cn("text-slate-400 transition-transform duration-300", showStatusMenu && "rotate-180")} />
          </button>
        </div>
      </footer>

      {showProfileModal && profile && (
        <ProfileModal 
          user={profile} 
          onClose={() => setShowProfileModal(false)} 
        />
      )}

      {/* Admin Message Dialog */}
      {showAdminMsg && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={() => { setShowAdminMsg(false); setAdminMsgText(''); }}>
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900">Yöneticiye Mesaj Gönder</h3>
              <button onClick={() => { setShowAdminMsg(false); setAdminMsgText(''); }} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={18} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 font-bold mb-4">Sorun, öneri veya ihlal bildirimi gönderebilirsiniz.</p>
            <textarea
              value={adminMsgText}
              onChange={e => setAdminMsgText(e.target.value)}
              placeholder="Mesajınız..."
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-900 outline-none min-h-[100px] resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowAdminMsg(false); setAdminMsgText(''); }}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider"
              >
                İptal
              </button>
              <button
                disabled={!adminMsgText.trim()}
                onClick={async () => {
                  try {
                    await addDoc(collection(db, 'adminMessages'), {
                      userId: user?.uid,
                      userDisplayName: user?.displayName || '',
                      userNickname: profile?.nickname || user?.displayName || '',
                      userUIN: profile?.uin || '',
                      message: adminMsgText.trim(),
                      timestamp: serverTimestamp()
                    });
                    setShowAdminMsg(false);
                    setAdminMsgText('');
                    alert('Mesajınız yöneticiye iletilmiştir.');
                  } catch {
                    alert('Mesaj gönderilemedi. Lütfen tekrar deneyin.');
                  }
                }}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
              >
                Gönder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
