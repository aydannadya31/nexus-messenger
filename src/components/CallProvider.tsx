import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { Call } from '../types';

interface CallContextType {
  activeCall: Call | null;
  incomingCall: Call | null;
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
  const activeCallRef = useRef<Call | null>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
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
            if (updated.status === 'ended' || (updated.type === 'private' && updated.activeParticipants?.length === 0)) {
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
    });

    return () => unsubscribe();
  }, [user]);

  const startCall = async (chatId: string, participants: string[], type: 'private' | 'group', mediaType: 'audio' | 'video' = 'audio') => {
    if (!user) return;
    
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
      
      await addDoc(collection(db, 'calls'), callData);
    } catch (error) {
      console.error("Start call error:", error);
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
      setIncomingCall(null);
    } catch (error) {
      console.error("Accept call error:", error);
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    try {
      // For private calls, if rejected, end the call
      if (incomingCall.type === 'private') {
        await updateDoc(doc(db, 'calls', incomingCall.id), {
          status: 'ended'
        });
      }
      setIncomingCall(null);
    } catch (error) {
      console.error("Reject call error:", error);
    }
  };

  const leaveCall = async () => {
    if (!activeCall || !user) return;
    try {
      const activeParts = (activeCall.activeParticipants || []).filter(id => id !== user.uid);
      const updates: any = { activeParticipants: activeParts };
      
      // If no one left, end it
      if (activeParts.length === 0) {
        updates.status = 'ended';
      }
      
      await updateDoc(doc(db, 'calls', activeCall.id), updates);
      setActiveCall(null);
    } catch (error) {
      console.error("Leave call error:", error);
    }
  };

  const endCall = async () => {
    const callToEnd = activeCall || incomingCall;
    if (!callToEnd) return;
    try {
      await updateDoc(doc(db, 'calls', callToEnd.id), {
        status: 'ended'
      });
      setActiveCall(null);
      setIncomingCall(null);
    } catch (error) {
      console.error("End call error:", error);
    }
  };

  return (
    <CallContext.Provider value={{ activeCall, incomingCall, startCall, inviteToCall, acceptCall, rejectCall, leaveCall, endCall }}>
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
