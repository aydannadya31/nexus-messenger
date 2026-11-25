import React, { useState, useRef, useEffect } from 'react';
import { Message, SharedFile, Participant } from '../types';
import { 
  Send, Paperclip, CheckCircle, Download, 
  Laugh, Users, Sparkles, MessageSquareDot
} from 'lucide-react';
import { getFileIcon } from '../utils/fileIcon';

interface ChatAreaProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  participants: Participant[];
  onUploadFile: (file: SharedFile) => void;
  sharedFiles: SharedFile[];
}

export default function ChatArea({
  messages,
  setMessages,
  participants,
  onUploadFile,
  sharedFiles
}: ChatAreaProps) {
  const [inputText, setInputText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [speakVoice, setSpeakVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speakRate, setSpeakRate] = useState(1);
  const [speakPitch, setSpeakPitch] = useState(1);
  const [speakVolume, setSpeakVolume] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Auto scroll to latest message
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!synth) return;
    const loadVoices = () => {
      const v = synth.getVoices();
      setVoices(v);
      const tr = v.find(x => x.lang.startsWith('tr'));
      setSpeakVoice(tr ?? null);
    };
    loadVoices();
    synth.onvoiceschanged = loadVoices;
  }, []);

  const speak = (text: string) => {
    if (!speakEnabled || !synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (speakVoice) u.voice = speakVoice;
    u.rate = speakRate;
    u.pitch = speakPitch;
    u.volume = speakVolume;
    u.lang = speakVoice?.lang || 'tr-TR';
    synth.speak(u);
  };

  // Handle Send text message
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const myMessage: Message = {
      id: Math.random().toString(36).substring(4),
      senderId: 'user',
      senderName: 'Siz',
      senderAvatar: 'S',
      content: inputText,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, myMessage]);
    const writtenText = inputText;
    setInputText('');

    // Trigger simulated responder from random active participant
    triggerSimulatedReply(writtenText);
  };

  // Simulated AI participant reply based on context
  const triggerSimulatedReply = (userText: string) => {
    setTimeout(() => {
      // Find a simulated participant
      const sims = participants.filter(p => p.role === 'simulated' && !p.isMuted);
      if (sims.length === 0) return;
      const responder = sims[Math.floor(Math.random() * sims.length)];

      let responseText = "Anlaşıldı! Görüşmeye devam ediyoruz.";
      const lower = userText.toLowerCase();

      if (lower.includes("merhaba") || lower.includes("selam")) {
        responseText = `Selamlar! Hoş geldin, sesin ve görüntün çok iyi geliyor.`;
      } else if (lower.includes("dosya") || lower.includes("belge") || lower.includes("pdf")) {
        responseText = `Dosya yüklemenizi aldım, hemen inceliyorum. Teşekkürler!`;
      } else if (lower.includes("kayıt") || lower.includes("ekran")) {
        responseText = `Ekran kaydı seçeneği olması süper olmuş. Toplantı bitiminde kaydı alabilir miyim?`;
      } else if (lower.includes("ses") || lower.includes("duymak")) {
        responseText = `Benim mikrofonda sıkıntı yok herhalde? Sesim net ulaşıyor mu?`;
      } else if (lower.includes("video") || lower.includes("görüntü")) {
        responseText = `Benim kamera açısı nasıl? Işık biraz az sanki ama idare eder.`;
      } else {
        const standardReplies = [
          "Harika bir noktaya değindin.",
          "Tamamen katılıyorum! Diğer arkadaşlar ne düşünüyor?",
          "Bu ekran paylaşımına ek olarak bir de sunumu yükler misin?",
          "Toplantı kaydını daha sonra kanala atarsan harika olur.",
          "Sesin çok net geliyor, sunumuna devam edebilirsin.",
          "Sorunsuz bir bağlantı var şu anda bende."
        ];
        responseText = standardReplies[Math.floor(Math.random() * standardReplies.length)];
      }

      const simMessage: Message = {
        id: Math.random().toString(36).substring(4),
        senderId: responder.id,
        senderName: responder.name,
        senderAvatar: responder.avatar,
        content: responseText,
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, simMessage]);
      speak(responseText);
    }, 2000 + Math.random() * 1500);
  };

  // Convert files loaded into downloadable structures
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    const fileUrl = URL.createObjectURL(file);
    const sizeInKb = (file.size / 1024);
    const sizeStr = sizeInKb > 1000 
      ? (sizeInKb / 1024).toFixed(1) + ' MB' 
      : sizeInKb.toFixed(0) + ' KB';

    const sharedFile: SharedFile = {
      id: Math.random().toString(36).substring(4),
      name: file.name,
      size: sizeStr,
      type: file.type || 'application/octet-stream',
      url: fileUrl,
      senderName: 'Siz',
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    };

    // Store in active parent files state
    onUploadFile(sharedFile);

    // Push standard visual card into chat
    const fileMessage: Message = {
      id: Math.random().toString(36).substring(4),
      senderId: 'user',
      senderName: 'Siz',
      senderAvatar: 'S',
      content: `📎 Dosya paylaştı: ${file.name}`,
      timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      file: sharedFile
    };

    setMessages(prev => [...prev, fileMessage]);

    // Fast simulated response acknowledging upload
    setTimeout(() => {
      const activeParticipants = participants.filter(p => p.role === 'simulated');
      if (activeParticipants.length > 0) {
        const chosen = activeParticipants[Math.floor(Math.random() * activeParticipants.length)];
        setMessages(prev => [...prev, {
          id: Math.random().toString(36).substring(4),
          senderId: chosen.id,
          senderName: chosen.name,
          senderAvatar: chosen.avatar,
          content: `👍 "${file.name}" dosyasını başarıyla aldım, teşekkürler!`,
          timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        }]);
      }
    }, 1500);
  };

  // Drag and Drop files controls over chats
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processSelectedFile(files[0]);
    }
  };

  const fileIcon = (mimeType: string, filename: string) => getFileIcon(mimeType, filename, 24);

  return (
    <div 
      className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden shadow-xl"
      onDragOver={handleDragOver}
    >
      {/* Hidden file input anchor */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Drag element overlay */}
      {isDragging && (
        <div 
          className="absolute inset-0 bg-indigo-950/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 border-4 border-dashed border-indigo-500/80 rounded-2xl transition-all"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="p-4 bg-indigo-500/10 rounded-2xl text-indigo-400 mb-4 animate-[bounce_1s_infinite]">
            <Paperclip size={44} />
          </div>
          <h4 className="text-lg font-bold text-slate-100 font-display">Dosyayı Buraya Bırakın</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-xs text-center font-sans">
            Bıraktığınız dosya anında yüklenecek ve toplantı odasındaki diğer 7 katılımcıyla paylaşılacaktır.
          </p>
        </div>
      )}

      {/* Header of Chat */}
      <div className="px-5 py-4 border-b border-slate-850 bg-slate-900/40 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400">
            <MessageSquareDot size={18} />
          </div>
          <div>
            <h3 className="font-bold font-display text-sm text-slate-100">Grup Toplantı Sohbeti</h3>
            <p className="text-[10px] text-slate-400 font-sans"># genel-toplantı • Aktif Kanal</p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-800 px-2.5 py-1 rounded-md text-[10px] text-slate-400">
          <Users size={11} />
          <span>8 Kişi Aktif</span>
        </div>
      </div>

      {/* Sesli okuma ayarları */}
      <div className="px-5 py-3 border-b border-indigo-500/40 bg-indigo-900/20 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={speakEnabled}
              onChange={(e) => setSpeakEnabled(e.target.checked)}
              className="w-5 h-5 rounded accent-indigo-500"
            />
            <span className={`text-sm font-semibold ${speakEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
              Sesli Okuma: {speakEnabled ? 'Açık' : 'Kapalı'}
            </span>
          </label>
        </div>
        {speakEnabled && (
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <label className="text-indigo-200">Ses:</label>
            <select
              value={speakVoice?.name ?? ''}
              onChange={(e) => {
                const v = voices.find(x => x.name === e.target.value);
                setSpeakVoice(v ?? null);
              }}
              className="bg-slate-950 border border-indigo-500 text-white rounded px-2 py-1 text-sm"
            >
              {voices.map(v => (
                <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <label className="text-indigo-200">Hız</label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={speakRate}
                onChange={(e) => setSpeakRate(parseFloat(e.target.value))}
                className="w-24 accent-indigo-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Message History area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.senderId === 'user';
          const participant = participants.find(p => p.id === msg.senderId);
          const customColor = participant?.color || '#6366f1';

          return (
            <div 
              id={`message-${msg.id}`}
              key={msg.id}
              className={`flex items-start gap-3 max-w-[85%] ${isMe ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
            >
              {/* Profile Avatar identifier */}
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-md flex-shrink-0"
                style={{ backgroundColor: customColor }}
              >
                {msg.senderAvatar}
              </div>

              {/* Message Bubble box */}
              <div className="space-y-1">
                <div className={`flex items-center gap-2 ${isMe ? 'justify-end' : ''}`}>
                  <span className="text-[11px] font-bold text-slate-300 font-display">{msg.senderName}</span>
                  <span className="text-[9px] text-slate-500 font-sans">{msg.timestamp}</span>
                </div>

                <div 
                  className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed max-w-full font-sans ${
                    isMe 
                      ? 'bg-indigo-600 text-white rounded-tr-none' 
                      : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-750'
                  }`}
                >
                  <div className="break-words">{msg.content}</div>

                  {/* Render attached File sharing info inside bubble block */}
                  {msg.file && (
                    <div className="mt-3.5 bg-slate-950/80 border border-slate-850 rounded-xl p-3 flex items-center justify-between gap-3 shadow-inner">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 bg-slate-900/60 rounded-lg">
                          {fileIcon(msg.file.type, msg.file.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-200 truncate" title={msg.file.name}>
                            {msg.file.name}
                          </p>
                          <span className="text-[9px] text-slate-400 font-mono">{msg.file.size}</span>
                        </div>
                      </div>

                      <a 
                        id={`dl-link-${msg.file.id}`}
                        href={msg.file.url} 
                        download={msg.file.name}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
                        title="İndir"
                      >
                        <Download size={13} />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messageEndRef} />
      </div>

      {/* Recommended Context Quick Actions */}
      <div className="px-5 py-2 border-t border-slate-850/60 bg-slate-900/10 flex flex-wrap gap-1.5 overflow-x-auto select-none">
        <span className="text-[9px] text-slate-500 flex items-center font-semibold uppercase pr-1">Hızlı Yanıtlar:</span>
        {[
          "Sesim geliyor mu?",
          "Dosyayı gönderdim",
          "Kameramı açıyorum",
          "Ekran paylaşıyorum"
        ].map((phrase, i) => (
          <button
            key={i}
            onClick={() => setInputText(phrase)}
            className="text-[10px] text-slate-400 hover:text-slate-100 bg-slate-800/40 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 px-2.5 py-1 rounded-full transition-colors cursor-pointer"
          >
            {phrase}
          </button>
        ))}
      </div>

      {/* Compose bottom section */}
      <form 
        onSubmit={handleSendMessage}
        className="p-4 border-t border-slate-850 bg-slate-950/10 flex items-center gap-2"
      >
        <button
          type="button"
          id="btn-file-attach"
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 bg-slate-800 hover:bg-slate-755 border border-slate-750 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer flex-shrink-0"
          title="Dosya Ekle (veya sürükleyip bırakın)"
        >
          <Paperclip size={16} />
        </button>

        <input
          id="chat-text-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Mesaj yazın veya buraya dosya sürükleyin..."
          className="flex-1 bg-slate-950/80 border border-slate-800 text-white rounded-xl py-2.5 px-4 text-xs font-sans placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />

        <button
          type="submit"
          id="btn-send-msg"
          disabled={!inputText.trim()}
          className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:pointer-events-none rounded-xl text-white transition-all cursor-pointer flex-shrink-0 shadow-md shadow-indigo-950/20"
        >
          <Send size={15} />
        </button>
      </form>

    </div>
  );
}
