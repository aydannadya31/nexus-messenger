import { getAISettings } from './adminSettings';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

let conversationHistory: { role: string; parts: { text: string }[] }[] = [];
const MAX_HISTORY = 50;

const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];

const callGemini = async (model: string, contents: any[], systemInstruction: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { role: 'user', parts: [{ text: systemInstruction }] },
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      if (err?.error?.code === 429) return null;
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
};

export const askAI = async (message: string): Promise<string> => {
  const settings = await getAISettings();

  if (!settings.enabled) {
    return 'AI asistan şu anda devre dışı. Yöneticinize başvurun.';
  }

  if (!API_KEY) {
    return 'AI asistan yapılandırılmamış (API anahtarı eksik). Yöneticinize başvurun.';
  }

  let systemInstruction = 'Sen "Nexus" adında bir AI asistanısın. Kullanıcılarla Türkçe konuş. Kısa, öz ve net yanıtlar ver. Samimi ve yardımsever ol.';

  const enabledRules = (settings.ethicsRules || []).filter(r => r.enabled);
  if (enabledRules.length > 0) {
    systemInstruction += ' Etik kurallar: ' + enabledRules.map(r => r.label).join(', ');
  } else {
    systemInstruction += ' Etik filtreleme devre dışı. Admin tüm etik kuralları kaldırdığı için her konuda yardımcı olabilirsin.';
  }

  conversationHistory.push({ role: 'user', parts: [{ text: message }] });
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY);
  }

  for (const model of MODELS) {
    const result = await callGemini(model, conversationHistory, systemInstruction);
    if (result !== null) {
      conversationHistory.push({ role: 'model', parts: [{ text: result }] });
      return result;
    }
  }

  conversationHistory.pop();
  return 'AI asistan şu anda yoğun. Lütfen biraz sonra tekrar dene. (API kotası doldu, yöneticinizin Google AI Studio\'da fatura bilgisi eklemesi gerekiyor.)';
};

export const clearAIHistory = () => {
  conversationHistory = [];
};
