import React, { useEffect, useState, useRef, useCallback } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, doc, updateDoc, getDoc, where, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthProvider';
import { useCall } from './CallProvider';
import { Chat, Message, UserProfile, Call } from '../types';
import { cn } from '../lib/utils';
import { Image, MoreVertical, Send, Smile, Phone, Video, MessageSquarePlus, Clock, Play, Mic, Pause, Trash2, ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

interface ChatAreaProps {
  chatId: string;
  onBack?: () => void;
}

const AudioPlayer: React.FC<{ url: string; isMe: boolean }> = ({ url, isMe }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn(
      "flex items-center gap-3 min-w-[180px] py-1",
      isMe ? "text-white" : "text-slate-800"
    )}>
      <button 
        onClick={togglePlay}
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0",
          isMe ? "bg-white/20 hover:bg-white/30" : "bg-blue-50 hover:bg-blue-100 text-blue-600 shadow-sm"
        )}
      >
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-current opacity-20 rounded-full relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-current rounded-full transition-all duration-200"
            style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }}
          />
        </div>
        <span className="text-[10px] font-bold opacity-60 tabular-nums shrink-0">
          {isPlaying || progress > 0 ? formatTime(duration - progress) : formatTime(duration)}
        </span>
      </div>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
        onTimeUpdate={() => {
          if (audioRef.current) setProgress(audioRef.current.currentTime);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
        }}
        className="hidden"
      />
    </div>
  );
};

