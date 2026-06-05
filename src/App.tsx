/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Login } from './components/Login';
import { NewChatModal } from './components/NewChatModal';
import { BroadcastModal } from './components/BroadcastModal';
import { CallProvider } from './components/CallProvider';
import { CallOverlay } from './components/CallOverlay';
import { cn } from './lib/utils';
import { MessageSquare, Ban } from 'lucide-react';

function NexusApp() {
  const { user, loading } = useAuth();
  const [selectedChatId, setSelectedChatId] = useState<string | undefined>();
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  const [banned, setBanned] = useState<{ until: Date; reason?: string } | null>(null);

  useEffect(() => {
    if (!user) { setBanned(null); return; }
    const checkBan = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.data();
        if (data?.bannedUntil?.toDate?.() > new Date()) {
          setBanned({ until: data.bannedUntil.toDate(), reason: data.banReason });
        } else {
          setBanned(null);
        }
      } catch { setBanned(null); }
    };
    checkBan();
    const interval = setInterval(checkBan, 30000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="relative flex flex-col items-center">
          <div className="w-20 h-20 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin shadow-xl shadow-blue-100" />
          <MessageSquare className="absolute top-7 left-1/2 -translate-x-1/2 text-blue-600" size={28} />
          <span className="mt-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Syncing Core...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (banned) {
    const remaining = Math.max(0, Math.floor((banned.until.getTime() - Date.now()) / 1000));
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-10 shadow-2xl max-w-md w-full text-center border border-slate-200">
          <div className="w-20 h-20 bg-red-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Ban size={40} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-3">Hesabınız Banlanmış</h1>
          <p className="text-sm text-slate-500 font-bold mb-6 leading-relaxed">
            Hesabınız geçici olarak askıya alınmıştır.
          </p>
          <div className="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-100">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">KALAN SÜRE</p>
            <p className="text-3xl font-black text-red-600 tabular-nums tracking-tight">
              {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </p>
          </div>
          {banned.reason && (
            <p className="text-xs text-slate-500 font-medium mb-4">
              Sebep: {banned.reason}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-neutral-950">
      {/* Sidebar - hidden on mobile when chat is open */}
      <div className={cn(
        "w-full sm:w-[350px] sm:block",
        showMobileSidebar || !selectedChatId ? "block" : "hidden sm:block"
      )}>
        <Sidebar
          selectedChatId={selectedChatId}
          onSelectChat={(id) => {
            setSelectedChatId(id);
            setShowMobileSidebar(false);
          }}
          onStartNewChat={() => setIsNewChatModalOpen(true)}
          onOpenBroadcast={() => setIsBroadcastModalOpen(true)}
        />
      </div>

      {/* Chat Area - hidden on mobile when showing sidebar */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0",
        !showMobileSidebar || !selectedChatId ? "flex" : "hidden sm:flex"
      )}>
        <ChatArea
          chatId={selectedChatId || ''}
          onBack={() => setShowMobileSidebar(true)}
        />
      </div>

      {isNewChatModalOpen && (
        <NewChatModal 
          onClose={() => setIsNewChatModalOpen(false)}
          onChatCreated={(id) => {
            setSelectedChatId(id);
            setIsNewChatModalOpen(false);
            setShowMobileSidebar(false);
          }}
        />
      )}

      {isBroadcastModalOpen && (
        <BroadcastModal 
          onClose={() => setIsBroadcastModalOpen(false)}
        />
      )}

      <CallOverlay />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CallProvider>
        <NexusApp />
      </CallProvider>
    </AuthProvider>
  );
}
