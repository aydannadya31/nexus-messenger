import React, { useState, useRef } from 'react';
import { Play, Pause, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';

export const AudioPlayer: React.FC<{ url: string; isMe: boolean }> = ({ url, isMe }) => {
  const { t } = useI18n();
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
        <span className="text-[10px] font-bold opacity-60">{t('chat.audioMsg')}</span>
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

export const MessageStatus: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return <Clock size={12} className="opacity-50" />;

  const baseClasses = "w-2.5 h-2.5 rounded-full transition-all duration-300";

  switch (status) {
    case 'sent':
      return <div className={cn(baseClasses, "border border-white/60")} />;
    case 'delivered':
      return <div className={cn(baseClasses, "bg-white/80")} />;
    case 'read':
      return <div className={cn(baseClasses, "bg-emerald-400 border border-white ring-1 ring-emerald-500/20")} />;
    default:
      return <Clock size={12} className="opacity-50" />;
  }
};