export const ChatArea: React.FC<ChatAreaProps> = ({ chatId, onBack }) => {
  const { user } = useAuth();
  const { startCall, activeCall, acceptCall, callError } = useCall();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chat, setChat] = useState<Chat | null>(null);

  useEffect(() => {
    if (callError) showCustomAlert('Arama Hatası', callError);
  }, [callError]);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [participantInfo, setParticipantInfo] = useState<Record<string, UserProfile>>({});
  const [inputText, setInputText] = useState('');
  const [activeCallForChat, setActiveCallForChat] = useState<Call | null>(null);
  const [reactionMenu, setReactionMenu] = useState<{ msgId: string, x: number, y: number } | null>(null);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isEmojiMenuOpen, setIsEmojiMenuOpen] = useState(false);
  const [viewProfile, setViewProfile] = useState<UserProfile | null>(null);
  const [selectedActionMsg, setSelectedActionMsg] = useState<string | null>(null);
  const [customDialog, setCustomDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
  } | null>(null);



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

  const confirmDeleteMsg = (msgId: string) => {
    showCustomConfirm('Mesajı Sil', 'Bu mesajı silmek istediğinize emin misiniz?', () => handleDeleteMsg(msgId));
  };

  const handleDeleteMsg = async (msgId: string) => {
    if (!chatId || !user) return;
    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', msgId);
      const msgSnap = await getDoc(msgRef);
      if (!msgSnap.exists()) return;
      const currentDeletedBy = msgSnap.data().deletedBy || [];
      await updateDoc(msgRef, {
        deletedBy: Array.from(new Set([...currentDeletedBy, user.uid]))
      });
    } catch (error) {
      console.error("Delete message error:", error);
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

  const participantInfoRef = useRef<Record<string, UserProfile>>({});

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
    const profileUnsubs: (() => void)[] = [];

    const unsubChat = onSnapshot(chatRef, async (d) => {
      if (d.exists()) {
        const chatData = d.data() as Chat;
        chatData.id = d.id;
        setChat(chatData);

        // Clean old profile listeners
        profileUnsubs.forEach(fn => fn());
        profileUnsubs.length = 0;

        if (chatData.type === 'private') {
          const otherId = chatData.participants.find(p => p !== user.uid);
          if (otherId) {
            profileUnsubs.push(
              onSnapshot(doc(db, 'users', otherId), (snap) => {
                if (snap.exists()) {
                  const otherProfile = snap.data() as UserProfile;
                  setOtherUser(otherProfile);
                  participantInfoRef.current = { ...participantInfoRef.current, [otherId]: otherProfile };
                  setParticipantInfo({ ...participantInfoRef.current });
                }
              })
            );
          }
        } else {
          for (const pId of chatData.participants) {
            if (!participantInfoRef.current[pId]) {
              profileUnsubs.push(
                onSnapshot(doc(db, 'users', pId), (snap) => {
                  if (snap.exists()) {
                    participantInfoRef.current[pId] = snap.data() as UserProfile;
                    setParticipantInfo({ ...participantInfoRef.current });
                  }
                })
              );
            }
          }
        }
      }
    });

    // Fetch messages
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const readProcessedRef = new Set<string>();

    const unsubMsgs = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);

      for (const msg of msgs) {
        if (
          msg.senderId !== user.uid &&
          msg.status !== 'read' &&
          !readProcessedRef.has(msg.id)
        ) {
          readProcessedRef.add(msg.id);
          updateDoc(doc(db, 'chats', chatId, 'messages', msg.id), {
            status: 'read'
          }).catch(() => {});
        }
      }
    });

    const handleClickOutside = () => {
      setReactionMenu(null);
      setSelectedActionMsg(null);
    };
    window.addEventListener('click', handleClickOutside);

    // VisualViewport for mobile keyboard
    let originalHeight = window.innerHeight;
    const handleViewport = () => {
      const inputFooter = document.getElementById('chat-input-footer');
      if (!inputFooter) return;
      if (window.visualViewport) {
        const diff = originalHeight - window.visualViewport.height;
        if (diff > 100) {
          inputFooter.style.paddingBottom = `${diff}px`;
        } else {
          inputFooter.style.paddingBottom = '';
        }
      }
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewport);
      window.visualViewport.addEventListener('scroll', handleViewport);
    }

    return () => {
      unsubCalls();
      unsubChat();
      unsubMsgs();
      profileUnsubs.forEach(fn => fn());
      window.removeEventListener('click', handleClickOutside);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewport);
        window.visualViewport.removeEventListener('scroll', handleViewport);
      }
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

  const [showVideoDialog, setShowVideoDialog] = useState(false);
  const [videoDialogState, setVideoDialogState] = useState<'preview' | 'recording' | 'result'>('preview');
  const [videoRecordingTime, setVideoRecordingTime] = useState(0);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoTimerRef = useRef<any>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const [useFrontCamera, setUseFrontCamera] = useState(true);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);

  const MAX_RECORDING_SECONDS = 30;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
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
          if (base64Audio.length > 900000) {
            showCustomAlert("Ses Kaydı Sınırı", "Ses mesajı çok uzun, lütfen daha kısa bir kayıt yapın (maks. 30 saniye).");
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
        setRecordingTime(prev => {
          if (prev >= MAX_RECORDING_SECONDS - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
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

  const MAX_VIDEO_RECORDING_SECONDS = 10;

  const startVideoStream = async (facing: 'user' | 'environment') => {
    try {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(t => t.stop());
        videoStreamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 10 }, facingMode: facing },
        audio: false
      });
      videoStreamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Camera access error:", error);
      showCustomAlert("Kamera Erişim Hatası", "Kameraya erişilemedi. İzinleri kontrol edin.");
      setShowVideoDialog(false);
    }
  };

  const stopVideoStream = () => {
    clearInterval(videoTimerRef.current);
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(t => t.stop());
      videoStreamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!showVideoDialog) {
      stopVideoStream();
      return;
    }
    const t = setTimeout(() => {
      startVideoStream(useFrontCamera ? 'user' : 'environment');
    }, 300);
    return () => { clearTimeout(t); };
  }, [showVideoDialog, useFrontCamera]);

  const openVideoDialog = () => {
    setShowVideoDialog(true);
    setVideoDialogState('preview');
    setRecordedVideoUrl(null);
    setVideoRecordingTime(0);
  };

  const toggleCamera = () => {
    stopVideoStream();
    setUseFrontCamera(prev => !prev);
  };

  const startVideoRecording = () => {
    if (!videoStreamRef.current) return;
    videoChunksRef.current = [];
    setVideoRecordingTime(0);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';
    const mediaRecorder = new MediaRecorder(videoStreamRef.current, { mimeType, videoBitsPerSecond: 250000 });
    videoRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const videoBlob = new Blob(videoChunksRef.current, { type: 'video/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(videoBlob);
      reader.onloadend = () => {
        setRecordedVideoUrl(reader.result as string);
        setVideoDialogState('result');
        stopVideoStream();
      };
    };

    mediaRecorder.start(100);
    setVideoDialogState('recording');
    videoTimerRef.current = setInterval(() => {
      setVideoRecordingTime(prev => {
        if (prev >= MAX_VIDEO_RECORDING_SECONDS - 1) {
          stopVideoRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopVideoRecording = () => {
    if (videoRecorderRef.current && videoRecorderRef.current.state === 'recording') {
      videoRecorderRef.current.stop();
      clearInterval(videoTimerRef.current);
    }
  };

  const discardVideo = () => {
    setRecordedVideoUrl(null);
    setShowVideoDialog(false);
    setVideoDialogState('preview');
    stopVideoStream();
  };

  const sendRecordedVideo = async () => {
    if (!recordedVideoUrl) return;
    await sendVideoMessage(recordedVideoUrl);
    setRecordedVideoUrl(null);
    setShowVideoDialog(false);
    setVideoDialogState('preview');
    clearInterval(videoTimerRef.current);
  };

  const closeVideoDialog = () => {
    setShowVideoDialog(false);
    setRecordedVideoUrl(null);
    setVideoDialogState('preview');
    stopVideoStream();
  };

  const sendVideoMessage = async (videoUrl: string) => {
    if (!user || !chatId) return;
    if (videoUrl.length > 2000000) {
      showCustomAlert("Video Çok Büyük", "Video dosyası çok büyük. Lütfen daha kısa bir kayıt yapın.");
      return;
    }
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        videoUrl,
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
      console.error("Video send error:", error);
      showCustomAlert("Video Hatası", "Video gönderilirken bir hata oluştu. Lütfen tekrar deneyin.");
    }
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

    const text = inputText;
    setInputText('');

    const messageData = {
      text,
      senderId: user.uid,
      timestamp: serverTimestamp(),
      type: 'text',
      status: 'sent'
    };

    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), messageData);
      
      // Update chat last message
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text,
          senderId: user.uid,
          senderName: user.displayName,
          timestamp: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
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
      <header className="min-h-14 sm:h-20 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-8 shrink-0 relative z-10">
        <div className="flex items-center min-w-0 flex-1">
          <button onClick={onBack} className="p-1.5 mr-1.5 sm:hidden text-slate-500 hover:bg-slate-100 rounded-lg shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full mr-2 sm:mr-4 shadow-sm overflow-hidden border-2 border-white shrink-0">
            <img 
              src={headerInfo.photoURL} 
              alt={headerInfo.name} 
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-none truncate max-w-[120px] sm:max-w-none">{headerInfo.name}</h3>
              {headerInfo.status && (
                <span className={cn(
                  "text-[8px] sm:text-[9px] font-black uppercase px-1.5 sm:px-2 py-0.5 rounded-full shadow-sm",
                  headerInfo.status === 'online' ? "bg-green-500 text-white" : 
                  headerInfo.status === 'away' ? "bg-amber-500 text-white" : "bg-red-500 text-white"
                )}>
                  {headerInfo.status === 'online' ? 'Çevrimiçi' : headerInfo.status === 'away' ? 'Uzakta' : 'Meşgul'}
                </span>
              )}
              {headerInfo.uin && <span className="text-[9px] sm:text-[10px] font-black text-blue-500 bg-blue-50 px-1 sm:px-1.5 py-0.5 rounded tracking-tighter hidden sm:inline">#{headerInfo.uin}</span>}
            </div>
            <span className={cn(
              "text-[10px] sm:text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5",
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
        <div className="flex items-center space-x-3 sm:space-x-6 text-slate-400 relative shrink-0">
          {activeCallForChat && !activeCall && (
            <button 
              onClick={() => acceptCall()}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-green-500/20 active:scale-95 animate-pulse"
            >
              <Video size={16} />
              KATIL
            </button>
          )}
          
          {!activeCallForChat && (
            <button 
              onClick={() => {
                if (callError) return;
                chat && startCall(chat.id, chat.participants, chat.type, 'audio');
              }}
              className="hover:text-blue-600 transition-colors"
              title="Sesli Arama Başlat"
            >
              <Phone size={20} />
            </button>
          )}

          {activeCallForChat && activeCall?.id === activeCallForChat.id && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-ping" />
              GÖRÜŞMEDESİN
            </div>
          )}
          
          <div className="relative">
            <button 
              onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
              className="hover:text-slate-900 transition-colors p-1 rounded-full hover:bg-slate-100"
            >
              <MoreVertical size={20} />
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
                    onClick={() => { setIsHeaderMenuOpen(false); }}
                    className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                  >
                    ℹ️ Sohbet / Katılımcı Bilgileri
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 sm:p-10 space-y-4 sm:space-y-6 custom-scrollbar z-10"
      >
        <div className="flex justify-center mb-4 sm:mb-8">
          <span className="px-3 py-1 bg-slate-200 text-slate-500 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm">BUGÜN</span>
        </div>

        <AnimatePresence>
          {messages
            .filter(msg => !msg.deletedBy?.includes(user?.uid || ''))
            .map((msg, idx) => {
              const isMe = msg.senderId === user?.uid;
              const sender = participantInfo[msg.senderId];
              const isDeleted = (msg.deletedBy?.length || 0) > 0;

              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id || idx}
                  className={cn(
                    "flex items-end space-x-2 sm:space-x-3 max-w-[90%] sm:max-w-[70%]",
                    isMe ? "self-end flex-row-reverse space-x-reverse" : "self-start"
                  )}
                >
                  {!isMe && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 shrink-0 border border-white shadow-sm overflow-hidden cursor-pointer" onClick={() => sender && setViewProfile(sender)}>
                      <img src={sender?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderId}`} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className={cn(
                     "flex flex-col relative group",
                     isMe ? "items-end" : "items-start"
                  )}>
                    {!isMe && (
                      <div className="flex flex-col mb-1 ml-1 cursor-pointer" onClick={() => sender && setViewProfile(sender)}>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider hover:text-blue-500 transition-colors">
                          {sender?.nickname || sender?.displayName || 'Bilinmeyen'}
                        </span>
                        {sender?.uin && (
                          <span className="text-[8px] font-bold text-slate-300 uppercase tracking-tight">
                            #{sender.uin}
                          </span>
                        )}
                      </div>
                    )}
                    <div 
                      onContextMenu={(e) => msg.id && !isDeleted && onContextMenu(e, msg.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (msg.id && !isDeleted) {
                          setSelectedActionMsg(prev => prev === msg.id ? null : msg.id);
                        }
                      }}
                      className={cn(
                        "px-5 py-3 rounded-2xl shadow-sm border overflow-hidden transition-all duration-300",
                        isDeleted
                          ? "bg-slate-100 text-slate-400 border-slate-200/60 opacity-60 rounded-br-none"
                          : isMe 
                            ? "bg-blue-600 text-white border-blue-500 rounded-br-none shadow-blue-100" 
                            : "bg-white text-slate-800 border-slate-100 rounded-bl-none",
                        !isDeleted && msg.id && "cursor-pointer"
                      )}
                    >
                      {isDeleted && (
                        <div className="text-[9px] font-black uppercase tracking-wider text-rose-500 flex items-center gap-1 mb-1.5 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded w-max select-none">
                          <Trash2 size={10} /> SİLİNMİŞ MESAJ
                        </div>
                      )}

                      {msg.type === 'text' && (
                        <p className={cn(
                          "text-sm font-medium leading-relaxed",
                          isDeleted && "line-through text-slate-400 font-normal italic"
                        )}>{msg.text}</p>
                      )}
                      
                      {msg.type === 'image' && msg.imageUrl && (
                        <div className={cn(
                          "relative rounded-lg overflow-hidden mb-1 min-w-[200px]",
                          isDeleted && "grayscale blur-[2px] opacity-40"
                        )}>
                          <img 
                            src={msg.imageUrl} 
                            alt="Paylaşılan görsel" 
                            className="max-w-full h-auto object-cover hover:scale-105 transition-transform duration-500 cursor-pointer"
                            onClick={() => !isDeleted && window.open(msg.imageUrl, '_blank')}
                          />
                        </div>
                      )}

                      {msg.type === 'video' && msg.videoUrl && (
                        <div className={cn(
                          "relative rounded-lg overflow-hidden mb-1 min-w-[240px] bg-black/5",
                          isDeleted && "grayscale blur-[2px] opacity-40"
                        )}>
                          <video 
                            src={msg.videoUrl} 
                            className="max-w-full h-auto" 
                            controls={!isDeleted}
                            playsInline
                          />
                        </div>
                      )}

                      {msg.type === 'audio' && msg.audioUrl && (
                        <div className={cn(isDeleted && "grayscale opacity-40 pointer-events-none")}>
                          <AudioPlayer url={msg.audioUrl} isMe={isMe} />
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

                    {/* Click-to-show Actions: Reaction & Delete */}
                    {!isDeleted && msg.id && selectedActionMsg === msg.id && (
                      <div className={cn(
                        "flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150",
                        isMe ? "justify-end mt-1.5" : "justify-start mt-1.5"
                      )}>
                        <div className="inline-flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-full shadow-lg">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReactionMenu({ msgId: msg.id, x: e.clientX, y: e.clientY });
                            }}
                            className="p-1.5 px-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 active:scale-110 transition-all rounded-full cursor-pointer"
                            title="Tepki Bırak"
                          >
                            <Smile size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedActionMsg(null);
                              confirmDeleteMsg(msg.id);
                            }}
                            className="p-1.5 px-2 text-slate-500 hover:text-red-500 hover:bg-red-50 active:scale-110 transition-all rounded-full cursor-pointer"
                            title={isMe ? 'Mesajı Sil' : 'Benden Sil'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
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

        {/* Persistent Admin Message Button */}
        </div>

      {/* Input Area */}
      <footer id="chat-input-footer" className="p-2 sm:p-6 bg-white border-t border-slate-200 shrink-0 z-10 transition-all duration-200 safe-area-bottom">
        <div className="max-w-4xl mx-auto flex items-center bg-slate-100 rounded-xl sm:rounded-2xl p-1 sm:p-2 focus-within:ring-2 focus-within:ring-blue-500 transition-all relative gap-0.5 sm:gap-0">
          
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

          <div className="relative shrink-0">
            <button 
              type="button" 
              onClick={() => setIsEmojiMenuOpen(!isEmojiMenuOpen)}
              className={cn(
                "p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg sm:rounded-xl",
                isEmojiMenuOpen && "bg-slate-200 text-slate-700"
              )}
            >
              <Smile size={18} className="sm:size-[20px]" />
            </button>

            {isEmojiMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsEmojiMenuOpen(false)} />
                <div className="absolute bottom-full mb-2 left-0 sm:bottom-12 sm:left-0 w-56 sm:w-64 bg-white border border-slate-150 rounded-2xl shadow-xl p-2 sm:p-3 z-40 grid grid-cols-5 gap-1 animate-in fade-in slide-in-from-bottom-2 duration-155">
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
            className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          >
            <Image size={18} className="sm:size-[20px]" />
          </button>
          <button 
            type="button" 
            onClick={openVideoDialog}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            title="Video Kaydı (10sn)"
          >
            <Video size={18} className="sm:size-[20px]" />
          </button>

          {isRecording ? (
            <div className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-1 bg-red-50 text-red-600 rounded-lg sm:rounded-xl animate-in fade-in zoom-in-95 duration-200 shrink-0">
               <div className="w-2 h-2 bg-red-600 rounded-full animate-ping shrink-0" />
               <span className="text-[10px] sm:text-xs font-black tabular-nums">{Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}</span>
               <button onClick={stopRecording} className="p-1 px-1.5 sm:px-2 bg-red-600 text-white rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Gönder</button>
            </div>
          ) : (
            <button 
              type="button" 
              onClick={startRecording}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0"
            >
              <Mic size={18} className="sm:size-[20px]" />
            </button>
          )}

          <form onSubmit={handleSend} className="flex-1 flex items-center min-w-0">
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Mesaj yaz..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-1.5 sm:py-2 px-2 sm:px-4 text-slate-900 placeholder:text-slate-400 min-w-0 w-0"
            />
            <button 
              type="submit"
              disabled={!inputText.trim()}
              className={cn(
                "p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all flex items-center justify-center shadow-lg shrink-0",
                inputText.trim() 
                  ? "bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700" 
                  : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
              )}
            >
              <Send size={16} className="sm:size-[18px]" />
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
              top: Math.min(reactionMenu.y, window.innerHeight - 100), 
              left: Math.max(8, Math.min(reactionMenu.x, window.innerWidth - 320))
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleReaction(reactionMenu.msgId, emoji)}
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-lg sm:text-xl hover:bg-slate-100 rounded-xl transition-all active:scale-125"
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

        {/* Profile View Modal */}
        <AnimatePresence>
          {viewProfile && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setViewProfile(null)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full flex flex-col items-center gap-4"
                onClick={e => e.stopPropagation()}
              >
                <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 border-4 border-white shadow-xl">
                  <img src={viewProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${viewProfile.uid}`} className="w-full h-full object-cover" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-black text-slate-900">{viewProfile.nickname || viewProfile.displayName}</h3>
                  <p className="text-xs font-bold text-blue-500">#{viewProfile.uin}</p>
                  {viewProfile.nickname && (
                    <p className="text-xs text-slate-400 mt-1">@{viewProfile.displayName}</p>
                  )}
                </div>
                {viewProfile.about && (
                  <div className="w-full bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Hakkında</p>
                    <p className="text-sm font-bold text-slate-700">{viewProfile.about}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", viewProfile.onlineStatus === 'online' ? 'bg-green-500' : viewProfile.onlineStatus === 'away' ? 'bg-amber-500' : viewProfile.onlineStatus === 'busy' ? 'bg-red-500' : 'bg-slate-300')} />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {viewProfile.onlineStatus === 'online' ? 'Çevrimiçi' : viewProfile.onlineStatus === 'away' ? 'Uzakta' : viewProfile.onlineStatus === 'busy' ? 'Meşgul' : 'Çevrimdışı'}
                  </span>
                </div>
                <button onClick={() => setViewProfile(null)} className="mt-2 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all">
                  Kapat
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Video Recording Dialog */}
        {showVideoDialog && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" onClick={closeVideoDialog}>
            <div className="bg-slate-950 rounded-2xl overflow-hidden shadow-2xl w-full max-w-sm mx-3" onClick={e => e.stopPropagation()}>
              {/* Camera Preview */}
              <div className="relative bg-black aspect-[3/4] flex items-center justify-center">
                {videoDialogState !== 'result' ? (
                    <video ref={el => { videoPreviewRef.current = el; }} autoPlay playsInline muted className="w-full h-full object-cover" />
                ) : (
                  <video src={recordedVideoUrl || ''} controls playsInline className="w-full h-full object-cover" />
                )}

                {/* Close button */}
                <button onClick={closeVideoDialog} className="absolute top-3 right-3 p-1.5 bg-slate-900/60 hover:bg-slate-900/80 rounded-full text-white transition-all z-10">
                  <X size={18} />
                </button>

                {/* Timer */}
                {videoDialogState === 'recording' && (
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-full">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                    <span className="text-white text-xs font-black tabular-nums">{Math.floor(videoRecordingTime / 60)}:{String(videoRecordingTime % 60).padStart(2, '0')}</span>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="p-5 flex items-center justify-center gap-5 bg-slate-900">
                {videoDialogState === 'preview' && (
                  <>
                    <button onClick={toggleCamera} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-white transition-all" title="Kamera Değiştir">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    </button>
                    <button onClick={startVideoRecording} className="w-14 h-14 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-all">
                      <div className="w-6 h-6 rounded-full bg-white" />
                    </button>
                    <div className="w-[52px]" />
                  </>
                )}
                {videoDialogState === 'recording' && (
                  <>
                    <button onClick={stopVideoRecording} className="w-14 h-14 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-all">
                      <div className="w-5 h-5 rounded-sm bg-white" />
                    </button>
                    <span className="text-xs text-slate-400 font-bold">Kaydediliyor...</span>
                  </>
                )}
                {videoDialogState === 'result' && (
                  <>
                    <button onClick={discardVideo} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-red-400 transition-all">
                      <Trash2 size={20} />
                    </button>
                    <button onClick={sendRecordedVideo} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs shadow-lg transition-all active:scale-95">
                      Gönder
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

    </div>
  );
};
