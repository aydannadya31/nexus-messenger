import React, { useState, useRef, useEffect } from 'react';
import { askAI, clearAIHistory } from '../lib/ai';
import { useAuth } from './AuthProvider';
import { subscribeAISettings, AISettings } from '../lib/adminSettings';
import { Send, Trash2, Bot, Shield, ShieldOff, Brain, ArrowLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

interface AIChatProps {
  onBack?: () => void;
}

export const AIChat: React.FC<AIChatProps> = ({ onBack }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'ai',
      text: 'Merhaba! Ben Nexus, yapay zeka asistanınız. Size nasıl yardımcı olabilirim?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiSettings, setAiSettings] = useState<AISettings>({ enabled: true, ethicsRules: [] });
  const [aiSettingsLoading, setAiSettingsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = subscribeAISettings(
      (settings) => {
        setAiSettings(settings);
        setAiSettingsLoading(false);
      },
      () => setAiSettingsLoading(false)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !aiSettings.enabled) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await askAI(userMsg.text);
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: 'Bir hata oluştu. Lütfen tekrar dene.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    clearAIHistory();
    setMessages([
      {
        id: 'welcome',
        role: 'ai',
        text: 'Sohbet geçmişi temizlendi. Yeni bir konuşmaya başlayabiliriz!',
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-100/30 blur-[100px] rounded-full" />
      </div>

      {/* Header */}
      <header className="min-h-14 sm:h-20 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-8 shrink-0 relative z-10">
        <div className="flex items-center gap-2 sm:gap-4">
          <button onClick={onBack} className="p-1.5 sm:hidden text-slate-500 hover:bg-slate-100 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-200">
            <Bot size={22} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 leading-none">Nexus AI</h3>
              {aiSettings.ethicsRules.some(r => r.enabled) ? (
                <span className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-700 shadow-sm">
                  <Shield size={10} /> Etik Filtre Açık
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shadow-sm">
                  <ShieldOff size={10} /> Filtre Kapalı
                </span>
              )}
            </div>
            <span className="text-[11px] font-bold text-purple-500 flex items-center gap-1 mt-0.5">
              <Brain size={12} />
              Token sınırı olmayan AI · {aiSettings.enabled ? 'Aktif' : 'Devre Dışı'}
            </span>
          </div>
        </div>
        <button
          onClick={handleClear}
          className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
          title="Sohbeti Temizle"
        >
          <Trash2 size={18} />
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar z-10">
        {aiSettingsLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
          </div>
        ) : !aiSettings.enabled && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
            <p className="text-xs font-bold text-amber-700">AI asistan şu anda yönetici tarafından devre dışı bırakıldı.</p>
          </div>
        )}
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex items-end gap-3 max-w-[85%] sm:max-w-[75%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm border",
                msg.role === 'ai'
                  ? "bg-gradient-to-br from-purple-500 to-indigo-600 border-purple-300 text-white"
                  : "bg-blue-600 border-blue-500 text-white"
              )}>
                {msg.role === 'ai' ? <Bot size={16} /> : <Brain size={16} />}
              </div>
              <div className={cn(
                "px-5 py-3 rounded-2xl shadow-sm border",
                msg.role === 'user'
                  ? "bg-blue-600 text-white border-blue-500 rounded-br-none"
                  : "bg-white text-slate-800 border-slate-100 rounded-bl-none"
              )}>
                <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                <div className={cn(
                  "flex items-center justify-end mt-1.5",
                  msg.role === 'user' ? "text-blue-100" : "text-slate-400"
                )}>
                  <span className="text-[10px] font-medium">{format(msg.timestamp, 'HH:mm')}</span>
                </div>
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-end gap-3 max-w-[85%] sm:max-w-[75%] mr-auto"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 border-purple-300 text-white flex items-center justify-center shrink-0 shadow-sm border">
                <Bot size={16} />
              </div>
              <div className="px-5 py-4 rounded-2xl bg-white border border-slate-100 rounded-bl-none shadow-sm">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input */}
      <footer id="chat-input-footer" className="p-2 sm:p-6 bg-white border-t border-slate-200 shrink-0 z-10 safe-area-bottom transition-all duration-200">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex items-center bg-slate-100 rounded-xl sm:rounded-2xl p-1 sm:p-2 focus-within:ring-2 focus-within:ring-purple-500 transition-all">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={aiSettings.enabled ? "Nexus AI'ya bir şey sor..." : "AI asistan devre dışı..."}
            disabled={!aiSettings.enabled}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-1.5 sm:py-2 px-2 sm:px-4 text-slate-900 placeholder:text-slate-400 outline-none min-w-0"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !aiSettings.enabled}
            className={cn(
              "p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl transition-all flex items-center justify-center shadow-lg shrink-0",
              input.trim() && !isLoading && aiSettings.enabled
                ? "bg-purple-600 text-white shadow-purple-200 hover:bg-purple-700"
                : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
            )}
          >
            <Send size={16} className="sm:size-[18px]" />
          </button>
        </form>
      </footer>
    </div>
  );
};
