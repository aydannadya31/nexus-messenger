import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

export interface EthicsRule {
  id: string;
  label: string;
  enabled: boolean;
}

export interface AISettings {
  enabled: boolean;
  ethicsRules: EthicsRule[];
}

const AI_SETTINGS_REF = doc(db, 'adminSettings', 'ai');

const DEFAULT_RULES: EthicsRule[] = [
  { id: 'harmful', label: 'Zararlı içerik üretme', enabled: true },
  { id: 'illegal', label: 'Yasa dışı konularda yardım etme', enabled: true },
  { id: 'hate-speech', label: 'Nefret söylemi kullanma', enabled: true },
  { id: 'safety', label: 'Kullanıcı güvenliğini önceliklendir', enabled: true },
];

export const getAISettings = async (): Promise<AISettings> => {
  try {
    const snap = await getDoc(AI_SETTINGS_REF);
    if (snap.exists()) {
      const data = snap.data() as AISettings;
      return { ...data, ethicsRules: data.ethicsRules || DEFAULT_RULES };
    }
  } catch {}
  return { enabled: true, ethicsRules: DEFAULT_RULES };
};

export const updateAISettings = async (settings: Partial<AISettings>) => {
  await setDoc(AI_SETTINGS_REF, settings, { merge: true });
};

export const subscribeAISettings = (callback: (settings: AISettings) => void, onError?: () => void) => {
  return onSnapshot(
    AI_SETTINGS_REF,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as AISettings;
        callback({ ...data, ethicsRules: data.ethicsRules || DEFAULT_RULES });
      } else callback({ enabled: true, ethicsRules: DEFAULT_RULES });
    },
    () => {
      if (onError) onError();
      else callback({ enabled: true, ethicsRules: DEFAULT_RULES });
    }
  );
};
