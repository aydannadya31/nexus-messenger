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

      if (firebaseUser) {
        await syncUser(firebaseUser);
      } else {
        setUser(null);
      }
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const syncUser = async (user: User) => {
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    
    let uin = userDoc.exists() ? (userDoc.data() as any).uin : null;
    
    // Generate UIN if not exists (ICQ style with Country Prefix)
    if (!uin) {
      const locale = navigator.language || 'en-US';
      const countryCode = locale.split('-')[1] || locale.split('-')[0].toUpperCase();
      const prefix = countryCode.padEnd(3, 'X').slice(0, 3).toUpperCase();
      uin = `${prefix}-${Math.floor(10000000 + Math.random() * 90000000)}`;
    }

    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName || 'Anonymous',
      email: user.email || '',
      photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
      lastSeen: serverTimestamp(),
      uin: uin
    }, { merge: true });
    
    const d = await getDoc(userRef);
    setUser({ ...user, ...(d.data() as any) });
  };

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
