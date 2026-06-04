import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

export interface AISettings {
  enabled: boolean;
  ethicsFilter: boolean;
}

const AI_SETTINGS_REF = doc(db, 'adminSettings', 'ai');

export const getAISettings = async (): Promise<AISettings> => {
  try {
    const snap = await getDoc(AI_SETTINGS_REF);
    if (snap.exists()) return snap.data() as AISettings;
  } catch {}
  return { enabled: true, ethicsFilter: true };
};

export const updateAISettings = async (settings: Partial<AISettings>) => {
  await setDoc(AI_SETTINGS_REF, settings, { merge: true });
};

export const subscribeAISettings = (callback: (settings: AISettings) => void, onError?: () => void) => {
  return onSnapshot(
    AI_SETTINGS_REF,
    (snap) => {
      if (snap.exists()) callback(snap.data() as AISettings);
      else callback({ enabled: true, ethicsFilter: true });
    },
    () => {
      if (onError) onError();
      else callback({ enabled: true, ethicsFilter: true });
    }
  );
};
