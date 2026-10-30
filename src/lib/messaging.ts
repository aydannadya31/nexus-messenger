import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app, db } from './firebase';
import { doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';

type NotifCfg = { vapidKey?: string; workerUrl?: string };
let cfgPromise: Promise<NotifCfg> | null = null;

const getNotifConfig = (): Promise<NotifCfg> => {
  if (!cfgPromise) {
    cfgPromise = getDoc(doc(db, 'config', 'notifications')).then((snap) => {
      const d = snap.exists() ? snap.data() : {};
      return {
        vapidKey: typeof d.vapidKey === 'string' ? d.vapidKey : undefined,
        workerUrl: typeof d.workerUrl === 'string' ? d.workerUrl : undefined,
      };
    }).catch(() => ({}) as NotifCfg);
  }
  return cfgPromise;
};

export async function initPush(uid: string) {
  try {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    const cfg = await getNotifConfig();
    if (!cfg.workerUrl || !cfg.vapidKey) return;
    if (!(await isSupported())) return;
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return;
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}firebase-messaging-sw.js`);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
    if (token) {
      await setDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) }, { merge: true });
    }
  } catch (e) { console.warn('initPush:', e); }
}

export async function enablePush(uid: string): Promise<string> {
  if (typeof window === 'undefined') return 'no-window';
  if (!('Notification' in window)) return 'no-api';
  if (!('serviceWorker' in navigator)) return 'no-sw';
  try {
    let perm: NotificationPermission;
    if (Notification.permission === 'granted') perm = 'granted';
    else perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'perm-' + perm;
    const cfg = await getNotifConfig();
    if (!cfg.workerUrl || !cfg.vapidKey) return 'no-config';
    if (!(await isSupported())) return 'no-fcm';
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}firebase-messaging-sw.js`);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
    if (!token) return 'no-token';
    await setDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) }, { merge: true });
    return 'ok';
  } catch (e) {
    return 'error:' + (e instanceof Error ? e.message : String(e));
  }
}

export async function sendPushToUsers(userIds: string[], title: string, body: string, data?: Record<string, string>) {
  try {
    if (!userIds.length) return;
    const cfg = await getNotifConfig();
    if (!cfg.workerUrl) return;
    const tokens: string[] = [];
    await Promise.all(userIds.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const t = snap.data()?.fcmTokens;
        if (Array.isArray(t)) tokens.push(...t.filter((x): x is string => typeof x === 'string'));
      } catch { }
    }));
    if (!tokens.length) return;
    await fetch(cfg.workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens, title, body, data }),
    });
  } catch (e) { console.warn('sendPush:', e); }
}
