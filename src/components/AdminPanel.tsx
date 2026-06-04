import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, getDoc, where, orderBy, deleteDoc, updateDoc, Timestamp, serverTimestamp, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Message, Chat } from '../types';
import { X, Search, Shield, UserX, UserCheck, Trash2, Clock, MessageSquare, Ban, Bot, Shield as ShieldIcon, ShieldOff, Globe, Brain } from 'lucide-react';
import { AISettings, getAISettings, updateAISettings, subscribeAISettings } from '../lib/adminSettings';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

const ADMIN_PASSWORD = 'Ag1453ag!';

interface AdminPanelProps {
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
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

  // Tab: users, admin-msgs, ai
  const [tab, setTab] = useState<'users' | 'admin-msgs' | 'ai'>('users');
  const [aiSettings, setAiSettings] = useState<AISettings>({ enabled: true, ethicsFilter: true });
  const [aiSettingsLoading, setAiSettingsLoading] = useState(true);

  useEffect(() => {
    if (step !== 'panel' || tab !== 'ai') return;
    setAiSettingsLoading(true);
    const unsub = subscribeAISettings((s) => {
      setAiSettings(s);
      setAiSettingsLoading(false);
    });
    return () => unsub();
  }, [step, tab]);
  const [adminMessages, setAdminMessages] = useState<{ id: string; message: string; userId: string; userDisplayName: string; userNickname?: string; userUIN?: string; timestamp: any }[]>([]);

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

  const loadUserMessages = async (u: UserProfile) => {
    setSelectedUser(u);
    setUserMessages([]);

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
    }

    allMessages.sort((a, b) => {
      const ta = a.msg.timestamp?.toMillis?.() || 0;
      const tb = b.msg.timestamp?.toMillis?.() || 0;
      return tb - ta;
    });

    setUserMessages(allMessages.slice(0, 200));
    setUserChats(chatNames);
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
                        onClick={() => updateAISettings({ enabled: !aiSettings.enabled })}
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

                  {/* Ethics Filter Toggle */}
                  <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          aiSettings.ethicsFilter ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                        )}>
                          {aiSettings.ethicsFilter ? <ShieldIcon size={20} /> : <ShieldOff size={20} />}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">Etik Filtreleme</h3>
                          <p className="text-[10px] text-slate-400 font-bold">
                            {aiSettings.ethicsFilter
                              ? 'Açık - AI etik kurallara uygun yanıt üretir'
                              : 'Kapalı - AI her konuda yanıt verebilir (admin izni ile)'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => updateAISettings({ ethicsFilter: !aiSettings.ethicsFilter })}
                        className={cn(
                          "relative w-14 h-7 rounded-full transition-all duration-300",
                          aiSettings.ethicsFilter ? "bg-emerald-500" : "bg-amber-500"
                        )}
                      >
                        <div className={cn(
                          "absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300",
                          aiSettings.ethicsFilter ? "left-7" : "left-0.5"
                        )} />
                      </button>
                    </div>
                    {!aiSettings.ethicsFilter && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mt-2">
                        <p className="text-xs font-bold text-amber-400 flex items-center gap-2">
                          <ShieldOff size={14} />
                          DİKKAT: Etik filtreleme kapalı. AI, admin tarafından belirlenen şekilde kısıtlama olmadan yanıt verecek.
                        </p>
                      </div>
                    )}
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
                      <p>• Etik değerler admin kontrolünde açılıp kapatılabilir</p>
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
      </div>
    </div>
  );
};
