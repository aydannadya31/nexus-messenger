import React, { useEffect, useState, useRef, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, doc, updateDoc, setDoc, getDoc, where, deleteDoc, getDocs, writeBatch, arrayUnion } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { useCall } from './CallProvider';
import { Chat, Message, UserProfile, Call } from '../types';
import { cn } from '../lib/utils';
import ProfileModal from './ProfileModal';
import { Image, MoreVertical, Send, Smile, Phone, Video, MessageSquarePlus, Clock, Play, Mic, Square, Pause, Trash2, ListChecks, X, Info, Eye, EyeOff, Lock, LogOut, Shield, UserX, UserCheck, Ban, Settings, Reply, Pencil, Download, ChevronLeft, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { encryptMessage, decryptMessage } from '../lib/crypto';

const toBase64 = (str: string) => btoa(unescape(encodeURIComponent(str)));
const fromBase64 = (b64: string) => decodeURIComponent(escape(atob(b64)));

const DecryptContent: React.FC<{ msg: Message; onClose: () => void }> = ({ msg, onClose }) => {
  const [pwd, setPwd] = useState('');
  const [decrypted, setDecrypted] = useState<{ text?: string; imageUrl?: string; videoUrl?: string; audioUrl?: string } | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!msg.imagePassword) return;
    if (toBase64(pwd) === msg.imagePassword) {
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

const emojiCategories: Record<string, string[]> = {
  sik: ['😀','😂','🤣','😍','🥰','😘','😎','🥳','😤','😭','😱','🤔','🫡','😴','🙄','😏','🤤','🤩','🥺','😈','💀','🤡','👻','👽','🤖'],
  ele: ['👍','👎','👏','🙏','🤝','💪','🫶','✌️','👋','🫰','🤞','👊','✊','🤟','🦾'],
  kal: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💕','💖','💗','💓','💝'],
  dog: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦅','🦆'],
  yiye: ['🍕','🍔','🍟','🌭','🍿','🍩','🍪','🎂','🍰','🧁','🍫','🍬','☕','🍵','🧃','🥤','🍺','🍷'],
  nes: ['⚽','🏀','🏈','🎮','🎯','🎲','🏆','🎪','🎨','🎬','🎤','🎧','🎸','🎹','🎺','🎵','🔔','📱','💻','📷'],
  diger: ['🎉','🎊','🎈','🎁','🎀','⭐','🌟','✨','💫','🔥','🌈','☀️','🌙','❄️','🌸','🌺','🎶','💫','💎','🏆'],
};

const loadHtmlImage = (url: string, timeoutMs = 5000) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = document.createElement('img');
  const timer = window.setTimeout(() => reject(new Error('image timeout')), timeoutMs);
  img.crossOrigin = 'anonymous';
  img.onload = () => { window.clearTimeout(timer); resolve(img); };
  img.onerror = () => { window.clearTimeout(timer); reject(new Error('image load failed')); };
  img.src = url;
});

const htmlImageToJpegDataUrl = (img: HTMLImageElement, maxPx = 800) => {
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas ctx');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
};

const fileToDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result as string);
  r.onerror = () => reject(new Error('file read failed'));
  r.readAsDataURL(file);
});

const compressImageToDataUrl = async (file: File, maxLen = 800 * 1024): Promise<string> => {
  const raw = await fileToDataUrl(file);
  if (raw.length <= maxLen) return raw;
  try {
    const img = await loadHtmlImage(raw);
    let maxPx = Math.max(img.naturalWidth, img.naturalHeight);
    let quality = 0.85;
    let best = raw;
    for (let i = 0; i < 8; i++) {
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight, 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext('2d');
      if (!ctx) break;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL('image/jpeg', quality);
      if (out.length < best.length) best = out;
      if (out.length <= maxLen) return out;
      maxPx = Math.floor(maxPx * 0.7);
      quality = Math.max(0.5, quality - 0.1);
      if (maxPx < 160) break;
    }
    return best;
  } catch {
    return raw;
  }
};

const compressVideoToDataUrl = async (file: Blob, maxLen = 1500 * 1024): Promise<string> => {
  const raw = await fileToDataUrl(file);
  if (raw.length <= maxLen) return raw;
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('video load failed'));
    });
    const duration = Math.min(video.duration || 0, 15);
    const scale = Math.min(1, 480 / (video.videoWidth || 480));
    const w = Math.max(1, Math.round((video.videoWidth || 480) * scale));
    const h = Math.max(1, Math.round((video.videoHeight || 360) * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); return raw; }
    const stream = c.captureStream(15);
    try {
      const vs = (video as any).captureStream?.() as MediaStream | undefined;
      if (vs) for (const t of vs.getAudioTracks()) stream.addTrack(t);
    } catch { /* no audio track */ }
    const mime = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 400000 });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>(res => { rec.onstop = () => res(); });
    rec.start(200);
    video.currentTime = 0;
    await video.play();
    await new Promise<void>(resolve => {
      const draw = () => {
        ctx.drawImage(video, 0, 0, w, h);
        if (video.currentTime >= duration || video.ended) {
          video.pause();
          resolve();
          return;
        }
        requestAnimationFrame(draw);
      };
      draw();
    });
    rec.stop();
    await stopped;
    URL.revokeObjectURL(url);
    const blob = new Blob(chunks, { type: 'video/webm' });
    const out = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('read failed'));
      r.readAsDataURL(blob);
    });
    return out.length <= maxLen || out.length < raw.length ? out : raw;
  } catch {
    return raw;
  }
};

