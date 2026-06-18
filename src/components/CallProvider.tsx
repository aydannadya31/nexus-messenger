import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { Call } from '../types';
import { CallEngineManager } from '../call-engines/CallEngineManager';
import { CallEngineOptions, CallSession } from '../call-engines/types';

/** Our Node.js server on Render.com */
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://nexus-messenger-rhad.onrender.com';

interface CallContextType {
  activeCall: Call | null;
  incomingCall: Call | null;
  callError: string | null;
  /** The active engine session (if connected) */
  session: CallSession | null;
  /** Which engine is currently being tried/used */
  currentEngine: string | null;
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
  const [session, setSession] = useState<CallSession | null>(null);
  const [currentEngine, setCurrentEngine] = useState<string | null>(null);

  const activeCallRef = useRef<Call | null>(null);
  const callStartTimeRef = useRef<number>(0);
  const engineRef = useRef<CallEngineManager | null>(null);
  const pendingRejectRef = useRef(false);

  // Lazy init engine manager
  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new CallEngineManager();
      engineRef.current.on((type, data) => {
        if (type === 'engine_change') setCurrentEngine(data);
        if (type === 'connected') setCurrentEngine(data);
        if (type === 'disconnected') setCurrentEngine(null);
        if (type === 'error') setCallError(data);
      });
    }
    return engineRef.current;
  }, []);

  useEffect(() => {
    if (activeCall?.status === 'ongoing' && callStartTimeRef.current === 0) {
      callStartTimeRef.current = Date.now();
    }
    if (!activeCall) {
      callStartTimeRef.current = 0;
    }
  }, [activeCall]);

  // Firestore listener for calls
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', user.uid),
      where('status', 'in', ['calling', 'ongoing'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        // Skip processing while a reject is in flight to prevent re-trigger loops
        if (pendingRejectRef.current) return;

        const calls = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Call));
        const currentActive = activeCallRef.current;

        // Incoming call detection
        const incoming = calls.find(c =>
          c.status === 'calling' &&
          c.callerId !== user.uid &&
          !c.activeParticipants?.includes(user.uid) &&
          !currentActive
        );
        setIncomingCall(incoming || null);

        // Active call tracking
        if (currentActive) {
          const updated = calls.find(c => c.id === currentActive.id);
          if (updated) {
            if (updated.status === 'ended' || (updated.type === 'private' && updated.activeParticipants?.length < 2)) {
              // Clean up engine session when call ends
              if (session) {
                session.end().catch(() => {});
                setSession(null);
              }
              getEngine().endCall();
              setActiveCall(null);
              callStartTimeRef.current = 0;
            } else {
              setActiveCall(updated);
            }
          } else {
            // Active call was removed from Firestore — clean up engine
            getEngine().endCall();
            setSession(null);
            setActiveCall(null);
            callStartTimeRef.current = 0;
          }
        } else {
          const myActive = calls.find(c =>
            c.activeParticipants?.includes(user.uid) &&
            (c.status === 'ongoing' || (c.callerId === user.uid && c.status === 'calling'))
          );
          if (myActive) {
            setActiveCall(myActive);
            // If we're the caller and the call is ongoing, try to connect engines
            if (myActive.callerId === user.uid && myActive.status === 'ongoing' && !engineRef.current?.session) {
              const opts: CallEngineOptions = {
                userId: user.uid,
                userDisplayName: user.displayName || undefined,
                serverUrl: SERVER_URL,
                roomId: myActive.roomId,
              };
              getEngine().startCall(myActive.id, opts).then(s => {
                if (s) setSession(s);
              });
            }
          }
        }
      } catch (err) {
        console.error("Call listener error:", err);
      }
    }, (err) => {
      console.error("Call listener failed:", err);
      setCallError('Arama sistemi hatas�' + (err.message || 'Bağlantı kaybı'));
    });

    return () => unsubscribe();
  }, [user, getEngine]);

  const postCallMessage = async (chatId: string, duration: number, callStatus: 'missed' | 'completed' | 'cancelled' | 'rejected' | 'answered') => {
    if (!user) return;
    try {
      const text = callStatus === 'completed'
        ? `Görüşme ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
        : callStatus === 'missed' ? 'Cevapsız Arama'
        : callStatus === 'rejected' ? 'Gelen Arama Reddedildi'
        : callStatus === 'answered' ? 'Gelen Arama Yanıtlandı'
        : 'Çağrı iptal edildi';
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
      const engine = getEngine();
      const roomId = `${chatId}_${Date.now()}`;
      const opts: CallEngineOptions = {
        userId: user.uid,
        userDisplayName: user.displayName || undefined,
        serverUrl: SERVER_URL,
        roomId,
      };

      const ses = await engine.startCall('', opts);
      if (ses) {
        setSession(ses);
        const engineName = engine.currentEngine || 'websocket';

        const callData = {
          participants: [...participants],
          activeParticipants: [user.uid],
          chatId,
          callerId: user.uid,
          type,
          mediaType,
          status: type === 'group' ? 'ongoing' : 'calling',
          createdAt: serverTimestamp(),
          engine: engineName,
          roomId,
        };

        const docRef = await addDoc(collection(db, 'calls'), callData);
        const newActive = { id: docRef.id, ...callData } as Call;
        activeCallRef.current = newActive;
        setActiveCall(newActive);
        return;
      }

      // Error already emitted via event with detailed failure info
      if (!callError) {
        setCallError('Tüm arama motorları başarısız oldu. Konsola bakın: F12');
      }
    } catch (error: any) {
      console.error("Start call error:", error);
      setCallError('Arama başlatılamadı: ' + (error?.message || 'Bilinmeyen hata'));
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
      setCallError(null);
      const callDoc = incomingCall;
      const engine = getEngine();
      const opts: CallEngineOptions = {
        userId: user.uid,
        userDisplayName: user.displayName || undefined,
        serverUrl: SERVER_URL,
        roomId: callDoc.roomId || callDoc.id,
      };

      const ses = await engine.joinCall(opts.roomId, callDoc.callerId, opts);
      if (!ses) {
        // Error already emitted via event with detailed failure info
        if (!callError) {
          setCallError('Tüm arama motorları başarısız oldu. Konsola bakın: F12');
        }
        return;
      }
      setSession(ses);

      // Update Firestore
      const activeParts = Array.from(new Set([...(incomingCall.activeParticipants || []), user.uid]));
      await updateDoc(doc(db, 'calls', incomingCall.id), {
        status: 'ongoing',
        activeParticipants: activeParts
      });
      await postCallMessage(incomingCall.chatId, 0, 'answered');
      const updatedCall = { ...incomingCall, status: 'ongoing' as const, activeParticipants: activeParts };
      activeCallRef.current = updatedCall;
      setActiveCall(updatedCall);
      setIncomingCall(null);
    } catch (error: any) {
      console.error("Accept call error:", error);
      setCallError('Arama kabul edilemedi: ' + (error?.message || 'Bilinmeyen hata'));
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    pendingRejectRef.current = true;
    try {
      // Immediately clear incoming so the listener won't re-process it
      setIncomingCall(null);
      if (incomingCall.type === 'private') {
        await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'ended' });
        await postCallMessage(incomingCall.chatId, 0, 'rejected');
      }
    } catch (error) {
      console.error("Reject call error:", error);
    } finally {
      // Small delay to let Firestore listener settle before allowing re-detection
      setTimeout(() => { pendingRejectRef.current = false; }, 1000);
    }
  };

  const leaveCall = async () => {
    if (!activeCall || !user) return;
    try {
      // End engine session
      if (session) {
        await session.end();
        setSession(null);
      }
      getEngine().endCall();

      const duration = callStartTimeRef.current > 0
        ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0;
      const activeParts = (activeCall.activeParticipants || []).filter(id => id !== user.uid);
      const updates: any = { activeParticipants: activeParts };
      if (activeCall.type === 'private' || activeParts.length === 0) {
        updates.status = 'ended';
      }
      activeCallRef.current = null;
      await updateDoc(doc(db, 'calls', activeCall.id), updates);
      if (updates.status === 'ended') {
        await postCallMessage(activeCall.chatId, duration, duration > 0 ? 'completed' : 'cancelled');
      }
      setActiveCall(null);
      callStartTimeRef.current = 0;
    } catch (error) {
      console.error("Leave call error:", error);
    }
  };

  const endCall = async () => {
    const callToEnd = activeCall || incomingCall;
    if (!callToEnd) return;
    try {
      if (session) {
        await session.end();
        setSession(null);
      }
      getEngine().endCall();

      activeCallRef.current = null;
      const duration = callStartTimeRef.current > 0
        ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0;
      callStartTimeRef.current = 0;
      await updateDoc(doc(db, 'calls', callToEnd.id), { status: 'ended' });
      if (callToEnd.status === 'ongoing' || callToEnd.status === 'calling') {
        await postCallMessage(callToEnd.chatId, duration, callToEnd.status === 'ongoing' ? 'completed' : 'cancelled');
      }
      setActiveCall(null);
      setIncomingCall(null);
    } catch (error) {
      console.error("End call error:", error);
    }
  };

  return (
    <CallContext.Provider value={{
      activeCall, incomingCall, callError,
      session, currentEngine,
      startCall, inviteToCall, acceptCall, rejectCall, leaveCall, endCall
    }}>
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
