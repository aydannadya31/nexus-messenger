import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (cancelled) return;

      try {
        if (firebaseUser) {
          setUser(firebaseUser);

          try {
            const userRef = doc(db, 'users', firebaseUser.uid);
            const userDoc = await getDoc(userRef);
            const exists = userDoc.exists();
            const existingData = exists ? (userDoc.data() as any) : null;

            let uin = existingData?.uin || null;

            if (!uin) {
              const locale = navigator.language || 'en-US';
              const countryCode = locale.split('-')[1] || locale.split('-')[0].toUpperCase();
              const prefix = countryCode.padEnd(3, 'X').slice(0, 3).toUpperCase();
              uin = `${prefix}-${Math.floor(10000000 + Math.random() * 90000000)}`;
            }

            await setDoc(userRef, {
              uid: firebaseUser.uid,
              displayName: existingData?.displayName || firebaseUser.displayName || 'Anonymous',
              email: firebaseUser.email || '',
              photoURL: existingData?.photoURL || firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
              lastSeen: serverTimestamp(),
              uin
            }, { merge: true });

            // Listen to profile changes in real-time
            unsubProfile = onSnapshot(userRef, (snap) => {
              if (snap.exists() && !cancelled) {
                setProfile({ ...snap.data() as UserProfile, uid: snap.id });
              }
            });
          } catch (firestoreErr) {
            console.warn('Firestore sync failed (non-critical):', firestoreErr);
          }
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setUser(null);
        setProfile(null);
      }

      if (!cancelled) setLoading(false);
    });

    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8000);

    return () => {
      cancelled = true;
      unsubscribe();
      if (unsubProfile) unsubProfile();
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);