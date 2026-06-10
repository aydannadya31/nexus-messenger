import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCall } from './CallProvider';
import { useAuth } from './AuthProvider';
import { db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, collection, addDoc, serverTimestamp, getDoc, query, where } from 'firebase/firestore';
import { X, Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Users, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { UserProfile, CallSignal } from '../types';

export const CallOverlay = () => {
  const { activeCall, incomingCall, acceptCall, rejectCall, leaveCall, inviteToCall } = useCall();
  const { user } = useAuth();
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [participantInfo, setParticipantInfo] = useState<Record<string, UserProfile>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callerInfo, setCallerInfo] = useState<UserProfile | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  const pcs = useRef<Record<string, RTCPeerConnection>>({});
  const activeCallRef = useRef(activeCall);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const pendingCandidates = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const mediaInitPromiseRef = useRef<Promise<MediaStream | null> | null>(null);

  const configuration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'turn:free.turnservers.com:3478' },
    ],
    iceCandidatePoolSize: 1,
  };

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

  const cleanupPeer = useCallback((pId: string) => {
    if (pcs.current[pId]) {
      pcs.current[pId].close();
      delete pcs.current[pId];
    }
    setRemoteStreams(prev => {
      const next = { ...prev };
      delete next[pId];
      return next;
    });
  }, []);

  const addLocalTracksToPC = useCallback((pc: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const senders = pc.getSenders().map(s => s.track?.kind);
    stream.getTracks().forEach(track => {
      if (!senders.includes(track.kind)) {
        pc.addTrack(track, stream);
      }
    });
  }, []);

  const getOrCreatePC = useCallback(async (pId: string, isInitiator: boolean) => {
    if (pcs.current[pId]) {
      addLocalTracksToPC(pcs.current[pId]);
      return pcs.current[pId];
    }
    if (!activeCallRef.current || !user) return null;

    const ac = activeCallRef.current;
    const pc = new RTCPeerConnection(configuration);
    pcs.current[pId] = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const currentCall = activeCallRef.current;
        if (!currentCall) return;
        addDoc(collection(db, 'calls', currentCall.id, 'signals'), {
          from: user.uid,
          to: pId,
          type: 'candidate',
          data: event.candidate.toJSON(),
          createdAt: serverTimestamp()
        }).catch(() => {});
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream(event.track ? [event.track] : []);
      setRemoteStreams(prev => ({ ...prev, [pId]: stream }));
    };

    let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
    pc.oniceconnectionstatechange = () => {
      console.log("ICE state:", pc.iceConnectionState, "peer:", pId);
      if (pc.iceConnectionState === 'connected') {
        console.log(`Peer ${pId} connected!`);
        if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
      }
      if (pc.iceConnectionState === 'disconnected') {
        if (!disconnectTimer) {
          disconnectTimer = setTimeout(() => {
            console.log("ICE disconnected timeout, cleaning up peer:", pId);
            cleanupPeer(pId);
          }, 10000);
        }
      }
      if (pc.iceConnectionState === 'failed') {
        if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
        cleanupPeer(pId);
      }
    };

    pc.onsignalingstatechange = () => {
      console.log("Signaling state:", pc.signalingState, "peer:", pId);
    };

    pc.onicegatheringstatechange = () => {
      console.log("ICE gathering:", pc.iceGatheringState, "peer:", pId);
    };

    // Add local tracks
    addLocalTracksToPC(pc);

    if (isInitiator) {
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: ac.mediaType === 'video' });
        await pc.setLocalDescription(offer);
        await addDoc(collection(db, 'calls', ac.id, 'signals'), {
          from: user.uid,
          to: pId,
          type: 'offer',
          data: { type: offer.type, sdp: offer.sdp },
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Error creating offer:", err);
      }
    }

    return pc;
  }, [user?.uid, cleanupPeer, addLocalTracksToPC]);

  const initLocalMedia = useCallback(async (isVideoCall: boolean) => {
    if (localStreamRef.current) return localStreamRef.current;
    if (mediaInitPromiseRef.current) return mediaInitPromiseRef.current;
    mediaInitPromiseRef.current = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: isVideoCall ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
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

  // Global Signaling Listener
  useEffect(() => {
    if (!activeCall || !user) return;
    const callId = activeCall.id;

    const qSignals = query(
      collection(db, 'calls', callId, 'signals'),
      where('to', '==', user.uid)
    );

    const unsubscribe = onSnapshot(qSignals, async (snapshot) => {
      const changes = snapshot.docChanges();
      for (const change of changes) {
        if (change.type !== 'added') continue;
        const signal = { id: change.doc.id, ...change.doc.data() } as CallSignal;

        try {
          if (signal.type === 'offer') {
            console.log("📨 Received OFFER from", signal.from);
            const stream = localStreamRef.current || await initLocalMedia(activeCallRef.current?.mediaType === 'video');
            if (!stream) { console.error("❌ No media stream for offer"); continue; }
            let pc = pcs.current[signal.from];
            if (!pc) {
              console.log("Creating PC for offer from", signal.from);
              pc = await getOrCreatePC(signal.from, false);
            }
            if (!pc) { console.error("❌ Failed to create PC for offer"); continue; }
            addLocalTracksToPC(pc);
            await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
            console.log("✅ Remote description set from offer, state:", pc.signalingState);
            const buffered = pendingCandidates.current[signal.from] || [];
            delete pendingCandidates.current[signal.from];
            for (const c of buffered) {
              try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.warn("candidate add error:", e); }
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log("✅ Answer created and set, state:", pc.signalingState);
            const currentCall = activeCallRef.current;
            if (currentCall) {
              await addDoc(collection(db, 'calls', currentCall.id, 'signals'), {
                from: user.uid,
                to: signal.from,
                type: 'answer',
                data: { type: answer.type, sdp: answer.sdp },
                createdAt: serverTimestamp()
              });
              console.log("✅ Answer sent to", signal.from);
            }
          } else if (signal.type === 'answer') {
            console.log("📨 Received ANSWER from", signal.from);
            let pc = pcs.current[signal.from];
            if (!pc) { console.error("❌ No PC for answer"); continue; }
            console.log("Signaling state before answer:", pc.signalingState);
            if (pc.signalingState !== 'have-local-offer') { console.warn("⚠️ Wrong state for answer:", pc.signalingState); continue; }
            await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
            console.log("✅ Remote description set from answer, state:", pc.signalingState);
            const buffered = pendingCandidates.current[signal.from] || [];
            delete pendingCandidates.current[signal.from];
            for (const c of buffered) {
              try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.warn("candidate add error:", e); }
            }
          } else if (signal.type === 'candidate') {
            let pc = pcs.current[signal.from];
            if (!pc || !pc.remoteDescription) {
              if (!pendingCandidates.current[signal.from]) {
                pendingCandidates.current[signal.from] = [];
              }
              pendingCandidates.current[signal.from].push(signal.data);
              console.log("📦 Buffered ICE candidate from", signal.from, "buffer size:", pendingCandidates.current[signal.from].length);
              continue;
            }
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal.data));
            } catch (e) { console.warn("candidate add error:", e); }
          }
        } catch (err) {
          console.error("Signal processing error:", err);
        }
      }
    });

    return () => unsubscribe();
  }, [activeCall?.id, user?.uid, getOrCreatePC, initLocalMedia]);

  // Re-add local tracks to all peers when localStream changes
  useEffect(() => {
    if (!localStream || !activeCall || !user) return;
    Object.entries(pcs.current).forEach(([pId, pc]) => {
      const senders = pc.getSenders().map(s => s.track?.kind);
      let added = false;
      localStream.getTracks().forEach(track => {
        if (!senders.includes(track.kind)) {
          pc.addTrack(track, localStream);
          added = true;
        }
      });
      // If tracks were added and connection is stable, renegotiate
      if (added && pc.signalingState === 'stable' && pc.connectionState === 'connected') {
        pc.restartIce();
      }
    });
  }, [localStream, activeCall, user]);

  // Mesh Management: Connect to active participants
  useEffect(() => {
    if (!activeCall || !user) return;
    console.log("🔄 Mesh Management: active participants:", activeCall.activeParticipants, "my uid:", user.uid);
    let cancelled = false;
    (async () => {
      const stream = localStreamRef.current || await initLocalMedia(activeCall.mediaType === 'video');
      if (!stream || cancelled) {
        console.log("⚠️ Mesh: no stream, initLocalMedia result:", !!stream);
        return;
      }

      for (const pId of activeCall.activeParticipants) {
        if (pId !== user.uid && !pcs.current[pId]) {
          const isInit = user.uid < pId;
          console.log("🔌 Mesh: connecting to", pId, "isInitiator:", isInit);
          await getOrCreatePC(pId, isInit);
        }
      }
    })();

    Object.keys(pcs.current).forEach(pId => {
      if (!activeCall.activeParticipants.includes(pId)) {
        console.log("🧹 Mesh: cleaning up peer", pId);
        cleanupPeer(pId);
      }
    });
    return () => { cancelled = true; };
  }, [activeCall?.activeParticipants, user?.uid, getOrCreatePC, cleanupPeer]);

  // Cleanup on call end
  useEffect(() => {
    if (!activeCall) {
      Object.keys(pcs.current).forEach(cleanupPeer);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
    }
  }, [activeCall, cleanupPeer]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  if (!incomingCall && !activeCall) return null;

  const participantsCount = activeCall?.activeParticipants?.length || 1;
  const gridCols = participantsCount <= 1 ? 'grid-cols-1' : 
                   participantsCount <= 2 ? 'grid-cols-2' : 
                   participantsCount <= 4 ? 'grid-cols-2' : 'grid-cols-3';
  const gridRows = participantsCount <= 2 ? 'grid-rows-1' : 
                   participantsCount <= 6 ? 'grid-rows-2' : 'grid-rows-3';

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
                {incomingCall.mediaType === 'video' ? <Video size={14} className="text-white" /> : <Phone size={14} className="text-white" />}
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
                {incomingCall.mediaType === 'video' ? <Video size={22} /> : <Phone size={22} />}
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
            {/* Main Video Area */}
            <div className={cn("flex-1 p-3 grid gap-3 transition-all duration-500 min-h-0", gridCols, gridRows)}>
              {/* Local Participant */}
              <div className="relative bg-slate-900 rounded-[2rem] overflow-hidden shadow-inner group">
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={cn("w-full h-full object-cover", !isVideoOff && "mirror")}
                />
                <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">Sen (Ben)</span>
                  {isMuted && <MicOff size={10} className="text-red-400" />}
                </div>
                {isVideoOff && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 gap-3">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                      <VideoOff size={32} />
                    </div>
                  </div>
                )}
              </div>

              {/* Remote Participants */}
              {activeCall.activeParticipants.filter(id => id !== user?.uid).map(pId => {
                const stream = remoteStreams[pId];
                const info = participantInfo[pId];
                return (
                  <div key={pId} className="relative bg-slate-900 rounded-[2rem] overflow-hidden shadow-inner group">
                    {stream ? (
                      <video 
                        autoPlay 
                        playsInline 
                        ref={el => { if (el) el.srcObject = stream; }}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900">
                        <div className="w-20 h-20 rounded-full bg-slate-800 animate-pulse flex items-center justify-center">
                           <img src={info?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${pId}`} className="w-full h-full rounded-full opacity-50" />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Bağlanılıyor...</p>
                      </div>
                    )}
                    <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">{info?.displayName || 'Katılımcı'}</span>
                    </div>
                  </div>
                );
              })}

              {/* Placeholder for unfilled grid slots if calling */}
              {activeCall.status === 'calling' && activeCall.participants.length > 1 && activeCall.activeParticipants.length === 1 && (
                 <div className="relative bg-slate-900/50 rounded-[2rem] border-2 border-dashed border-slate-800 flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-600 animate-bounce">
                      <Users size={32} />
                    </div>
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Yanıt Bekleniyor...</p>
                 </div>
              )}
            </div>

            {/* Controls */}
            <div className="h-20 sm:h-24 bg-slate-900 border-t border-white/5 px-4 sm:px-6 flex items-center justify-between shrink-0">
               <div className="hidden sm:flex flex-col">
                   <h4 className="text-xs font-black text-white tracking-tight">Nexus {activeCall.mediaType === 'video' ? 'Video' : 'Sesli'} Arama</h4>
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

                  {activeCall.mediaType === 'video' && (
                    <button 
                      onClick={toggleVideo}
                      className={cn(
                        "w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-95",
                        isVideoOff ? "bg-red-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      )}
                    >
                      {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
                    </button>
                  )}

                  {activeCall.type === 'group' && (
                    <button 
                      onClick={() => setIsInviting(!isInviting)}
                      className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-800 text-blue-400 rounded-2xl flex items-center justify-center hover:bg-slate-700 active:scale-95 transition-all"
                    >
                      <UserPlus size={18} />
                    </button>
                  )}

                  <button 
                    onClick={leaveCall}
                    className="w-14 h-10 sm:w-16 sm:h-12 bg-red-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-red-600/30 active:scale-95 transition-all"
                  >
                    <PhoneOff size={18} />
                  </button>
               </div>

               <div className="hidden sm:block w-24" />
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
