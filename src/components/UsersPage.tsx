import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, where, getDocs, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { Chat, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { MessageSquarePlus, Users, Search, Loader2 } from 'lucide-react';

interface UsersPageProps {
  onSelectChat: (chatId: string) => void;
}

const statusLabels: Record<string, string> = {
  online: 'Çevrimiçi',
  away: 'Uzakta',
  busy: 'Meşgul',
};

const statusDot: Record<string, string> = {
  online: 'bg-green-500',
  away: 'bg-amber-500',
  busy: 'bg-red-500',
};

const statusBadge: Record<string, string> = {
  online: 'bg-green-100 text-green-600',
  away: 'bg-amber-100 text-amber-600',
  busy: 'bg-red-100 text-red-600',
};

export const UsersPage: React.FC<UsersPageProps> = ({ onSelectChat }) => {
  const { user } = useAuth();
  const [friendsList, setFriendsList] = useState<string[]>([]);
  const [friendProfiles, setFriendProfiles] = useState<Record<string, UserProfile>>({});
  const [groups, setGroups] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Track approved friend UIDs — closure refs so both onSnapshot callbacks
  // can merge into a single setFriendsList call, avoiding any stale closures
  // or React batching issues with separate functional updaters.
  useEffect(() => {
    if (!user) return;
    let incomingUids: string[] = [];
    let outgoingUids: string[] = [];

    const merge = () => {
      const all = [...new Set([...incomingUids, ...outgoingUids])];
      setFriendsList(all);
    };

    const mapDoc = (d: { data(): Record<string, unknown>; id: string }) => ({ ...d.data(), id: d.id }) as { from: string; to: string; status: string; id: string };

    const unsub1 = onSnapshot(
      query(collection(db, 'friendRequests'), where('to', '==', user.uid)),
      (snap) => {
        incomingUids = snap.docs.map(mapDoc).filter(d => d.status === 'approved').map(d => d.from);
        merge();
      }
    );
    const unsub2 = onSnapshot(
      query(collection(db, 'friendRequests'), where('from', '==', user.uid)),
      (snap) => {
        outgoingUids = snap.docs.map(mapDoc).filter(d => d.status === 'approved').map(d => d.to);
        merge();
      }
    );
    return () => { unsub1(); unsub2(); };
  }, [user]);

  useEffect(() => {
    if (!user || friendsList.length === 0) return;
    const unsubs = friendsList.map(uid =>
      onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists()) {
          setFriendProfiles(prev => ({ ...prev, [uid]: { ...snap.data() as UserProfile, uid: snap.id } }));
        }
      })
    );
    return () => unsubs.forEach(u => u());
  }, [user, friendsList]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const allChats = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Chat));
      const groupChats = allChats
        .filter(c => c.type === 'group')
        .sort((a, b) => {
          const aTime = a.updatedAt?.toMillis?.() || 0;
          const bTime = b.updatedAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
      setGroups(groupChats);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const handleFriendClick = async (friendUid: string) => {
    if (!user) return;
    const chatQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      where('type', '==', 'private')
    );
    const chatSnap = await getDocs(chatQuery);
    let foundId: string | null = null;
    chatSnap.forEach(d => {
      const data = d.data();
      if (data.participants.includes(friendUid)) foundId = d.id;
    });
    if (foundId) {
      onSelectChat(foundId);
    } else {
      const newRef = await addDoc(collection(db, 'chats'), {
        participants: [user.uid, friendUid],
        type: 'private',
        updatedAt: serverTimestamp(),
        lastMessage: null,
      });
      onSelectChat(newRef.id);
    }
  };

  const handleGroupClick = (chatId: string) => {
    onSelectChat(chatId);
  };

  const filteredFriends = friendsList.filter(uid => {
    const fp = friendProfiles[uid];
    if (!fp) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      fp.displayName?.toLowerCase().includes(q) ||
      fp.nickname?.toLowerCase().includes(q) ||
      fp.uin?.includes(q)
    );
  });

  const filteredGroups = groups.filter(g => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return g.groupMetadata?.name?.toLowerCase().includes(q);
  });

  const hasAnyContent = friendsList.length > 0 || groups.length > 0;
  const hasFilteredContent = filteredFriends.length > 0 || filteredGroups.length > 0;

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
      <header className="min-h-14 sm:h-20 bg-white border-b border-slate-200 flex items-center px-4 sm:px-8 shrink-0">
        <h2 className="text-lg font-black text-slate-900 tracking-tight">Kullanıcılar</h2>
        <span className="ml-2 text-xs font-bold text-slate-400">({friendsList.length + groups.length})</span>
      </header>

      <div className="px-4 sm:px-8 py-3 bg-white border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Arkadaş veya grup ara..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-100 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && !hasAnyContent ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        ) : !hasFilteredContent ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              {searchQuery ? (
                <Search size={28} className="text-slate-400" />
              ) : (
                <Users size={28} className="text-slate-400" />
              )}
            </div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              {searchQuery ? 'Sonuç bulunamadı' : 'Henüz bağlantın yok'}
            </p>
            <p className="text-xs text-slate-400 mt-2 max-w-[200px]">
              {searchQuery
                ? 'Farklı bir arama dene'
                : 'Kullanıcı eklemek için sol üstteki "Kull. List." butonunu kullan'}
            </p>
          </div>
        ) : (
          <div className="pb-6">
            {filteredFriends.length > 0 && (
              <div>
                <div className="px-4 sm:px-8 pt-4 pb-2">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    Arkadaşlar
                    <span className="ml-1.5 text-[10px] opacity-60">({filteredFriends.length})</span>
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredFriends.map(uid => {
                    const fp = friendProfiles[uid];
                    if (!fp) return null;
                    return (
                      <div
                        key={uid}
                        onClick={() => handleFriendClick(uid)}
                        className="flex items-center gap-4 px-4 sm:px-8 py-4 cursor-pointer transition-all hover:bg-white active:scale-[0.99]"
                      >
                        <div className="w-12 h-12 bg-slate-200 rounded-full shrink-0 relative shadow-sm overflow-hidden">
                          <img
                            src={fp.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`}
                            alt={fp.displayName}
                            className="w-full h-full object-cover"
                          />
                          {fp.onlineStatus && (
                            <div className={cn(
                              "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white",
                              statusDot[fp.onlineStatus]
                            )} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900 truncate">
                              {fp.displayName || 'İsimsiz'}
                            </h3>
                            {fp.onlineStatus && (
                              <span className={cn(
                                "text-[8px] px-1.5 py-0.5 font-bold uppercase tracking-tighter shrink-0 rounded",
                                statusBadge[fp.onlineStatus]
                              )}>
                                {statusLabels[fp.onlineStatus]}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {fp.uin && (
                              <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded tracking-tighter">
                                #{fp.uin}
                              </span>
                            )}
                            {fp.country && (
                              <span className="text-[10px] font-medium text-slate-500">{fp.country}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleFriendClick(uid); }}
                          className="p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-all active:scale-95 shrink-0"
                          title="Mesaj Gönder"
                        >
                          <MessageSquarePlus size={18} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredGroups.length > 0 && (
              <div>
                <div className="px-4 sm:px-8 pt-6 pb-2">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    Gruplar
                    <span className="ml-1.5 text-[10px] opacity-60">({filteredGroups.length})</span>
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredGroups.map(group => (
                    <div
                      key={group.id}
                      onClick={() => handleGroupClick(group.id!)}
                      className="flex items-center gap-4 px-4 sm:px-8 py-4 cursor-pointer transition-all hover:bg-white active:scale-[0.99]"
                    >
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full shrink-0 relative shadow-sm overflow-hidden flex items-center justify-center">
                        {group.groupMetadata?.photoURL ? (
                          <img src={group.groupMetadata.photoURL} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Users size={20} className="text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {group.groupMetadata?.name || 'Grup'}
                          </h3>
                          <span className="text-[8px] px-1.5 py-0.5 font-bold bg-slate-100 text-slate-500 uppercase tracking-tighter rounded shrink-0">
                            {group.participants.length} üye
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                          {group.lastMessage?.text
                            ? `${group.lastMessage.senderName || 'Birisi'}: ${group.lastMessage.text}`
                            : 'Henüz mesaj yok'}
                        </p>
                      </div>
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-xl transition-all active:scale-95 shrink-0">
                        <MessageSquarePlus size={16} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
