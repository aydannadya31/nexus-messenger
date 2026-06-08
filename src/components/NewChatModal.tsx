import React, { useEffect, useState, useRef } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, where, limit, orderBy, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { UserProfile, Chat } from '../types';
import { X, Search, UserPlus, Users, ArrowRight, Check, Globe, Filter, LogIn, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface NewChatModalProps {
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ onClose, onChatCreated }) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Group state
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserProfile[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupPassword, setGroupPassword] = useState('');
  const [step, setStep] = useState(1); // 1: Select users, 2: Name group
  const [countryFilter, setCountryFilter] = useState('');

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

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        // Fetch all users (limited), then filter client-side
        const q = query(
          collection(db, 'users'),
          ...(search && search.length >= 2
            ? [
                where('uin', '>=', search.toUpperCase()),
                where('uin', '<=', search.toUpperCase() + '\uf8ff'),
              ]
            : [limit(30)])
        );

        const snapshot = await getDocs(q);
        const fetchedUsers = snapshot.docs
          .map(d => d.data() as UserProfile)
          .filter(u => u.uid !== user?.uid);
        
        // Client-side text filter for non-UIN searches
        if (!/^\d+$/.test(search)) {
          setUsers(fetchedUsers.filter(u => 
            u.displayName.toLowerCase().includes(search.toLowerCase()) || 
            u.email.toLowerCase().includes(search.toLowerCase()) ||
            (u.uin || '').toLowerCase().includes(search.toLowerCase())
          ));
        } else {
          setUsers(fetchedUsers);
        }
      } catch (error) {
        console.error("Fetch users error:", error);
      } finally {
        setLoading(false);
      }
    };
    
    const timeout = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timeout);
  }, [user, search]);

  const toggleUserSelection = (u: UserProfile) => {
    if (selectedUsers.find(sel => sel.uid === u.uid)) {
      setSelectedUsers(selectedUsers.filter(sel => sel.uid !== u.uid));
    } else {
      setSelectedUsers([...selectedUsers, u]);
    }
  };

  const startPrivateChat = async (otherUser: UserProfile) => {
    if (!user) return;

    // Check if already friends (either direction)
    const friendsRef = collection(db, 'friendRequests');
    const approvedQ1 = query(friendsRef, 
      where('from', '==', user.uid),
      where('to', '==', otherUser.uid),
      where('status', '==', 'approved')
    );
    const approvedQ2 = query(friendsRef, 
      where('from', '==', otherUser.uid),
      where('to', '==', user.uid),
      where('status', '==', 'approved')
    );
    const [approvedSnap1, approvedSnap2] = await Promise.all([getDocs(approvedQ1), getDocs(approvedQ2)]);
    if (!approvedSnap1.empty || !approvedSnap2.empty) {
      // Friend approved - check existing chat
      const chatsRef = collection(db, 'chats');
      const q = query(chatsRef, 
        where('participants', 'array-contains', user.uid),
        where('type', '==', 'private')
      );
      const snapshot = await getDocs(q);
      
      let existingChatId = null;
      snapshot.forEach(d => {
        const data = d.data();
        if (data.participants.includes(otherUser.uid)) {
          existingChatId = d.id;
        }
      });

      if (existingChatId) {
        onChatCreated(existingChatId);
        onClose();
        return;
      }

      const newChatRef = await addDoc(chatsRef, {
        participants: [user.uid, otherUser.uid],
        type: 'private',
        updatedAt: serverTimestamp(),
        lastMessage: null
      });
      
      onChatCreated(newChatRef.id);
      onClose();
      return;
    }

    // Check if request already pending (either direction)
    const pendingQ1 = query(friendsRef, 
      where('from', '==', user.uid),
      where('to', '==', otherUser.uid),
      where('status', '==', 'pending')
    );
    const pendingQ2 = query(friendsRef, 
      where('from', '==', otherUser.uid),
      where('to', '==', user.uid),
      where('status', '==', 'pending')
    );
    const [pendingSnap1, pendingSnap2] = await Promise.all([getDocs(pendingQ1), getDocs(pendingQ2)]);
    if (!pendingSnap1.empty) {
      alert('Bu kullanıcıya zaten arkadaşlık isteği gönderdiniz.');
      return;
    }
    if (!pendingSnap2.empty) {
      alert('Bu kullanıcıdan zaten arkadaşlık isteği var. Lütfen istekleri kontrol edin.');
      return;
    }

    // Send friend request
    await addDoc(friendsRef, {
      from: user.uid,
      to: otherUser.uid,
      fromName: user.displayName || user.email,
      toName: otherUser.displayName || otherUser.email,
      fromPhoto: user.photoURL || '',
      toPhoto: otherUser.photoURL || '',
      status: 'pending',
      timestamp: serverTimestamp()
    });

    alert('Arkadaşlık isteği gönderildi! Onay bekleniyor.');
  };

  const createGroup = async () => {
    if (!user || !groupName.trim() || selectedUsers.length === 0) return;

    const participants = [user.uid, ...selectedUsers.map(u => u.uid)];
    
    const newChatRef = await addDoc(collection(db, 'chats'), {
      participants,
      type: 'group',
      groupMetadata: {
        name: groupName.trim(),
        createdBy: user.uid,
        adminId: user.uid,
        photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${groupName}`,
        ...(groupPassword.trim() ? { password: groupPassword.trim() } : {})
      },
      updatedAt: serverTimestamp(),
      lastMessage: null
    });

    onChatCreated(newChatRef.id);
    onClose();
  };

  // Group join state
  const [joinGroupMode, setJoinGroupMode] = useState(false);
  const [joinSearch, setJoinSearch] = useState('');
  const [foundGroups, setFoundGroups] = useState<Chat[]>([]);
  const [groupSearchLoading, setGroupSearchLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Chat | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [joinStep, setJoinStep] = useState(1); // 1: search, 2: enter password

  const searchGroups = async (name: string) => {
    if (!name.trim()) { setFoundGroups([]); return; }
    setGroupSearchLoading(true);
    try {
      const q = query(
        collection(db, 'chats'),
        where('type', '==', 'group')
      );
      const snap = await getDocs(q);
      const groups = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Chat))
        .filter(g => 
          g.groupMetadata?.name?.toLowerCase().includes(name.toLowerCase()) &&
          !g.participants.includes(user!.uid)
        );
      setFoundGroups(groups);
    } catch (err) {
      console.error("Group search error:", err);
    } finally {
      setGroupSearchLoading(false);
    }
  };

  const requestJoinGroup = async (group: Chat) => {
    if (!user) return;
    if (group.groupMetadata?.password) {
      // Has password, show password step
      setSelectedGroup(group);
      setJoinStep(2);
      return;
    }
    // No password - send join request to admin
    const adminId = group.groupMetadata?.adminId || group.groupMetadata?.createdBy;
    if (!adminId) return;
    await addDoc(collection(db, 'groupJoinRequests'), {
      chatId: group.id,
      chatName: group.groupMetadata?.name || '',
      from: user.uid,
      fromName: user.displayName || user.email,
      status: 'pending',
      timestamp: serverTimestamp()
    });
    alert('Gruba katılma isteği yöneticiye gönderildi!');
    setJoinGroupMode(false);
    onClose();
  };

  const joinWithPassword = async () => {
    if (!user || !selectedGroup) return;
    const storedPassword = selectedGroup.groupMetadata?.password;
    if (joinPassword.trim() === storedPassword) {
      // Correct password - add user to participants
      await updateDoc(doc(db, 'chats', selectedGroup.id), {
        participants: arrayUnion(user.uid)
      });
      alert('Gruba başarıyla katıldınız!');
      onChatCreated(selectedGroup.id);
      onClose();
    } else {
      alert('Hatalı şifre!');
    }
  };

  // We no longer need filteredUsers since state 'users' is already filtered in useEffect
  const displayUsers = countryFilter 
    ? users.filter(u => u.country === countryFilter)
    : users;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {isGroupMode ? (step === 1 ? 'Grup Üyeleri Seç' : 'Grup Bilgileri') : 'Kullanıcı Listesi'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                {!isGroupMode && !joinGroupMode && (
                  <>
                  <button 
                    onClick={() => setIsGroupMode(true)}
                    className="w-full flex items-center gap-4 p-4 mb-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-colors font-bold shadow-sm"
                  >
                    <div className="p-2 bg-blue-600 text-white rounded-xl">
                      <Users size={20} />
                    </div>
                    Yeni Grup Sohbeti
                  </button>
                  <button 
                    onClick={() => setJoinGroupMode(true)}
                    className="w-full flex items-center gap-4 p-4 mb-6 bg-green-50 text-green-600 rounded-2xl hover:bg-green-100 transition-colors font-bold shadow-sm"
                  >
                    <div className="p-2 bg-green-600 text-white rounded-xl">
                      <LogIn size={20} />
                    </div>
                    Gruba Katıl
                  </button>
                  </>
                )}
                {joinGroupMode && joinStep === 1 && (
                  <div>
                    <button 
                      onClick={() => { setJoinGroupMode(false); setFoundGroups([]); setJoinPassword(''); }}
                      className="text-xs font-bold text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1"
                    >
                      <ArrowRight size={14} className="rotate-180" /> Geri
                    </button>
                    <div className="relative mb-4">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        value={joinSearch}
                        onChange={(e) => { setJoinSearch(e.target.value); searchGroups(e.target.value); }}
                        placeholder="Grup adı ile ara..." 
                        className="w-full bg-slate-100 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                      {groupSearchLoading ? (
                        <div className="text-center py-12">
                          <div className="w-8 h-8 border-3 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Aranıyor</p>
                        </div>
                      ) : foundGroups.length > 0 ? (
                        foundGroups.map(g => (
                          <div 
                            key={g.id}
                            onClick={() => requestJoinGroup(g)}
                            className="flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border hover:bg-slate-50 border-transparent hover:border-slate-100 group"
                          >
                            <div className="p-3 bg-slate-100 rounded-xl">
                              <Users size={18} className="text-slate-500" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-bold text-slate-900">{g.groupMetadata?.name || 'İsimsiz Grup'}</p>
                              <p className="text-xs text-slate-500 font-medium">{g.participants?.length || 0} üye • {g.groupMetadata?.password ? '🔒 Şifreli' : '🔓 Açık'}</p>
                            </div>
                            <div className="p-2 bg-green-50 rounded-xl text-green-600 group-hover:bg-green-100 transition-all">
                              <LogIn size={18} />
                            </div>
                          </div>
                        ))
                      ) : joinSearch.trim() ? (
                        <div className="text-center py-12">
                          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Grup bulunamadı</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
                {joinGroupMode && joinStep === 2 && selectedGroup && (
                  <div>
                    <p className="text-sm font-bold text-slate-900 mb-2">{selectedGroup.groupMetadata?.name}</p>
                    <p className="text-xs text-amber-600 font-bold mb-4">Bu grup şifre korumalı. Katılmak için şifreyi girin.</p>
                    <input 
                      type="text"
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      placeholder="Grup şifresi..."
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-green-500 transition-all mb-4"
                      autoFocus
                    />
                    <div className="flex gap-3">
                      <button onClick={() => { setJoinStep(1); setJoinPassword(''); setSelectedGroup(null); }} className="flex-1 py-3 font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors text-xs">
                        İptal
                      </button>
                      <button onClick={joinWithPassword} disabled={!joinPassword.trim()} className="flex-1 py-3 font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-slate-300 rounded-2xl transition-all text-xs">
                        Katıl
                      </button>
                    </div>
                  </div>
                )}

                <div className="relative mb-4">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Kişi ara..." 
                    className="w-full bg-slate-100 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all outline-none"
                  />
                </div>

                  <div className="flex items-center gap-2 mb-4">
                    <div className="relative flex-1">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-2.5 pl-9 pr-3 text-xs font-bold text-slate-700 outline-none appearance-none cursor-pointer">
                        <option value="">Tüm Ülkeler</option>
                        {COUNTRIES.map(c => (
                          <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    {countryFilter && (
                      <button onClick={() => setCountryFilter('')} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Filtreyi Temizle">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div className="w-8 h-8 border-3 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Yükleniyor</p>
                    </div>
                  ) : displayUsers.length > 0 ? (
                    displayUsers.map(u => {
                      const isSelected = !!selectedUsers.find(sel => sel.uid === u.uid);
                      return (
                        <div 
                          key={u.uid}
                          onClick={() => isGroupMode ? toggleUserSelection(u) : startPrivateChat(u)}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border group",
                            isSelected ? "bg-blue-50 border-blue-200" : "hover:bg-slate-50 border-transparent hover:border-slate-100"
                          )}
                        >
                          <div className="relative">
                            <img src={u.photoURL} alt={u.displayName} className="w-12 h-12 rounded-full border-2 border-white shadow-sm" />
                            {isSelected && (
                              <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full border-2 border-white flex items-center justify-center">
                                <Check size={12} className="text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-900">{u.displayName}</p>
                              {u.uin && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black tracking-tighter">#{u.uin}</span>}
                            </div>
                            <p className="text-xs text-slate-500 font-medium">{u.email}</p>
                          </div>
                          {!isGroupMode && (
                            <div className="p-2 bg-slate-50 rounded-xl text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                              <UserPlus size={18} />
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Sonuç yok</p>
                    </div>
                  )}
                </div>

                {isGroupMode && (
                  <div className="mt-8 flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="text-sm font-bold text-slate-500">
                      {selectedUsers.length} kişi seçildi
                    </span>
                    <button 
                      disabled={selectedUsers.length === 0}
                      onClick={() => setStep(2)}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white p-3 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95"
                    >
                      <ArrowRight size={20} />
                    </button>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="flex flex-col items-center py-6">
                  <div className="w-24 h-24 bg-slate-100 rounded-[2rem] flex items-center justify-center mb-6 border-2 border-slate-200 shadow-sm text-slate-400">
                    <Users size={40} />
                  </div>
                  <input 
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Grup ismi girin..."
                    className="w-full text-center text-xl font-bold bg-transparent border-b-2 border-slate-200 focus:border-blue-500 transition-colors placeholder:text-slate-300 pb-2 outline-none mb-4"
                    autoFocus
                  />
                  <div className="w-full flex flex-wrap gap-2 justify-center py-4">
                    {selectedUsers.map(u => (
                      <span key={u.uid} className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 border border-slate-200">
                        {u.displayName}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      🔒 Grup Şifresi (opsiyonel)
                    </label>
                    <p className="text-[9px] text-amber-600 font-bold">Şifre girilirse sohbete sadece şifreyi bilenler katılabilir.</p>
                    <input 
                      type="text"
                      value={groupPassword}
                      onChange={(e) => setGroupPassword(e.target.value)}
                      placeholder="Şifre girilmezse herkes katılabilir"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-4 mt-8">
                  <button 
                    onClick={() => setStep(1)}
                    className="flex-1 py-4 font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors"
                  >
                    Geri
                  </button>
                  <button 
                    onClick={createGroup}
                    disabled={!groupName.trim()}
                    className="flex-1 py-4 font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-2xl shadow-xl shadow-blue-200 transition-all"
                  >
                    Grubu Oluştur
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
