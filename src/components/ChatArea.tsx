import React, { useEffect, useState, useRef, useCallback } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, doc, updateDoc, setDoc, getDoc, where, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { useCall } from './CallProvider';
import { Chat, Message, UserProfile, Call } from '../types';
import { cn } from '../lib/utils';
import ProfileModal from './ProfileModal';
import { Image, MoreVertical, Send, Smile, Phone, Video, MessageSquarePlus, Clock, Play, Mic, Square, Pause, Trash2, ListChecks, X, Info, Eye, EyeOff, Lock, LogOut, Shield, UserX, UserCheck, Ban, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { encryptMessage, decryptMessage } from '../lib/crypto';

const DecryptContent: React.FC<{ msg: Message; onClose: () => void }> = ({ msg, onClose }) => {
  const [pwd, setPwd] = useState('');
  const [decrypted, setDecrypted] = useState<{ text?: string; imageUrl?: string; videoUrl?: string; audioUrl?: string } | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!msg.imagePassword) return;
    if (btoa(pwd) === msg.imagePassword) {
      setDecrypted({ text: msg.text, imageUrl: msg.imageUrl, videoUrl: msg.videoUrl, audioUrl: msg.audioUrl });
      setError('');
    } else {
      setError('Hatalı şifre!');
    }
  };

  if (decrypted) {
    return (
      <div className="space-y-4">
        {decrypted.text && (
          <p className="text-sm font-bold leading-relaxed text-slate-800">{decrypted.text}</p>
        )}
        {decrypted.imageUrl && (
          <img src={decrypted.imageUrl} alt="" className="max-w-full h-auto rounded-xl" />
        )}
        {decrypted.videoUrl && (
          <video src={decrypted.videoUrl} className="max-w-full h-auto rounded-xl" controls playsInline />
        )}
        {decrypted.audioUrl && (
          <audio src={decrypted.audioUrl} controls className="w-full" />
        )}
        <button onClick={onClose}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all">
          Kapat
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 font-bold text-center">Bu mesajı görüntülemek için şifreyi girin</p>
      <input type="text" value={pwd} onChange={e => setPwd(e.target.value)} autoFocus
        placeholder="Şifre..."
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        className="w-full bg-slate-100 border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-center outline-none focus:border-blue-500 transition-all" />
      {error && <p className="text-xs font-bold text-red-500 text-center">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 border border-slate-200 transition-all">
          İptal
        </button>
        <button onClick={handleSubmit}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/10">
          Çöz
        </button>
      </div>
    </div>
  );
};

interface ChatAreaProps {
  chatId: string;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ chatId }) => {
  const { user } = useAuth();
  const { startCall, activeCall, acceptCall } = useCall();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [participantInfo, setParticipantInfo] = useState<Record<string, UserProfile>>({});
  const [inputText, setInputText] = useState('');
  const [activeCallForChat, setActiveCallForChat] = useState<Call | null>(null);
  const [reactionMenu, setReactionMenu] = useState<{ msgId: string, x: number, y: number } | null>(null);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isEmojiMenuOpen, setIsEmojiMenuOpen] = useState(false);
  const [showDeletedMessages, setShowDeletedMessages] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedMsgs, setSelectedMsgs] = useState<Set<string>>(new Set());
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [mutedUsers, setMutedUsers] = useState<Record<string, boolean>>({});
  const [showProfile, setShowProfile] = useState(false);
  const [customDialog, setCustomDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
  } | null>(null);
  const [encryptMode, setEncryptMode] = useState(false);
  const [decryptModal, setDecryptModal] = useState<Message | null>(null);

  // Upload menu state
  const [showUploadMenu, setShowUploadMenu] = useState(false);

  // Group admin state
  const [showGroupAdmin, setShowGroupAdmin] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [showEditGroupName, setShowEditGroupName] = useState(false);
  const [showTransferAdmin, setShowTransferAdmin] = useState(false);
  const [showKickMember, setShowKickMember] = useState(false);
  const [kickMemberId, setKickMemberId] = useState<string | null>(null);
  const [kickDuration, setKickDuration] = useState<number>(0);
  const [kickDurationUnit, setKickDurationUnit] = useState<'minutes' | 'hours' | 'days'>('minutes');
  const [allMembers, setAllMembers] = useState<UserProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const isGroupAdmin = chat?.type === 'group' && chat?.groupMetadata?.adminId === user?.uid;

  const showCustomAlert = (title: string, message: string) => {
    setCustomDialog({
      isOpen: true,
      title,
      message,
      type: 'alert'
    });
  };

  const showCustomConfirm = (title: string, message: string, onConfirm: () => void) => {
    setCustomDialog({
      isOpen: true,
      title,
      message,
      type: 'confirm',
      onConfirm
    });
  };

  // Group Admin Functions
  const loadGroupMembers = useCallback(async () => {
    if (!chat || chat.type !== 'group' || !chat.participants) return;
    setLoadingMembers(true);
    const members: UserProfile[] = [];
    for (const pId of chat.participants) {
      if (participantInfo[pId]) {
        members.push(participantInfo[pId]);
      } else {
        const d = await getDoc(doc(db, 'users', pId));
        if (d.exists()) {
          const p = d.data() as UserProfile;
          members.push(p);
          setParticipantInfo(prev => ({ ...prev, [pId]: p }));
        }
      }
    }
    setAllMembers(members);
    setLoadingMembers(false);
  }, [chat?.participants, participantInfo]);

  const handleEditGroupName = async () => {
    if (!chatId || !editGroupName.trim() || !isGroupAdmin) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        'groupMetadata.name': editGroupName.trim()
      });
      setShowEditGroupName(false);
    } catch (error) {
      console.error("Group name update error:", error);
    }
  };

  const handleTransferAdmin = async (newAdminId: string) => {
    if (!chatId || !isGroupAdmin) return;
    try {
      const currentHistory = chat?.groupMetadata?.adminHistory || [];
      await updateDoc(doc(db, 'chats', chatId), {
        'groupMetadata.adminId': newAdminId,
        'groupMetadata.adminHistory': [...currentHistory, newAdminId]
      });
      setShowTransferAdmin(false);
    } catch (error) {
      console.error("Admin transfer error:", error);
    }
  };

  const handleKickMember = async (targetId: string) => {
    if (!chatId || !chat || !isGroupAdmin) return;
    try {
      const newParticipants = chat.participants.filter(id => id !== targetId);
      const now = new Date();
      let bannedUntil = null;
      if (kickDuration > 0) {
        let ms = 0;
        if (kickDurationUnit === 'minutes') ms = kickDuration * 60 * 1000;
        else if (kickDurationUnit === 'hours') ms = kickDuration * 3600 * 1000;
        else ms = kickDuration * 86400 * 1000;
        bannedUntil = new Date(now.getTime() + ms);
      }
      const bannedUser = allMembers.find(m => m.uid === targetId);
      const newBanned = chat.groupMetadata?.bannedUsers || [];
      if (bannedUser) {
        newBanned.push({
          uid: targetId,
          displayName: bannedUser.displayName,
          bannedUntil: bannedUntil,
          bannedAt: now,
          bannedBy: user?.uid || ''
        });
      }
      await updateDoc(doc(db, 'chats', chatId), {
        participants: newParticipants,
        'groupMetadata.bannedUsers': newBanned,
        activeParticipants: (chat as any).activeParticipants?.filter((id: string) => id !== targetId) || []
      });
      setShowKickMember(false);
      setKickMemberId(null);
      setKickDuration(0);
    } catch (error) {
      console.error("Kick member error:", error);
    }
  };

  const handleUnbanMember = async (targetUid: string) => {
    if (!chatId || !chat || !isGroupAdmin) return;
    try {
      const currentBanned = chat.groupMetadata?.bannedUsers || [];
      const newBanned = currentBanned.filter(b => b.uid !== targetUid);
      await updateDoc(doc(db, 'chats', chatId), {
        'groupMetadata.bannedUsers': newBanned,
        participants: [...chat.participants, targetUid]
      });
    } catch (error) {
      console.error("Unban error:", error);
    }
  };

  const handleAdminLeaveGroup = async () => {
    if (!chatId || !chat || !user || chat.type !== 'group') return;
    try {
      const remainingParticipants = chat.participants.filter(id => id !== user.uid);
      if (remainingParticipants.length < 2) {
        // Auto-delete group: save data to admin panel first
        await handleGroupAutoDelete(chatId);
        return;
      }
      // Find most active user (or first participant) as new admin
      let newAdminId = remainingParticipants[0];
      const currentHistory = chat.groupMetadata?.adminHistory || [];
      await updateDoc(doc(db, 'chats', chatId), {
        participants: remainingParticipants,
        'groupMetadata.adminId': newAdminId,
        'groupMetadata.adminHistory': [...currentHistory, newAdminId]
      });
      // Let the snapshot listener handle state updates
    } catch (error) {
      console.error("Admin leave group error:", error);
    }
  };

  const handleGroupAutoDelete = async (targetChatId: string) => {
    try {
      // Save all data to adminDeleteRequests with special type
      const messagesSnap = await getDocs(collection(db, 'chats', targetChatId, 'messages'));
      const messagesData = messagesSnap.docs.map(d => ({ msgId: d.id, ...d.data() }));
      const chatDoc = await getDoc(doc(db, 'chats', targetChatId));
      const chatData = chatDoc.data();
      await addDoc(collection(db, 'adminDeleteRequests'), {
        type: 'group-auto-delete',
        chatId: targetChatId,
        chatData: chatData || {},
        messages: messagesData,
        participantCount: chatData?.participants?.length || 0,
        requestedBy: user?.uid || 'system',
        timestamp: serverTimestamp(),
        status: 'pending',
        deletedAt: serverTimestamp()
      });
      // Delete messages and chat
      for (const msg of messagesSnap.docs) {
        await deleteDoc(doc(db, 'chats', targetChatId, 'messages', msg.id));
      }
      await deleteDoc(doc(db, 'chats', targetChatId));
    } catch (error) {
      console.error("Group auto-delete error:", error);
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍', '🔥', '🎉'];

  const handleReaction = async (msgId: string, emoji: string) => {
    if (!user || !chatId) return;
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    const currentReactions = { ...(msg.reactions || {}) };
    
    // Toggle: if same emoji, remove it
    if (currentReactions[user.uid] === emoji) {
      delete currentReactions[user.uid];
    } else {
      currentReactions[user.uid] = emoji;
    }

    try {
      await updateDoc(doc(db, 'chats', chatId, 'messages', msgId), {
        reactions: currentReactions
      });
      setReactionMenu(null);
    } catch (error) {
      console.error("Reaction update error:", error);
    }
  };

  const onContextMenu = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault();
    setReactionMenu({ msgId, x: e.clientX, y: e.clientY });
  };

  const amIHolding = chat?.heldBy === user?.uid;
  const isBeingHeld = !!chat?.heldBy && !amIHolding;

  // Check if current user is banned from this group
  const isBannedFromGroup = chat?.type === 'group' && chat?.groupMetadata?.bannedUsers?.some(b => {
    if (b.uid !== user?.uid) return false;
    if (!b.bannedUntil) return true; // permanent ban
    return new Date(b.bannedUntil.seconds * 1000 || b.bannedUntil) > new Date();
  });

  const handleHoldToggle = async () => {
    if (!chatId || !user || !chat) return;
    try {
      if (amIHolding) {
        await updateDoc(doc(db, 'chats', chatId), { heldBy: null, holdExpiresAt: null });
      } else {
        await updateDoc(doc(db, 'chats', chatId), { heldBy: user.uid, holdExpiresAt: new Date(Date.now() + 24*60*60*1000) });
      }
    } catch (err) {
      console.error("Hold toggle error:", err);
    }
  };

  useEffect(() => {
    if (!chatId || !user) return;

    // Listen for calls for this specific chat
    const callsQuery = query(
      collection(db, 'calls'),
      where('chatId', '==', chatId),
      where('status', 'in', ['calling', 'ongoing'])
    );

    const unsubCalls = onSnapshot(callsQuery, (snapshot) => {
      const call = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Call))[0];
      setActiveCallForChat(call || null);
    });

    // Fetch chat metadata
    const chatRef = doc(db, 'chats', chatId);
    const unsubChat = onSnapshot(chatRef, async (d) => {
      if (d.exists()) {
        const chatData = d.data() as Chat;
        chatData.id = d.id;
        setChat(chatData);
        
        if (chatData.type === 'private') {
          const otherId = chatData.participants.find(p => p !== user.uid);
          if (otherId) {
            const userDoc = await getDoc(doc(db, 'users', otherId));
            if (userDoc.exists()) setOtherUser(userDoc.data() as UserProfile);
          }
        } else if (chatData.type === 'group') {
          // Auto-delete group if < 2 participants
          const nonBannedParticipants = chatData.participants.filter((pId: string) => {
            const bannedInfo = chatData.groupMetadata?.bannedUsers?.find(b => b.uid === pId);
            if (!bannedInfo) return true;
            if (!bannedInfo.bannedUntil) return false;
            const bannedUntilMs = bannedInfo.bannedUntil?.seconds ? bannedInfo.bannedUntil.seconds * 1000 : new Date(bannedInfo.bannedUntil).getTime();
            return bannedUntilMs <= Date.now();
          });
          if (nonBannedParticipants.length < 2 && user?.uid && nonBannedParticipants.includes(user.uid)) {
            // The current user is one of the <2 remaining - trigger auto-delete
            handleGroupAutoDelete(chatId).catch(console.error);
          }
          // Group: Fetch all participant names for message display
          const newParticipantInfo = { ...participantInfo };
          for (const pId of chatData.participants) {
            if (!newParticipantInfo[pId]) {
              const userDoc = await getDoc(doc(db, 'users', pId));
              if (userDoc.exists()) newParticipantInfo[pId] = userDoc.data() as UserProfile;
            }
          }
          setParticipantInfo(newParticipantInfo);
        }
      }
    });

    // Fetch messages
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubMsgs = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);

      // Mark incoming messages as read
      msgs.forEach(async (msg) => {
        if (msg.senderId !== user.uid && msg.status !== 'read') {
          try {
            await updateDoc(doc(db, 'chats', chatId, 'messages', msg.id), {
              status: 'read'
            });
          } catch (error) {
            // Silently fail if rules prevent it (e.g. if we are not a participant anymore)
            console.warn("Could not mark message as read", error);
          }
        }
      });
    });

    const handleClickOutside = () => setReactionMenu(null);
    window.addEventListener('click', handleClickOutside);

    return () => {
      unsubCalls();
      unsubChat();
      unsubMsgs();
      window.removeEventListener('click', handleClickOutside);
    };
  }, [chatId, user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleVideoSend = () => {
    videoInputRef.current?.click();
  };

  const handleVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !chatId) return;

    if (file.size > 1500 * 1024) {
      showCustomAlert("Dosya Boyutu Sınırı", "Ses/video dosyası çok büyük (maksimum 1.5MB olmalıdır).");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Video = reader.result as string;
      try {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          videoUrl: base64Video,
          senderId: user.uid,
          timestamp: serverTimestamp(),
          type: 'video',
          status: 'sent'
        });

        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: {
            text: '🎥 Video Mesajı',
            senderId: user.uid,
            senderName: user.displayName,
            timestamp: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Video gönderme hatası:", error);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Video Recording State
  const [isVideoRecording, setIsVideoRecording] = useState(false);
  const [videoRecordingTime, setVideoRecordingTime] = useState(0);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoTimerRef = useRef<any>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [videoPreviewStream, setVideoPreviewStream] = useState<MediaStream | null>(null);
  const MAX_VIDEO_SECONDS = 15;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          if (base64Audio.length > 800000) {
            showCustomAlert("Ses Kaydı Sınırı", "Ses mesajı çok uzun, lütfen daha kısa bir kayıt yapın.");
            return;
          }
          await sendAudioMessage(base64Audio);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Microphone access error:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const startVideoRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } } });
      setVideoPreviewStream(stream);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      videoRecorderRef.current = mediaRecorder;
      videoChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setVideoPreviewStream(null);
        const videoBlob = new Blob(videoChunksRef.current, { type: 'video/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(videoBlob);
        reader.onloadend = async () => {
          const base64Video = reader.result as string;
          if (base64Video.length > 1500 * 1024) {
            showCustomAlert("Video Boyutu Sınırı", "Video çok büyük, lütfen daha kısa bir kayıt yapın.");
            return;
          }
          try {
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
              videoUrl: base64Video,
              senderId: user.uid,
              timestamp: serverTimestamp(),
              type: 'video',
              status: 'sent'
            });
            await updateDoc(doc(db, 'chats', chatId), {
              lastMessage: { text: '🎥 Video Mesajı', senderId: user.uid, senderName: user.displayName, timestamp: serverTimestamp() },
              updatedAt: serverTimestamp()
            });
          } catch (error) {
            console.error("Video kaydı gönderme hatası:", error);
          }
        };
      };

      mediaRecorder.start();
      setIsVideoRecording(true);
      setVideoRecordingTime(0);
      videoTimerRef.current = setInterval(() => {
        setVideoRecordingTime(prev => {
          const next = prev + 1;
          if (next >= MAX_VIDEO_SECONDS) {
            stopVideoRecording();
            return MAX_VIDEO_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch (error) {
      console.error("Video kaydı başlatma hatası:", error);
    }
  };

  const stopVideoRecording = () => {
    if (videoRecorderRef.current && isVideoRecording) {
      videoRecorderRef.current.stop();
      setIsVideoRecording(false);
      clearInterval(videoTimerRef.current);
    }
  };

  const sendAudioMessage = async (audioUrl: string) => {
    if (!user || !chatId) return;
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        audioUrl,
        senderId: user.uid,
        timestamp: serverTimestamp(),
        type: 'audio',
        status: 'sent'
      });

      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: '🎤 Ses Mesajı',
          senderId: user.uid,
          senderName: user.displayName,
          timestamp: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Audio send error:", error);
    }
  };

  const AudioPlayer: React.FC<{ url: string; isMe: boolean }> = ({ url, isMe }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const togglePlay = () => {
      if (!audioRef.current) return;
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    };

    return (
      <div className={cn(
        "flex items-center gap-3 min-w-[200px] py-1",
        isMe ? "text-white" : "text-slate-800"
      )}>
        <button 
          onClick={togglePlay}
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center transition-all",
            isMe ? "bg-white/20 hover:bg-white/30" : "bg-blue-50 hover:bg-blue-100 text-blue-600 shadow-sm"
          )}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>
        <div className="flex-1 flex flex-col gap-1">
          <div className="h-1 bg-current opacity-20 rounded-full relative overflow-hidden">
             <div className="absolute inset-0 bg-current rounded-full" style={{ width: '40%' }} />
          </div>
          <span className="text-[10px] font-bold opacity-60">Ses Mesajı</span>
        </div>
        <audio 
          ref={audioRef} 
          src={url} 
          onEnded={() => setIsPlaying(false)}
          className="hidden" 
        />
      </div>
    );
  };

  const handleImageSend = () => {
    imageInputRef.current?.click();
  };

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !chatId) return;

    const isVideo = file.type.startsWith('video/');

    if (isVideo) {
      if (file.size > 1500 * 1024) {
        showCustomAlert("Dosya Boyutu Sınırı", "Video dosyası çok büyük (maksimum 1.5MB olmalıdır).");
        return;
      }
    } else {
      if (file.size > 800 * 1024) {
        showCustomAlert("Dosya Boyutu Sınırı", "Seçilen dosya çok büyük (maksimum 800KB olmalıdır).");
        return;
      }
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      try {
        if (isVideo) {
          await addDoc(collection(db, 'chats', chatId, 'messages'), {
            videoUrl: base64Data,
            senderId: user.uid,
            timestamp: serverTimestamp(),
            type: 'video',
            status: 'sent'
          });
          await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: { text: '🎥 Video', senderId: user.uid, senderName: user.displayName, timestamp: serverTimestamp() },
            updatedAt: serverTimestamp()
          });
        } else {
          await addDoc(collection(db, 'chats', chatId, 'messages'), {
            imageUrl: base64Data,
            senderId: user.uid,
            timestamp: serverTimestamp(),
            type: 'image',
            status: 'sent'
          });
          await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: { text: '📷 Fotoğraf', senderId: user.uid, senderName: user.displayName, timestamp: serverTimestamp() },
            updatedAt: serverTimestamp()
          });
        }
      } catch (error) {
        console.error("Dosya gönderme hatası:", error);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!chatId) return;
    showCustomConfirm(
      "Mesajı Sil",
      "Bu mesajı silmek istediğinizden emin misiniz? Silinen bu mesaj sadece sizin 'Sildiğim Mesajları Göster' seçeneğiniz açıkken görüntülenebilir.",
      async () => {
        try {
          await updateDoc(doc(db, 'chats', chatId, 'messages', msgId), {
            isDeleted: true,
            deletedAt: serverTimestamp()
          });
        } catch (error) {
          console.error("Delete message error:", error);
        }
      }
    );
  };

  const handleClearChat = async () => {
    if (!chatId) return;
    setIsHeaderMenuOpen(false);
    showCustomConfirm(
      "Sohbeti Temizle",
      "Bu sohbetteki tüm mesajları silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.",
      async () => {
        try {
          const messagesRef = collection(db, 'chats', chatId, 'messages');
          const q = query(messagesRef);
          const querySnapshot = await getDocs(q);
          const deletePromises = querySnapshot.docs.map(d => deleteDoc(doc(db, 'chats', chatId, 'messages', d.id)));
          await Promise.all(deletePromises);
          
          // Update lastMessage
          await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: {
              text: 'Sohbet geçmişi temizlendi.',
              senderId: user?.uid || '',
              senderName: user?.displayName || '',
              timestamp: serverTimestamp()
            },
            updatedAt: serverTimestamp()
          });
        } catch (error) {
          console.error("Clear chat error:", error);
        }
      }
    );
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user || !chatId) return;
    if (isBannedFromGroup) {
      showCustomAlert('Banlandınız', 'Bu gruptan banlandığınız için mesaj gönderemezsiniz.');
      return;
    }

    const text = inputText;
    setInputText('');

    let pwd = '';
    if (encryptMode) {
      pwd = prompt('Şifreli mesaj şifresini girin:') || '';
      if (!pwd) { setEncryptMode(false); return; }
    }

    const messageData: any = {
      text,
      senderId: user.uid,
      timestamp: serverTimestamp(),
      type: 'text',
      status: 'sent'
    };

    if (encryptMode && pwd) {
      messageData.encrypted = true;
      messageData.imagePassword = btoa(pwd);
    }

    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), messageData);
      
      // Update chat last message
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: encryptMode && pwd ? '🔒 Şifreli Mesaj' : text,
          senderId: user.uid,
          senderName: user.displayName,
          timestamp: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
    setEncryptMode(false);
  };

  const getChatHeaderInfo = () => {
    if (chat?.type === 'group') {
      return {
        name: chat.groupMetadata?.name || 'Grup',
        statusText: `${chat.participants.length} katılımcı`,
        status: 'online',
        uin: null,
        photoURL: chat.groupMetadata?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${chatId}`
      };
    }
    
    const s = otherUser?.onlineStatus || 'online';
    const labels = { online: 'çevrimiçi', away: 'uzakta', busy: 'meşgul' };
    
    return {
      name: otherUser?.displayName || 'Yükleniyor...',
      statusText: labels[s as keyof typeof labels],
      status: s,
      uin: otherUser?.uin,
      photoURL: otherUser?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${chatId}`
    };
  };

  const headerInfo = getChatHeaderInfo();

  const MessageStatus: React.FC<{ status?: string }> = ({ status }) => {
    if (!status) return <Clock size={12} className="opacity-50" />;
    
    const baseClasses = "w-2.5 h-2.5 rounded-full transition-all duration-300";
    
    switch (status) {
      case 'sent':
        // Hollow white circle
        return <div className={cn(baseClasses, "border border-white/60")} />;
      case 'delivered':
        // Solid white circle
        return <div className={cn(baseClasses, "bg-white/80")} />;
      case 'read':
        // Green-filled circle with white border
        return <div className={cn(baseClasses, "bg-emerald-400 border border-white ring-1 ring-emerald-500/20")} />;
      default:
        return <Clock size={12} className="opacity-50" />;
    }
  };

  if (!chatId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl shadow-slate-200/50 border border-slate-100">
          <MessageSquarePlus size={44} className="text-blue-500/40" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Sync Platform</h2>
        <p className="max-w-xs text-center mt-3 text-sm font-medium text-slate-500">
          Uçtan uca şifreli, gerçek zamanlı iletişim protokolü. Bir sohbet seçerek başlayın.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0 pointer-events-none">
         <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-100/30 blur-[100px] rounded-full" />
      </div>

      {/* Chat Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-3 shrink-0 relative z-10">
        {/* Row 1: Avatar + Name */}
        <div className="flex items-center">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full mr-4 shadow-sm overflow-hidden border-2 border-white shrink-0">
            <img 
              src={headerInfo.photoURL} 
              alt={headerInfo.name} 
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 leading-none truncate">{headerInfo.name}</h3>
              {headerInfo.status && (
                <span className={cn(
                  "text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm shrink-0",
                  headerInfo.status === 'online' ? "bg-green-500 text-white" : 
                  headerInfo.status === 'away' ? "bg-amber-500 text-white" : "bg-red-500 text-white"
                )}>
                  {headerInfo.status === 'online' ? 'Çevrimiçi' : headerInfo.status === 'away' ? 'Uzakta' : 'Meşgul'}
                </span>
              )}
              {headerInfo.uin && <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded tracking-tighter shrink-0">#{headerInfo.uin}</span>}
            </div>
            <span className={cn(
              "text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 mt-1",
              headerInfo.status === 'online' ? "text-green-500" : headerInfo.status === 'away' ? "text-amber-500" : "text-red-500"
            )}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full animate-pulse",
                headerInfo.status === 'online' ? "bg-green-500" : headerInfo.status === 'away' ? "bg-amber-500" : "bg-red-500"
              )} />
              {headerInfo.statusText}
            </span>
          </div>
        </div>

        {/* Row 2: Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-4 text-slate-400 relative mt-2 pl-14">
          {activeCallForChat && !activeCall && (
            <button 
              onClick={() => acceptCall()}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-green-500/20 active:scale-95 animate-pulse"
            >
              <Video size={16} />
              <span className="hidden sm:inline">KATIL</span>
            </button>
          )}
          
          {!activeCallForChat && (
            <>
              <button 
                onClick={() => chat && startCall(chat.id, chat.participants, chat.type, 'audio')}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-blue-50 hover:text-blue-600 transition-all active:scale-90"
                title="Sesli Arama Başlat"
              >
                <Phone size={16} />
              </button>
              <button 
                onClick={() => chat && startCall(chat.id, chat.participants, chat.type, 'video')}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-all active:scale-90 shadow-md shadow-blue-500/20"
                title="Görüntülü Arama Başlat"
              >
                <Video size={16} />
              </button>
            </>
          )}

          {activeCallForChat && activeCall?.id === activeCallForChat.id && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-ping" />
              GÖRÜŞMEDESİN
            </div>
          )}
          
          {/* Ara */}
          <button 
            onClick={() => setShowChatSearch(!showChatSearch)}
            className={cn("hover:text-blue-600 transition-colors p-1 rounded-full hover:bg-blue-50", showChatSearch && "text-blue-600 bg-blue-50")}
            title="Sohbet İçi Ara"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>

          {/* Toplu Seç */}
          <button 
            onClick={() => { setBatchMode(!batchMode); setSelectedMsgs(new Set()); }}
            className={cn("hover:text-slate-900 transition-colors p-1 rounded-full hover:bg-slate-100", batchMode && "text-blue-600 bg-blue-50")}
            title="Toplu Mesaj Seç"
          >
            <ListChecks size={18} />
          </button>

          {/* Beklemeye Al */}
          {(chat?.type === 'private' || isGroupAdmin) && (
            <button 
              onClick={handleHoldToggle}
              className={cn("transition-colors p-1 rounded-full hover:bg-amber-50 relative", amIHolding ? "text-amber-500 bg-amber-50" : "hover:text-amber-500")}
              title={amIHolding ? 'Beklemeden Çıkar' : 'Beklemeye Al'}
            >
              {amIHolding ? <Play size={18} /> : <Pause size={18} />}
            </button>
          )}

          {/* User Info */}
          <button 
            onClick={() => {
              if (chat?.type === 'group') {
                const uinList = chat.participants.map(pId => `👤 ${participantInfo[pId]?.displayName || 'Katılımcı'} (UIN: #${participantInfo[pId]?.uin || 'Yok'})`).join('\n');
                showCustomAlert("Grup Bilgileri", uinList);
              } else if (otherUser) {
                setShowProfile(true);
              }
            }}
            className="hover:text-blue-600 transition-colors p-1 rounded-full hover:bg-blue-50"
            title="Kullanıcı Bilgisi"
          >
            <Info size={18} />
          </button>

          {/* Group Admin Button */}
          {isGroupAdmin && (
            <button 
              onClick={() => { setShowGroupAdmin(true); loadGroupMembers(); }}
              className="hover:text-amber-500 transition-colors p-1 rounded-full hover:bg-amber-50 text-slate-400"
              title="Grup Yönetimi"
            >
              <Shield size={18} />
            </button>
          )}

          <div className="relative ml-auto">
            <button 
              onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
              className="hover:text-slate-900 transition-colors p-1 rounded-full hover:bg-slate-100"
            >
              <MoreVertical size={18} />
            </button>

            {isHeaderMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsHeaderMenuOpen(false)} 
                />
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-150 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sohbet İşlemleri</p>
                  </div>
                  <button 
                    onClick={handleClearChat}
                    className="w-full text-left px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Sohbet Geçmişini Temizle
                  </button>
                  <button 
                    onClick={() => {
                      setShowDeletedMessages(!showDeletedMessages);
                      setIsHeaderMenuOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 text-xs font-bold transition-colors flex items-center gap-2",
                      showDeletedMessages ? "text-amber-600 hover:bg-amber-50" : "text-blue-600 hover:bg-blue-50"
                    )}
                  >
                    {showDeletedMessages ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showDeletedMessages ? ' Sildiğim Mesajları Gizle' : ' Sildiğim Mesajları Göster'}
                  </button>
                  {isGroupAdmin && (
                    <button 
                      onClick={() => {
                        setIsHeaderMenuOpen(false);
                        showCustomConfirm(
                          'Gruptan Ayrıl',
                          'Grubu başka bir yöneticiye devretmeden ayrılıyorsunuz. En aktif üye yönetici olacak. Devam etmek istiyor musunuz?',
                          () => handleAdminLeaveGroup()
                        );
                      }}
                      className="w-full text-left px-4 py-3 text-xs font-bold text-amber-600 hover:bg-amber-50 transition-colors flex items-center gap-2 border-t border-slate-100"
                    >
                      <LogOut size={14} /> Admin Olarak Ayrıl
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Search Bar */}
      {showChatSearch && (
        <div className="p-3 bg-white border-b border-slate-200 shrink-0 z-10">
          <div className="relative">
            <input type="text" value={chatSearchQuery} onChange={e => setChatSearchQuery(e.target.value)}
              placeholder="Mesajlarda ara..."
              className="w-full bg-slate-100 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none"
              autoFocus
            />
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            {chatSearchQuery && (
              <button onClick={() => setChatSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                <X size={16} />
              </button>
            )}
          </div>
          <div className="mt-1 text-[9px] text-slate-400 font-bold">
            {messages.filter(m => m.text?.toLowerCase().includes(chatSearchQuery.toLowerCase())).length} sonuç
          </div>
        </div>
      )}

      {/* Hold Banner */}
      {isBeingHeld && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 shrink-0">
          <Pause size={14} className="text-amber-600" />
          <span className="text-[10px] font-bold text-amber-700">Bu sohbet beklemeye alındı. Mesaj gönderemezsiniz.</span>
        </div>
      )}

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar z-10"
      >
        <div className="flex justify-center mb-8">
          <span className="px-3 py-1 bg-slate-200 text-slate-500 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm">BUGÜN</span>
        </div>

        <AnimatePresence>
          {messages
            .filter(msg => !msg.isDeleted || (showDeletedMessages && msg.senderId === user?.uid))
            .filter(msg => !chatSearchQuery || msg.text?.toLowerCase().includes(chatSearchQuery.toLowerCase()))
            .map((msg, idx) => {
              const isMe = msg.senderId === user?.uid;
              const sender = participantInfo[msg.senderId];
              const isDeleted = msg.isDeleted === true;

              return (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id || idx}
                className={cn(
                  "flex items-end space-x-3 max-w-[80%] sm:max-w-[70%] group",
                  isMe ? "self-end flex-row-reverse space-x-reverse" : "self-start"
                )}
              >
                {batchMode && msg.id && (
                  <input type="checkbox"
                    checked={selectedMsgs.has(msg.id)}
                    onChange={() => {
                      const next = new Set(selectedMsgs);
                      if (next.has(msg.id!)) next.delete(msg.id!);
                      else next.add(msg.id!);
                      setSelectedMsgs(next);
                    }}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                )}
                {!isMe && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0 border border-white shadow-sm overflow-hidden">
                      <img src={sender?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className={cn(
                     "flex flex-col relative group",
                     isMe ? "items-end" : "items-start"
                  )}>
                    {!isMe && chat?.type === 'group' && (
                      <span className="text-[10px] font-black text-slate-400 mb-1 ml-1 uppercase tracking-wider">
                        {sender?.displayName || 'Bilinmeyen'}
                      </span>
                    )}
                    <div 
                      onContextMenu={(e) => msg.id && !isDeleted && onContextMenu(e, msg.id)}
                      className={cn(
                        "px-5 py-3 rounded-2xl shadow-sm border overflow-hidden relative group/bubble transition-all duration-300",
                        isDeleted
                          ? "bg-slate-100 text-slate-400 border-slate-200/60 opacity-60 rounded-br-none"
                          : isMe 
                            ? "bg-blue-600 text-white border-blue-500 rounded-br-none shadow-blue-100" 
                            : "bg-white text-slate-800 border-slate-100 rounded-bl-none"
                      )}
                    >
                      {isDeleted && (
                        <div className="text-[9px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1 mb-1.5 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded w-max select-none">
                          <Trash2 size={10} /> SİLDİĞİNİZ MESAJ
                        </div>
                      )}

                      {msg.type === 'text' && (
                        msg.encrypted && !isMe ? (
                          <button onClick={() => setDecryptModal(msg)}
                            className="text-sm font-medium leading-relaxed opacity-70 hover:opacity-100 text-left w-full">
                            🔒 Şifreli Mesaj (dokunun)
                          </button>
                        ) : (
                          <p className={cn(
                            "text-sm font-medium leading-relaxed",
                            isDeleted && "line-through text-slate-400 font-normal italic"
                          )}>{msg.text}</p>
                        )
                      )}
                      
                      {msg.type === 'image' && msg.imageUrl && (
                        <div className={cn(
                          "relative rounded-lg overflow-hidden mb-1 min-w-[200px]",
                          isDeleted && "grayscale blur-[2px] opacity-40"
                        )}>
                          {msg.encrypted && !isMe ? (
                            <>
                              <img src={msg.imageUrl} alt="" className="w-full h-auto object-cover blur-[12px]" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <button onClick={() => setDecryptModal(msg)}
                                  className="bg-black/50 text-white text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm hover:bg-black/70 cursor-pointer">🔒 Şifreli</button>
                              </div>
                            </>
                          ) : (
                            <img 
                              src={msg.imageUrl} 
                              alt="Paylaşılan görsel" 
                              className="max-w-full h-auto object-cover hover:scale-105 transition-transform duration-500 cursor-pointer"
                              onClick={() => !isDeleted && window.open(msg.imageUrl, '_blank')}
                            />
                          )}
                        </div>
                      )}

                      {msg.type === 'video' && msg.videoUrl && (
                        <div className={cn(
                          "relative rounded-lg overflow-hidden mb-1 min-w-[240px] bg-black/5",
                          isDeleted && "grayscale blur-[2px] opacity-40"
                        )}>
                          {msg.encrypted && !isMe ? (
                            <>
                              <video src={msg.videoUrl} className="max-w-full h-auto blur-[12px]" playsInline />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <button onClick={() => setDecryptModal(msg)}
                                  className="bg-black/50 text-white text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm hover:bg-black/70 cursor-pointer">🔒 Şifreli</button>
                              </div>
                            </>
                          ) : (
                            <video 
                              src={msg.videoUrl} 
                              className="max-w-full h-auto" 
                              controls={!isDeleted}
                              playsInline
                            />
                          )}
                        </div>
                      )}

                      {msg.type === 'audio' && msg.audioUrl && (
                        <div className={cn(isDeleted && "grayscale opacity-40 pointer-events-none")}>
                          {msg.encrypted && !isMe ? (
                            <button onClick={() => setDecryptModal(msg)}
                              className="text-[10px] font-bold flex items-center gap-1 text-slate-500 hover:text-slate-700">🔒 Şifreli Ses Mesajı (dokunun)</button>
                          ) : (
                            <AudioPlayer url={msg.audioUrl} isMe={isMe} />
                          )}
                        </div>
                      )}

                      <div className={cn(
                        "flex items-center justify-end mt-1.5 space-x-1",
                        isMe && !isDeleted ? "text-blue-100" : "text-slate-400"
                      )}>
                        <span className="text-[10px] font-medium">
                          {msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : ''}
                        </span>
                        {isMe && !isDeleted && <MessageStatus status={msg.status} />}
                      </div>
                    </div>

                    {/* Hover Actions: Reaction & Delete */}
                    {!isDeleted && msg.id && (
                      <div className={cn(
                        "absolute flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white border border-slate-200 p-1 rounded-full shadow-lg z-20",
                        isMe ? "right-full mr-3 top-1/2 -translate-y-1/2" : "left-full ml-3 top-1/2 -translate-y-1/2"
                      )}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (msg.id) {
                              setReactionMenu({ msgId: msg.id, x: e.clientX, y: e.clientY });
                            }
                          }}
                          className="p-1 px-1.5 text-slate-400 hover:text-slate-600 active:scale-110 transition-all rounded-full flex items-center justify-center cursor-pointer"
                          title="Tepki Bırak"
                        >
                          <Smile size={14} />
                        </button>
                        
                        {isMe && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (msg.id) {
                                handleDeleteMessage(msg.id);
                              }
                            }}
                            className="p-1 px-1.5 text-slate-400 hover:text-red-500 active:scale-110 transition-all rounded-full flex items-center justify-center cursor-pointer"
                            title="Mesajı Sil"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Reaction Badges */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className={cn(
                      "flex flex-wrap gap-1 mt-1 px-1",
                      isMe ? "justify-end" : "justify-start"
                    )}>
                      {Object.entries(
                        Object.values(msg.reactions).reduce((acc, emoji) => {
                          acc[emoji] = (acc[emoji] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      ).map(([emoji, count]) => (
                        <button
                          key={emoji}
                          onClick={() => msg.id && handleReaction(msg.id, emoji)}
                          className={cn(
                            "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-all",
                            msg.reactions?.[user?.uid || ''] === emoji
                              ? "bg-blue-50 border-blue-200 text-blue-600 scale-110"
                              : "bg-white border-slate-100 text-slate-500 hover:bg-slate-50"
                          )}
                        >
                          <span>{emoji}</span>
                          {count > 1 && <span>{count}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Batch Action Bar */}
      {batchMode && (
        <div className="p-3 bg-white border-t border-b border-slate-200 flex items-center justify-between shrink-0 z-10">
          <span className="text-xs font-bold text-slate-500">{selectedMsgs.size} mesaj seçildi</span>
          <div className="flex gap-2">
            <button onClick={() => { setBatchMode(false); setSelectedMsgs(new Set()); }}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider">
              İptal
            </button>
            <button onClick={() => {
                if (selectedMsgs.size === 0) return;
                showCustomConfirm('Mesajları Sil', `${selectedMsgs.size} mesajı silmek istediğinize emin misiniz?`, async () => {
                  if (!chat) return;
                  for (const msgId of selectedMsgs) {
                    try {
                      await updateDoc(doc(db, 'chats', chatId, 'messages', msgId), { isDeleted: true });
                    } catch(err) { console.error(err); }
                  }
                  setBatchMode(false);
                  setSelectedMsgs(new Set());
                });
              }}
              disabled={selectedMsgs.size === 0}
              className="px-4 py-2 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider disabled:opacity-40">
              Seçilenleri Sil
            </button>
          </div>
        </div>
      )}

      {/* Hold Banner (bottom) */}
      {isBeingHeld && !isBannedFromGroup && (
        <div className="p-3 bg-amber-50 border-t border-amber-200 flex items-center gap-2 shrink-0">
          <Pause size={14} className="text-amber-600" />
          <span className="text-[10px] font-bold text-amber-700">Bu sohbet beklemeye alındı. Mesaj gönderemezsiniz.</span>
        </div>
      )}

      {/* Ban Banner */}
      {isBannedFromGroup && (
        <div className="p-3 bg-red-50 border-t border-red-200 flex items-center gap-2 shrink-0">
          <Ban size={14} className="text-red-600" />
          <span className="text-[10px] font-bold text-red-700">Bu gruptan banlandınız. Mesaj gönderemezsiniz.</span>
        </div>
      )}

      {/* Input Area */}
      <footer className="p-6 bg-white border-t border-slate-200 shrink-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center bg-slate-100 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-500 transition-all relative">
          
          {/* Hidden inputs for real uploads */}
          <input 
            type="file" 
            ref={imageInputRef}
            onChange={handleImageFileSelect}
            accept="image/*,video/*"
            className="hidden"
          />
          <input 
            type="file" 
            ref={videoInputRef}
            onChange={handleVideoFileSelect}
            accept="video/*"
            className="hidden"
          />

          <div className="relative">
            <button 
              type="button" 
              onClick={() => setIsEmojiMenuOpen(!isEmojiMenuOpen)}
              className={cn(
                "p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-xl",
                isEmojiMenuOpen && "bg-slate-200 text-slate-700"
              )}
            >
              <Smile size={20} />
            </button>

            {isEmojiMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsEmojiMenuOpen(false)} />
                <div className="absolute bottom-12 left-0 w-64 bg-white border border-slate-150 rounded-2xl shadow-xl p-3 z-40 grid grid-cols-5 gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-155">
                  {['😀', '😂', '😍', '👍', '🔥', '🎉', '❤️', '🤔', '😎', '👏', '🙏', '😭', '😡', '😮', '🚀'].map(emoji => (
                    <button
                      type="button"
                      key={emoji}
                      onClick={() => {
                        setInputText(prev => prev + emoji);
                        setIsEmojiMenuOpen(false);
                      }}
                      className="w-10 h-10 flex items-center justify-center text-lg hover:bg-slate-50 active:scale-125 transition-all rounded-xl"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button 
              type="button" 
              onClick={() => { imageInputRef.current?.click(); setShowUploadMenu(false); }}
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
              title="Fotoğraf/Video Yükle"
            >
              <Image size={20} />
            </button>
            <button
              type="button"
              onClick={() => setShowUploadMenu(!showUploadMenu)}
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors absolute -bottom-1 -right-1 bg-white rounded-full shadow-sm border border-slate-200 w-4 h-4 flex items-center justify-center"
              title="Dosya Seçenekleri"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {showUploadMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowUploadMenu(false)} />
                <div className="absolute bottom-12 left-0 w-44 bg-white border border-slate-150 rounded-2xl shadow-xl py-1 z-40 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <button
                    type="button"
                    onClick={() => { imageInputRef.current?.click(); setShowUploadMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                  >
                    <Image size={14} /> Fotoğraf Yükle
                  </button>
                  <button
                    type="button"
                    onClick={() => { videoInputRef.current?.click(); setShowUploadMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                  >
                    <Video size={14} /> Video Yükle
                  </button>
                </div>
              </>
            )}
          </div>

          {isVideoRecording ? (
            <div className="flex items-center gap-3 px-4 py-1 bg-red-50 text-red-600 rounded-xl animate-in fade-in zoom-in-95 duration-200">
              <video ref={videoPreviewRef} autoPlay playsInline muted className="w-10 h-10 rounded-lg object-cover bg-slate-200" />
              <div className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
              <span className="text-xs font-black tabular-nums">{Math.floor(videoRecordingTime / 60)}:{String(videoRecordingTime % 60).padStart(2, '0')} / 0:15</span>
              <button onClick={stopVideoRecording} className="p-1 px-2 bg-red-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">Durdur</button>
            </div>
          ) : (
            <button 
              type="button" 
              onClick={startVideoRecording}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              title="Video Kaydet"
            >
              <Video size={20} />
            </button>
          )}

          {isRecording ? (
            <div className="flex items-center gap-3 px-4 py-1 bg-red-50 text-red-600 rounded-xl animate-in fade-in zoom-in-95 duration-200">
               <div className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
               <span className="text-xs font-black tabular-nums">{Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}</span>
               <button onClick={stopRecording} className="p-1 px-2 bg-red-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">Durur ve Gönder</button>
            </div>
          ) : (
            <button 
              type="button" 
              onClick={startRecording}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
            >
              <Mic size={20} />
            </button>
          )}

          {/* Şifreli Mesaj Butonu */}
          <button 
            type="button" 
            onClick={() => setEncryptMode(!encryptMode)}
            className={cn(
              "p-1.5 sm:p-2 transition-colors shrink-0",
              encryptMode ? "text-amber-500 bg-amber-50 rounded-lg" : "text-slate-400 hover:text-slate-600"
            )}
            title={encryptMode ? 'Şifreli Gönder: AÇIK' : 'Şifreli Gönder: KAPALI'}
          >
            <Lock size={18} />
          </button>

          <form onSubmit={handleSend} className="flex-1 flex items-center">
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isBeingHeld ? "Sohbet beklemeye alındı..." : "Mesaj yaz..."}
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-4 text-slate-900 placeholder:text-slate-400"
            />
            <button 
              type="submit"
              disabled={!inputText.trim()}
              className={cn(
                "p-2 rounded-xl transition-all flex items-center justify-center shadow-lg",
                inputText.trim() 
                  ? "bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700" 
                  : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
              )}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </footer>

      {/* Reaction Menu Overlay */}
      <AnimatePresence>
        {reactionMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="fixed z-[100] bg-white/80 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-2xl p-2 flex gap-1 items-center"
            style={{ 
              top: Math.min(reactionMenu.y, window.innerHeight - 80), 
              left: Math.min(reactionMenu.x, window.innerWidth - 300) 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleReaction(reactionMenu.msgId, emoji)}
                className="w-10 h-10 flex items-center justify-center text-xl hover:bg-slate-100 rounded-xl transition-all active:scale-125"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Alert/Confirm Modal */}
      <AnimatePresence>
        {customDialog?.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 max-w-sm w-full flex flex-col gap-4 text-center relative z-[120]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto text-xl font-bold">
                {customDialog.type === 'confirm' ? '❓' : 'ℹ️'}
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 leading-tight">{customDialog.title}</h3>
                <p className="text-xs text-slate-500 font-bold mt-2 leading-relaxed whitespace-pre-line">{customDialog.message}</p>
              </div>
              <div className="flex gap-3 justify-center mt-2">
                {customDialog.type === 'confirm' && (
                  <button
                    onClick={() => setCustomDialog(null)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 active:scale-95 transition-all border border-slate-200 cursor-pointer"
                  >
                    Vazgeç
                  </button>
                )}
                <button
                  onClick={() => {
                    if (customDialog.type === 'confirm' && customDialog.onConfirm) {
                      customDialog.onConfirm();
                    }
                    setCustomDialog(null);
                  }}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/10 cursor-pointer"
                >
                  Tamam
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Decrypt Modal */}
      <AnimatePresence>
        {decryptModal && (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md" onClick={() => setDecryptModal(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-6 shadow-2xl max-w-md w-full border border-slate-100" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">🔒 Şifreli Mesaj</h3>
                <button onClick={() => setDecryptModal(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400"><X size={18} /></button>
              </div>
              <DecryptContent msg={decryptModal} onClose={() => setDecryptModal(null)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Group Admin Modal */}
      <AnimatePresence>
        {showGroupAdmin && chat?.type === 'group' && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md" onClick={() => setShowGroupAdmin(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-slate-100 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <Shield size={22} className="text-amber-500" />
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Grup Yönetimi</h3>
                </div>
                <button onClick={() => setShowGroupAdmin(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                {/* Group Name Edit */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Grup Adı</h4>
                  {showEditGroupName ? (
                    <div className="flex gap-2">
                      <input type="text" value={editGroupName} onChange={e => setEditGroupName(e.target.value)}
                        placeholder="Yeni grup adı..."
                        className="flex-1 bg-white border-2 border-slate-200 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:border-blue-500 transition-all"
                        autoFocus onKeyDown={e => e.key === 'Enter' && handleEditGroupName()} />
                      <button onClick={handleEditGroupName} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all">Kaydet</button>
                      <button onClick={() => setShowEditGroupName(false)} className="px-4 py-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-300 transition-all">İptal</button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-700">{chat.groupMetadata?.name}</p>
                      <button onClick={() => { setEditGroupName(chat.groupMetadata?.name || ''); setShowEditGroupName(true); }}
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-bold hover:bg-blue-100 transition-all flex items-center gap-1">
                        <Settings size={12} /> Düzenle
                      </button>
                    </div>
                  )}
                </div>

                {/* Admin Transfer */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Yönetici Devret</h4>
                  {showTransferAdmin ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {loadingMembers ? (
                        <p className="text-xs text-slate-400 text-center py-4">Yükleniyor...</p>
                      ) : (
                        allMembers.filter(m => m.uid !== user?.uid).map(m => (
                          <button key={m.uid} onClick={() => handleTransferAdmin(m.uid)}
                            className="w-full flex items-center gap-3 p-3 bg-white rounded-xl hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-all text-left">
                            <img src={m.photoURL} className="w-8 h-8 rounded-full object-cover" />
                            <span className="text-sm font-bold text-slate-700">{m.displayName}</span>
                          </button>
                        ))
                      )}
                      <button onClick={() => setShowTransferAdmin(false)} className="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors">İptal</button>
                    </div>
                  ) : (
                    <button onClick={() => { loadGroupMembers(); setShowTransferAdmin(true); }}
                      className="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-bold hover:bg-amber-100 transition-all">
                      Yöneticiyi Devret
                    </button>
                  )}
                </div>

                {/* Kick/Ban Member */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Üyeler</h4>
                  {loadingMembers ? (
                    <p className="text-xs text-slate-400 text-center py-4">Yükleniyor...</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {allMembers.map(m => {
                        const isAdmin = m.uid === chat.groupMetadata?.adminId;
                        const isMe = m.uid === user?.uid;
                        const bannedInfo = chat.groupMetadata?.bannedUsers?.find(b => b.uid === m.uid);
                        return (
                          <div key={m.uid} className={cn("flex items-center gap-3 p-3 rounded-xl border transition-all", 
                            bannedInfo ? "bg-red-50 border-red-200" : "bg-white border-slate-100")}>
                            <img src={m.photoURL} className="w-8 h-8 rounded-full object-cover" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-700 truncate flex items-center gap-2">
                                {m.displayName}
                                {isAdmin && <span className="text-[8px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider">Admin</span>}
                                {isMe && <span className="text-[8px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider">Sen</span>}
                              </p>
                              {bannedInfo && (
                                <p className="text-[10px] text-red-500 font-bold">
                                  Banlı {bannedInfo.bannedUntil ? `(süre: ${bannedInfo.bannedUntil?.seconds ? new Date(bannedInfo.bannedUntil.seconds*1000).toLocaleDateString() : 'Süresiz'})` : '(Süresiz)'}
                                </p>
                              )}
                            </div>
                            {!isAdmin && !isMe && !bannedInfo && (
                              <div className="flex gap-1">
                                <button onClick={() => { setKickMemberId(m.uid); setShowKickMember(true); }}
                                  className="px-2 py-1 bg-red-50 text-red-600 rounded-lg text-[9px] font-bold hover:bg-red-100 transition-all flex items-center gap-1">
                                  <UserX size={10} /> At
                                </button>
                              </div>
                            )}
                            {bannedInfo && isGroupAdmin && (
                              <button onClick={() => handleUnbanMember(m.uid)}
                                className="px-2 py-1 bg-green-50 text-green-600 rounded-lg text-[9px] font-bold hover:bg-green-100 transition-all flex items-center gap-1">
                                <UserCheck size={10} /> Ban Kaldır
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Kick Duration Modal */}
                {showKickMember && kickMemberId && (
                  <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
                    <h4 className="text-xs font-black text-amber-700 uppercase tracking-wider mb-3">Kullanıcıyı Gruptan At</h4>
                    <p className="text-[10px] text-amber-600 font-bold mb-3">Süreli ban eklemek istiyor musunuz? (0 = sadece at, süreli ban yok)</p>
                    <div className="flex items-center gap-2 mb-4">
                      <input type="number" value={kickDuration} onChange={e => setKickDuration(Number(e.target.value))} min={0}
                        className="w-20 bg-white border-2 border-amber-200 rounded-xl px-3 py-2 text-sm font-bold text-center outline-none focus:border-amber-500 transition-all" />
                      <select value={kickDurationUnit} onChange={e => setKickDurationUnit(e.target.value as any)}
                        className="bg-white border-2 border-amber-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-amber-500 transition-all">
                        <option value="minutes">Dakika</option>
                        <option value="hours">Saat</option>
                        <option value="days">Gün</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleKickMember(kickMemberId)}
                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all">
                        {kickDuration > 0 ? 'Banla ve At' : 'Sadece At'}
                      </button>
                      <button onClick={() => { setShowKickMember(false); setKickMemberId(null); setKickDuration(0); }}
                        className="flex-1 py-2.5 bg-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-300 transition-all">
                        İptal
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Info */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-3xl shrink-0">
                <p className="text-[9px] text-slate-400 font-bold text-center">
                  Sadece grup yöneticisi bu ayarları değiştirebilir
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      {showProfile && otherUser && (
        <ProfileModal user={otherUser} onClose={() => setShowProfile(false)} />
      )}
    </div>
  );
};
