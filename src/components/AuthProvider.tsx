import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (cancelled) return;

      try {
        if (firebaseUser) {
          setUser(firebaseUser);

          try {
            const userRef = doc(db, 'users', firebaseUser.uid);
            const userDoc = await getDoc(userRef);

            let uin = userDoc.exists() ? (userDoc.data() as any).uin : null;

            if (!uin) {
              const locale = navigator.language || 'en-US';
              const countryCode = locale.split('-')[1] || locale.split('-')[0].toUpperCase();
              const prefix = countryCode.padEnd(3, 'X').slice(0, 3).toUpperCase();
              uin = `${prefix}-${Math.floor(10000000 + Math.random() * 90000000)}`;
            }

            await setDoc(userRef, {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || 'Anonymous',
              email: firebaseUser.email || '',
              photoURL: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
              lastSeen: serverTimestamp(),
              uin: uin
            }, { merge: true });
          } catch (firestoreErr) {
            console.warn('Firestore sync failed (non-critical):', firestoreErr);
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setUser(null);
      }

      if (!cancelled) setLoading(false);
    });

    const timeoutId = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8000);

    return () => {
      cancelled = true;
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);