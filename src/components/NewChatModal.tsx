import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, where, limit, orderBy, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { UserProfile, Chat } from '../types';
import { X, Search, UserPlus, Users, ArrowRight, Check, Globe, Filter, LogIn, MessageSquarePlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

interface NewChatModalProps {
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ onClose, onChatCreated }) => {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<'people' | 'groups'>('people');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [peopleSearch, setPeopleSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<Record<string, 'none' | 'pending_sent' | 'pending_received' | 'approved'>>({});
  const [countryFilter, setCountryFilter] = useState('');

  // Group creation state
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserProfile[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupCountry, setGroupCountry] = useState(profile?.country || '');
  const [groupPassword, setGroupPassword] = useState('');
  const [step, setStep] = useState(1);

  const [groupCountryFilter, setGroupCountryFilter] = useState('');

  // Group join state
  const [foundGroups, setFoundGroups] = useState<Chat[]>([]);
  const [groupSearchLoading, setGroupSearchLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Chat | null>(null);
  const [joinPassword, setJoinPassword] = useState('');

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'users'), limit(50));
        const snapshot = await getDocs(q);
        const fetchedUsers = snapshot.docs.map(d => d.data() as UserProfile).filter(u => u.uid !== user?.uid);
        setUsers(fetchedUsers);
      } catch (error) {
        console.error("Fetch users error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [user]);

  // Fetch friend status
  useEffect(() => {
    if (!user) return;
    const fetchFriendStatus = async () => {
      try {
        const [q1, q2] = await Promise.all([
          getDocs(query(collection(db, 'friendRequests'), where('from', '==', user.uid))),
          getDocs(query(collection(db, 'friendRequests'), where('to', '==', user.uid)))
        ]);
        const status: Record<string, 'none' | 'pending_sent' | 'pending_received' | 'approved'> = {};
        const requests = [...q1.docs, ...q2.docs].map(d => ({ id: d.id, ...d.data() } as any));
        const unique = requests.filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i);
        unique.forEach(r => {
          const otherId = r.from === user.uid ? r.to : r.from;
          if (r.status === 'approved') {
            status[otherId] = 'approved';
          } else if (r.status === 'pending') {
            if (!status[otherId] || status[otherId] === 'none') {
              status[otherId] = r.from === user.uid ? 'pending_sent' : 'pending_received';
            }
          }
        });
        setFriendStatus(prev => ({ ...prev, ...status }));
      } catch (err) {
        console.error(err);
      }
    };
    fetchFriendStatus();
  }, [user]);

  const toggleUserSelection = (u: UserProfile) => {
    if (selectedUsers.find(sel => sel.uid === u.uid)) {
      setSelectedUsers(selectedUsers.filter(sel => sel.uid !== u.uid));
    } else {
      setSelectedUsers([...selectedUsers, u]);
    }
  };

  const openExistingChat = async (otherUid: string) => {
    if (!user) return;
    const chatsRef = collection(db, 'chats');
    const chatQuery = query(chatsRef, where('participants', 'array-contains', user.uid), where('type', '==', 'private'));
    const chatSnap = await getDocs(chatQuery);
    let existingChatId = null;
    chatSnap.forEach(d => {
      const data = d.data();
      if (data.participants.includes(otherUid)) existingChatId = d.id;
    });
    if (existingChatId) {
      onChatCreated(existingChatId);
      onClose();
      return true;
    }
    return false;
  };

  const startPrivateChat = async (otherUser: UserProfile) => {
    if (!user) return;
    const opened = await openExistingChat(otherUser.uid);
    if (opened) return;
    const newChatRef = await addDoc(collection(db, 'chats'), {
      participants: [user.uid, otherUser.uid],
      type: 'private',
      updatedAt: serverTimestamp(),
      lastMessage: null
    });
    onChatCreated(newChatRef.id);
    onClose();
  };

  const sendFriendRequest = async (otherUser: UserProfile) => {
    if (!user) return;
    const opened = await openExistingChat(otherUser.uid);
    if (opened) return;
    await addDoc(collection(db, 'friendRequests'), {
      from: user.uid, to: otherUser.uid,
      fromName: user.displayName || user.email, toName: otherUser.displayName || otherUser.email,
      fromPhoto: user.photoURL || '', toPhoto: otherUser.photoURL || '',
      status: 'pending', timestamp: serverTimestamp()
    });
    setFriendStatus(prev => ({ ...prev, [otherUser.uid]: 'pending_sent' }));
    alert('Arkadaşlık isteği gönderildi!');
  };

  const createGroup = async () => {
    if (!user || !groupName.trim() || selectedUsers.length === 0) return;
    const participants = [user.uid, ...selectedUsers.map(u => u.uid)];
    const newChatRef = await addDoc(collection(db, 'chats'), {
      participants, type: 'group',
      groupCountry: groupCountry || profile?.country || '',
      groupMetadata: {
        name: groupName.trim(), createdBy: user.uid, adminId: user.uid,
        photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${groupName}`,
        ...(groupPassword.trim() ? { password: groupPassword.trim() } : {})
      },
      updatedAt: serverTimestamp(), lastMessage: null
    });
    onChatCreated(newChatRef.id);
    onClose();
  };

  const loadGroups = async (name: string = '') => {
    setGroupSearchLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'chats'), where('type', '==', 'group')));
      const groups = snap.docs.map(d => ({ id: d.id, ...d.data() } as Chat)).filter(g =>
        !g.participants.includes(user!.uid) &&
        (!name || g.groupMetadata?.name?.toLowerCase().includes(name.toLowerCase())) &&
        (!groupCountryFilter || g.groupCountry === groupCountryFilter)
      );
      setFoundGroups(groups);
    } catch (err) {
      console.error(err);
      setFoundGroups([]);
    } finally {
      setGroupSearchLoading(false);
    }
  };

  const searchGroups = async (name: string) => {
    loadGroups(name);
  };

  useEffect(() => {
    if (tab === 'groups') loadGroups();
  }, [tab, groupCountryFilter]);

  const requestJoinGroup = async (group: Chat) => {
    if (!user) return;
    if (group.groupMetadata?.password) { setSelectedGroup(group); return; }
    const adminId = group.groupMetadata?.adminId || group.groupMetadata?.createdBy;
    if (!adminId) return;
    await addDoc(collection(db, 'groupJoinRequests'), {
      chatId: group.id, chatName: group.groupMetadata?.name || '', from: user.uid,
      fromName: user.displayName || user.email, status: 'pending', timestamp: serverTimestamp()
    });
    alert('Gruba katılma isteği yöneticiye gönderildi!');
    onClose();
  };

  const joinWithPassword = async () => {
    if (!user || !selectedGroup) return;
    if (joinPassword.trim() === selectedGroup.groupMetadata?.password) {
      await updateDoc(doc(db, 'chats', selectedGroup.id), { participants: arrayUnion(user.uid) });
      alert('Gruba başarıyla katıldınız!');
      onChatCreated(selectedGroup.id);
      onClose();
    } else {
      alert('Hatalı şifre!');
    }
  };

  const filteredUsers = users.filter(u =>
    (!countryFilter || u.country === countryFilter) &&
    (!peopleSearch || u.displayName.toLowerCase().includes(peopleSearch.toLowerCase()) || (u.uin || '').includes(peopleSearch))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Kullanıcı Listesi</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={22} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {!isGroupMode && !selectedGroup && (
            <>
              {/* Tabs */}
              <div className="flex rounded-2xl bg-slate-100 p-1">
                <button onClick={() => setTab('people')} className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all", tab === 'people' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>Kişiler</button>
                <button onClick={() => setTab('groups')} className={cn("flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all", tab === 'groups' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>Gruplar</button>
              </div>

              {tab === 'people' && (
                <>
                  {/* Country Filter (only for People tab) */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-2.5 pl-9 pr-3 text-xs font-bold text-slate-700 outline-none appearance-none cursor-pointer">
                        <option value="">Tüm Ülkeler</option>
                        {COUNTRIES.map(c => (<option key={c.code} value={c.code}>{c.name}</option>))}
                      </select>
                    </div>
                    {countryFilter && <button onClick={() => setCountryFilter('')} className="p-2 text-slate-400 hover:text-red-500 shrink-0"><X size={14} /></button>}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" value={peopleSearch} onChange={e => setPeopleSearch(e.target.value)}
                      placeholder="Kişi ara..." className="w-full bg-slate-100 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all outline-none" />
                  </div>
                  <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                    {loading ? (
                      <div className="text-center py-12"><div className="w-8 h-8 border-3 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" /><p className="text-xs font-bold text-slate-400 uppercase">Yükleniyor</p></div>
                    ) : filteredUsers.length > 0 ? filteredUsers.map(u => {
                      const fs = friendStatus[u.uid] || 'none';
                      const isFriend = fs === 'approved';
                      return (
                        <div key={u.uid} className="flex items-center gap-3 p-4 rounded-2xl border border-transparent hover:bg-slate-50 hover:border-slate-100 transition-all group">
                          <img src={u.photoURL} alt={u.displayName} className="w-11 h-11 rounded-full border-2 border-white shadow-sm shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{u.displayName}</p>
                            <p className="text-[10px] text-slate-500 font-medium truncate">{u.uin ? `#${u.uin}` : u.email}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isFriend ? (
                              <button onClick={() => startPrivateChat(u)}
                                className="px-2 sm:px-3 py-1 bg-blue-50 text-blue-600 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-wider hover:bg-blue-100 transition-all active:scale-95 flex items-center gap-1"><MessageSquarePlus size={12} className="hidden sm:block" />Ark.</button>
                            ) : (
                              <button onClick={() => sendFriendRequest(u)}
                                className={cn("px-2 sm:px-3 py-1 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1",
                                  fs === 'pending_sent' ? "bg-amber-50 text-amber-500 cursor-not-allowed" :
                                  fs === 'pending_received' ? "bg-amber-50 text-amber-500 cursor-not-allowed" :
                                  "bg-green-50 text-green-600 hover:bg-green-100"
                                )}
                                disabled={fs === 'pending_sent' || fs === 'pending_received'}>
                                {fs === 'pending_sent' ? '⏳' : fs === 'pending_received' ? '📨' : '➕'}
                                <span className="hidden sm:inline">{fs === 'pending_sent' ? 'Bekliyor' : fs === 'pending_received' ? 'İstek Var' : 'İstek Gönder'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="text-center py-12"><p className="text-sm font-bold text-slate-400 uppercase">Sonuç yok</p></div>
                    )}
                  </div>
                  <button onClick={() => setIsGroupMode(true)} className="w-full flex items-center gap-4 p-4 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-colors font-bold shadow-sm mt-2">
                    <div className="p-2 bg-blue-600 text-white rounded-xl"><Users size={20} /></div>
                    Yeni Grup Sohbeti
                  </button>
                </>
              )}

              {tab === 'groups' && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <select value={groupCountryFilter} onChange={e => { setGroupCountryFilter(e.target.value); }}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-2.5 pl-9 pr-3 text-xs font-bold text-slate-700 outline-none appearance-none cursor-pointer">
                        <option value="">Tüm Ülkeler</option>
                        {COUNTRIES.map(c => (<option key={c.code} value={c.code}>{c.name}</option>))}
                      </select>
                    </div>
                    {groupCountryFilter && <button onClick={() => setGroupCountryFilter('')} className="p-2 text-slate-400 hover:text-red-500 shrink-0"><X size={14} /></button>}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" value={groupSearch} onChange={e => { setGroupSearch(e.target.value); searchGroups(e.target.value); }}
                      placeholder="Grup adı ile ara..." className="w-full bg-slate-100 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all outline-none" />
                  </div>
                  <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                    {groupSearchLoading ? (
                      <div className="text-center py-12"><div className="w-8 h-8 border-3 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" /><p className="text-xs font-bold text-slate-400 uppercase">Yükleniyor</p></div>
                    ) : foundGroups.length > 0 ? foundGroups.map(g => (
                      <div key={g.id} onClick={() => requestJoinGroup(g)}
                        className="flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border hover:bg-slate-50 border-transparent hover:border-slate-100 group">
                        <div className="p-3 bg-slate-100 rounded-xl"><Users size={18} className="text-slate-500" /></div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-900">{g.groupMetadata?.name || 'İsimsiz Grup'}</p>
                          <p className="text-xs text-slate-500 font-medium">{g.participants?.length || 0} üye • {g.groupMetadata?.password ? '🔒 Şifreli' : '🔓 Açık'}</p>
                        </div>
                        <div className="p-2 bg-green-50 rounded-xl text-green-600 group-hover:bg-green-100 transition-all"><LogIn size={18} /></div>
                      </div>
                    )) : (
                      <div className="text-center py-12"><p className="text-sm font-bold text-slate-400 uppercase">Grup bulunamadı</p></div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Group member selection */}
          {isGroupMode && !selectedGroup && (
            <div>
              <button onClick={() => { setIsGroupMode(false); setSelectedUsers([]); setGroupName(''); setGroupPassword(''); setStep(1); }}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1"><ArrowRight size={14} className="rotate-180" /> Geri</button>
              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" value={peopleSearch} onChange={e => setPeopleSearch(e.target.value)}
                  placeholder="Üye ekle..." className="w-full bg-slate-100 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all outline-none" />
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                {filteredUsers.map(u => {
                  const isSelected = !!selectedUsers.find(sel => sel.uid === u.uid);
                  return (
                    <div key={u.uid} onClick={() => toggleUserSelection(u)}
                      className={cn("flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border", isSelected ? "bg-blue-50 border-blue-200" : "hover:bg-slate-50 border-transparent")}>
                      <img src={u.photoURL} alt={u.displayName} className="w-11 h-11 rounded-full" />
                      <div className="flex-1"><p className="text-sm font-bold text-slate-900">{u.displayName}</p></div>
                      {isSelected && <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center"><Check size={12} className="text-white" /></div>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center justify-between bg-slate-50 p-4 rounded-xl">
                <span className="text-xs font-bold text-slate-500">{selectedUsers.length} kişi seçildi</span>
                <button disabled={selectedUsers.length === 0} onClick={() => setStep(2)}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white p-3 rounded-xl transition-all"><ArrowRight size={20} /></button>
              </div>
            </div>
          )}

          {/* Group name & password step */}
          {isGroupMode && step === 2 && !selectedGroup && (
            <div>
              <button onClick={() => setStep(1)} className="text-xs font-bold text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1"><ArrowRight size={14} className="rotate-180" /> Geri</button>
              <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Grup ismi..."
                className="w-full text-center text-xl font-bold bg-transparent border-b-2 border-slate-200 focus:border-blue-500 outline-none pb-2 mb-4" autoFocus />
              <div className="flex flex-wrap gap-2 justify-center mb-4">
                {selectedUsers.map(u => <span key={u.uid} className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500">{u.displayName}</span>)}
              </div>
              <div className="space-y-2 mb-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Globe size={12} /> Grup Ülkesi</label>
                <select value={groupCountry} onChange={e => setGroupCountry(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 appearance-none cursor-pointer">
                  <option value="">Ülke seçilmedi</option>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2 mb-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">🔒 Grup Şifresi (opsiyonel)</label>
                <input type="text" value={groupPassword} onChange={e => setGroupPassword(e.target.value)} placeholder="Şifre girilmezse herkes katılabilir"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-4 font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-2xl">Geri</button>
                <button onClick={createGroup} disabled={!groupName.trim() || selectedUsers.length === 0} className="flex-1 py-4 font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-2xl">Grubu Oluştur</button>
              </div>
            </div>
          )}

          {/* Password entry for group join */}
          {selectedGroup && (
            <div>
              <p className="text-sm font-bold mb-2">{selectedGroup.groupMetadata?.name}</p>
              <p className="text-xs text-amber-600 font-bold mb-4">Bu grup şifre korumalı.</p>
              <input type="text" value={joinPassword} onChange={e => setJoinPassword(e.target.value)} placeholder="Grup şifresi..."
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-green-500 mb-4" autoFocus />
              <div className="flex gap-3">
                <button onClick={() => setSelectedGroup(null)} className="flex-1 py-3 font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-2xl text-xs">İptal</button>
                <button onClick={joinWithPassword} disabled={!joinPassword.trim()} className="flex-1 py-3 font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-slate-300 rounded-2xl text-xs">Katıl</button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
