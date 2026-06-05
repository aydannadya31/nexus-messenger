const EXTERNAL_API_KEY = (import.meta as any).env?.VITE_EXTERNAL_API_KEY || 'nexus-messenger-key-2024';
const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000';

let currentConversationId: number | null = null;

export const askAI = async (message: string): Promise<string> => {
  try {
    const res = await fetch(`${API_BASE}/api/external/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXTERNAL_API_KEY,
      },
      body: JSON.stringify({
        conversation_id: currentConversationId,
        message,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    currentConversationId = data.conversation_id;

    if (data.blocked) {
      return `[Engellendi] ${data.block_reason || 'İçerik etik kurallar tarafından engellendi.'}`;
    }

    return data.reply;
  } catch (e: any) {
    if (e.message?.includes('Failed to fetch') || e.message?.includes('NetworkError')) {
      return 'AI sunucusuna bağlanılamadı. Sunucunun çalıştığından emin olun. (http://localhost:8000)';
    }
    return `AI bağlantı hatası: ${e.message || 'Bilinmeyen hata'}`;
  }
};

export const clearAIHistory = () => {
  currentConversationId = null;
};
