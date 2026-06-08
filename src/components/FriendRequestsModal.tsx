import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, getDocs, updateDoc, doc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { X, Check, X as XIcon, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FriendRequest {
  id: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  fromPhoto: string;
  toPhoto: string;
  status: string;
  timestamp: any;
}

interface FriendRequestsModalProps {
  onClose: () => void;
}

const FriendRequestsModal: React.FC<FriendRequestsModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsubIncoming = onSnapshot(
      query(collection(db, 'friendRequests'), where('to', '==', user.uid)),
      (snap) => {
        setIncoming(snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest)).filter(r => r.status === 'pending'));
      }
    );
    const unsubOutgoing = onSnapshot(
      query(collection(db, 'friendRequests'), where('from', '==', user.uid)),
      (snap) => {
        setOutgoing(snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest)));
      }
    );
    return () => { unsubIncoming(); unsubOutgoing(); };
  }, [user]);

  const handleApprove = async (req: FriendRequest) => {
    if (!user) return;
    await updateDoc(doc(db, 'friendRequests', req.id), { status: 'approved' });
    const chatsRef = collection(db, 'chats');
    const q = query(chatsRef,
      where('participants', 'array-contains', user.uid),
      where('type', '==', 'private')
    );
    const snapshot = await getDocs(q);
    let existingChatId = null;
    snapshot.forEach(d => {
      const data = d.data();
      if (data.participants.includes(req.from)) {
        existingChatId = d.id;
      }
    });
    if (!existingChatId) {
      await addDoc(chatsRef, {
        participants: [user.uid, req.from],
        type: 'private',
        updatedAt: serverTimestamp(),
        lastMessage: null
      });
    }
  };

  const handleReject = async (req: FriendRequest) => {
    await updateDoc(doc(db, 'friendRequests', req.id), { status: 'rejected' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Arkadaşlık İstekleri</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
            <X size={22} />
          </button>
        </div>
        <div className="p-6 max-h-96 overflow-y-auto custom-scrollbar">
          {incoming.length === 0 && outgoing.length === 0 && (
            <div className="text-center py-12">
              <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <UserPlus size={28} className="text-slate-400" />
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Henüz istek yok</p>
            </div>
          )}
          {incoming.length > 0 && (
            <div className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Gelen İstekler</p>
              {incoming.map(req => (
                <div key={req.id} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 mb-2">
                  <img src={req.fromPhoto || `https://api.dicebear.com/7.x/initials/svg?seed=${req.fromName}`} alt={req.fromName} className="w-10 h-10 rounded-full" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">{req.fromName}</p>
                  </div>
                  <button onClick={() => handleApprove(req)} className="p-2 bg-green-100 text-green-600 rounded-xl hover:bg-green-200 transition-colors">
                    <Check size={18} />
                  </button>
                  <button onClick={() => handleReject(req)} className="p-2 bg-red-100 text-red-500 rounded-xl hover:bg-red-200 transition-colors">
                    <XIcon size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {outgoing.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Gönderilen İstekler</p>
              {outgoing.map(req => (
                <div key={req.id} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 mb-2">
                  <img src={req.toPhoto || `https://api.dicebear.com/7.x/initials/svg?seed=${req.toName}`} alt={req.toName} className="w-10 h-10 rounded-full" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900">{req.toName}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {req.status === 'pending' ? '⏳ Beklemede' : req.status === 'approved' ? '✅ Onaylandı' : '❌ Reddedildi'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default FriendRequestsModal;
