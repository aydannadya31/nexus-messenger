import React, { useEffect, useRef, useState } from 'react';
import { useCall } from './CallProvider';
import { useAuth } from './AuthProvider';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { X, Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';

export const CallOverlay = () => {
  const { activeCall, incomingCall, session, currentEngine, acceptCall, rejectCall, leaveCall, callError } = useCall();
  const { user } = useAuth();

  const [participantInfo, setParticipantInfo] = useState<Record<string, UserProfile>>({});
  const [callerInfo, setCallerInfo] = useState<UserProfile | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  // Incoming caller info
  useEffect(() => {
    if (incomingCall) {
      getDoc(doc(db, 'users', incomingCall.callerId)).then(snap => {
        if (snap.exists()) setCallerInfo(snap.data() as UserProfile);
      });
    }
  }, [incomingCall?.callerId]);

  // Participant info for active call
  useEffect(() => {
    if (activeCall) {
      activeCall.participants.forEach(async (pId) => {
        if (!participantInfo[pId]) {
          const d = await getDoc(doc(db, 'users', pId));
          if (d.exists()) {
            setParticipantInfo(prev => ({ ...prev, [pId]: d.data() as UserProfile }));
          }
        }
      });
    }
  }, [activeCall?.participants]);

  // Play ringtone for incoming call
  const ringtoneRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (incomingCall && !ringtoneRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ringtoneRef.current = ctx;
      const playRing = () => {
        if (!ringtoneRef.current) return;
        if (ringtoneRef.current.state === 'suspended') ringtoneRef.current.resume();
        const osc = ringtoneRef.current.createOscillator();
        const gain = ringtoneRef.current.createGain();
        osc.connect(gain);
        gain.connect(ringtoneRef.current.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ringtoneRef.current.currentTime);
        osc.frequency.setValueAtTime(660, ringtoneRef.current.currentTime + 0.15);
        osc.frequency.setValueAtTime(880, ringtoneRef.current.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ringtoneRef.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ringtoneRef.current.currentTime + 0.6);
        osc.start(ringtoneRef.current.currentTime);
        osc.stop(ringtoneRef.current.currentTime + 0.6);
      };
      playRing();
      const interval = setInterval(playRing, 1800);
      return () => {
        clearInterval(interval);
        ringtoneRef.current?.close();
        ringtoneRef.current = null;
      };
    }
  }, [incomingCall]);

  const toggleMute = () => {
    if (session) {
      const newMuted = !isMuted;
      session.setMuted(newMuted);
      setIsMuted(newMuted);
    }
  };

  if (!incomingCall && !activeCall) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <AnimatePresence>
        {incomingCall && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-3xl px-8 py-6 shadow-2xl flex flex-col items-center gap-4 border border-slate-100 z-10 w-[85vw] max-w-sm mx-4"
          >
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-blue-100 overflow-hidden border-4 border-white shadow-lg">
                <img src={callerInfo?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${incomingCall.callerId}`} className="w-full h-full object-cover" />
              </div>
              <div className={cn("absolute -bottom-2 -right-2 p-2 rounded-full border-4 border-white", incomingCall.mediaType === 'video' ? "bg-green-500" : "bg-blue-500")}>
                <Phone size={14} className="text-white" />
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">{callerInfo?.displayName || 'Bilinmeyen'}</h3>
              <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] mt-0.5">{incomingCall.mediaType === 'video' ? 'Gelen Görüntülü Arama' : 'Gelen Sesli Arama'}</p>
            </div>

            <div className="flex gap-6 mt-1">
              <button
                onClick={rejectCall}
                className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors active:scale-90"
              >
                <PhoneOff size={22} />
              </button>
              <button
                onClick={acceptCall}
                className="w-14 h-14 bg-green-600 text-white rounded-full flex items-center justify-center hover:bg-green-700 transition-colors animate-bounce active:scale-95 shadow-xl shadow-green-600/20"
              >
                <Phone size={22} />
              </button>
            </div>
          </motion.div>
        )}

        {activeCall && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-[92vw] max-w-2xl h-auto max-h-[85vh] bg-slate-950 rounded-3xl overflow-hidden shadow-2xl flex flex-col pointer-events-auto relative z-10"
          >
            {/* Engine indicator */}
            {currentEngine && (
              <div className="absolute top-3 left-3 px-2 py-1 bg-blue-600/20 text-blue-400 text-[8px] font-bold uppercase tracking-widest rounded-lg">
                {currentEngine}
              </div>
            )}

            {/* Participants */}
            <div className="flex-1 p-8 flex flex-col items-center justify-center gap-6 min-h-0">
              {activeCall.activeParticipants.filter(id => id !== user?.uid).map(pId => {
                const info = participantInfo[pId];
                return (
                  <div key={pId} className="flex flex-col items-center gap-3">
                    <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center animate-pulse shadow-xl shadow-blue-500/10">
                      <img src={info?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${pId}`} className="w-full h-full rounded-full opacity-80" />
                    </div>
                    <p className="text-sm font-black text-white tracking-tight">{info?.displayName || 'Katılımcı'}</p>
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{session?.isConnected() ? 'Bağlı' : 'Bağlanıyor...'}</p>
                  </div>
                );
              })}

              {/* Self view (no video, just icon) */}
              {(!activeCall.activeParticipants || activeCall.activeParticipants.length <= 1) && (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-slate-600 animate-bounce">
                    <Phone size={36} />
                  </div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{currentEngine ? 'Bağlanıyor...' : 'Çalıyor...'}</p>
                </div>
              )}

              {/* Error */}
              {callError && (
                <p className="text-[10px] font-bold text-red-400 text-center max-w-xs">{callError}</p>
              )}
            </div>

            {/* Controls */}
            <div className="h-20 sm:h-24 bg-slate-900 border-t border-white/5 px-4 sm:px-6 flex items-center justify-between shrink-0">
              <div className="hidden sm:flex flex-col">
                <h4 className="text-xs font-black text-white tracking-tight">Nexus Sesli Arama</h4>
                <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">
                  {currentEngine ? `${currentEngine} ile` : 'Bağlanıyor...'}
                </p>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={toggleMute}
                  disabled={!session}
                  className={cn(
                    "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-95",
                    isMuted ? "bg-red-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700",
                    !session && "opacity-40 cursor-not-allowed"
                  )}
                >
                  {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                <button
                  onClick={leaveCall}
                  className="w-14 h-10 sm:w-16 sm:h-12 bg-red-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-red-600/30 active:scale-95 transition-all"
                >
                  <PhoneOff size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
