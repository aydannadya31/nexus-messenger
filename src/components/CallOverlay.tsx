import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCall } from './CallProvider';
import { useAuth } from './AuthProvider';
import { db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, collection, addDoc, serverTimestamp, getDoc, query, where, deleteDoc, getDocs } from 'firebase/firestore';
import { X, Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Users, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { UserProfile, CallSignal } from '../types';

export const CallOverlay = () => {
  const { activeCall, incomingCall, acceptCall, rejectCall, leaveCall, inviteToCall } = useCall();
  const { user } = useAuth();
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [participantInfo, setParticipantInfo] = useState<Record<string, UserProfile>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callerInfo, setCallerInfo] = useState<UserProfile | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [localUserInfo, setLocalUserInfo] = useState<UserProfile | null>(null);

  const pcs = useRef<Record<string, RTCPeerConnection>>({});
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const newVideoTrackRef = useRef<MediaStreamTrack | null>(null);

  const configuration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10,
  };

  // Fetch local user info
  useEffect(() => {
    if (user && !localUserInfo) {
      const fetchMe = async () => {
        const d = await getDoc(doc(db, 'users', user.uid));
        if (d.exists()) setLocalUserInfo(d.data() as UserProfile);
      };
      fetchMe();
    }
  }, [user]);

  // Fetch caller info for incoming call
  useEffect(() => {
    if (incomingCall && !callerInfo) {
      const fetchCaller = async () => {
        const d = await getDoc(doc(db, 'users', incomingCall.callerId));
        if (d.exists()) setCallerInfo(d.data() as UserProfile);
      };
      fetchCaller();
    } else if (!incomingCall) {
      setCallerInfo(null);
    }
  }, [incomingCall]);

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

  const createPeerConnection = useCallback(async (pId: string, isInitiator: boolean) => {
    if (pcs.current[pId]) return pcs.current[pId];
    if (!activeCall || !user) return null;

    const pc = new RTCPeerConnection(configuration);
    pcs.current[pId] = pc;

    // Add existing local tracks (audio + video if present)
    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }
    // Add any new video track that was added after initial media setup
    if (newVideoTrackRef.current && localStream) {
      try { pc.addTrack(newVideoTrackRef.current, localStream); } catch (e) { /* already added */ }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(collection(db, 'calls', activeCall.id, 'signals'), {
          from: user.uid,
          to: pId,
          type: 'candidate',
          data: event.candidate.toJSON(),
          createdAt: serverTimestamp()
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams(prev => ({ ...prev, [pId]: event.streams[0] }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupPeer(pId);
      }
    };

    if (isInitiator) {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      await addDoc(collection(db, 'calls', activeCall.id, 'signals'), {
        from: user.uid,
        to: pId,
        type: 'offer',
        data: { type: offer.type, sdp: offer.sdp },
        createdAt: serverTimestamp()
      });
    }

    return pc;
  }, [activeCall?.id, user?.uid, localStream, cleanupPeer]);

  // Initialize Local Media
  useEffect(() => {
    if (activeCall && !localStream) {
      const startMedia = async () => {
        try {
          const constraints: MediaStreamConstraints = {
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          };
          if (activeCall.mediaType === 'video') {
            constraints.video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
          }
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          setLocalStream(stream);
        } catch (err) {
          console.error("Media access error:", err);
        }
      };
      startMedia();
    }
  }, [activeCall?.id, activeCall?.mediaType]);

  // Global Signaling Listener
  useEffect(() => {
    if (!activeCall || !user) return;

    const qSignals = query(
      collection(db, 'calls', activeCall.id, 'signals'),
      where('to', '==', user.uid)
    );

    const unsubscribe = onSnapshot(qSignals, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const signal = { id: change.doc.id, ...change.doc.data() } as CallSignal;
          const pc = pcs.current[signal.from] || await createPeerConnection(signal.from, false);
          if (!pc) return;

          if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await addDoc(collection(db, 'calls', activeCall.id, 'signals'), {
              from: user.uid,
              to: signal.from,
              type: 'answer',
              data: { type: answer.type, sdp: answer.sdp },
              createdAt: serverTimestamp()
            });
          } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
          } else if (signal.type === 'candidate') {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal.data));
            } catch (e) {
              // Ignore
            }
          }
          
          // Delete signal after processing to keep collection clean
          deleteDoc(doc(db, 'calls', activeCall.id, 'signals', signal.id));
        }
      });
    });

    return () => unsubscribe();
  }, [activeCall?.id, user?.uid, createPeerConnection]);

  // Mesh Management: Connect to active participants
  useEffect(() => {
    if (!activeCall || !user || !localStream) return;

    activeCall.activeParticipants.forEach(async (pId) => {
      if (pId !== user.uid && !pcs.current[pId]) {
        // Smaller UID initiates to larger UID to avoid double offers
        if (user.uid < pId) {
          await createPeerConnection(pId, true);
        }
      }
    });

    // Cleanup peers who left activeParticipants
    Object.keys(pcs.current).forEach(pId => {
      if (!activeCall.activeParticipants.includes(pId)) {
        cleanupPeer(pId);
      }
    });
  }, [activeCall?.activeParticipants, user?.uid, localStream, createPeerConnection, cleanupPeer]);

  // Cleanup on call end
  useEffect(() => {
    if (!activeCall) {
      Object.keys(pcs.current).forEach(cleanupPeer);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
      newVideoTrackRef.current = null;
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

  const toggleVideo = async () => {
    if (!localStream) return;
    let videoTrack = localStream.getVideoTracks()[0];

    if (!videoTrack) {
      // Audio call: add video track dynamically
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        });
        const newTrack = newStream.getVideoTracks()[0];
        localStream.addTrack(newTrack);
        newVideoTrackRef.current = newTrack;

        // Add track to all existing peer connections
        Object.entries(pcs.current).forEach(([pId, pc]) => {
          try {
            pc.addTrack(newTrack, localStream);
            // Re-negotiate
            pc.createOffer().then(offer => {
              pc.setLocalDescription(offer);
              if (activeCall) {
                addDoc(collection(db, 'calls', activeCall.id, 'signals'), {
                  from: user!.uid,
                  to: pId,
                  type: 'offer',
                  data: { type: offer.type, sdp: offer.sdp },
                  createdAt: serverTimestamp()
                });
              }
            }).catch(e => console.warn('Renegotiation error:', e));
          } catch (e) {
            console.warn('Could not add video track to peer:', e);
          }
        });

        setIsVideoOff(false);
      } catch (err) {
        console.error("Could not add video:", err);
      }
    } else {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  };

  if (!incomingCall && !activeCall) return null;

  const participantsCount = activeCall?.activeParticipants?.length || 1;
  const gridCols = participantsCount <= 1 ? 'grid-cols-1' : 
                   participantsCount <= 2 ? 'grid-cols-1 landscape:grid-cols-2 sm:grid-cols-2' : 
                   participantsCount <= 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3';

  // Shared avatar overlay component
  const AvatarOverlay: React.FC<{ photoURL?: string; displayName: string; subtitle?: string; size?: string }> = ({ photoURL, displayName, subtitle, size = 'w-20 h-20' }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 gap-3">
      <div className={cn(size, "rounded-full bg-slate-800 overflow-hidden border-2 border-white/10 shadow-lg shadow-black/20")}>
        <img 
          src={photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${displayName}`}
          className="w-full h-full object-cover opacity-70"
        />
      </div>
      <span className="text-xs font-bold text-slate-400">{displayName}</span>
      {subtitle && <span className="text-[10px] text-slate-500">{subtitle}</span>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-6 pointer-events-auto overflow-hidden bg-slate-950">
      <AnimatePresence>
        {incomingCall && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 pointer-events-auto"
          >
            <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl flex flex-col items-center gap-6 border border-slate-100">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-blue-100 overflow-hidden border-4 border-white shadow-lg">
                  <img src={callerInfo?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${incomingCall.callerId}`} className="w-full h-full object-cover" />
                </div>
                <div className={cn("absolute -bottom-2 -right-2 p-2 rounded-full border-4 border-white", incomingCall.mediaType === 'video' ? "bg-green-500" : "bg-blue-500")}>
                  {incomingCall.mediaType === 'video' ? <Video size={16} className="text-white" /> : <Phone size={16} className="text-white" />}
                </div>
              </div>
              
              <div className="text-center">
                <h3 className="text-xl font-black text-slate-900 tracking-tight">{callerInfo?.displayName || 'Yükleniyor...'}</h3>
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mt-1">{incomingCall.mediaType === 'video' ? 'Gelen Görüntülü Arama' : 'Gelen Sesli Arama'}</p>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={rejectCall}
                  className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center hover:bg-red-200 transition-colors active:scale-90"
                >
                  <PhoneOff size={24} />
                </button>
                <button 
                  onClick={acceptCall}
                  className="w-14 h-14 bg-green-600 text-white rounded-full flex items-center justify-center hover:bg-green-700 transition-colors animate-bounce active:scale-95 shadow-xl shadow-green-600/20"
                >
                  {incomingCall.mediaType === 'video' ? <Video size={24} /> : <Phone size={24} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {activeCall && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex-1 min-h-0 flex flex-col sm:max-w-5xl sm:max-h-[90vh] sm:rounded-[3rem] sm:shadow-2xl sm:overflow-hidden relative"
          >
            {/* Main Video Area */}
            <div className="flex-1 min-h-0 p-2 sm:p-4">
              <div className={cn("w-full h-full grid gap-2 sm:gap-4", gridCols)} style={{ gridAutoRows: '1fr' }}>
              {/* Local Participant */}
              <div className="relative bg-slate-900 rounded-[2rem] overflow-hidden shadow-inner group">
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={cn("w-full h-full object-cover", !isVideoOff && "mirror")}
                />
                {/* Camera off / audio mode overlay: show avatar */}
                {(isVideoOff || activeCall.mediaType === 'audio') && (
                  <AvatarOverlay
                    photoURL={localUserInfo?.photoURL}
                    displayName="Sen (Ben)"
                  />
                )}
                <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 z-10">
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">Sen (Ben)</span>
                  {isMuted && <MicOff size={10} className="text-red-400" />}
                </div>
              </div>

              {/* Remote Participants */}
              {activeCall.activeParticipants.filter(id => id !== user?.uid).map(pId => {
                const stream = remoteStreams[pId];
                const info = participantInfo[pId];
                return (
                  <div key={pId} className="relative bg-slate-900 rounded-[2rem] overflow-hidden shadow-inner group">
                    {stream ? (
                      <>
                        <video 
                          autoPlay 
                          playsInline 
                          ref={el => { 
                            if (el) {
                              el.srcObject = stream;
                              if (el.paused) {
                                el.play().catch(err => console.warn('[CallOverlay] Autoplay prevented:', err));
                              }
                            }
                          }}
                          className="w-full h-full object-cover"
                        />
                        {/* Always show avatar as fallback behind video */}
                        <AvatarOverlay
                          photoURL={info?.photoURL}
                          displayName={info?.displayName || 'Katılımcı'}
                          subtitle="Kamera Kapalı"
                        />
                      </>
                    ) : (
                      <AvatarOverlay
                        photoURL={info?.photoURL}
                        displayName={info?.displayName || 'Katılımcı'}
                        subtitle="Bağlanılıyor..."
                        size="w-20 h-20"
                      />
                    )}
                    <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 z-10">
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
            </div>

            {/* Controls */}
            <div className="h-20 sm:h-28 shrink-0 bg-slate-900 border-t border-white/5 px-6 sm:px-10 flex items-center justify-between">
               <div className="hidden sm:flex flex-col">
                   <h4 className="text-sm font-black text-white tracking-tight">Nexus {activeCall.mediaType === 'video' ? 'Görüntülü' : 'Sesli'} Arama</h4>
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                    {activeCall.type === 'private' ? 'BİREBİR GÖRÜŞME' : `GRUP SOHBETİ (${activeCall.activeParticipants.length}/${activeCall.participants.length})`}
                  </p>
               </div>

               <div className="flex items-center gap-2 sm:gap-4">
                  <button 
                    onClick={toggleMute}
                    className={cn(
                      "w-12 h-12 sm:w-14 sm:h-14 rounded-3xl flex items-center justify-center transition-all shadow-lg active:scale-95",
                      isMuted ? "bg-red-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    )}
                  >
                    {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                  </button>

                  <button 
                    onClick={toggleVideo}
                    className={cn(
                      "w-12 h-12 sm:w-14 sm:h-14 rounded-3xl flex items-center justify-center transition-all shadow-lg active:scale-95",
                      isVideoOff ? "bg-red-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    )}
                    title={activeCall.mediaType === 'audio' && !localStream?.getVideoTracks().length ? 'Görüntülü Aç' : isVideoOff ? 'Kamerayı Aç' : 'Kamerayı Kapat'}
                  >
                    {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                  </button>

                  {activeCall.type === 'group' && (
                    <button 
                      onClick={() => setIsInviting(!isInviting)}
                      className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-800 text-blue-400 rounded-3xl flex items-center justify-center hover:bg-slate-700 active:scale-95 transition-all"
                    >
                      <UserPlus size={24} />
                    </button>
                  )}

                  <button 
                    onClick={leaveCall}
                    className="w-16 h-12 sm:w-20 sm:h-14 bg-red-600 text-white rounded-3xl flex items-center justify-center shadow-xl shadow-red-600/30 active:scale-95 transition-all"
                  >
                    <PhoneOff size={24} />
                  </button>
               </div>

               <div className="hidden sm:block w-32" />
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
