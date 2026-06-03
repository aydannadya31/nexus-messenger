import React, { useEffect, useState, useRef } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { UserProfile } from '../types';
import { X, Search, UserPlus, Users, ArrowRight, Check } from 'lucide-react';
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
  const [step, setStep] = useState(1); // 1: Select users, 2: Name group

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        let q;
        if (search && search.length >= 2) {
          // If searching by UIN or Prefix (ICQ style)
          const searchTerm = search.toUpperCase();
          q = query(
            collection(db, 'users'), 
            where('uin', '>=', searchTerm),
            where('uin', '<=', searchTerm + '\uf8ff'),
            where('uid', '!=', user?.uid || '')
          );
        } else {
          // Default fetch (limited for performance)
          q = query(
            collection(db, 'users'), 
            where('uid', '!=', user?.uid || ''),
            limit(20)
          );
        }
        
        const snapshot = await getDocs(q);
        const fetchedUsers = snapshot.docs.map(d => d.data() as UserProfile);
        
        // If not numeric search, we still do local filtering for text
        if (!/^\d+$/.test(search)) {
          setUsers(fetchedUsers.filter(u => 
            u.displayName.toLowerCase().includes(search.toLowerCase()) || 
            u.email.toLowerCase().includes(search.toLowerCase())
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

    // Check if chat already exists
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

    // Create new chat
    const newChatRef = await addDoc(chatsRef, {
      participants: [user.uid, otherUser.uid],
      type: 'private',
      updatedAt: serverTimestamp(),
      lastMessage: null
    });
    
    onChatCreated(newChatRef.id);
    onClose();
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
        photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${groupName}`
      },
      updatedAt: serverTimestamp(),
      lastMessage: null
    });

    onChatCreated(newChatRef.id);
    onClose();
  };

  // We no longer need filteredUsers since state 'users' is already filtered in useEffect
  const displayUsers = users;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {isGroupMode ? (step === 1 ? 'Grup Üyeleri Seç' : 'Grup Bilgileri') : 'Yeni Sohbet'}
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
                {!isGroupMode && (
                  <button 
                    onClick={() => setIsGroupMode(true)}
                    className="w-full flex items-center gap-4 p-4 mb-6 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-colors font-bold shadow-sm"
                  >
                    <div className="p-2 bg-blue-600 text-white rounded-xl">
                      <Users size={20} />
                    </div>
                    Yeni Grup Sohbeti
                  </button>
                )}

                <div className="relative mb-6">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Kişi ara..." 
                    className="w-full bg-slate-100 border-none rounded-2xl py-3.5 pl-12 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all outline-none"
                  />
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
