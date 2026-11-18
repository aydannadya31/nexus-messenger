import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, browserLocalPersistence, setPersistence, getRedirectResult } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

// Oturumu localStorage'da kalıcı yap (sayfa yenilemede oturum açık kalır)
const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(err => console.warn('Persistence error:', err));

// Native tespiti: Capacitor koprusu her zaman enjekte edilmeyebilir, UA isareti belli edici.
export const isNativeApp = () => Capacitor.isNativePlatform() || navigator.userAgent.includes('NexusApp');

export const signInWithGoogle = () =>
  isNativeApp()
    ? signInWithRedirect(auth, googleProvider)
    : signInWithPopup(auth, googleProvider);

// Google'dan donuste redirect sonucunu oku (olmazsa giris tamamlanmaz).
export const completeRedirectSignIn = async () => {
  await persistenceReady;
  return getRedirectResult(auth);
};

export const logout = () => signOut(auth);
