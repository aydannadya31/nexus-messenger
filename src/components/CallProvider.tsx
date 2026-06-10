import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { Call } from '../types';

interface CallContextType {
  activeCall: Call | null;
  incomingCall: Call | null;
  callError: string | null;
  startCall: (chatId: string, participants: string[], type: 'private' | 'group', mediaType?: 'audio' | 'video') => Promise<void>;
  inviteToCall: (userIds: string[]) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  leaveCall: () => Promise<void>;
  endCall: () => Promise<void>;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const callStartTimeRef = useRef<number>(0);

  useEffect(() => {
    activeCallRef.current = activeCall;
    if (activeCall?.status === 'ongoing' && callStartTimeRef.current === 0) {
      callStartTimeRef.current = Date.now();
    }
    if (!activeCall) {
      callStartTimeRef.current = 0;
    }
  }, [activeCall]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', user.uid),
      where('status', 'in', ['calling', 'ongoing'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const calls = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Call));
        const currentActive = activeCallRef.current;

        const incoming = calls.find(c =>
          c.status === 'calling' &&
          c.callerId !== user.uid &&
          !c.activeParticipants?.includes(user.uid) &&
          !currentActive
        );
        setIncomingCall(incoming || null);

        if (currentActive) {
          const updated = calls.find(c => c.id === currentActive.id);
          if (updated) {
            if (updated.status === 'ended' || (updated.type === 'private' && updated.activeParticipants?.length < 2)) {
              setActiveCall(null);
            } else {
              setActiveCall(updated);
            }
          } else {
            setActiveCall(null);
          }
        } else {
          const myActive = calls.find(c =>
            c.activeParticipants?.includes(user.uid) &&
            (c.status === 'ongoing' || (c.callerId === user.uid && c.status === 'calling'))
          );
          if (myActive) setActiveCall(myActive);
        }
      } catch (err) {
        console.error("Call listener error:", err);
      }
    }, (err) => {
      console.error("Call listener failed:", err);
      setCallError('Arama sistemi hatası: ' + (err.message || 'Bağlantı kaybı'));
    });

    return () => unsubscribe();
  }, [user]);

  const postCallMessage = async (chatId: string, duration: number, callStatus: 'missed' | 'completed' | 'cancelled' | 'rejected' | 'answered') => {
    if (!user) return;
    try {
      const text = callStatus === 'completed'
        ? `📞 Görüşme ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
        : callStatus === 'missed' ? '📞 Cevapsız Arama'
        : callStatus === 'rejected' ? '❌ Gelen Arama Reddedildi'
        : callStatus === 'answered' ? '✅ Gelen Arama Yanıtlandı'
        : '📞 Çağrı iptal edildi';
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: user.uid, timestamp: serverTimestamp(), type: 'call',
        callDuration: callStatus === 'completed' ? duration : 0,
        callStatus, text, status: 'sent'
      });
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: { senderId: user.uid, senderName: user.displayName, text, timestamp: serverTimestamp() },
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Post call message error:", err);
    }
  };

  const startCall = async (chatId: string, participants: string[], type: 'private' | 'group', mediaType: 'audio' | 'video' = 'audio') => {
    if (!user) return;
    setCallError(null);

    try {
      const callData = {
        participants: [...participants],
        activeParticipants: [user.uid],
        chatId,
        callerId: user.uid,
        type,
        mediaType,
        status: type === 'group' ? 'ongoing' : 'calling',
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'calls'), callData);
      // Set active call immediately instead of waiting for listener
      setActiveCall({ id: docRef.id, ...callData, createdAt: serverTimestamp() } as Call);
    } catch (error: any) {
      console.error("Start call error:", error);
      if (error?.code === 'permission-denied') {
        setCallError('Arama başlatılamadı: Firestore güvenlik kuralları henüz yayınlanmamış.');
      } else {
        setCallError('Arama başlatılamadı: ' + (error?.message || 'Bilinmeyen hata'));
      }
    }
  };

  const inviteToCall = async (userIds: string[]) => {
    if (!activeCall || !user) return;
    try {
      const newParticipants = Array.from(new Set([...activeCall.participants, ...userIds]));
      await updateDoc(doc(db, 'calls', activeCall.id), {
        participants: newParticipants
      });
    } catch (error) {
      console.error("Invite to call error:", error);
    }
  };

  const acceptCall = async () => {
    if (!incomingCall || !user) return;
    try {
      const activeParts = Array.from(new Set([...(incomingCall.activeParticipants || []), user.uid]));
      await updateDoc(doc(db, 'calls', incomingCall.id), {
        status: 'ongoing',
        activeParticipants: activeParts
      });
      await postCallMessage(incomingCall.chatId, 0, 'answered');
      setIncomingCall(null);
    } catch (error) {
      console.error("Accept call error:", error);
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    try {
      if (incomingCall.type === 'private') {
        await updateDoc(doc(db, 'calls', incomingCall.id), {
          status: 'ended'
        });
        await postCallMessage(incomingCall.chatId, 0, 'rejected');
      }
      setIncomingCall(null);
    } catch (error) {
      console.error("Reject call error:", error);
    }
  };

  const leaveCall = async () => {
    if (!activeCall || !user) return;
    try {
      const duration = callStartTimeRef.current > 0
        ? Math.floor((Date.now() - callStartTimeRef.current) / 1000)
        : 0;
      const activeParts = (activeCall.activeParticipants || []).filter(id => id !== user.uid);
      const updates: any = { activeParticipants: activeParts };

      if (activeCall.type === 'private' || activeParts.length === 0) {
        updates.status = 'ended';
      }

      await updateDoc(doc(db, 'calls', activeCall.id), updates);

      if (updates.status === 'ended') {
        await postCallMessage(activeCall.chatId, duration, duration > 0 ? 'completed' : 'cancelled');
      }

      setActiveCall(null);
    } catch (error) {
      console.error("Leave call error:", error);
    }
  };

  const endCall = async () => {
    const callToEnd = activeCall || incomingCall;
    if (!callToEnd) return;
    try {
      const duration = callStartTimeRef.current > 0
        ? Math.floor((Date.now() - callStartTimeRef.current) / 1000)
        : 0;

      await updateDoc(doc(db, 'calls', callToEnd.id), {
        status: 'ended'
      });

      if (callToEnd.status === 'ongoing' || callToEnd.status === 'calling') {
        const callStatus = callToEnd.status === 'ongoing' ? 'completed' : 'cancelled';
        await postCallMessage(callToEnd.chatId, duration, callStatus);
      }

      setActiveCall(null);
      setIncomingCall(null);
    } catch (error) {
      console.error("End call error:", error);
    }
  };

  return (
    <CallContext.Provider value={{ activeCall, incomingCall, callError, startCall, inviteToCall, acceptCall, rejectCall, leaveCall, endCall }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
