import React, { useState } from 'react';
import { Message } from '../types';
import { useI18n } from '../lib/i18n';
import { toBase64 } from '../lib/chatMedia';

const DecryptContent: React.FC<{ msg: Message; onClose: () => void; canBypass?: boolean }> = ({ msg, onClose, canBypass }) => {
  const { t } = useI18n();
  const [pwd, setPwd] = useState('');
  const [decrypted, setDecrypted] = useState<{ text?: string; imageUrl?: string; videoUrl?: string; audioUrl?: string } | null>(
    canBypass ? { text: msg.text, imageUrl: msg.imageUrl, videoUrl: msg.videoUrl, audioUrl: msg.audioUrl } : null
  );
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!msg.imagePassword) return;
    if (toBase64(pwd) === msg.imagePassword) {
      setDecrypted({ text: msg.text, imageUrl: msg.imageUrl, videoUrl: msg.videoUrl, audioUrl: msg.audioUrl });
      setError('');
    } else {
      setError(t('login.wrongPw'));
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
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all">{t('chat.close')}</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 font-bold text-center">{t('chat.decryptPrompt')}</p>
      <input type="text" value={pwd} onChange={e => setPwd(e.target.value)} autoFocus
        placeholder={t('chat.password')}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        className="w-full bg-slate-100 border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-center outline-none focus:border-blue-500 transition-all" />
      {error && <p className="text-xs font-bold text-red-500 text-center">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onClose}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 border border-slate-200 transition-all">{t('login.cancel')}</button>
        <button onClick={handleSubmit}
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/10">{t('chat.decrypt')}</button>
      </div>
    </div>
  );
};

export default DecryptContent;
