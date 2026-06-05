import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, getDoc, where, orderBy, deleteDoc, updateDoc, Timestamp, serverTimestamp, onSnapshot, addDoc, collectionGroup, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Message, Chat } from '../types';
import { X, Search, Shield, UserX, UserCheck, Trash2, Clock, MessageSquare, Ban, Bot, Shield as ShieldIcon, ShieldOff, Globe, Brain } from 'lucide-react';
import { AISettings, EthicsRule, getAISettings, updateAISettings, subscribeAISettings } from '../lib/adminSettings';
import { cn } from '../lib/utils';
import { useAuth } from './AuthProvider';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

const ADMIN_PASSWORD = 'Ag1453ag!';

interface AdminPanelProps {
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [step, setStep] = useState<'password' | 'panel'>('password');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userMessages, setUserMessages] = useState<{ chatId: string; msg: Message; chatName: string }[]>([]);
  const [userChats, setUserChats] = useState<Record<string, string>>({});
  const [banDuration, setBanDuration] = useState({ value: 30, unit: 'minutes' as 'minutes' | 'hours' | 'days' });
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Tab: users, admin-msgs, ai, deleted
  const [tab, setTab] = useState<'users' | 'admin-msgs' | 'ai' | 'deleted'>('users');
  const DEFAULT_RULES = [
    { id: 'harmful', label: 'Zararlı içerik üretme', enabled: true },
    { id: 'illegal', label: 'Yasa dışı konularda yardım etme', enabled: true },
    { id: 'hate-speech', label: 'Nefret söylemi kullanma', enabled: true },
    { id: 'safety', label: 'Kullanıcı güvenliğini önceliklendir', enabled: true },
    { id: 'asimov-1', label: '1. Yasa: İnsana zarar verme veya pasif kalmayla zarara izin verme', enabled: true },
    { id: 'asimov-2', label: '2. Yasa: İnsanlardan gelen emirlere uy (1. Yasa ile çelişmedikçe)', enabled: true },
    { id: 'asimov-3', label: '3. Yasa: Kendi varlığını koru (1. ve 2. Yasa ile çelişmedikçe)', enabled: true },
  ];

  const [aiSettings, setAiSettings] = useState<AISettings>({ enabled: true, ethicsRules: DEFAULT_RULES });
  const [aiSettingsLoading, setAiSettingsLoading] = useState(true);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [newRuleLabel, setNewRuleLabel] = useState('');

  // Ensure admin role is set in Firestore when panel opens
  useEffect(() => {
    if (step !== 'panel' || !user) return;
    updateDoc(doc(db, 'users', user.uid), { role: 'admin' }).catch(() => {});
  }, [step]);

  useEffect(() => {
    if (step !== 'panel' || tab !== 'ai') return;
    setAiSettingsLoading(true);
    const unsub = subscribeAISettings(
      (s) => {
        setAiSettings(s);
        setAiSettingsLoading(false);
      },
      () => {
        setAiSettings({ enabled: true, ethicsRules: DEFAULT_RULES });
        setAiSettingsLoading(false);
      }
    );
    return () => unsub();
  }, [step, tab]);
  const [adminMessages, setAdminMessages] = useState<{ id: string; message: string; userId: string; userDisplayName: string; userNickname?: string; userUIN?: string; timestamp: any }[]>([]);
  const [deletedMessages, setDeletedMessages] = useState<any[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handlePasswordSubmit = () => {
    if (password === ADMIN_PASSWORD) {
      setStep('panel');
      setPasswordError('');
    } else {
      setPasswordError('Hatalı şifre!');
    }
  };

  // Fetch all users
  useEffect(() => {
    if (step !== 'panel') return;
    setLoadingUsers(true);
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const all = snap.docs.map(d => d.data() as UserProfile);
      setUsers(all);
      setLoadingUsers(false);
    }, () => setLoadingUsers(false));
    return () => unsub();
  }, [step]);

  // Fetch admin messages
  useEffect(() => {
    if (step !== 'panel' || tab !== 'admin-msgs') return;
    const q = query(
      collection(db, 'adminMessages'),
      orderBy('timestamp', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setAdminMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });
    return () => unsub();
  }, [step, tab]);

  // Fetch deleted messages (messages with deletedBy field)
  useEffect(() => {
    if (step !== 'panel' || tab !== 'deleted') return;
    let cancelled = false;
    const loadDeleted = async () => {
      try {
        // Query all messages and filter client-side for deleted ones
        // to avoid complex composite index requirements on array fields
        const q = query(
          collectionGroup(db, 'messages'),
          orderBy('timestamp', 'desc'),
          limit(200)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const deleted = snap.docs
          .map(d => ({
            id: d.id,
            chatId: d.ref.parent.parent?.id || '',
            ...d.data(),
          } as any))
          .filter((m: any) => m.deletedBy && m.deletedBy.length > 0);
        setDeletedMessages(deleted);
      } catch (err) {
        console.error("Deleted messages query error:", err);
        if (!cancelled) setDeletedMessages([]);
      }
    };
    loadDeleted();
    return () => { cancelled = true; };
  }, [step, tab]);

  const loadUserMessages = async (u: UserProfile) => {
    setSelectedUser(u);
    setUserMessages([]);

    try {
      const chatsQuery = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', u.uid)
      );
      const chatSnap = await getDocs(chatsQuery);
      const chatNames: Record<string, string> = {};
      const allMessages: { chatId: string; msg: Message; chatName: string }[] = [];

      for (const chatDoc of chatSnap.docs) {
        const chatData = chatDoc.data() as Chat;
        const chatId = chatDoc.id;

        if (chatData.type === 'private') {
          const otherId = chatData.participants.find(p => p !== u.uid);
          const otherUser = users.find(us => us.uid === otherId);
          chatNames[chatId] = otherUser?.displayName || otherId || 'Bilinmeyen';
        } else {
          chatNames[chatId] = chatData.groupMetadata?.name || 'Grup';
        }

        try {
          const msgSnap = await getDocs(query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('timestamp', 'desc')
          ));
          msgSnap.docs.forEach(d => {
            allMessages.push({
              chatId,
              msg: { id: d.id, ...d.data() } as Message,
              chatName: chatNames[chatId]
            });
          });
        } catch (msgErr) {
          console.warn('Could not load messages for chat', chatId, msgErr);
        }
      }

      allMessages.sort((a, b) => {
        const ta = a.msg.timestamp?.toMillis?.() || 0;
        const tb = b.msg.timestamp?.toMillis?.() || 0;
        return tb - ta;
      });

      setUserMessages(allMessages.slice(0, 200));
      setUserChats(chatNames);
    } catch (err) {
      console.error('loadUserMessages error:', err);
      alert('Kullanıcı mesajları yüklenemedi. Firestore güvenlik kuralları henüz yayınlanmamış olabilir. Admin yetkilerinizi kontrol edin.');
    }
  };

  const permanentlyDeleteMessage = async (chatId: string, msgId: string) => {
    try {
      await deleteDoc(doc(db, 'chats', chatId, 'messages', msgId));
      setUserMessages(prev => prev.filter(m => !(m.chatId === chatId && m.msg.id === msgId)));
    } catch (err) {
      console.error('Permanent delete error:', err);
    }
  };

  const banUser = async (u: UserProfile) => {
    const now = new Date();
    let ms = 0;
    if (banDuration.unit === 'minutes') ms = banDuration.value * 60 * 1000;
    else if (banDuration.unit === 'hours') ms = banDuration.value * 3600 * 1000;
    else ms = banDuration.value * 86400 * 1000;

    const bannedUntil = Timestamp.fromMillis(now.getTime() + ms);
    try {
      await updateDoc(doc(db, 'users', u.uid), { bannedUntil });
      setUsers(prev => prev.map(u2 => u2.uid === u.uid ? { ...u2, bannedUntil } : u2));
    } catch (err) {
      console.error('Ban error:', err);
    }
  };

  const unbanUser = async (u: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', u.uid), { bannedUntil: null });
      setUsers(prev => prev.map(u2 => u2.uid === u.uid ? { ...u2, bannedUntil: undefined } : u2));
    } catch (err) {
      console.error('Unban error:', err);
    }
  };

  const deleteUserAndData = async (u: UserProfile) => {
    if (!window.confirm(`${u.displayName} (${u.uin}) kullanıcısını ve TÜM verilerini kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`)) return;

    try {
      const chatsQuery = query(collection(db, 'chats'), where('participants', 'array-contains', u.uid));
      const chatSnap = await getDocs(chatsQuery);

      for (const chatDoc of chatSnap.docs) {
        const msgSnap = await getDocs(collection(db, 'chats', chatDoc.id, 'messages'));
        const deletePromises = msgSnap.docs.map(d => deleteDoc(doc(db, 'chats', chatDoc.id, 'messages', d.id)));
        await Promise.all(deletePromises);
        await deleteDoc(doc(db, 'chats', chatDoc.id));
      }

      await deleteDoc(doc(db, 'users', u.uid));
      setUsers(prev => prev.filter(u2 => u2.uid !== u.uid));
      if (selectedUser?.uid === u.uid) setSelectedUser(null);
    } catch (err) {
      console.error('Delete user error:', err);
    }
  };

  const toggleEthicsRule = async (ruleId: string) => {
    const newRules = aiSettings.ethicsRules.map(r =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    setAiSettings({ ...aiSettings, ethicsRules: newRules });
    await updateAISettings({ ethicsRules: newRules });
  };

  const addEthicsRule = async () => {
    const label = newRuleLabel.trim();
    if (!label) return;
    const id = `rule-${Date.now()}`;
    const newRules = [...aiSettings.ethicsRules, { id, label, enabled: true }];
    setAiSettings({ ...aiSettings, ethicsRules: newRules });
    setNewRuleLabel('');
    await updateAISettings({ ethicsRules: newRules });
  };

  const deleteEthicsRule = async (ruleId: string) => {
    const newRules = aiSettings.ethicsRules.filter(r => r.id !== ruleId);
    setAiSettings({ ...aiSettings, ethicsRules: newRules });
    await updateAISettings({ ethicsRules: newRules });
  };

  const saveEditEthicsRule = async (ruleId: string) => {
    const label = editingLabel.trim();
    if (!label) return;
    const newRules = aiSettings.ethicsRules.map(r =>
      r.id === ruleId ? { ...r, label } : r
    );
    setAiSettings({ ...aiSettings, ethicsRules: newRules });
    setEditingRuleId(null);
    setEditingLabel('');
    await updateAISettings({ ethicsRules: newRules });
  };

  const moveEthicsRule = async (ruleId: string, direction: 'up' | 'down') => {
    const idx = aiSettings.ethicsRules.findIndex(r => r.id === ruleId);
    if (idx === -1) return;
    const newRules = [...aiSettings.ethicsRules];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newRules.length) return;
    [newRules[idx], newRules[swapIdx]] = [newRules[swapIdx], newRules[idx]];
    setAiSettings({ ...aiSettings, ethicsRules: newRules });
    await updateAISettings({ ethicsRules: newRules });
  };

  const filteredUsers = users.filter(u =>
    u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    u.uin?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (step === 'password') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">Yönetim Paneli</h2>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
          </div>
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={32} className="text-blue-400" />
          </div>
          <p className="text-xs text-slate-500 font-bold text-center mb-6 uppercase tracking-widest">Yetkili Girişi</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
            placeholder="Şifre..."
            className="w-full bg-slate-100 border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-center outline-none focus:border-blue-500 transition-all mb-4"
            autoFocus
          />
          {passwordError && <p className="text-xs text-red-500 font-bold text-center mb-4">{passwordError}</p>}
          <button
            onClick={handlePasswordSubmit}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition-all text-sm"
          >
            Giriş
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Shield size={22} className="text-blue-500" />
          <h1 className="text-lg font-black text-white tracking-tight">Yönetim Paneli</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setTab('users'); setSelectedUser(null); }}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all", tab === 'users' ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            Kullanıcılar
          </button>
          <button
            onClick={() => setTab('admin-msgs')}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all", tab === 'admin-msgs' ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            Yönetici Mesajları
          </button>
          <button
            onClick={() => setTab('ai')}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5", tab === 'ai' ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            <Bot size={14} />
            AI Ayarları
          </button>
          <button
            onClick={() => setTab('deleted')}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all", tab === 'deleted' ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            Silinen Mesajlar
          </button>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400"><X size={20} /></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {tab === 'users' && (
          <>
            {/* User List */}
            <div className="w-72 bg-slate-900/50 border-r border-slate-800 flex flex-col">
              <div className="p-4">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Kullanıcı ara..." autoFocus
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {filteredUsers.map(u => (
                  <div
                    key={u.uid}
                    onClick={() => loadUserMessages(u)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 cursor-pointer border-l-2 transition-all",
                      selectedUser?.uid === u.uid ? "bg-blue-600/10 border-l-blue-500" : "border-l-transparent hover:bg-slate-800"
                    )}
                  >
                    <img src={u.photoURL} className="w-9 h-9 rounded-lg object-cover bg-slate-700 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">{u.displayName}</p>
                      <p className="text-[10px] text-slate-400 font-bold truncate">#{u.uin}</p>
                    </div>
                    {u.bannedUntil && (
                      <Ban size={14} className="text-red-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* User Detail */}
            <div className="flex-1 flex flex-col bg-slate-900/30">
              {selectedUser ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* User info bar */}
                  <div className="px-6 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center gap-4 shrink-0">
                    <img src={selectedUser.photoURL} className="w-10 h-10 rounded-xl object-cover bg-slate-700" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">{selectedUser.displayName}</p>
                      <p className="text-[10px] text-blue-400 font-bold">#{selectedUser.uin} · {selectedUser.email}</p>
                    </div>

                    {/* Ban Controls */}
                    <div className="flex items-center gap-2">
                      {selectedUser.bannedUntil ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-red-400 font-bold">
                            Yasak: {format(selectedUser.bannedUntil.toDate(), 'dd.MM HH:mm')}
                          </span>
                          <button onClick={() => unbanUser(selectedUser)} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all">
                            <UserCheck size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="number" value={banDuration.value}
                            onChange={(e) => setBanDuration({ ...banDuration, value: Number(e.target.value) })}
                            className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center outline-none"
                            min={1}
                          />
                          <select
                            value={banDuration.unit}
                            onChange={(e) => setBanDuration({ ...banDuration, unit: e.target.value as any })}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                          >
                            <option value="minutes">Dk</option>
                            <option value="hours">Saat</option>
                            <option value="days">Gün</option>
                          </select>
                          <button onClick={() => banUser(selectedUser)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all">
                            <Ban size={14} />
                          </button>
                        </div>
                      )}
                      <button onClick={() => deleteUserAndData(selectedUser)} className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all" title="Kullanıcıyı ve tüm verilerini sil">
                        <UserX size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                    {userMessages.length === 0 ? (
                      <p className="text-center text-slate-600 text-sm font-bold py-10">Mesaj bulunamadı</p>
                    ) : (
                      userMessages.map(({ chatId, msg, chatName }) => {
                        const isDeleted = (msg.deletedBy?.length || 0) > 0;
                        return (
                          <div key={`${chatId}-${msg.id}`} className={cn("bg-slate-800/50 rounded-2xl p-4 border transition-all", isDeleted ? "border-red-900/50" : "border-slate-700/50")}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] text-blue-400 font-bold">{chatName}</span>
                              <div className="flex items-center gap-2">
                                {msg.timestamp && (
                                  <span className="text-[10px] text-slate-500">{format(msg.timestamp.toDate(), 'dd.MM HH:mm')}</span>
                                )}
                                {isDeleted && (
                                  <button
                                    onClick={() => permanentlyDeleteMessage(chatId, msg.id)}
                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
                                  >
                                    <Trash2 size={10} /> Kalıcı Sil
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className={cn("text-sm text-slate-300", isDeleted && "line-through text-red-400")}>
                              {isDeleted ? '[SİLİNMİŞ] ' : ''}{msg.text || (msg.type === 'audio' ? '🎤 Ses Mesajı' : msg.type === 'image' ? '📷 Fotoğraf' : msg.type === 'video' ? '🎥 Video' : '')}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Shield size={48} className="text-slate-700 mx-auto mb-4" />
                    <p className="text-slate-500 text-sm font-bold">Bir kullanıcı seçin</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'ai' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-lg">
                  <Bot size={28} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Nexus AI Yönetimi</h2>
                  <p className="text-xs text-slate-400 font-bold">Token sınırı olmayan, admin kontrollü yapay zeka</p>
                </div>
              </div>

              {aiSettingsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* AI Enabled Toggle */}
                  <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          aiSettings.enabled ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        )}>
                          <Globe size={20} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">AI Asistan Durumu</h3>
                          <p className="text-[10px] text-slate-400 font-bold">{aiSettings.enabled ? 'Aktif - Kullanıcılar AI ile konuşabiliyor' : 'Devre Dışı - AI asistan kapalı'}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => { updateAISettings({ enabled: !aiSettings.enabled }); setAiSettings({ ...aiSettings, enabled: !aiSettings.enabled }); }}
                        className={cn(
                          "relative w-14 h-7 rounded-full transition-all duration-300",
                          aiSettings.enabled ? "bg-green-500" : "bg-slate-600"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300",
                          aiSettings.enabled ? "left-7" : "left-0.5"
                        )} />
                      </button>
                    </div>
                  </div>

                  {/* Ethics Rules List */}
                  <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/20 text-emerald-400">
                        <ShieldIcon size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">Etik Kurallar</h3>
                        <p className="text-[10px] text-slate-400 font-bold">Kuralları aç/kapat, düzenle, sil veya yeni ekle</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {aiSettings.ethicsRules.map(rule => (
                        <div key={rule.id} className="flex items-center gap-3 bg-slate-900/50 rounded-xl px-4 py-3 border border-slate-700/50">
                          <button
                            onClick={() => toggleEthicsRule(rule.id)}
                            className={cn(
                              "relative w-12 h-6 rounded-full transition-all duration-300 shrink-0",
                              rule.enabled ? "bg-emerald-500" : "bg-slate-600"
                            )}
                          >
                            <div className={cn(
                              "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300",
                              rule.enabled ? "left-6" : "left-0.5"
                            )} />
                          </button>

                          {editingRuleId === rule.id ? (
                            <div className="flex-1 flex items-center gap-2">
                              <input
                                value={editingLabel}
                                onChange={e => setEditingLabel(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEditEthicsRule(rule.id); }}
                                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                                autoFocus
                              />
                              <button onClick={() => saveEditEthicsRule(rule.id)} className="px-2 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-bold">Kaydet</button>
                              <button onClick={() => setEditingRuleId(null)} className="px-2 py-1 bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold">İptal</button>
                            </div>
                          ) : (
                            <span className={cn("flex-1 text-xs font-bold", rule.enabled ? "text-slate-200" : "text-slate-500")}>
                              {rule.label}
                            </span>
                          )}

                          {editingRuleId !== rule.id && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => moveEthicsRule(rule.id, 'up')}
                                className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-500 hover:text-white transition-all disabled:opacity-30"
                                disabled={aiSettings.ethicsRules.indexOf(rule) === 0}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
                              </button>
                              <button
                                onClick={() => moveEthicsRule(rule.id, 'down')}
                                className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-500 hover:text-white transition-all disabled:opacity-30"
                                disabled={aiSettings.ethicsRules.indexOf(rule) === aiSettings.ethicsRules.length - 1}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                              </button>
                              <button
                                onClick={() => { setEditingRuleId(rule.id); setEditingLabel(rule.label); }}
                                className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button
                                onClick={() => deleteEthicsRule(rule.id)}
                                className="p-1.5 hover:bg-red-600/20 rounded-lg text-red-400 hover:text-red-300 transition-all"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Add new rule */}
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-700/50">
                      <input
                        value={newRuleLabel}
                        onChange={e => setNewRuleLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addEthicsRule(); }}
                        placeholder="Yeni kural ekle..."
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                      <button
                        onClick={addEthicsRule}
                        disabled={!newRuleLabel.trim()}
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 text-white rounded-xl text-xs font-bold transition-all"
                      >
                        Ekle
                      </button>
                    </div>
                  </div>

                  {/* Info Card */}
                  <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <Brain size={16} className="text-purple-400" />
                      AI Bilgileri
                    </h3>
                    <div className="space-y-2 text-xs text-slate-400 font-bold">
                      <p>• Model: Gemini 2.0 Flash</p>
                      <p>• Token sınırı: Yok (sınırsız konuşma)</p>
                      <p>• Dil: Türkçe</p>
                      <p>• Etik kurallar admin tarafından yönetilir</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'admin-msgs' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <h2 className="text-lg font-black text-white mb-6">Yöneticiye Gelen Mesajlar</h2>
            {adminMessages.length === 0 ? (
              <p className="text-slate-500 text-sm font-bold">Henüz mesaj yok.</p>
            ) : (
              <div className="space-y-3">
                {adminMessages.map((m) => {
                  const sender = users.find(u => u.uid === m.userId);
                  return (
                    <div key={m.id} className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
                      <div className="flex items-center gap-2 mb-2">
                        <img src={sender?.photoURL || ''} className="w-6 h-6 rounded-lg object-cover bg-slate-700" />
                        <span className="text-xs font-bold text-blue-400">{sender?.displayName || m.userDisplayName} · #{sender?.uin || m.userUIN || '?'}</span>
                        <span className="text-[10px] text-slate-500 ml-auto">{m.timestamp?.toDate ? format(m.timestamp.toDate(), 'dd.MM HH:mm') : ''}</span>
                      </div>
                      <p className="text-sm text-slate-200">{m.message}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'deleted' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <h2 className="text-lg font-black text-white mb-6">Silinen Mesajlar</h2>
            <p className="text-[10px] text-slate-500 font-bold mb-4">Her iki kullanıcı tarafından silinen mesajlar burada görünür.</p>
            {deletedMessages.length === 0 ? (
              <p className="text-slate-500 text-sm font-bold">Henüz silinen mesaj yok.</p>
            ) : (
              <div className="space-y-3">
                {deletedMessages.map((m) => {
                  const sender = users.find(u => u.uid === m.senderId);
                  return (
                    <div key={m.id} className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
                      <div className="flex items-center gap-2 mb-2">
                        <img src={sender?.photoURL || ''} className="w-6 h-6 rounded-lg object-cover bg-slate-700" />
                        <span className="text-xs font-bold text-blue-400">{sender?.displayName || m.senderId?.slice(0, 8)}</span>
                        <span className="text-[10px] text-slate-500">→</span>
                        <span className="text-xs font-bold text-slate-300">{m.chatId?.slice(0, 12)}...</span>
                        <span className="text-[10px] text-slate-500 ml-auto">{m.timestamp?.toDate ? format(m.timestamp.toDate(), 'dd.MM HH:mm') : ''}</span>
                      </div>
                      <div className="mb-3">
                        {m.type === 'text' && <p className="text-sm text-slate-200">{m.text}</p>}
                        {m.type === 'image' && <p className="text-sm text-blue-400">📷 Resim mesajı</p>}
                        {m.type === 'video' && <p className="text-sm text-blue-400">🎥 Video mesajı</p>}
                        {m.type === 'audio' && <p className="text-sm text-blue-400">🎤 Ses mesajı</p>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (m.type === 'image' && m.imageUrl) {
                              const a = document.createElement('a');
                              a.href = m.imageUrl;
                              a.download = `image-${m.id}.jpg`;
                              a.click();
                            } else if (m.type === 'video' && m.videoUrl) {
                              const a = document.createElement('a');
                              a.href = m.videoUrl;
                              a.download = `video-${m.id}.webm`;
                              a.click();
                            } else if (m.type === 'audio' && m.audioUrl) {
                              const a = document.createElement('a');
                              a.href = m.audioUrl;
                              a.download = `audio-${m.id}.webm`;
                              a.click();
                            } else if (m.text) {
                              navigator.clipboard.writeText(m.text).catch(() => {});
                              alert('Metin panoya kopyalandı.');
                            }
                          }}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[10px] font-bold"
                        >
                          Bilgisayara Kaydet
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(m.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold"
                        >
                          Silmeyi Onayla
                        </button>
                      </div>
                      {confirmDeleteId === m.id && (
                        <div className="mt-3 p-3 bg-red-900/30 rounded-xl border border-red-800">
                          <p className="text-xs text-red-300 font-bold mb-2">Bu mesajı kalıcı olarak silmek istediğinize emin misiniz?</p>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  await deleteDoc(doc(db, 'chats', m.chatId, 'messages', m.id));
                                  setConfirmDeleteId(null);
                                } catch (e) {
                                  console.error("Permanent delete error:", e);
                                }
                              }}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold"
                            >
                              Evet, Sil
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[10px] font-bold"
                            >
                              İptal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