interface ChatAreaProps {
  chatId: string;
  onBack?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ chatId, onBack }) => {
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
  const [exportingPdf, setExportingPdf] = useState(false);
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
  const [viewOnceMode, setViewOnceMode] = useState(false);
  const [viewOnceModal, setViewOnceModal] = useState<Message | null>(null);
  const [viewOnceUnlocked, setViewOnceUnlocked] = useState(false);
  const [decryptModal, setDecryptModal] = useState<Message | null>(null);
  const [emojiCategory, setEmojiCategory] = useState<string>('sik');
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  // Upload menu state
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showCameraPicker, setShowCameraPicker] = useState(false);
  const [showCameraPreview, setShowCameraPreview] = useState(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);

  // Group admin state
  const [showGroupAdmin, setShowGroupAdmin] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [showEditGroupName, setShowEditGroupName] = useState(false);
  const [showTransferAdmin, setShowTransferAdmin] = useState(false);

  // System admin check
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'adminUsers', user.uid)).then(snap => {
      setIsSystemAdmin(snap.exists());
    }).catch(() => setIsSystemAdmin(false));
  }, [user]);
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
      where('participants', 'array-contains', user.uid),
      where('status', 'in', ['calling', 'ongoing'])
    );

    const unsubCalls = onSnapshot(callsQuery, (snapshot) => {
      const call = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Call))
        .find(c => c.chatId === chatId) || null;
      setActiveCallForChat(call);
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
          if (nonBannedParticipants.length < 2 && user?.uid && nonBannedParticipants.includes(user.uid) && !autoDeleteInProgress.current) {
            autoDeleteInProgress.current = true;
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

    const unsubMsgs = onSnapshot(q, async (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);

      // Mark incoming messages as read
      const unreadMsgs = msgs.filter(m => m.senderId !== user.uid && m.status !== 'read');
      if (unreadMsgs.length > 0) {
        try {
          const batch = writeBatch(db);
          unreadMsgs.forEach(msg => {
            batch.update(doc(db, 'chats', chatId, 'messages', msg.id), { status: 'read' });
          });
          await batch.commit();
        } catch (error) {
          console.warn("Could not mark messages as read", error);
        }
      }
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

  const askEncryptFields = (): { encrypted?: boolean; imagePassword?: string } | null => {
    if (!encryptMode) return {};
    const pwd = prompt('Şifreli mesaj şifresini girin:') || '';
    setEncryptMode(false);
    if (!pwd) return null;
    return { encrypted: true, imagePassword: toBase64(pwd) };
  };

  const viewOnceFields = () => (viewOnceMode ? { viewOnce: true } : {});

  const openViewOnce = (msg: Message) => {
    setViewOnceUnlocked(!msg.encrypted);
    setViewOnceModal(msg);
  };

  const closeViewOnce = async () => {
    const msg = viewOnceModal;
    setViewOnceModal(null);
    setViewOnceUnlocked(false);
    if (msg && !msg.viewOnceOpened && msg.id && chatId && msg.senderId !== user?.uid) {
      try {
        await updateDoc(doc(db, 'chats', chatId, 'messages', msg.id), {
          viewOnceOpened: true,
        });
      } catch (error) {
        console.error('ViewOnce open error:', error);
      }
    }
  };

  const resendViewOnce = async (msg: Message) => {
    if (!user || !chatId) return;
    try {
      const payload: Record<string, unknown> = {
        senderId: user.uid,
        timestamp: serverTimestamp(),
        type: msg.type,
        status: 'sent',
        viewOnce: true,
      };
      if (msg.type === 'text') payload.text = msg.text;
      if (msg.imageUrl) payload.imageUrl = msg.imageUrl;
      if (msg.videoUrl) payload.videoUrl = msg.videoUrl;
      if (msg.audioUrl) payload.audioUrl = msg.audioUrl;
      if (msg.encrypted) {
        payload.encrypted = true;
        payload.imagePassword = msg.imagePassword;
      }
      await addDoc(collection(db, 'chats', chatId, 'messages'), payload);
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: { text: '👁 Tek kullanımlık mesaj', senderId: user.uid, senderName: user.displayName, timestamp: serverTimestamp() },
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('ViewOnce resend error:', error);
    }
  };

  const stopCameraPreview = () => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
    setShowCameraPreview(false);
  };

  const openCameraPreview = async (facing: 'user' | 'environment') => {
    setShowCameraPicker(false);
    setShowUploadMenu(false);
    if (!user || !chatId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      cameraStreamRef.current = stream;
      setShowCameraPreview(true);
    } catch (error) {
      console.error("Photo capture error:", error);
      showCustomAlert("Kamera Hatası", "Kamera açılamadı. Lütfen kamera izinlerini kontrol edin.");
    }
  };

  useEffect(() => {
    if (!showCameraPreview) return;
    const video = cameraPreviewRef.current;
    const stream = cameraStreamRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }, [showCameraPreview]);

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
  }, []);

  const takePhotoFromPreview = async () => {
    if (!user || !chatId) return;
    const video = cameraPreviewRef.current;
    const stream = cameraStreamRef.current;
    if (!video || !stream || !video.videoWidth) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      stopCameraPreview();
      const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
      if (!blob) return;
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const enc = askEncryptFields();
      if (enc === null) return;
      const base64Data = await compressImageToDataUrl(file);
      if (base64Data.length > 800 * 1024) {
        showCustomAlert("Dosya Boyutu Sınırı", "Fotoğraf sıkıştırıldığında hala çok büyük (maksimum 800KB).");
        return;
      }
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        imageUrl: base64Data,
        senderId: user.uid,
        timestamp: serverTimestamp(),
        type: 'image',
        status: 'sent',
        ...enc,
        ...viewOnceFields()
      });
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: { text: viewOnceMode ? '👁 Tek kullanımlık mesaj' : enc.encrypted ? '🔒 Fotoğraf' : '📷 Fotoğraf', senderId: user.uid, senderName: user.displayName, timestamp: serverTimestamp() },
        updatedAt: serverTimestamp()
      });
      setViewOnceMode(false);
    } catch (error) {
      console.error("Photo capture error:", error);
      showCustomAlert("Kamera Hatası", "Fotoğraf gönderilemedi.");
    }
  };

  const startPhotoCapture = async () => {
    setShowUploadMenu(false);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      if (cams.length >= 2) {
        setShowCameraPicker(true);
      } else {
        await openCameraPreview('user');
      }
    } catch {
      await openCameraPreview('user');
    }
  };

  const handleVideoSend = () => {
    videoInputRef.current?.click();
  };

  const handleVideoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user || !chatId) return;

    const enc = askEncryptFields();
    if (enc === null) return;
    try {
      const base64Video = await compressVideoToDataUrl(file);
      if (base64Video.length > 1500 * 1024) {
        showCustomAlert("Dosya Boyutu Sınırı", "Video sıkıştırıldığında hala çok büyük (maksimum 1.5MB). Lütfen daha kısa bir video seçin.");
        return;
      }
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        videoUrl: base64Video,
        senderId: user.uid,
        timestamp: serverTimestamp(),
        type: 'video',
        status: 'sent',
        ...enc,
        ...viewOnceFields()
      });

      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: viewOnceMode ? '👁 Tek kullanımlık mesaj' : enc.encrypted ? '🔒 Video Mesajı' : '🎥 Video Mesajı',
          senderId: user.uid,
          senderName: user.displayName,
          timestamp: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });
      setViewOnceMode(false);
    } catch (error) {
      console.error("Video gönderme hatası:", error);
    }
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
  const autoDeleteInProgress = useRef(false);
  const [videoPreviewStream, setVideoPreviewStream] = useState<MediaStream | null>(null);
  const MAX_VIDEO_SECONDS = 15;

  useEffect(() => {
    if (videoPreviewRef.current && videoPreviewStream) {
      videoPreviewRef.current.srcObject = videoPreviewStream;
    }
  }, [videoPreviewStream]);

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
        try {
          const base64Video = await compressVideoToDataUrl(videoBlob);
          if (base64Video.length > 1500 * 1024) {
            showCustomAlert("Video Boyutu Sınırı", "Video çok büyük, lütfen daha kısa bir kayıt yapın.");
            return;
          }
          const enc = askEncryptFields();
          if (enc === null) return;
          await addDoc(collection(db, 'chats', chatId, 'messages'), {
            videoUrl: base64Video,
            senderId: user.uid,
            timestamp: serverTimestamp(),
            type: 'video',
            status: 'sent',
            ...enc,
            ...viewOnceFields()
          });
          await updateDoc(doc(db, 'chats', chatId), {
            lastMessage: { text: viewOnceMode ? '👁 Tek kullanımlık mesaj' : enc.encrypted ? '🔒 Video Mesajı' : '🎥 Video Mesajı', senderId: user.uid, senderName: user.displayName, timestamp: serverTimestamp() },
            updatedAt: serverTimestamp()
          });
          setViewOnceMode(false);
        } catch (error) {
          console.error("Video kaydı gönderme hatası:", error);
        }
      };

      mediaRecorder.start();
      setIsVideoRecording(true);
      setVideoRecordingTime(0);
      let ticks = 0;
      videoTimerRef.current = setInterval(() => {
        ticks += 1;
        setVideoRecordingTime(ticks);
        if (ticks >= MAX_VIDEO_SECONDS) {
          stopVideoRecording();
        }
      }, 1000);
    } catch (error) {
      console.error("Video kaydı başlatma hatası:", error);
    }
  };

  const stopVideoRecording = () => {
    const rec = videoRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
    setIsVideoRecording(false);
    if (videoTimerRef.current) {
      clearInterval(videoTimerRef.current);
      videoTimerRef.current = null;
    }
  };

  const sendAudioMessage = async (audioUrl: string) => {
    if (!user || !chatId) return;
    const enc = askEncryptFields();
    if (enc === null) return;
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        audioUrl,
        senderId: user.uid,
        timestamp: serverTimestamp(),
        type: 'audio',
        status: 'sent',
        ...enc,
        ...viewOnceFields()
      });

      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: viewOnceMode ? '👁 Tek kullanımlık mesaj' : enc.encrypted ? '🔒 Ses Mesajı' : '🎤 Ses Mesajı',
          senderId: user.uid,
          senderName: user.displayName,
          timestamp: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });
      setViewOnceMode(false);
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

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user || !chatId) return;

    const isVideo = file.type.startsWith('video/');
    const enc = askEncryptFields();
    if (enc === null) return;
    try {
      const base64Data = isVideo
        ? await compressVideoToDataUrl(file)
        : await compressImageToDataUrl(file);
      const maxLen = isVideo ? 1500 * 1024 : 800 * 1024;
      if (base64Data.length > maxLen) {
        showCustomAlert(
          "Dosya Boyutu Sınırı",
          isVideo
            ? "Video sıkıştırıldığında hala çok büyük (maksimum 1.5MB). Lütfen daha kısa bir video seçin."
            : "Fotoğraf sıkıştırıldığında hala çok büyük (maksimum 800KB)."
        );
        return;
      }
      if (isVideo) {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          videoUrl: base64Data,
          senderId: user.uid,
          timestamp: serverTimestamp(),
          type: 'video',
          status: 'sent',
          ...enc,
          ...viewOnceFields()
        });
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: { text: viewOnceMode ? '👁 Tek kullanımlık mesaj' : enc.encrypted ? '🔒 Video' : '🎥 Video', senderId: user.uid, senderName: user.displayName, timestamp: serverTimestamp() },
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          imageUrl: base64Data,
          senderId: user.uid,
          timestamp: serverTimestamp(),
          type: 'image',
          status: 'sent',
          ...enc,
          ...viewOnceFields()
        });
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: { text: viewOnceMode ? '👁 Tek kullanımlık mesaj' : enc.encrypted ? '🔒 Fotoğraf' : '📷 Fotoğraf', senderId: user.uid, senderName: user.displayName, timestamp: serverTimestamp() },
          updatedAt: serverTimestamp()
        });
      }
      setViewOnceMode(false);
    } catch (error) {
      console.error("Dosya gönderme hatası:", error);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!chatId) return;
    showCustomConfirm(
      "Mesajı Sil",
      "Bu mesajı silmek istediğinizden emin misiniz? Silinen bu mesaj sadece sizin 'Sildiğim Mesajları Göster' seçeneğiniz açıkken görüntülenebilir.",
      async () => {
        try {
          await updateDoc(doc(db, 'chats', chatId, 'messages', msgId), {
            deletedBy: arrayUnion(user?.uid || ''),
          });
          // Silinen mesaj sidebar'daki son mesaj önizlemesinde de görünüyorsa temizle
          const chatSnap = await getDoc(doc(db, 'chats', chatId));
          if (chatSnap.exists()) {
            const last = chatSnap.data()?.lastMessage;
            const msgSnap = await getDoc(doc(db, 'chats', chatId, 'messages', msgId));
            const msgText = msgSnap.data()?.text;
            if (last?.text && msgText && last.text === msgText && last.senderId === user?.uid) {
              await updateDoc(doc(db, 'chats', chatId), { lastMessage: null });
            }
          }
        } catch (error) {
          console.error("Delete message error:", error);
        }
      }
    );
  };

  const handleClearChat = async () => {
    if (!chatId) return;
    if (chat?.type === 'group' && !isGroupAdmin) return;
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

    if (editingMsg?.id) {
      try {
        await updateDoc(doc(db, 'chats', chatId, 'messages', editingMsg.id), {
          text,
          edited: true,
          editedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Error editing message:", error);
      }
      setEditingMsg(null);
      return;
    }

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
      status: 'sent',
      ...viewOnceFields()
    };

    if (replyTo?.id) {
      messageData.replyTo = {
        id: replyTo.id,
        text: replyTo.text,
        senderId: replyTo.senderId
      };
    }

    if (encryptMode && pwd) {
      messageData.encrypted = true;
      messageData.imagePassword = toBase64(pwd);
    }

    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), messageData);
      
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: viewOnceMode ? '👁 Tek kullanımlık mesaj' : encryptMode && pwd ? '🔒 Şifreli Mesaj' : text,
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
    setViewOnceMode(false);
    setReplyTo(null);
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
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500">
        <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 border border-slate-100 dark:border-slate-700">
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
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 relative overflow-hidden transition-colors">
      {/* Background Decoration */}
      <div className="absolute inset-0 pointer-events-none">
         <div className="absolute top-0 right-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-blue-100/30 blur-[100px] rounded-full" />
      </div>

      {/* Chat Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-8 py-3 shrink-0 relative transition-colors">
        {/* Row 1: Avatar + Name */}
        <div className="flex items-center min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="sm:hidden mr-2 p-2 -ml-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
              title="Geri"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full mr-3 sm:mr-4 shadow-sm overflow-hidden border-2 border-white shrink-0">
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
        <div className="flex items-center gap-2 sm:gap-4 text-slate-400 relative mt-2 pl-0 sm:pl-14 overflow-x-auto pb-0.5">
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
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 transition-all active:scale-90"
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
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-ping" />
              GÖRÜŞMEDESİN
            </div>
          )}
          
          {/* Ara */}
          <button 
            onClick={() => setShowChatSearch(!showChatSearch)}
            className={cn("hover:text-blue-600 transition-colors p-1 rounded-full hover:bg-blue-50 dark:hover:bg-blue-950", showChatSearch && "text-blue-600 bg-blue-50 dark:bg-blue-950")}
            title="Sohbet İçi Ara"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>

          {/* Toplu Seç */}
          <button 
            onClick={() => { setBatchMode(!batchMode); setSelectedMsgs(new Set()); }}
            className={cn("hover:text-slate-900 dark:hover:text-slate-100 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800", batchMode && "text-blue-600 bg-blue-50 dark:bg-blue-950")}
            title="Toplu Mesaj Seç"
          >
            <ListChecks size={18} />
          </button>

          {/* Beklemeye Al */}
          {(chat?.type === 'private' || isGroupAdmin) && (
            <button 
              onClick={handleHoldToggle}
              className={cn("transition-colors p-1 rounded-full hover:bg-amber-50 dark:hover:bg-amber-950 relative", amIHolding ? "text-amber-500 bg-amber-50 dark:bg-amber-950" : "hover:text-amber-500")}
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
            className="hover:text-blue-600 transition-colors p-1 rounded-full hover:bg-blue-50 dark:hover:bg-blue-950"
            title="Kullanıcı Bilgisi"
          >
            <Info size={18} />
          </button>

          {/* Group Admin Button */}
          {isGroupAdmin && (
            <button 
              onClick={() => { setShowGroupAdmin(true); loadGroupMembers(); }}
              className="hover:text-amber-500 transition-colors p-1 rounded-full hover:bg-amber-50 dark:hover:bg-amber-950 text-slate-400"
              title="Grup Yönetimi"
            >
              <Shield size={18} />
            </button>
          )}

          <div className="relative ml-auto">
            <button 
              onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
              className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MoreVertical size={18} />
            </button>

            {isHeaderMenuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsHeaderMenuOpen(false)} 
                />
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sohbet İşlemleri</p>
                  </div>
                  {(chat?.type !== 'group' || isGroupAdmin) && (
                  <button 
                    onClick={handleClearChat}
                    className="w-full text-left px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Sohbet Geçmişini Temizle
                  </button>
                  )}
                  <button 
                    disabled={exportingPdf}
                    onClick={async () => {
                      if (exportingPdf) return;
                      setExportingPdf(true);
                      try {
                        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                        const fixTr = s => s.replace(/ğ/g,'g').replace(/Ğ/g,'G').replace(/ş/g,'s').replace(/Ş/g,'S').replace(/İ/g,'I').replace(/ı/g,'i').replace(/ç/g,'c').replace(/Ç/g,'C').replace(/ö/g,'o').replace(/Ö/g,'O').replace(/ü/g,'u').replace(/Ü/g,'U');
                        const items = messages
                          .filter(m => !(m.deletedBy && user?.uid && (m.deletedBy as string[]).includes(user.uid)));
                        const chatName = fixTr(chat?.groupMetadata?.name || chatId);
                        const fileSafe = chatName.replace(/[^a-zA-Z0-9]/g, '_');
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(16);
                        doc.text(chatName, 15, 20);
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(10);
                        doc.text(`Disa Aktarim: ${new Date().toLocaleString('tr-TR')}  |  Toplam Mesaj: ${items.length}`, 15, 28);
                        doc.setDrawColor(200);
                        doc.line(15, 31, 195, 31);
                        doc.setFontSize(9);
                        let y = 38;
                        const pageBreak = () => { if (y > 275) { doc.addPage(); y = 20; } };
                        const writeLine = (line: string) => {
                          const wrapped = doc.splitTextToSize(fixTr(line), 180);
                          for (const wl of wrapped) { pageBreak(); doc.text(wl, 15, y); y += 4.5; }
                        };
                        for (const m of items) {
                          try {
                            const sender = participantInfo[m.senderId];
                            const name = sender?.displayName || m.senderId.slice(0, 8);
                            const time = m.timestamp?.toDate?.() ? m.timestamp.toDate().toLocaleString('tr-TR') : '';
                            const text = m.text || (m.imageUrl ? '[fotograf]' : m.videoUrl ? '[video]' : m.audioUrl ? '[ses]' : '[medya]');
                            const edited = m.edited ? ' (duzenlendi)' : '';
                            writeLine(`[${time}] ${name}: ${text}${edited}`);
                            if (m.imageUrl) {
                              try {
                                const img = await loadHtmlImage(m.imageUrl, 5000);
                                const dataUrl = htmlImageToJpegDataUrl(img);
                                const maxW = 120;
                                const maxH = 90;
                                const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
                                const w = Math.max(img.naturalWidth * scale, 20);
                                const h = Math.max(img.naturalHeight * scale, 15);
                                if (y + h > 280) { doc.addPage(); y = 20; }
                                doc.addImage(dataUrl, 'JPEG', 15, y, w, h);
                                y += h + 3;
                              } catch {
                                writeLine(`[fotoğraf eklenemedi: ${m.imageUrl}]`);
                              }
                            }
                            if (m.videoUrl || m.audioUrl) {
                              const u = m.videoUrl || m.audioUrl;
                              const kind = m.videoUrl ? 'Video' : 'Ses';
                              const wrappedUrl = doc.splitTextToSize(`${kind} dosyasi: ${u}`, 180);
                              for (const wl of wrappedUrl) { pageBreak(); doc.textWithLink(wl, 15, y, { url: u! }); y += 4.5; }
                            }
                          } catch {
                            writeLine(`[mesaj okunamadi]`);
                          }
                        }
                        doc.save(`sohbet-${fileSafe}-${new Date().toISOString().slice(0,10)}.pdf`);
                      } catch (e) {
                        console.error('PDF export failed', e);
                        alert('PDF hazırlanırken hata oluştu. Lütfen tekrar deneyin.');
                      } finally {
                        setExportingPdf(false);
                        setIsHeaderMenuOpen(false);
                      }
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors flex items-center gap-2",
                      exportingPdf && "opacity-60 pointer-events-none"
                    )}
                  >
                    <Download size={14} /> {exportingPdf ? 'PDF hazırlanıyor...' : 'Sohbeti İndir (.pdf)'}
                  </button>
                  <button 
                    onClick={() => {
                      setShowDeletedMessages(!showDeletedMessages);
                      setIsHeaderMenuOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 text-xs font-bold transition-colors flex items-center gap-2",
                      showDeletedMessages ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950" : "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
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
                      className="w-full text-left px-4 py-3 text-xs font-bold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors flex items-center gap-2 border-t border-slate-100 dark:border-slate-700"
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
        <div className="p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shrink-0 z-10 transition-colors">
          <div className="relative">
            <input type="text" value={chatSearchQuery} onChange={e => setChatSearchQuery(e.target.value)}
              placeholder="Mesajlarda ara..."
              className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 outline-none transition-colors"
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
            {messages.filter(m => {
              const db = m.deletedBy as string[] | undefined;
              if (db?.length) {
                if (user?.uid && db.includes(user.uid)) {
                  if (!showDeletedMessages) return false;
                } else {
                  return false;
                }
              }
              return m.text?.toLowerCase().includes(chatSearchQuery.toLowerCase());
            }).length} sonuç
          </div>
        </div>
      )}

      {/* Hold Banner */}
      {isBeingHeld && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-900 flex items-center gap-2 shrink-0">
          <Pause size={14} className="text-amber-600 dark:text-amber-400" />
          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">Bu sohbet beklemeye alındı. Mesaj gönderemezsiniz.</span>
        </div>
      )}

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-10 space-y-6 custom-scrollbar z-10"
      >
        <div className="flex justify-center mb-8">
          <span className="px-3 py-1 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm">BUGÜN</span>
        </div>

        <AnimatePresence>
          {messages
            .filter(msg => {
              const db = msg.deletedBy as string[] | undefined;
              if (!db?.length) return true;
              if (user?.uid && db.includes(user.uid)) return showDeletedMessages;
              return false;
            })
            .filter(msg => !chatSearchQuery || msg.text?.toLowerCase().includes(chatSearchQuery.toLowerCase()))
            .map((msg, idx) => {
              const isMe = msg.senderId === user?.uid;
              const sender = participantInfo[msg.senderId];
              const isDeleted = msg.deletedBy && user?.uid && (msg.deletedBy as string[]).includes(user.uid);

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
                           ? "bg-slate-100 dark:bg-slate-700 text-slate-400 border-slate-200/60 dark:border-slate-600 opacity-60 rounded-br-none"
                           : isMe 
                             ? "bg-blue-600 text-white border-blue-500 rounded-br-none shadow-blue-100 dark:shadow-none" 
                             : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-100 dark:border-slate-700 rounded-bl-none"
                       )}
                     >
                       {isDeleted && (
                         <div className="text-[9px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1 mb-1.5 bg-rose-50 dark:bg-rose-950 dark:text-rose-400 border border-rose-100 dark:border-rose-900 px-1.5 py-0.5 rounded w-max select-none">
                          <Trash2 size={10} /> SİLDİĞİNİZ MESAJ
                        </div>
                      )}

                      {msg.blockedByAdmin && !isSystemAdmin ? (
                        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 rounded-lg p-3 my-1">
                          <p className="text-[11px] text-red-600 dark:text-red-400 font-bold text-center">
                            AI Destekli Sistem tarafından içerik zararlı bulunmuş ve kaldırılmıştır.
                          </p>
                        </div>
                      ) : (<>

                      {msg.viewOnce && !isMe ? (
                        msg.viewOnceOpened ? (
                          <div className="flex items-center gap-2 text-[11px] font-bold italic opacity-50 py-1">
                            <EyeOff size={12} /> Tek seferlik görüntülendi
                          </div>
                        ) : (
                          <button onClick={() => openViewOnce(msg)}
                            className="flex items-center gap-2 text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 px-3 py-2.5 rounded-xl transition-colors w-full text-left">
                            <Eye size={16} />
                            Tek bakışlık mesajı açmak için dokun
                          </button>
                        )
                      ) : (<>
                      {msg.viewOnce && isMe && (
                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-500 dark:text-amber-400 mb-1.5 flex-wrap">
                          <Eye size={11} /> Tek bakışlık · {msg.viewOnceOpened ? 'görüntülendi' : 'henüz açılmadı'}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); resendViewOnce(msg); }}
                            className="ml-2 normal-case underline text-blue-400 hover:text-blue-300 font-bold"
                          >
                            Yeniden gönder
                          </button>
                        </div>
                      )}

                      {msg.replyTo && (
                        <div className={cn(
                          "text-[10px] font-medium mb-1.5 px-2 py-1 rounded border-l-2",
                          isMe ? "bg-blue-700/30 border-blue-300 text-blue-100" : "bg-slate-100 border-slate-300 text-slate-500"
                        )}>
                          <span className="font-bold">{msg.replyTo.senderId === user?.uid ? 'Sen' : (participantInfo[msg.replyTo.senderId]?.displayName || 'Bilinmeyen')}</span>: {(msg.replyTo.text || '').slice(0, 60)}{(msg.replyTo.text || '').length > 60 ? '...' : ''}
                        </div>
                      )}

                      {msg.type === 'text' && (
                        msg.encrypted && !isMe ? (
                          <button onClick={() => setDecryptModal(msg)}
                            className="text-sm font-medium leading-relaxed opacity-70 hover:opacity-100 text-left w-full flex items-center gap-1.5">
                            <Lock size={13} className="shrink-0" /> Şifreli Mesaj (dokunun)
                          </button>
                        ) : (
                          <p className={cn(
                            "text-sm font-medium leading-relaxed",
                            msg.encrypted && "flex items-start gap-1.5",
                            isDeleted && "line-through text-slate-400 font-normal italic"
                          )}>
                            {msg.encrypted && !isDeleted && <Lock size={13} className="shrink-0 mt-0.5" />}
                            {msg.text}
                          </p>
                        )
                      )}

                      {msg.type === 'call' && (
                        <div className="flex items-center gap-2 text-sm font-medium leading-relaxed">
                          <Phone size={14} className="shrink-0 opacity-70" />
                          <span>{msg.text || (msg.callType === 'video' ? 'Görüntülü görüşme' : 'Sesli görüşme')}</span>
                        </div>
                      )}
                      
                      {msg.type === 'image' && msg.imageUrl && (
                        <div className={cn(
                          "relative rounded-lg overflow-hidden mb-1 max-w-full",
                          isDeleted && "grayscale blur-[2px] opacity-40"
                        )}>
                          {msg.encrypted && !isMe ? (
                            <>
                              <img src={msg.imageUrl} alt="" className="w-full h-auto object-cover blur-[12px]" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <button onClick={() => setDecryptModal(msg)}
                                  className="bg-black/50 text-white text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm hover:bg-black/70 cursor-pointer flex items-center gap-1"><Lock size={11} /> Şifreli</button>
                              </div>
                            </>
                          ) : (
                            <>
                              {msg.encrypted && (
                                <span className="absolute top-1.5 left-1.5 z-10 bg-black/45 text-white rounded-md p-1" title="Şifreli gönderildi">
                                  <Lock size={12} />
                                </span>
                              )}
                              <img 
                                src={msg.imageUrl} 
                                alt="Paylaşılan görsel" 
                                className="max-w-full h-auto object-cover hover:scale-105 transition-transform duration-500 cursor-pointer"
                                onClick={() => !isDeleted && window.open(msg.imageUrl, '_blank')}
                              />
                            </>
                          )}
                        </div>
                      )}

                      {msg.type === 'video' && msg.videoUrl && (
                        <div className={cn(
                          "relative rounded-lg overflow-hidden mb-1 max-w-full bg-black/5",
                          isDeleted && "grayscale blur-[2px] opacity-40"
                        )}>
                          {msg.encrypted && !isMe ? (
                            <>
                              <video src={msg.videoUrl} className="max-w-full h-auto blur-[12px]" playsInline />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <button onClick={() => setDecryptModal(msg)}
                                  className="bg-black/50 text-white text-[10px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm hover:bg-black/70 cursor-pointer flex items-center gap-1"><Lock size={11} /> Şifreli</button>
                              </div>
                            </>
                          ) : (
                            <>
                              {msg.encrypted && (
                                <span className="absolute top-1.5 left-1.5 z-10 bg-black/45 text-white rounded-md p-1" title="Şifreli gönderildi">
                                  <Lock size={12} />
                                </span>
                              )}
                              <video 
                                src={msg.videoUrl} 
                                className="max-w-full h-auto" 
                                controls={!isDeleted}
                                playsInline
                              />
                            </>
                          )}
                        </div>
                      )}

                      {msg.type === 'audio' && msg.audioUrl && (
                        <div className={cn(isDeleted && "grayscale opacity-40 pointer-events-none", "flex items-center gap-1.5")}>
                          {msg.encrypted && !isMe ? (
                            <button onClick={() => setDecryptModal(msg)}
                              className="text-[10px] font-bold flex items-center gap-1 text-slate-500 hover:text-slate-700"><Lock size={11} /> Şifreli Ses Mesajı (dokunun)</button>
                          ) : (
                            <>
                              {msg.encrypted && <Lock size={13} className="shrink-0" />}
                              <AudioPlayer url={msg.audioUrl} isMe={isMe} />
                            </>
                          )}
                        </div>
                      )}
                      </>)}

                      <div className={cn(
                        "flex items-center justify-end mt-1.5 space-x-1",
                        isMe && !isDeleted ? "text-blue-100" : "text-slate-400"
                      )}>
                        <span className="text-[10px] font-medium">
                          {msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : ''}
                        </span>
                        {msg.edited && <span className="text-[9px] italic opacity-60 ml-0.5">(düzenlendi)</span>}
                        {isMe && !isDeleted && <MessageStatus status={msg.status} />}
                      </div>
                    </>)}
                    </div>

                    {/* Hover Actions: Reaction & Delete */}
                    {!isDeleted && msg.id && (
                      <div className={cn(
                        "absolute flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded-full shadow-lg z-20",
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

                        {msg.type === 'text' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReplyTo(msg);
                            }}
                            className="p-1 px-1.5 text-slate-400 hover:text-blue-500 active:scale-110 transition-all rounded-full flex items-center justify-center cursor-pointer"
                            title="Yanıtla"
                          >
                            <Reply size={13} />
                          </button>
                        )}

                        {isMe && msg.type === 'text' && !msg.encrypted && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingMsg(msg);
                              setInputText(msg.text || '');
                            }}
                            className="p-1 px-1.5 text-slate-400 hover:text-amber-500 active:scale-110 transition-all rounded-full flex items-center justify-center cursor-pointer"
                            title="Düzenle"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        
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
                              ? "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 scale-110"
                              : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
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
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0 z-10 transition-colors">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{selectedMsgs.size} mesaj seçildi</span>
          <div className="flex gap-2">
            <button onClick={() => { setBatchMode(false); setSelectedMsgs(new Set()); }}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-wider">
              İptal
            </button>
            <button onClick={() => {
                if (selectedMsgs.size === 0) return;
                showCustomConfirm('Mesajları Sil', `${selectedMsgs.size} mesajı silmek istediğinize emin misiniz?`, async () => {
                  if (!chat) return;
                  for (const msgId of selectedMsgs) {
                    try {
                      await updateDoc(doc(db, 'chats', chatId, 'messages', msgId), { deletedBy: arrayUnion(user?.uid || '') });
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
        <div className="p-3 bg-amber-50 dark:bg-amber-950 border-t border-amber-200 dark:border-amber-900 flex items-center gap-2 shrink-0">
          <Pause size={14} className="text-amber-600 dark:text-amber-400" />
          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">Bu sohbet beklemeye alındı. Mesaj gönderemezsiniz.</span>
        </div>
      )}

      {/* Ban Banner */}
      {isBannedFromGroup && (
        <div className="p-3 bg-red-50 dark:bg-red-950 border-t border-red-200 dark:border-red-900 flex items-center gap-2 shrink-0">
          <Ban size={14} className="text-red-600 dark:text-red-400" />
          <span className="text-[10px] font-bold text-red-700 dark:text-red-300">Bu gruptan banlandınız. Mesaj gönderemezsiniz.</span>
        </div>
      )}

      {(editingMsg || replyTo) && !isBeingHeld && !isBannedFromGroup && (
        <div className="px-6 py-2 bg-blue-50 dark:bg-blue-950 border-t border-blue-100 dark:border-blue-900 flex items-center gap-2 shrink-0">
          {editingMsg ? (
            <><Pencil size={12} className="text-blue-500 dark:text-blue-400" /><span className="text-[11px] font-bold text-blue-600 dark:text-blue-300">Mesajı düzenle</span></>
          ) : (
            <><Reply size={12} className="text-blue-500 dark:text-blue-400" /><span className="text-[11px] font-bold text-blue-600 dark:text-blue-300">Yanıtla: {(replyTo?.text || '').slice(0, 50)}{(replyTo?.text || '').length > 50 ? '...' : ''}</span></>
          )}
          <button onClick={() => { setEditingMsg(null); setReplyTo(null); setInputText(''); }}
            className="ml-auto p-0.5 text-blue-400 hover:text-blue-600"><X size={14} /></button>
        </div>
      )}

      {/* Input Area */}
      <footer className="p-3 sm:p-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shrink-0 z-10 transition-colors relative">
        <div className="max-w-4xl mx-auto flex items-center bg-slate-100 dark:bg-slate-800 rounded-2xl p-1.5 sm:p-2 focus-within:ring-2 focus-within:ring-blue-500 transition-all relative">
          {/* Video kayıt önizlemesi — çekim alanını görmeniz için büyük önizleme */}
          {isVideoRecording && (
            <div className="absolute bottom-full right-0 mb-2 w-44 sm:w-56 rounded-2xl overflow-hidden border-2 border-red-500 shadow-2xl bg-black z-30 animate-in fade-in zoom-in-95 duration-200">
              <video ref={videoPreviewRef} autoPlay playsInline muted className="w-full h-32 sm:h-40 object-cover" />
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-red-600 text-white">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping shrink-0" />
                  <span className="text-[10px] font-black tabular-nums truncate">{Math.floor(videoRecordingTime / 60)}:{String(videoRecordingTime % 60).padStart(2, '0')} / 0:15</span>
                </div>
                <button onClick={stopVideoRecording} className="px-2 py-1 bg-white text-red-600 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0">Durdur</button>
              </div>
            </div>
          )}
          
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
                "p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-xl shrink-0",
                isEmojiMenuOpen && "bg-slate-200 text-slate-700"
              )}
            >
              <Smile size={20} />
            </button>

            {isEmojiMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsEmojiMenuOpen(false)} />
                <div className="absolute bottom-12 left-0 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-40 animate-in fade-in slide-in-from-bottom-2 duration-150 flex flex-col" style={{maxHeight: '320px'}}>
                  <div className="flex gap-1 p-2 border-b border-slate-100 dark:border-slate-700 overflow-x-auto shrink-0">
                    {([
                      ['sik','😀'], ['ele','👋'], ['kal','❤️'], ['dog','🐶'], ['yiye','🍕'], ['nes','🎮'], ['diger','🎉']
                    ] as [string,string][]).map(([k, icon]) => (
                      <button key={k} onClick={() => setEmojiCategory(k)}
                        className={`text-[10px] px-2 py-1 rounded-full font-bold shrink-0 transition-colors ${emojiCategory === k ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                        {icon}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5 p-2 overflow-y-auto flex-1">
                    {(emojiCategories[emojiCategory] || []).map(emoji => (
                      <button type="button" key={emoji}
                        onClick={() => { setInputText(prev => prev + emoji); setIsEmojiMenuOpen(false); }}
                        className="w-9 h-9 flex items-center justify-center text-lg hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-125 transition-all rounded-lg">
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUploadMenu(!showUploadMenu)}
              className={cn(
                "p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 transition-colors shrink-0",
                showUploadMenu && "bg-slate-200 text-slate-700"
              )}
              title="Fotoğraf/Video Seçenekleri"
            >
              <Image size={20} />
            </button>
            {showUploadMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowUploadMenu(false)} />
                <div className="absolute bottom-12 left-0 w-44 bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-2xl shadow-xl py-1 z-40 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <button
                    type="button"
                    onClick={() => { imageInputRef.current?.click(); setShowUploadMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                  >
                    <Image size={14} /> Fotoğraf Yükle
                  </button>
                  <button
                    type="button"
                    onClick={() => { startPhotoCapture(); }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                  >
                    <Camera size={14} /> Fotoğraf Çek
                  </button>
                  <button
                    type="button"
                    onClick={() => { videoInputRef.current?.click(); setShowUploadMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                  >
                    <Video size={14} /> Video Yükle
                  </button>
                </div>
              </>
            )}
          </div>

          {isVideoRecording ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-xl shrink-0 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
              <span className="text-xs font-black tabular-nums">{Math.floor(videoRecordingTime / 60)}:{String(videoRecordingTime % 60).padStart(2, '0')} / 0:15</span>
              <button onClick={stopVideoRecording} className="p-1 px-2 bg-red-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">Durdur</button>
            </div>
          ) : (
            <button 
              type="button" 
              onClick={startVideoRecording}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0"
              title="Video Kaydet"
            >
              <Video size={20} />
            </button>
          )}

          {isRecording ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-xl shrink-0 animate-in fade-in zoom-in-95 duration-200">
               <div className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
               <span className="text-xs font-black tabular-nums">{Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}</span>
               <button onClick={stopRecording} className="p-1 px-2 bg-red-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">Durur ve Gönder</button>
            </div>
          ) : (
            <button 
              type="button" 
              onClick={startRecording}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0"
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

          {/* Tek Bakışlık Mesaj Butonu */}
          <button
            type="button"
            onClick={() => setViewOnceMode(!viewOnceMode)}
            className={cn(
              "p-1.5 sm:p-2 transition-colors shrink-0",
              viewOnceMode ? "text-purple-500 bg-purple-50 rounded-lg" : "text-slate-400 hover:text-slate-600"
            )}
            title={viewOnceMode ? 'Tek Bakışlık: AÇIK' : 'Tek Bakışlık: KAPALI'}
          >
            <Eye size={18} />
          </button>

          <form onSubmit={handleSend} className="flex-1 min-w-0 flex items-center">
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isBeingHeld ? "Sohbet beklemeye alındı..." : "Mesaj yaz..."}
              className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-sm py-2 px-2 sm:px-4 text-slate-900 placeholder:text-slate-400"
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
            className="fixed z-[100] bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl p-2 flex gap-1 items-center"
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
                className="w-10 h-10 flex items-center justify-center text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all active:scale-125"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Picker Modal */}
      <AnimatePresence>
        {showCameraPicker && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-slate-800 max-w-sm w-full flex flex-col gap-4 text-center"
            >
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto">
                <Camera size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight">Kamera Seç</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-2">Seçtiğin kameranın önizlemesini görüp çek</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => openCameraPreview('user')}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 active:scale-95 text-white transition-all"
                >
                  Ön Kamera
                </button>
                <button
                  onClick={() => openCameraPreview('environment')}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all border border-slate-200 dark:border-slate-700"
                >
                  Arka Kamera
                </button>
              </div>
              <button
                onClick={() => setShowCameraPicker(false)}
                className="w-full py-2 rounded-xl text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
              >
                Vazgeç
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Camera Preview Modal */}
      <AnimatePresence>
        {showCameraPreview && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-black rounded-3xl shadow-2xl overflow-hidden w-full max-w-md flex flex-col"
            >
              <video ref={cameraPreviewRef} autoPlay playsInline muted className="w-full aspect-[3/4] object-cover bg-black" />
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-black">
                <button
                  onClick={stopCameraPreview}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-300 hover:bg-white/10 transition-all"
                >
                  Vazgeç
                </button>
                <button
                  onClick={takePhotoFromPreview}
                  className="w-14 h-14 rounded-full bg-white border-4 border-slate-400 hover:scale-105 active:scale-95 transition-all shadow-lg"
                  title="Çek"
                />
                <div className="w-14" />
              </div>
            </motion.div>
          </div>
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
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-slate-800 max-w-sm w-full flex flex-col gap-4 text-center relative z-[120]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto text-xl font-bold">
                {customDialog.type === 'confirm' ? '❓' : 'ℹ️'}
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight">{customDialog.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-2 leading-relaxed whitespace-pre-line">{customDialog.message}</p>
              </div>
              <div className="flex gap-3 justify-center mt-2">
                {customDialog.type === 'confirm' && (
                  <button
                    onClick={() => setCustomDialog(null)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-200 dark:border-slate-700 cursor-pointer"
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
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl max-w-md w-full border border-slate-100 dark:border-slate-800" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2"><Lock size={14} /> Şifreli Mesaj</h3>
                <button onClick={() => setDecryptModal(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400"><X size={18} /></button>
              </div>
              <DecryptContent msg={decryptModal} onClose={() => setDecryptModal(null)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ViewOnce Modal */}
      <AnimatePresence>
        {viewOnceModal && (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md" onClick={() => closeViewOnce()}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl max-w-md w-full border border-slate-100 dark:border-slate-800 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2"><Eye size={14} className="text-purple-500" /> Tek Bakışlık Mesaj</h3>
                <button onClick={() => closeViewOnce()} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400"><X size={18} /></button>
              </div>
              {viewOnceModal.encrypted && !viewOnceUnlocked ? (
                <DecryptContent msg={viewOnceModal} onClose={() => { setViewOnceUnlocked(true); }} />
              ) : (
                <div className="space-y-3">
                  {viewOnceModal.type === 'text' && (
                    <p className="text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-200">{viewOnceModal.text}</p>
                  )}
                  {viewOnceModal.type === 'image' && viewOnceModal.imageUrl && (
                    <img src={viewOnceModal.imageUrl} alt="" className="w-full h-auto rounded-xl" />
                  )}
                  {viewOnceModal.type === 'video' && viewOnceModal.videoUrl && (
                    <video src={viewOnceModal.videoUrl} className="w-full h-auto rounded-xl" controls playsInline />
                  )}
                  {viewOnceModal.type === 'audio' && viewOnceModal.audioUrl && (
                    <audio src={viewOnceModal.audioUrl} controls className="w-full" />
                  )}
                  <button onClick={() => closeViewOnce()}
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all">
                    Kapat
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Group Admin Modal */}
      <AnimatePresence>
        {showGroupAdmin && chat?.type === 'group' && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md" onClick={() => setShowGroupAdmin(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full border border-slate-100 dark:border-slate-800 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              
              {/* Header */}
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <Shield size={22} className="text-amber-500" />
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight">Grup Yönetimi</h3>
                </div>
                <button onClick={() => setShowGroupAdmin(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                {/* Group Name Edit */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
                  <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Grup Adı</h4>
                  {showEditGroupName ? (
                    <div className="flex gap-2">
                      <input type="text" value={editGroupName} onChange={e => setEditGroupName(e.target.value)}
                        placeholder="Yeni grup adı..."
                        className="flex-1 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:border-blue-500 transition-all text-slate-900 dark:text-slate-100"
                        autoFocus onKeyDown={e => e.key === 'Enter' && handleEditGroupName()} />
                      <button onClick={handleEditGroupName} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all">Kaydet</button>
                      <button onClick={() => setShowEditGroupName(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all">İptal</button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{chat.groupMetadata?.name}</p>
                      <button onClick={() => { setEditGroupName(chat.groupMetadata?.name || ''); setShowEditGroupName(true); }}
                        className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl text-[10px] font-bold hover:bg-blue-100 dark:hover:bg-blue-900 transition-all flex items-center gap-1">
                        <Settings size={12} /> Düzenle
                      </button>
                    </div>
                  )}
                </div>

                {/* Admin Transfer */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
                  <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Yönetici Devret</h4>
                  {showTransferAdmin ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {loadingMembers ? (
                        <p className="text-xs text-slate-400 text-center py-4">Yükleniyor...</p>
                      ) : (
                        allMembers.filter(m => m.uid !== user?.uid).map(m => (
                          <button key={m.uid} onClick={() => handleTransferAdmin(m.uid)}
                            className="w-full flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950 border border-slate-200 dark:border-slate-700 hover:border-blue-200 transition-all text-left">
                            <img src={m.photoURL} className="w-8 h-8 rounded-full object-cover" />
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{m.displayName}</span>
                          </button>
                        ))
                      )}
                      <button onClick={() => setShowTransferAdmin(false)} className="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors">İptal</button>
                    </div>
                  ) : (
                    <button onClick={() => { loadGroupMembers(); setShowTransferAdmin(true); }}
                      className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 rounded-xl text-[10px] font-bold hover:bg-amber-100 dark:hover:bg-amber-900 transition-all">
                      Yöneticiyi Devret
                    </button>
                  )}
                </div>

                {/* Kick/Ban Member */}
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
                  <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Üyeler</h4>
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
                            bannedInfo ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900" : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-700")}>
                            <img src={m.photoURL} className="w-8 h-8 rounded-full object-cover" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate flex items-center gap-2">
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
                <div className="bg-amber-50 dark:bg-amber-950 rounded-2xl p-4 border border-amber-200 dark:border-amber-900">
                    <h4 className="text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-3">Kullanıcıyı Gruptan At</h4>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mb-3">Süreli ban eklemek istiyor musunuz? (0 = sadece at, süreli ban yok)</p>
                    <div className="flex items-center gap-2 mb-4">
                      <input type="number" value={kickDuration} onChange={e => setKickDuration(Number(e.target.value))} min={0}
                        className="w-20 bg-white dark:bg-slate-900 border-2 border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-sm font-bold text-center outline-none focus:border-amber-500 transition-all text-slate-900 dark:text-slate-100" />
                      <select value={kickDuration} onChange={e => setKickDurationUnit(e.target.value as any)}
                        className="bg-white dark:bg-slate-900 border-2 border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-amber-500 transition-all text-slate-900 dark:text-slate-100">
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
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 rounded-b-3xl shrink-0">
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
        <ProfileModal user={otherUser} onClose={() => setShowProfile(false)} readOnly />
      )}
    </div>
  );
};
