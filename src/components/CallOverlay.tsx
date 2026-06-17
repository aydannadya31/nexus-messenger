import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCall } from './CallProvider';
import { useAuth } from './AuthProvider';
import { db } from '../lib/firebase';
import { doc, onSnapshot, collection, addDoc, serverTimestamp, getDoc, query, where } from 'firebase/firestore';
import { X, Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';

export const CallOverlay = () => {
  const { activeCall, incomingCall, acceptCall, rejectCall, leaveCall, inviteToCall } = useCall();
  const { user } = useAuth();
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [participantInfo, setParticipantInfo] = useState<Record<string, UserProfile>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [callerInfo, setCallerInfo] = useState<UserProfile | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  const activeCallRef = useRef(activeCall);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  const mediaInitPromiseRef = useRef<Promise<MediaStream | null> | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioSeqRef = useRef(0);
  const audioQueueRef = useRef<{ data: string; seq: number }[]>([]);
  const isPlayingRef = useRef(false);
  const lastPlayedSeqRef = useRef(-1);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioUnsubRef = useRef<(() => void) | null>(null);

  // Play ringtone for incoming call
  const ringtoneRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (incomingCall && !ringtoneRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ringtoneRef.current = ctx;

      const playRing = () => {
        if (!ringtoneRef.current) return;
        if (ringtoneRef.current.state === 'suspended') {
          ringtoneRef.current.resume();
        }
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
      ringIntervalRef.current = window.setInterval(playRing, 1500);
    }
    if (!incomingCall) {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
      if (ringtoneRef.current) {
        ringtoneRef.current.close();
        ringtoneRef.current = null;
      }
      setCallerInfo(null);
    }
    return () => {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
      if (ringtoneRef.current) {
        ringtoneRef.current.close();
        ringtoneRef.current = null;
      }
    };
  }, [incomingCall?.callerId]);

  // Fetch caller info for incoming call
  useEffect(() => {
    if (incomingCall?.callerId) {
      getDoc(doc(db, 'users', incomingCall.callerId)).then(d => {
        if (d.exists()) {
          setCallerInfo(d.data() as UserProfile);
          setParticipantInfo(prev => ({ ...prev, [incomingCall.callerId]: d.data() as UserProfile }));
        }
      }).catch(err => console.error("callerInfo fetch error:", err));
    } else {
      setCallerInfo(null);
    }
  }, [incomingCall?.callerId]);

  // Fetch info for all participants
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

  const playAudioChunk = useCallback(async (base64Data: string) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const audioBuf = await ctx.decodeAudioData(bytes.buffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(ctx.destination);
      source.start();
    } catch (err) {
      console.warn("Audio playback error:", err);
    }
  }, []);

  const processAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;
    audioQueueRef.current.sort((a, b) => a.seq - b.seq);
    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift()!;
      await playAudioChunk(chunk.data);
      lastPlayedSeqRef.current = chunk.seq;
    }
    isPlayingRef.current = false;
  }, [playAudioChunk]);

  const initLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (mediaInitPromiseRef.current) return mediaInitPromiseRef.current;
    mediaInitPromiseRef.current = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch (err) {
        console.error("Media access error:", err);
        return null;
      }
    })();
    return await mediaInitPromiseRef.current;
  }, []);

  const startMediaRecorder = useCallback((stream: MediaStream, callId: string) => {
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          if (!base64) return;
          const currentCall = activeCallRef.current;
          if (!currentCall) return;
          const seq = audioSeqRef.current++;
          currentCall.activeParticipants.forEach(pId => {
            if (pId === user?.uid) return;
            addDoc(collection(db, 'calls', callId, 'audio'), {
              from: user?.uid,
              to: pId,
              data: base64,
              seq,
              createdAt: serverTimestamp()
            }).catch(() => {});
          });
        };
        reader.readAsDataURL(event.data);
      };
      recorder.start(1500);
    } catch (err) {
      console.error("MediaRecorder error:", err);
    }
  }, [user?.uid]);

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, []);

  const acceptWithMedia = useCallback(async () => {
    // getUserMedia MUST be called from user gesture context (iOS Safari)
    await initLocalMedia();
    await acceptCall();
  }, [initLocalMedia, acceptCall]);

  useEffect(() => {
    if (!activeCall || !user) return;
    let cancelled = false;

    // If stream is already started (from acceptWithMedia), use it
    const existingStream = localStreamRef.current;
    if (existingStream && !mediaRecorderRef.current) {
      startMediaRecorder(existingStream, activeCall.id);
    }

    (async () => {
      const stream = localStreamRef.current || await initLocalMedia();
      if (!stream || cancelled) return;

      if (!mediaRecorderRef.current) {
        startMediaRecorder(stream, activeCall.id);
      }

      const qAudio = query(
        collection(db, 'calls', activeCall.id, 'audio'),
        where('to', '==', user.uid)
      );

      audioUnsubRef.current = onSnapshot(qAudio, (snap) => {
        snap.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const d = change.doc.data() as { from: string; data: string; seq: number };
          if (d.from === user.uid) return;
          if (d.seq <= lastPlayedSeqRef.current) return;
          audioQueueRef.current.push({ data: d.data, seq: d.seq });
        });
        processAudioQueue();
      }, (err) => {
        console.error("Audio listener error:", err);
      });
    })();

    return () => { cancelled = true; };
  }, [activeCall?.id, user?.uid, initLocalMedia, startMediaRecorder, processAudioQueue]);

  useEffect(() => {
    if (!activeCall) {
      stopMediaRecorder();
      if (audioUnsubRef.current) {
        audioUnsubRef.current();
        audioUnsubRef.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      audioSeqRef.current = 0;
      audioQueueRef.current = [];
      lastPlayedSeqRef.current = 0;
      isPlayingRef.current = false;
    }
  }, [activeCall, stopMediaRecorder]);

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
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
                onClick={acceptWithMedia}
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
            {/* Audio Call Participants Area */}
            <div className="flex-1 p-8 flex flex-col items-center justify-center gap-6 min-h-0">
              {activeCall.activeParticipants.filter(id => id !== user?.uid).map(pId => {
                const info = participantInfo[pId];
                return (
                  <div key={pId} className="flex flex-col items-center gap-3">
                    <div className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center animate-pulse shadow-xl shadow-blue-500/10">
                      <img src={info?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${pId}`} className="w-full h-full rounded-full opacity-80" />
                    </div>
                    <p className="text-sm font-black text-white tracking-tight">{info?.displayName || 'Katılımcı'}</p>
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Bağlı</p>
                  </div>
                );
              })}

              {activeCall.status === 'calling' && activeCall.participants.length > 1 && activeCall.activeParticipants.length === 1 && (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-slate-600 animate-bounce">
                    <Phone size={36} />
                  </div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Çalıyor...</p>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="h-20 sm:h-24 bg-slate-900 border-t border-white/5 px-4 sm:px-6 flex items-center justify-between shrink-0">
               <div className="hidden sm:flex flex-col">
                   <h4 className="text-xs font-black text-white tracking-tight">Nexus Sesli Arama</h4>
                  <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">
                    {activeCall.type === 'private' ? 'BİREBİR GÖRÜŞME' : `GRUP SOHBETİ (${activeCall.activeParticipants.length}/${activeCall.participants.length})`}
                  </p>
               </div>

               <div className="flex items-center gap-2 sm:gap-3">
                  <button 
                    onClick={toggleMute}
                    className={cn(
                      "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-95",
                      isMuted ? "bg-red-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
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

            {/* Invite Members Flyout */}
            <AnimatePresence>
              {isInviting && (
                <motion.div 
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  className="absolute inset-y-0 right-0 w-full sm:w-80 bg-white shadow-2xl z-10 flex flex-col"
                >
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Üye Ekle</h3>
                    <button onClick={() => setIsInviting(false)} className="text-slate-400 hover:text-slate-900">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {/* Simplified: Show all participants of the chat who are not in the call */}
                    {activeCall.participants.filter(pId => !activeCall.activeParticipants.includes(pId)).map(pId => (
                      <div key={pId} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-3">
                           <img src={participantInfo[pId]?.photoURL} className="w-8 h-8 rounded-lg" />
                           <span className="text-xs font-bold text-slate-700">{participantInfo[pId]?.displayName}</span>
                        </div>
                        <button 
                          onClick={() => inviteToCall([pId])}
                          className="text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-tighter"
                        >
                          Hemen Ara
                        </button>
                      </div>
                    ))}
                    {activeCall.participants.filter(pId => !activeCall.activeParticipants.includes(pId)).length === 0 && (
                      <p className="text-center text-xs text-slate-400 py-10 font-medium">Tüm grup üyeleri zaten sohbette.</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
