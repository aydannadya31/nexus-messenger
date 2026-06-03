import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithRedirect, signOut, getRedirectResult } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (err: any) {
    throw err;
  }
};

export const logout = () => signOut(auth);
