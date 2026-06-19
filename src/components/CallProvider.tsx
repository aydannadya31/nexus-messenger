import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { Call } from '../types';

interface CallContextType {
  activeCall: Call | null;
  incomingCall: Call | null;
  startCall: (chatId: string, participants: string[], type: 'private' | 'group', mediaType: 'audio' | 'video') => Promise<void>;
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

  // Refs for stable access inside snapshot listener (avoids re-subscribing)
  const activeCallRef = useRef<Call | null>(null);
  const incomingCallRef = useRef<Call | null>(null);
  const callAnsweredAtRef = useRef<Record<string, number>>({});
  const writtenMessagesRef = useRef<Set<string>>(new Set());
  const userRef = useRef(user);
  userRef.current = user;

  // Keep refs in sync with state
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);

  const writeCallHistory = useCallback(async (
    callId: string,
    chatId: string,
    mediaType: 'audio' | 'video',
    callStatus: 'completed' | 'missed' | 'rejected',
    callerId: string
  ) => {
    const currentUser = userRef.current;
    if (!currentUser || writtenMessagesRef.current.has(callId)) return;
    writtenMessagesRef.current.add(callId);

    const duration = callStatus === 'completed' && callAnsweredAtRef.current[callId]
      ? Math.floor((Date.now() - callAnsweredAtRef.current[callId]) / 1000)
      : 0;

    try {
      const mediaTypeName = mediaType === 'video' ? 'Görüntülü' : 'Sesli';
      const statusText = callStatus === 'completed'
        ? `Görüşme ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
        : callStatus === 'missed' ? 'Cevaplanmadı' : 'Reddedildi';

      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: currentUser.uid,
        timestamp: serverTimestamp(),
        type: 'call',
        callType: mediaType,
        callStatus,
        callDuration: duration,
        callerId,
        status: 'sent',
      });

      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: `${mediaTypeName} Arama - ${statusText}`,
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          timestamp: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Write call history error:", e);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', user.uid),
      where('status', 'in', ['calling', 'ongoing'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const calls = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Call));
      const curActive = activeCallRef.current;
      const curIncoming = incomingCallRef.current;
      const curUser = userRef.current;
      if (!curUser) return;

      // Track answered time
      calls.forEach(c => {
        if (c.status === 'ongoing' && c.activeParticipants?.includes(curUser.uid)) {
          if (!callAnsweredAtRef.current[c.id]) {
            callAnsweredAtRef.current[c.id] = Date.now();
          }
        }
      });

      // Detect call ended (removed from query results = status no longer calling/ongoing)
      const myActiveStillExists = curActive && calls.some(c => c.id === curActive.id);
      const myIncomingStillExists = curIncoming && calls.some(c => c.id === curIncoming.id);

      if (curActive && !myActiveStillExists) {
        const wasAnswered = !!callAnsweredAtRef.current[curActive.id];
        writeCallHistory(
          curActive.id, curActive.chatId, curActive.mediaType,
          wasAnswered ? 'completed' : 'missed', curActive.callerId
        );
        setActiveCall(null);
        // Cleanup answered time tracking
        delete callAnsweredAtRef.current[curActive.id];
      }

      if (curIncoming && !myIncomingStillExists) {
        writeCallHistory(
          curIncoming.id, curIncoming.chatId, curIncoming.mediaType,
          'missed', curIncoming.callerId
        );
        setIncomingCall(null);
      }

      // Handle incoming call detection
      const incoming = calls.find(c =>
        c.status === 'calling' &&
        c.callerId !== curUser.uid &&
        !c.activeParticipants?.includes(curUser.uid) &&
        !activeCallRef.current
      );
      setIncomingCall(incoming || null);

      // Handle active call update
      if (curActive) {
        const updated = calls.find(c => c.id === curActive.id);
        if (updated) {
          setActiveCall(updated);
          if (updated.status === 'ongoing' && updated.activeParticipants?.includes(curUser.uid)) {
            if (!callAnsweredAtRef.current[updated.id]) {
              callAnsweredAtRef.current[updated.id] = Date.now();
            }
          }
        }
      } else {
        const myActive = calls.find(c => c.activeParticipants?.includes(curUser.uid));
        if (myActive) setActiveCall(myActive);
      }
    });

    return () => unsubscribe();
  }, [user, writeCallHistory]);

  const startCall = async (chatId: string, participants: string[], type: 'private' | 'group', mediaType: 'audio' | 'video' = 'video') => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'calls'), {
        participants: [...participants],
        activeParticipants: [user.uid],
        chatId,
        callerId: user.uid,
        type,
        mediaType,
        status: type === 'group' ? 'ongoing' : 'calling',
        createdAt: serverTimestamp(),
      });
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
      if (incomingCall.type === 'private') {
        await updateDoc(doc(db, 'calls', incomingCall.id), {
          status: 'ended'
        });
      }
      // Write 'rejected' history before listener fires (dedup set prevents double-write)
      await writeCallHistory(
        incomingCall.id, incomingCall.chatId, incomingCall.mediaType,
        'rejected', incomingCall.callerId
      );
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

      if (activeParts.length === 0) {
        updates.status = 'ended';
      }

      await updateDoc(doc(db, 'calls', activeCall.id), updates);

      await writeCallHistory(
        activeCall.id, activeCall.chatId, activeCall.mediaType,
        'completed', activeCall.callerId
      );

      setActiveCall(null);
    } catch (error) {
      console.error("Leave call error:", error);
    }
  };

  const endCall = async () => {
    const callToEnd = activeCall || incomingCall;
    if (!callToEnd || !user) return;
    try {
      await updateDoc(doc(db, 'calls', callToEnd.id), {
        status: 'ended'
      });

      await writeCallHistory(
        callToEnd.id, callToEnd.chatId, callToEnd.mediaType,
        activeCall ? 'completed' : 'missed', callToEnd.callerId
      );

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
