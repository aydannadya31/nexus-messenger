/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { Login } from './components/Login';
import { NewChatModal } from './components/NewChatModal';
import { BroadcastModal } from './components/BroadcastModal';
import { CallProvider } from './components/CallProvider';
import { CallOverlay } from './components/CallOverlay';
import { MessageSquare } from 'lucide-react';

function NexusApp() {
  const { user, loading } = useAuth();
  const [selectedChatId, setSelectedChatId] = useState<string | undefined>();
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);

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

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950">
      <Sidebar 
        selectedChatId={selectedChatId} 
        onSelectChat={setSelectedChatId} 
        onStartNewChat={() => setIsNewChatModalOpen(true)}
        onOpenBroadcast={() => setIsBroadcastModalOpen(true)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <ChatArea chatId={selectedChatId || ''} />
      </div>

      {isNewChatModalOpen && (
        <NewChatModal 
          onClose={() => setIsNewChatModalOpen(false)}
          onChatCreated={(id) => {
            setSelectedChatId(id);
            setIsNewChatModalOpen(false);
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
