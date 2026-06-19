import React, { useEffect, useState, useRef } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, doc, updateDoc, setDoc, getDoc, where, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { useCall } from './CallProvider';
import { Chat, Message, UserProfile, Call } from '../types';
import { cn } from '../lib/utils';
import ProfileModal from './ProfileModal';
import { Image, Send, Smile, Phone, Video, MessageSquarePlus, Clock, Play, Mic, Square, Pause, Trash2, ListChecks, X, Info, Lock, ChevronDown } from 'lucide-react';
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
  const [isEmojiMenuOpen, setIsEmojiMenuOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedMsgs, setSelectedMsgs] = useState<Set<string>>(new Set());
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [holdDailyCount, setHoldDailyCount] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
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

  const MAX_DAILY_HOLD = 7;

  const amIHolding = chat?.heldBy === user?.uid;
  const isBeingHeld = !!chat?.heldBy && !amIHolding;

  const handleHoldToggle = async () => {
    if (!chatId || !user || !chat) return;
    try {
      if (amIHolding) {
        await updateDoc(doc(db, 'chats', chatId), { heldBy: null, holdExpiresAt: null });
        showCustomAlert('Bekleme Kaldırıldı', `Bu sohbet için bekleme kaldırıldı. Kalan hakkınız: ${MAX_DAILY_HOLD - holdDailyCount}/${MAX_DAILY_HOLD}`);
      } else {
        if (holdDailyCount >= MAX_DAILY_HOLD) {
          showCustomAlert('Limit Doldu', `Günlük ${MAX_DAILY_HOLD} kullanım hakkınız doldu. Yarını kadar bekleyin.`);
          return;
        }
        const newCount = holdDailyCount + 1;
        setHoldDailyCount(newCount);
        localStorage.setItem('holdDailyCount_' + user.uid, String(newCount));
        localStorage.setItem('holdDailyDate_' + user.uid, new Date().toDateString());
        await updateDoc(doc(db, 'chats', chatId), { heldBy: user.uid, holdExpiresAt: new Date(Date.now() + 24*60*60*1000) });
        showCustomAlert('Sohbet Beklemeye Alındı', `Bu sohbet 24 saat beklemeye alındı. Kalan hakkınız: ${MAX_DAILY_HOLD - newCount}/${MAX_DAILY_HOLD}`);
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
        } else {
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

  // Hold daily count from localStorage
  useEffect(() => {
    if (!user) return;
    try {
      const stored = localStorage.getItem('holdDailyCount_' + user.uid);
      const date = localStorage.getItem('holdDailyDate_' + user.uid);
      const today = new Date().toDateString();
      if (date === today && stored) {
        setHoldDailyCount(parseInt(stored, 10));
      } else {
        setHoldDailyCount(0);
        localStorage.setItem('holdDailyCount_' + user.uid, '0');
        localStorage.setItem('holdDailyDate_' + user.uid, today);
      }
    } catch {}
  }, [user]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollToBottom(scrollHeight - scrollTop - clientHeight > 200);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

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

    if (file.size > 800 * 1024) {
      showCustomAlert("Dosya Boyutu Sınırı", "Seçilen görsel dosyası çok büyük (maksimum 800KB olmalıdır).");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = reader.result as string;
      try {
        await addDoc(collection(db, 'chats', chatId, 'messages'), {
          imageUrl: base64Image,
          senderId: user.uid,
          timestamp: serverTimestamp(),
          type: 'image',
          status: 'sent'
        });

        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: {
            text: '📷 Fotoğraf',
            senderId: user.uid,
            senderName: user.displayName,
            timestamp: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Resim gönderme hatası:", error);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!chatId || !user) return;
    showCustomConfirm(
      "Mesajı Sil",
      "Bu mesajı silmek istediğinizden emin misiniz? Silinen mesaj yönetim onayına gönderilecektir.",
      async () => {
        try {
          // Mesajı tamamen sil
          await deleteDoc(doc(db, 'chats', chatId, 'messages', msgId));
          // Yönetim paneline bildir
          await addDoc(collection(db, 'pendingDeletions'), {
            chatId,
            messageId: msgId,
            deletedBy: user.uid,
            deletedByName: user.displayName,
            deletedAt: serverTimestamp(),
            status: 'pending'
          });
        } catch (error) {
          console.error("Delete message error:", error);
        }
      }
    );
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !user || !chatId) return;

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
        <div className="flex items-center gap-1.5 sm:gap-3 text-slate-500 relative mt-2 pl-14">
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
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 text-blue-500 hover:bg-blue-100 hover:text-blue-700 transition-all active:scale-90"
                title="Sesli Arama Başlat"
              >
                <Phone size={16} />
              </button>
              <button 
                onClick={() => chat && startCall(chat.id, chat.participants, chat.type, 'video')}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700 transition-all active:scale-90"
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
            className={cn("w-8 h-8 flex items-center justify-center rounded-xl transition-all", showChatSearch ? "bg-sky-100 text-sky-600" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700")}
            title="Sohbet İçi Ara"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>

          {/* Toplu Seç */}
          <button 
            onClick={() => { setBatchMode(!batchMode); setSelectedMsgs(new Set()); }}
            className={cn("w-8 h-8 flex items-center justify-center rounded-xl transition-all", batchMode ? "bg-emerald-100 text-emerald-600" : "bg-emerald-50 text-emerald-500 hover:bg-emerald-100 hover:text-emerald-700")}
            title="Toplu Mesaj Seç"
          >
            <ListChecks size={18} />
          </button>

          {/* Beklemeye Al */}
          {(chat?.type === 'private' || chat?.groupMetadata?.adminId === user?.uid) && (
            <button 
              onClick={handleHoldToggle}
              className={cn("w-8 h-8 flex items-center justify-center rounded-xl transition-all relative", amIHolding ? "bg-amber-100 text-amber-600" : "bg-amber-50 text-amber-500 hover:bg-amber-100 hover:text-amber-700")}
              title={amIHolding ? 'Beklemeden Çıkar' : 'Beklemeye Al'}
            >
              {amIHolding ? <Play size={18} /> : <Pause size={18} />}
              {!amIHolding && holdDailyCount < MAX_DAILY_HOLD && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 text-white text-[8px] font-black rounded-full flex items-center justify-center shadow-sm">
                  {MAX_DAILY_HOLD - holdDailyCount}
                </span>
              )}
              {holdDailyCount >= MAX_DAILY_HOLD && !amIHolding && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[7px] font-black rounded-full flex items-center justify-center shadow-sm">
                  <X size={10} />
                </span>
              )}
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
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-purple-50 text-purple-500 hover:bg-purple-100 hover:text-purple-700 transition-all"
            title="Kullanıcı Bilgisi"
          >
            <Info size={18} />
          </button>
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
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar z-10"
      >
        <div className="flex justify-center mb-8">
          <span className="px-3 py-1 bg-slate-200 text-slate-500 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm">BUGÜN</span>
        </div>

        <AnimatePresence>
          {messages
            .filter(msg => !chatSearchQuery || msg.text?.toLowerCase().includes(chatSearchQuery.toLowerCase()))
            .map((msg, idx) => {
              const isMe = msg.senderId === user?.uid;
              const sender = participantInfo[msg.senderId];

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
                      onContextMenu={(e) => msg.id && onContextMenu(e, msg.id)}
                      className={cn(
                        "px-5 py-3 rounded-2xl shadow-sm border overflow-hidden relative group/bubble transition-all duration-300",
                        isMe 
                          ? "bg-blue-600 text-white border-blue-500 rounded-br-none shadow-blue-100" 
                          : "bg-white text-slate-800 border-slate-100 rounded-bl-none"
                      )}
                    >

                      {msg.type === 'text' && (
                        msg.encrypted && !isMe ? (
                          <button onClick={() => setDecryptModal(msg)}
                            className="text-sm font-medium leading-relaxed opacity-70 hover:opacity-100 text-left w-full">
                            🔒 Şifreli Mesaj (dokunun)
                          </button>
                        ) : (
                          <p className="text-sm font-medium leading-relaxed">{msg.text}</p>
                        )
                      )}
                      
                      {msg.type === 'image' && msg.imageUrl && (
                        <div className="relative rounded-lg overflow-hidden mb-1 min-w-[200px]">
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
                              onClick={() => window.open(msg.imageUrl, '_blank')}
                            />
                          )}
                        </div>
                      )}

                      {msg.type === 'video' && msg.videoUrl && (
                        <div className="relative rounded-lg overflow-hidden mb-1 min-w-[240px] bg-black/5">
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
                              controls
                              playsInline
                            />
                          )}
                        </div>
                      )}

                      {msg.type === 'audio' && msg.audioUrl && (
                        <div>
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
                        isMe ? "text-blue-100" : "text-slate-400"
                      )}>
                        <span className="text-[10px] font-medium">
                          {msg.timestamp ? format(msg.timestamp.toDate(), 'HH:mm') : ''}
                        </span>
                        {isMe && <MessageStatus status={msg.status} />}
                      </div>
                    </div>

                    {/* Hover Actions: Reaction & Delete */}
                    {msg.id && (
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

      {/* Scroll to Bottom Button */}
      {showScrollToBottom && (
        <button onClick={scrollToBottom}
          className="absolute bottom-24 right-6 z-20 w-10 h-10 bg-white border border-slate-200 rounded-full shadow-lg flex items-center justify-center text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
          title="Sona Dön"
        >
          <ChevronDown size={20} />
        </button>
      )}

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
                  if (!chat || !user) return;
                  for (const msgId of selectedMsgs) {
                    try {
                      await deleteDoc(doc(db, 'chats', chatId, 'messages', msgId));
                      await addDoc(collection(db, 'pendingDeletions'), {
                        chatId,
                        messageId: msgId,
                        deletedBy: user.uid,
                        deletedByName: user.displayName,
                        deletedAt: serverTimestamp(),
                        status: 'pending'
                      });
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
      {isBeingHeld && (
        <div className="p-3 bg-amber-50 border-t border-amber-200 flex items-center gap-2 shrink-0">
          <Pause size={14} className="text-amber-600" />
          <span className="text-[10px] font-bold text-amber-700">Bu sohbet beklemeye alındı. Mesaj gönderemezsiniz.</span>
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
            accept="image/*"
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

          <button 
            type="button" 
            onClick={handleImageSend}
            className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Image size={20} />
          </button>
          <button 
            type="button" 
            onClick={handleVideoSend}
            className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Video size={20} />
          </button>

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

      {/* Profile Modal */}
      {showProfile && otherUser && (
        <ProfileModal user={otherUser} onClose={() => setShowProfile(false)} readOnly />
      )}
    </div>
  );
};
