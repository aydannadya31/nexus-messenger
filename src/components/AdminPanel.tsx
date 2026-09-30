import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, getDoc, where, orderBy, deleteDoc, updateDoc, Timestamp, serverTimestamp, onSnapshot, collectionGroup, limit, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useToast } from '../lib/toast';
import { UserProfile, Message, Chat } from '../types';
import { X, Search, Shield, UserX, UserCheck, Trash2, Clock, MessageSquare, Ban, Mail, Plus, Trash, Eye, EyeOff, Play, Pause, Download, Pencil } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { cn } from '../lib/utils';
import { useAuth } from './AuthProvider';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { useI18n } from '../lib/i18n';

interface AdminPanelProps {
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [step, setStep] = useState<'email-check' | 'password' | 'panel'>('email-check');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [emailAuthorized, setEmailAuthorized] = useState(false);
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userMessages, setUserMessages] = useState<{ chatId: string; msg: Message; chatName: string }[]>([]);
  const [userChats, setUserChats] = useState<Record<string, string>>({});
  const [banDuration, setBanDuration] = useState({ value: 30, unit: 'minutes' as 'minutes' | 'hours' | 'days' });
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [groups, setGroups] = useState<Chat[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Chat | null>(null);
  const [groupMessages, setGroupMessages] = useState<Message[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Tab: users, admin-msgs, deleted, encrypted, emails
  const [tab, setTab] = useState<'users' | 'groups' | 'admin-msgs' | 'deleted' | 'encrypted' | 'delete-requests' | 'emails'>('users');

  const [adminMessages, setAdminMessages] = useState<{ id: string; message: string; userId: string; userDisplayName: string; userNickname?: string; userUIN?: string; timestamp: any }[]>([]);
  const [deletedMessages, setDeletedMessages] = useState<any[]>([]);
  const [deleteRequests, setDeleteRequests] = useState<any[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);
  const [encryptedMessages, setEncryptedMessages] = useState<any[]>([]);
  const [msgFilter, setMsgFilter] = useState<'all' | 'text' | 'image' | 'video' | 'audio'>('all');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [groupSelectedKeys, setGroupSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    setSelectedKeys(new Set());
    setGroupSelectedKeys(new Set());
  }, [tab, selectedGroup]);

  const sha256 = async (text: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Email whitelist check on mount
  useEffect(() => {
    if (step !== 'email-check' || !user) return;
    const checkEmail = async () => {
      try {
        const configDoc = await getDoc(doc(db, 'config', 'admin'));
        if (!configDoc.exists()) {
          setEmailAuthorized(false);
          return;
        }
        const emails: string[] = configDoc.data().adminEmails || [];
        setAdminEmails(emails);
        if (user.email && emails.includes(user.email)) {
          setEmailAuthorized(true);
          setStep('password');
        } else {
          setEmailAuthorized(false);
        }
      } catch (err) {
        console.error('Email check error:', err);
        setEmailAuthorized(false);
      }
    };
    checkEmail();
  }, [step, user]);

  const verifyAdmin = async (password: string): Promise<boolean> => {
    try {
      if (!user) { addToast(t('adm.loginFirst'), 'error'); return false; }
      const configDoc = await getDoc(doc(db, 'config', 'admin'));
      if (!configDoc.exists()) {
        addToast(t('adm.noConfig'), 'error');
        return false;
      }
      const storedHash = configDoc.data().passwordHash;
      if (!storedHash) {
        addToast(t('adm.noHash'), 'error');
        return false;
      }
      const enteredHash = await sha256(password);
      if (enteredHash !== storedHash) return false;

      await setDoc(doc(db, 'adminUsers', user.uid), { admin: true, verifiedAt: new Date().toISOString() }, { merge: true });
      return true;
    } catch (err) {
      console.error('verifyAdmin error:', err);
      addToast(t('adm.verifyError'), 'error');
      return false;
    }
  };

  const handlePasswordSubmit = async () => {
    setVerifying(true);
    setPasswordError('');
    const ok = await verifyAdmin(password);
    if (ok) {
      setStep('panel');
    } else {
      setPasswordError(t('login.wrongPw'));
    }
    setVerifying(false);
  };

  // Email management
  const addAdminEmail = async () => {
    if (!newAdminEmail.trim() || !/\S+@\S+\.\S+/.test(newAdminEmail)) {
      addToast(t('adm.invalidEmail'), 'error');
      return;
    }
    if (adminEmails.includes(newAdminEmail.trim())) {
      addToast(t('adm.emailInList'), 'warning');
      return;
    }
    const updated = [...adminEmails, newAdminEmail.trim()];
    try {
      await setDoc(doc(db, 'config', 'admin'), { adminEmails: updated }, { merge: true });
      setAdminEmails(updated);
      setNewAdminEmail('');
      addToast(t('adm.emailAdded'), 'success');
    } catch (err) {
      console.error('Add email error:', err);
      addToast(t('adm.emailAddFail'), 'error');
    }
  };

  const removeAdminEmail = async (email: string) => {
    const updated = adminEmails.filter(e => e !== email);
    try {
      await setDoc(doc(db, 'config', 'admin'), { adminEmails: updated }, { merge: true });
      setAdminEmails(updated);
      addToast(t('adm.emailRemoved'), 'success');
    } catch (err) {
      console.error('Remove email error:', err);
      addToast(t('adm.emailRemoveFail'), 'error');
    }
  };

  // Fetch all users
  useEffect(() => {
    if (step !== 'panel') return;
    setLoadingUsers(true);
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const all = snap.docs.map(d => d.data() as UserProfile);
      setUsers(all);
      setLoadingUsers(false);
    }, () => setLoadingUsers(false));
    return () => unsub();
  }, [step]);

  // Fetch admin messages
  useEffect(() => {
    if (step !== 'panel' || tab !== 'admin-msgs') return;
    const q = query(
      collection(db, 'adminMessages'),
      orderBy('timestamp', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setAdminMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });
    return () => unsub();
  }, [step, tab]);

  // Fetch deleted messages (messages with deletedBy field)
  useEffect(() => {
    if (step !== 'panel' || tab !== 'deleted') return;
    let cancelled = false;
    const loadDeleted = async () => {
      try {
        const q = query(
          collectionGroup(db, 'messages'),
          orderBy('timestamp', 'desc'),
          limit(200)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const deleted = snap.docs
          .map(d => ({
            id: d.id,
            chatId: d.ref.parent.parent?.id || '',
            ...d.data(),
          } as any))
          .filter((m: any) => m.deletedBy && m.deletedBy.length > 0);
        setDeletedMessages(deleted);
      } catch (err) {
        console.error("Deleted messages query error:", err);
        if (!cancelled) setDeletedMessages([]);
      }
    };
    loadDeleted();
    return () => { cancelled = true; };
  }, [step, tab]);

  // Fetch admin delete requests
  useEffect(() => {
    if (step !== 'panel') return;
    const q = query(collection(db, 'adminDeleteRequests'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setDeleteRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });
    return () => unsub();
  }, [step]);

  // Fetch encrypted messages
  useEffect(() => {
    if (step !== 'panel' || tab !== 'encrypted') return;
    let cancelled = false;
    const loadEncrypted = async () => {
      try {
        const q = query(collectionGroup(db, 'messages'), orderBy('timestamp', 'desc'), limit(200));
        const snap = await getDocs(q);
        if (cancelled) return;
        const encrypted = snap.docs.map(d => ({
          id: d.id,
          chatId: d.ref.parent.parent?.id || '',
          ...d.data(),
        } as any)).filter((m: any) => m.encrypted === true);
        setEncryptedMessages(encrypted);
      } catch (err) {
        console.error("Encrypted messages query error:", err);
        if (!cancelled) setEncryptedMessages([]);
      }
    };
    loadEncrypted();
    return () => { cancelled = true; };
  }, [step, tab]);

  const loadUserMessages = async (u: UserProfile) => {
    setSelectedUser(u);
    setUserMessages([]);

    try {
      const chatsQuery = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', u.uid)
      );
      const chatSnap = await getDocs(chatsQuery);
      const chatNames: Record<string, string> = {};
      const allMessages: { chatId: string; msg: Message; chatName: string }[] = [];

      for (const chatDoc of chatSnap.docs) {
        const chatData = chatDoc.data() as Chat;
        const chatId = chatDoc.id;

        if (chatData.type === 'private') {
          const otherId = chatData.participants.find(p => p !== u.uid);
          const otherUser = users.find(us => us.uid === otherId);
          chatNames[chatId] = otherUser?.displayName || otherId || t('adm.unknown');
        } else {
          chatNames[chatId] = chatData.groupMetadata?.name || t('adm.group');
        }

        try {
          const msgSnap = await getDocs(query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('timestamp', 'desc')
          ));
          msgSnap.docs.forEach(d => {
            const data = d.data() as Message;
            allMessages.push({
              chatId,
              msg: { id: d.id, ...data } as Message,
              chatName: chatNames[chatId]
            });
          });
        } catch (msgErr) {
          console.warn('Could not load messages for chat', chatId, msgErr);
        }
      }

      allMessages.sort((a, b) => {
        const ta = a.msg.timestamp?.toMillis?.() || 0;
        const tb = b.msg.timestamp?.toMillis?.() || 0;
        return tb - ta;
      });

      setUserMessages(allMessages.slice(0, 200));
      setUserChats(chatNames);
    } catch (err) {
      console.error('loadUserMessages error:', err);
      addToast(t('adm.userMsgsFail'), 'error');
    }
  };

  const uidName = (uid: string) => users.find(u => u.uid === uid)?.displayName || uid.slice(0, 8);

  const msgKey = (chatId: string, msgId: string) => `${chatId}::${msgId}`;

  const toggleMsgSelect = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  type BulkItem = { chatId: string; msg: Message; chatName: string };

  const selectedUserItems: BulkItem[] = userMessages
    .filter(({ chatId, msg }) => msg.id && selectedKeys.has(msgKey(chatId, msg.id)))
    .map(({ chatId, msg, chatName }) => ({ chatId, msg, chatName }));

  const groupSelectedItems: BulkItem[] = selectedGroup && groupSelectedKeys.size > 0
    ? groupMessages
        .filter(m => m.id && groupSelectedKeys.has(m.id))
        .map(m => ({ chatId: selectedGroup.id, msg: m, chatName: selectedGroup.groupMetadata?.name || '' }))
    : [];

  const userCleanup = (keys: Set<string>) => {
    setUserMessages(prev => prev.filter(m => !m.msg.id || !keys.has(msgKey(m.chatId, m.msg.id))));
    setSelectedKeys(new Set());
  };

  const userPatchBlocked = (keys: Set<string>, blocked: boolean) => {
    setUserMessages(prev => prev.map(m => {
      if (!m.msg.id || !keys.has(msgKey(m.chatId, m.msg.id))) return m;
      return { ...m, msg: { ...m.msg, blockedByAdmin: blocked, blockedByAdminAt: blocked ? serverTimestamp() : null } as any };
    }));
  };

  const groupCleanup = (keys: Set<string>) => {
    setGroupMessages(prev => prev.filter(m => !m.id || !keys.has(msgKey(selectedGroup?.id || '', m.id))));
    setGroupSelectedKeys(new Set());
  };

  const groupPatchBlocked = (keys: Set<string>, blocked: boolean) => {
    setGroupMessages(prev => prev.map(m => {
      if (!m.id || !keys.has(msgKey(selectedGroup?.id || '', m.id))) return m;
      return { ...m, blockedByAdmin: blocked, blockedByAdminAt: blocked ? serverTimestamp() : null } as any;
    }));
  };

  const renameGroup = async (g: Chat) => {
    const current = g.groupMetadata?.name || '';
    const name = window.prompt(t('adm.groupRenamePrompt'), current);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === current) return;
    try {
      await updateDoc(doc(db, 'chats', g.id), { 'groupMetadata.name': trimmed });
      setGroups(prev => prev.map(x => x.id === g.id && x.groupMetadata ? { ...x, groupMetadata: { ...x.groupMetadata, name: trimmed } } : x));
      setSelectedGroup(prev => prev && prev.id === g.id && prev.groupMetadata ? { ...prev, groupMetadata: { ...prev.groupMetadata, name: trimmed } } : prev);
      addToast(t('adm.groupRenamed'), 'success');
    } catch (err) {
      console.error('Rename group error:', err);
      addToast(t('adm.bulkFail'), 'error');
    }
  };

  const toggleGroupPassive = async (g: Chat) => {
    const next = !g.groupMetadata?.passive;
    try {
      await updateDoc(doc(db, 'chats', g.id), { 'groupMetadata.passive': next });
      const patch = (x: Chat) => x.id === g.id && x.groupMetadata ? { ...x, groupMetadata: { ...x.groupMetadata, passive: next } } : x;
      setGroups(prev => prev.map(patch));
      setSelectedGroup(prev => prev ? patch(prev) : prev);
      addToast(next ? t('adm.groupPassiveOn') : t('adm.groupPassiveOff'), 'success');
    } catch (err) {
      console.error('Toggle group passive error:', err);
      addToast(t('adm.bulkFail'), 'error');
    }
  };

  const deleteGroup = async (g: Chat) => {
    if (!window.confirm(t('adm.deleteGroupConfirm', { name: g.groupMetadata?.name || t('adm.anonymousGroup') }))) return;
    try {
      const msgSnap = await getDocs(collection(db, 'chats', g.id, 'messages'));
      await Promise.all(msgSnap.docs.map(d => deleteDoc(doc(db, 'chats', g.id, 'messages', d.id))));
      await deleteDoc(doc(db, 'chats', g.id));
      setGroups(prev => prev.filter(x => x.id !== g.id));
      if (selectedGroup?.id === g.id) {
        setSelectedGroup(null);
        setGroupMessages([]);
        setGroupSelectedKeys(new Set());
      }
      addToast(t('adm.groupDeleted', { name: g.groupMetadata?.name || t('adm.anonymousGroup') }), 'success');
    } catch (err) {
      console.error('Delete group error:', err);
      addToast(t('adm.bulkFail'), 'error');
    }
  };


  const deletedItems: BulkItem[] = deletedMessages
    .filter(m => m.id && m.chatId && selectedKeys.has(msgKey(m.chatId, m.id)))
    .map(m => ({ chatId: m.chatId, msg: m as Message, chatName: m.chatId?.slice(0, 12) || '' }));

  const deletedCleanup = (keys: Set<string>) => {
    setDeletedMessages(prev => prev.filter(m => !m.id || !keys.has(msgKey(m.chatId || '', m.id))));
    setSelectedKeys(new Set());
  };

  const bulkDelete = async (items: BulkItem[], cleanup: (gone: Set<string>) => void) => {
    if (items.length === 0) return;
    if (!window.confirm(t('adm.bulkDeleteConfirm', { n: items.length }))) return;
    setBulkBusy(true);
    try {
      await Promise.all(items.map(i => deleteDoc(doc(db, 'chats', i.chatId, 'messages', i.msg.id!))));
      cleanup(new Set(items.map(i => msgKey(i.chatId, i.msg.id!))));
      addToast(t('adm.bulkDone', { n: items.length }), 'success');
    } catch (err) {
      console.error('Bulk delete error:', err);
      addToast(t('adm.bulkFail'), 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkSetBlocked = async (items: BulkItem[], blocked: boolean, patch: (keys: Set<string>, blocked: boolean) => void) => {
    if (items.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(items.map(i => updateDoc(
        doc(db, 'chats', i.chatId, 'messages', i.msg.id!),
        blocked
          ? { blockedByAdmin: true, blockedByAdminAt: serverTimestamp() }
          : { blockedByAdmin: false, blockedByAdminAt: null }
      )));
      patch(new Set(items.map(i => msgKey(i.chatId, i.msg.id!))), blocked);
      addToast(t('adm.bulkDone', { n: items.length }), 'success');
    } catch (err) {
      console.error('Bulk block error:', err);
      addToast(t('adm.bulkFail'), 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDownloadZip = async (items: BulkItem[], title: string, fileTag: string) => {
    if (items.length === 0) return;
    setBulkBusy(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.setFontSize(10);
      let y = 15;
      const writer = (line: string) => {
        const wrapped = pdf.splitTextToSize(line, 180) as string[];
        if (y + wrapped.length * 4.5 > 280) { pdf.addPage(); y = 15; }
        pdf.text(wrapped, 15, y);
        y += wrapped.length * 4.5 + 1.5;
      };
      writer(`NEXUS MESSENGER - ${title}`);
      writer(`Disari aktarma: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`);
      writer(`Mesaj sayisi: ${items.length}`);
      writer('');
      let mediaFailed = 0;
      for (const it of items) {
        const ts = it.msg.timestamp?.toDate ? format(it.msg.timestamp.toDate(), 'dd.MM.yyyy HH:mm:ss') : '';
        const from = uidName(it.msg.senderId);
        if (it.msg.type === 'text' && it.msg.text) {
          writer(`[${ts}] ${from} > ${it.chatName}: ${it.msg.text}`);
        } else {
          writer(`[${ts}] ${from} > ${it.chatName}: [${it.msg.type}]`);
        }
        const url = it.msg.type === 'image' ? it.msg.imageUrl
          : it.msg.type === 'video' ? it.msg.videoUrl
          : it.msg.type === 'audio' ? it.msg.audioUrl : null;
        if (url) {
          try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('fetch failed');
            const blob = await resp.blob();
            const ext = it.msg.type === 'image' ? 'jpg' : 'webm';
            zip.file(`${it.msg.type}-${it.msg.id}.${ext}`, blob);
          } catch {
            mediaFailed++;
          }
        }
      }
      zip.file('mesajlar.pdf', pdf.output('arraybuffer'));
      const out = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(out);
      a.download = `nexus-mesajlar-${fileTag}-${format(new Date(), 'yyyyMMdd-HHmm')}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      addToast(t('adm.bulkDone', { n: items.length }) + (mediaFailed ? ` (${mediaFailed} medya atlandi)` : ''), 'success');
    } catch (err) {
      console.error('ZIP export error:', err);
      addToast(t('adm.bulkFail'), 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const typeBadge = (m: Message) => (
    <span className={cn(
      "px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase",
      m.viewOnce ? "bg-purple-500/20 text-purple-300" : m.encrypted ? "bg-amber-500/20 text-amber-300" : "bg-slate-600/40 text-slate-300"
    )}>
      {m.viewOnce ? t('adm.viewOnce') : m.encrypted ? t('nc.encrypted') : t('adm.noEncrypt')}
    </span>
  );

  const kindBadge = (m: Message) => (
    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase bg-blue-500/20 text-blue-300">
      {m.type === 'image' ? t('adm.img') : m.type === 'video' ? t('adm.video') : m.type === 'audio' ? t('adm.audio') : m.type === 'call' ? t('adm.call') : t('adm.text')}
    </span>
  );

  const loadGroupMessages = async (g: Chat) => {
    setSelectedGroup(g);
    setGroupMessages([]);
    try {
      const msgSnap = await getDocs(query(
        collection(db, 'chats', g.id, 'messages'),
        orderBy('timestamp', 'desc'),
        limit(200)
      ));
      setGroupMessages(msgSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Message));
    } catch (err) {
      console.error('loadGroupMessages error:', err);
      addToast(t('adm.groupMsgsFail'), 'error');
    }
  };

  useEffect(() => {
    if (step !== 'panel' || tab !== 'groups') return;
    let cancelled = false;
    setLoadingGroups(true);
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'chats'), where('type', '==', 'group')));
        if (!cancelled) setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Chat));
      } catch (err) {
        console.error('loadGroups error:', err);
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoadingGroups(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, tab]);

  const permanentlyDeleteMessage = async (chatId: string, msgId: string) => {
    try {
      await deleteDoc(doc(db, 'chats', chatId, 'messages', msgId));
      setUserMessages(prev => prev.filter(m => !(m.chatId === chatId && m.msg.id === msgId)));
    } catch (err) {
      console.error('Permanent delete error:', err);
    }
  };

  const toggleBlockMessage = async (chatId: string, msgId: string, currentlyBlocked: boolean | undefined) => {
    try {
      const msgRef = doc(db, 'chats', chatId, 'messages', msgId);
      if (currentlyBlocked) {
        await updateDoc(msgRef, { blockedByAdmin: false, blockedByAdminAt: null });
        setUserMessages(prev => prev.map(m =>
          m.chatId === chatId && m.msg.id === msgId
            ? { ...m, msg: { ...m.msg, blockedByAdmin: false, blockedByAdminAt: null } as any }
            : m
        ));
        addToast(t('adm.blockRemoved'), 'success');
      } else {
        await updateDoc(msgRef, { blockedByAdmin: true, blockedByAdminAt: serverTimestamp() });
        setUserMessages(prev => prev.map(m =>
          m.chatId === chatId && m.msg.id === msgId
            ? { ...m, msg: { ...m.msg, blockedByAdmin: true, blockedByAdminAt: serverTimestamp() } as any }
            : m
        ));
        addToast(t('adm.blockAdded'), 'success');
      }
    } catch (err) {
      console.error('Toggle block error:', err);
      addToast(t('adm.blockFail'), 'error');
    }
  };

  const banUser = async (u: UserProfile) => {
    const now = new Date();
    let ms = 0;
    if (banDuration.unit === 'minutes') ms = banDuration.value * 60 * 1000;
    else if (banDuration.unit === 'hours') ms = banDuration.value * 3600 * 1000;
    else ms = banDuration.value * 86400 * 1000;

    const bannedUntil = Timestamp.fromMillis(now.getTime() + ms);
    try {
      await updateDoc(doc(db, 'users', u.uid), { bannedUntil });
      setUsers(prev => prev.map(u2 => u2.uid === u.uid ? { ...u2, bannedUntil } : u2));
    } catch (err) {
      console.error('Ban error:', err);
    }
  };

  const unbanUser = async (u: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', u.uid), { bannedUntil: null });
      setUsers(prev => prev.map(u2 => u2.uid === u.uid ? { ...u2, bannedUntil: undefined } : u2));
    } catch (err) {
      console.error('Unban error:', err);
    }
  };

  const deleteUserAndData = async (u: UserProfile) => {
    if (!window.confirm(t('adm.deleteUserConfirm', { name: u.displayName, uin: u.uin }))) return;

    try {
      const chatsQuery = query(collection(db, 'chats'), where('participants', 'array-contains', u.uid));
      const chatSnap = await getDocs(chatsQuery);

      for (const chatDoc of chatSnap.docs) {
        const msgSnap = await getDocs(collection(db, 'chats', chatDoc.id, 'messages'));
        const deletePromises = msgSnap.docs.map(d => deleteDoc(doc(db, 'chats', chatDoc.id, 'messages', d.id)));
        await Promise.all(deletePromises);
        await deleteDoc(doc(db, 'chats', chatDoc.id));
      }

      await deleteDoc(doc(db, 'users', u.uid));
      setUsers(prev => prev.filter(u2 => u2.uid !== u.uid));
      if (selectedUser?.uid === u.uid) setSelectedUser(null);
    } catch (err) {
      console.error('Delete user error:', err);
    }
  };

  const filteredUsers = users.filter(u =>
    u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    u.uin?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (step === 'email-check') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">{t('adm.title')}</h2>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
          </div>
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={32} className="text-red-500" />
          </div>
          <p className="text-xs text-slate-500 font-bold text-center mb-2 uppercase tracking-widest">{t('adm.unauthorized')}</p>
          <p className="text-sm text-slate-700 text-center font-bold mb-6">
            {t('adm.emailNotListed')} (<span className="text-blue-600">{user?.email || t('adm.none')}</span>) {t('adm.emailNotListedEnd')}
          </p>
          <p className="text-[11px] text-slate-400 text-center mb-6">
            {t('adm.needAuthorizedEmail')}
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-2xl transition-all text-sm"
          >
            {t('adm.close')}
          </button>
        </motion.div>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">{t('adm.title')}</h2>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full"><X size={20} /></button>
          </div>
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={32} className="text-blue-400" />
          </div>
          <p className="text-xs text-slate-500 font-bold text-center mb-6 uppercase tracking-widest">{t('adm.authorizedEntry')}</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
            placeholder={t('adm.passwordPlaceholder')}
            className="w-full bg-slate-100 border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-center outline-none focus:border-blue-500 transition-all mb-4"
            autoFocus
          />
          {passwordError && <p className="text-xs text-red-500 font-bold text-center mb-4">{passwordError}</p>}
          <button
            onClick={handlePasswordSubmit}
            disabled={verifying}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-700 text-white font-bold rounded-2xl transition-all text-sm"
          >
            {verifying ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
            ) : t('login.enter')}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-slate-950">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Shield size={22} className="text-blue-500" />
          <h1 className="text-lg font-black text-white tracking-tight">{t('adm.title')}</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setTab('users'); setSelectedUser(null); }}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all", tab === 'users' ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            {t('up.title')}
          </button>
          <button
            onClick={() => { setTab('groups'); setSelectedGroup(null); }}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all", tab === 'groups' ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            {t('side.groups')}
          </button>
          <button
            onClick={() => setTab('admin-msgs')}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all", tab === 'admin-msgs' ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            {t('adm.tabAdminMsgs')}
          </button>
          <button
            onClick={() => setTab('deleted')}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all", tab === 'deleted' ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            {t('adm.tabDeleted')}
          </button>
          <button
            onClick={() => setTab('delete-requests')}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all relative", tab === 'delete-requests' ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            {t('adm.tabDeleteRequests')}
            {deleteRequests.filter(r => r.status === 'pending').length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white rounded-full text-[8px] font-black flex items-center justify-center px-1">
                {deleteRequests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('encrypted')}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all", tab === 'encrypted' ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            {t('adm.tabEncrypted')}
            {encryptedMessages.length > 0 && (
              <span className="ml-1.5 text-[10px] text-purple-300">({encryptedMessages.length})</span>
            )}
          </button>
          <button
            onClick={() => setTab('emails')}
            className={cn("px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5", tab === 'emails' ? "bg-green-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}
          >
            <Mail size={14} /> {t('adm.tabEmails')}
          </button>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400"><X size={20} /></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {tab === 'users' && (
          <>
            {/* User List */}
            <div className="w-72 bg-slate-900/50 border-r border-slate-800 flex flex-col">
              <div className="p-4">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('adm.searchUser')} autoFocus
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 pl-9 pr-3 text-xs text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {filteredUsers.map(u => (
                  <div
                    key={u.uid}
                    onClick={() => loadUserMessages(u)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 cursor-pointer border-l-2 transition-all",
                      selectedUser?.uid === u.uid ? "bg-blue-600/10 border-l-blue-500" : "border-l-transparent hover:bg-slate-800"
                    )}
                  >
                    <img src={u.photoURL} className="w-9 h-9 rounded-lg object-cover bg-slate-700 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">{u.displayName}</p>
                      <p className="text-[10px] text-slate-400 font-bold truncate">#{u.uin}</p>
                    </div>
                    {u.bannedUntil && (
                      <Ban size={14} className="text-red-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* User Detail */}
            <div className="flex-1 flex flex-col bg-slate-900/30">
              {selectedUser ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* User info bar */}
                  <div className="px-6 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center gap-4 shrink-0">
                    <img src={selectedUser.photoURL} className="w-10 h-10 rounded-xl object-cover bg-slate-700" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">{selectedUser.displayName}</p>
                      <p className="text-[10px] text-blue-400 font-bold">#{selectedUser.uin} · {selectedUser.email}</p>
                    </div>

                    {/* Ban Controls */}
                    <div className="flex items-center gap-2">
                      {selectedUser.bannedUntil ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-red-400 font-bold">
                            {t('adm.bannedUntil')} {format(selectedUser.bannedUntil.toDate(), 'dd.MM HH:mm')}
                          </span>
                          <button onClick={() => unbanUser(selectedUser)} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all">
                            <UserCheck size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="number" value={banDuration.value}
                            onChange={(e) => setBanDuration({ ...banDuration, value: Number(e.target.value) })}
                            className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center outline-none"
                            min={1}
                          />
                          <select
                            value={banDuration.unit}
                            onChange={(e) => setBanDuration({ ...banDuration, unit: e.target.value as any })}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                          >
                            <option value="minutes">{t('adm.min')}</option>
                            <option value="hours">{t('adm.hour')}</option>
                            <option value="days">{t('adm.day')}</option>
                          </select>
                          <button onClick={() => banUser(selectedUser)} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all">
                            <Ban size={14} />
                          </button>
                        </div>
                      )}
                      <button onClick={() => deleteUserAndData(selectedUser)} className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all" title={t('adm.deleteUserTitle')}>
                        <UserX size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="shrink-0 px-4 py-2 bg-slate-900/70 border-b border-slate-800 flex items-center gap-1.5 flex-wrap">
                    {(['all', 'text', 'image', 'video', 'audio'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => { setMsgFilter(f); setSelectedKeys(new Set()); }}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                          msgFilter === f ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                        )}
                      >
                        {f === 'all' ? t('adm.filterAll') : f === 'text' ? t('adm.filterText') : f === 'image' ? t('adm.filterImg') : f === 'video' ? t('adm.filterVideo') : t('adm.filterAudio')}
                      </button>
                    ))}
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          const visible = userMessages.filter(({ msg }) => msgFilter === 'all' || (msg.type || 'text') === msgFilter);
                          const allSelected = visible.every(({ chatId, msg }) => msg.id && selectedKeys.has(msgKey(chatId, msg.id)));
                          if (allSelected) setSelectedKeys(new Set());
                          else setSelectedKeys(new Set(visible.map(({ chatId, msg }) => msg.id ? msgKey(chatId, msg.id) : '').filter(Boolean)));
                        }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-800 text-slate-300 hover:text-white transition-all"
                      >
                        {t('adm.selectAll')}
                      </button>
                      {selectedKeys.size > 0 && (
                        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
                          <span className="text-[10px] font-black text-blue-300">{t('adm.selectedN', { n: selectedKeys.size })}</span>
                          <button onClick={() => bulkDelete(selectedUserItems, userCleanup)} disabled={bulkBusy} className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-all flex items-center gap-1">
                            <Trash2 size={10} /> {t('adm.bulkDelete')}
                          </button>
                          <button onClick={() => bulkSetBlocked(selectedUserItems, true, userPatchBlocked)} disabled={bulkBusy} className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white transition-all flex items-center gap-1">
                            <EyeOff size={10} /> {t('adm.bulkPassive')}
                          </button>
                          <button onClick={() => bulkSetBlocked(selectedUserItems, false, userPatchBlocked)} disabled={bulkBusy} className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white transition-all flex items-center gap-1">
                            <Eye size={10} /> {t('adm.bulkUnpassive')}
                          </button>
                          <button onClick={() => bulkDownloadZip(selectedUserItems, `${selectedUser?.displayName || ''} (#${selectedUser?.uin || ''})`, selectedUser?.uin || 'user')} disabled={bulkBusy} className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white transition-all flex items-center gap-1">
                            <Download size={10} /> {bulkBusy ? '...' : 'ZIP'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                    {(() => {
                      const visibleMsgs = userMessages.filter(({ msg }) => msgFilter === 'all' || (msg.type || 'text') === msgFilter);
                      return visibleMsgs.length === 0 ? (
                        <p className="text-center text-slate-600 text-sm font-bold py-10">{t('adm.noMessagesFound')}</p>
                      ) : (
                        visibleMsgs.slice(0, 200).map(({ chatId, msg, chatName }) => {
                        const isDeleted = (msg.deletedBy?.length || 0) > 0;
                        const isBlocked = msg.blockedByAdmin === true;
                        const selKey = msg.id ? msgKey(chatId, msg.id) : '';
                        const isSel = selKey && selectedKeys.has(selKey);
                        const isMine = msg.senderId === selectedUser?.uid;
                        return (
                          <div key={`${chatId}-${msg.id}`} className={cn(
                            "bg-slate-800/50 rounded-2xl p-4 border transition-all",
                            isDeleted ? "border-red-900/50" : isBlocked ? "border-amber-600/50" : "border-slate-700/50",
                            isSel && "ring-2 ring-blue-500/60"
                          )}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <input
                                  type="checkbox"
                                  checked={!!isSel}
                                  onChange={() => selKey && toggleMsgSelect(selKey)}
                                  className="w-3.5 h-3.5 accent-blue-500 shrink-0 cursor-pointer"
                                />
                                <span className={cn("text-[10px] font-bold", isMine ? "text-blue-400" : "text-purple-400")}>
                                  {isMine ? t('adm.fromUser', { name: selectedUser?.displayName || '' }) : uidName(msg.senderId)}
                                </span>
                                <span className="text-[10px] text-slate-600">→</span>
                                <span className="text-[10px] text-slate-400 font-bold truncate max-w-[140px]">{chatName}</span>
                                {typeBadge(msg)}
                                {kindBadge(msg)}
                              </div>
                              <div className="flex items-center gap-2">
                                {msg.timestamp && (
                                  <span className="text-[10px] text-slate-500">{format(msg.timestamp.toDate(), 'dd.MM.yyyy HH:mm:ss')}</span>
                                )}
                                {/* Block/Unblock button */}
                                {!isDeleted && (
                                  <button
                                    onClick={() => toggleBlockMessage(chatId, msg.id!, isBlocked)}
                                    className={cn(
                                      "px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1",
                                      isBlocked
                                        ? "bg-green-600 hover:bg-green-700 text-white"
                                        : "bg-amber-600 hover:bg-amber-700 text-white"
                                    )}
                                    title={isBlocked ? t('adm.unblockBtn') : t('adm.blockBtn')}
                                  >
                                    {isBlocked ? <EyeOff size={10} /> : <Eye size={10} />}
                                    {isBlocked ? t('adm.unblock') : t('adm.block')}
                                  </button>
                                )}
                                {isDeleted && (
                                  <button
                                    onClick={() => permanentlyDeleteMessage(chatId, msg.id!)}
                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
                                  >
                                    <Trash2 size={10} /> {t('adm.deletePermanently')}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Blocked message warning */}
                            {isBlocked ? (
                              <div className="bg-amber-900/40 border border-amber-700/50 rounded-xl p-3 mb-2">
                                <p className="text-[11px] text-red-400 font-bold text-center">
                                  {t('adm.aiBlockedWarning')}
                                </p>
                              </div>
                            ) : null}

                            {/* Admin her zaman içeriği görebilir */}
                            {msg.type === 'text' && msg.text && (
                              <p className={cn("text-sm text-slate-300", isDeleted && "line-through text-red-400")}>
                                {isDeleted ? t('adm.deletedPrefix') : ''}{msg.text}
                              </p>
                            )}

                            {msg.type === 'image' && msg.imageUrl && (
                              <div className={cn("relative rounded-lg overflow-hidden", isDeleted && "grayscale blur-[2px] opacity-40")}>
                                <img
                                  src={msg.imageUrl}
                                  alt="Görsel"
                                  className="max-w-full h-auto object-cover rounded-lg cursor-pointer max-h-64"
                                  onClick={() => window.open(msg.imageUrl!, '_blank')}
                                />
                              </div>
                            )}

                            {msg.type === 'video' && msg.videoUrl && (
                              <div className={cn("relative rounded-lg overflow-hidden", isDeleted && "grayscale blur-[2px] opacity-40")}>
                                <video
                                  src={msg.videoUrl}
                                  className="max-w-full h-auto rounded-lg max-h-64"
                                  controls
                                  playsInline
                                />
                              </div>
                            )}

                            {msg.type === 'audio' && msg.audioUrl && (
                              <div className={cn(isDeleted && "grayscale opacity-40 pointer-events-none")}>
                                <audio src={msg.audioUrl} controls className="w-full h-10" />
                              </div>
                            )}

                            {!msg.type || (msg.type === 'text' && !msg.text) ? (
                              <p className={cn("text-sm text-slate-300", isDeleted && "line-through text-red-400")}>
                                {isDeleted ? t('adm.deletedPrefix') : ''}{t('adm.unknownMsgType')}
                              </p>
                            ) : null}
                          </div>
                        );
                        })
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Shield size={48} className="text-slate-700 mx-auto mb-4" />
                    <p className="text-slate-500 text-sm font-bold">{t('adm.selectUser')}</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'groups' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800 bg-slate-900/50 shrink-0">
              <Shield size={20} className="text-blue-400" />
              <h2 className="text-lg font-black text-white">{t('side.groups')}</h2>
              <span className="text-xs font-bold text-slate-500">({t('adm.groupCount', { n: groups.length })})</span>
            </div>
            {loadingGroups ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-slate-500 text-sm font-bold">{t('nc.loading')}...</p>
              </div>
            ) : groups.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-slate-500 text-sm font-bold">{t('adm.noGroupsYet')}</p>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                {/* Grup listesi */}
                <div className="w-72 border-r border-slate-800 overflow-y-auto custom-scrollbar bg-slate-900/30">
                  {groups.map(g => (
                    <button
                      key={g.id}
                      onClick={() => loadGroupMessages(g)}
                      className={cn(
                        "w-full text-left px-4 py-3 border-b border-slate-800/60 transition-colors",
                        selectedGroup?.id === g.id ? "bg-blue-600/20" : "hover:bg-slate-800/60"
                      )}
                    >
                      <p className="text-sm font-bold text-white truncate">{g.groupMetadata?.name || t('adm.anonymousGroup')}</p>
                      <p className="text-[11px] text-slate-400 truncate">{t('adm.adminLabel')} {uidName(g.groupMetadata?.adminId)}</p>
                    </button>
                  ))}
                </div>
                {/* Detay */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {!selectedGroup ? (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-slate-500 text-sm font-bold">{t('adm.selectGroup')}</p>
                    </div>
                  ) : (
                    <>
                      {/* Admin bilgisi */}
                      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/40 shrink-0">
                        <p className="text-base font-black text-white mb-2">{selectedGroup.groupMetadata?.name || t('adm.anonymousGroup')}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          <span className="text-slate-400">{t('adm.adminLabel')} <span className="text-blue-300 font-bold">{uidName(selectedGroup.groupMetadata?.adminId)}</span></span>
                          <span className="text-slate-400">{t('adm.founderLabel')} <span className="text-purple-300 font-bold">{uidName(selectedGroup.groupMetadata?.createdBy)}</span></span>
                          <span className="text-slate-400">{t('adm.memberLabel')} <span className="text-white font-bold">{selectedGroup.participants?.length ?? 0}</span></span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <button
                            onClick={() => renameGroup(selectedGroup)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-all flex items-center gap-1"
                          >
                            <Pencil size={10} /> {t('adm.renameGroupBtn')}
                          </button>
                          <button
                            onClick={() => toggleGroupPassive(selectedGroup)}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1",
                              selectedGroup.groupMetadata?.passive
                                ? "bg-green-600 hover:bg-green-700 text-white"
                                : "bg-amber-600 hover:bg-amber-700 text-white"
                            )}
                          >
                            {selectedGroup.groupMetadata?.passive ? <Eye size={10} /> : <EyeOff size={10} />}
                            {selectedGroup.groupMetadata?.passive ? t('adm.setActive') : t('adm.setPassive')}
                          </button>
                          <button
                            onClick={() => deleteGroup(selectedGroup)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white transition-all flex items-center gap-1"
                          >
                            <Trash2 size={10} /> {t('adm.deleteGroupBtn')}
                          </button>
                        </div>
                        {(() => {
                          const hist: string[] = [];
                          if (selectedGroup.groupMetadata?.createdBy) hist.push(selectedGroup.groupMetadata.createdBy);
                          (selectedGroup.groupMetadata?.adminHistory || []).forEach(id => { if (!hist.includes(id)) hist.push(id); });
                          const current = selectedGroup.groupMetadata?.adminId;
                          if (current && !hist.includes(current)) hist.push(current);
                          if (hist.length < 2) return null;
                          return (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 mr-1">{t('adm.adminHistory')}</span>
                              {hist.map((id, i) => (
                                <React.Fragment key={id + i}>
                                  {i > 0 && <span className="text-slate-600 text-xs">→</span>}
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-md text-[11px] font-bold",
                                    id === current ? "bg-blue-500/20 text-blue-300 border border-blue-500/40" : "bg-slate-800 text-slate-300 border border-slate-700"
                                  )}>
                                    {uidName(id)}{i === 0 ? ` ${t('adm.founderTag')}` : ''}
                                  </span>
                                </React.Fragment>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                      {/* Grup mesajları: filtre + seçim barı */}
                      <div className="shrink-0 px-4 py-2 bg-slate-900/70 border-b border-slate-800 flex items-center gap-1.5 flex-wrap">
                        {(['all', 'text', 'image', 'video', 'audio'] as const).map(f => (
                          <button
                            key={f}
                            onClick={() => { setMsgFilter(f); setGroupSelectedKeys(new Set()); }}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                              msgFilter === f ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                            )}
                          >
                            {f === 'all' ? t('adm.filterAll') : f === 'text' ? t('adm.filterText') : f === 'image' ? t('adm.filterImg') : f === 'video' ? t('adm.filterVideo') : t('adm.filterAudio')}
                          </button>
                        ))}
                        <div className="ml-auto flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              const visible = groupMessages.filter(m => msgFilter === 'all' || (m.type || 'text') === msgFilter);
                              const allSelected = visible.every(m => !!m.id && groupSelectedKeys.has(m.id));
                              if (allSelected) setGroupSelectedKeys(new Set());
                              else setGroupSelectedKeys(new Set(visible.map(m => m.id || '').filter(Boolean)));
                            }}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-800 text-slate-300 hover:text-white transition-all"
                          >
                            {t('adm.selectAll')}
                          </button>
                          {groupSelectedKeys.size > 0 && (
                            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
                              <span className="text-[10px] font-black text-blue-300">{t('adm.selectedN', { n: groupSelectedKeys.size })}</span>
                              <button onClick={() => bulkDelete(groupSelectedItems, groupCleanup)} disabled={bulkBusy} className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-all flex items-center gap-1">
                                <Trash2 size={10} /> {t('adm.bulkDelete')}
                              </button>
                              <button onClick={() => bulkSetBlocked(groupSelectedItems, true, groupPatchBlocked)} disabled={bulkBusy} className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white transition-all flex items-center gap-1">
                                <EyeOff size={10} /> {t('adm.bulkPassive')}
                              </button>
                              <button onClick={() => bulkSetBlocked(groupSelectedItems, false, groupPatchBlocked)} disabled={bulkBusy} className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white transition-all flex items-center gap-1">
                                <Eye size={10} /> {t('adm.bulkUnpassive')}
                              </button>
                              <button onClick={() => bulkDownloadZip(groupSelectedItems, selectedGroup?.groupMetadata?.name || '', selectedGroup?.id || 'group')} disabled={bulkBusy} className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white transition-all flex items-center gap-1">
                                <Download size={10} /> {bulkBusy ? '...' : 'ZIP'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                        {(() => {
                          const visibleMsgs = groupMessages.filter(m => msgFilter === 'all' || (m.type || 'text') === msgFilter);
                          return visibleMsgs.length === 0 ? (
                          <p className="text-slate-600 text-sm font-bold text-center py-10">{t('adm.noGroupMessages')}</p>
                        ) : visibleMsgs.slice(0, 200).map(msg => {
                          const isDeleted = (msg.deletedBy?.length || 0) > 0;
                          const isBlocked = msg.blockedByAdmin === true;
                          const isSel = !!msg.id && groupSelectedKeys.has(msg.id);
                          return (
                            <div key={msg.id} className={cn(
                              "rounded-xl p-3 border",
                              isDeleted ? "bg-red-950/30 border-red-900/50" : isBlocked ? "bg-amber-950/30 border-amber-800/50" : "bg-slate-800/50 border-slate-700/50",
                              isSel && "ring-2 ring-blue-500/60"
                            )}>
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <input
                                  type="checkbox"
                                  checked={isSel}
                                  onChange={() => msg.id && setGroupSelectedKeys(prev => {
                                    const next = new Set(prev);
                                    if (next.has(msg.id!)) next.delete(msg.id!); else next.add(msg.id!);
                                    return next;
                                  })}
                                  className="w-3.5 h-3.5 accent-blue-500 shrink-0 cursor-pointer"
                                />
                                <span className="text-xs font-bold text-blue-300">{uidName(msg.senderId)}</span>
                                <span className="text-[10px] text-slate-500">{msg.timestamp ? format(msg.timestamp.toDate(), 'dd.MM.yyyy HH:mm:ss') : ''}</span>
                                {typeBadge(msg)}
                                {kindBadge(msg)}
                              </div>
                              {isBlocked ? (
                                <p className="text-xs font-bold text-amber-300">{t('adm.blockedByAdmin')}</p>
                              ) : isDeleted ? (
                                <p className="text-xs text-red-400 italic">{t('adm.deletedMsgTag')}</p>
                              ) : msg.type === 'text' ? (
                                <p className="text-sm text-slate-200 break-words">{msg.text}</p>
                              ) : (
                                <p className="text-sm text-slate-400 italic">
                                  {msg.type === 'image' ? t('adm.mediaImage') : msg.type === 'video' ? t('adm.mediaVideo') : msg.type === 'audio' ? t('adm.mediaAudio') : msg.type === 'call' ? t('adm.mediaCall') : msg.type === 'file' ? t('adm.mediaFile') : t('adm.mediaOther')}
                                </p>
                              )}
                            </div>
                          );
                        })})()}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'admin-msgs' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <h2 className="text-lg font-black text-white mb-6">{t('adm.msgsToAdmin')}</h2>
            {adminMessages.length === 0 ? (
              <p className="text-slate-500 text-sm font-bold">{t('side.noMessagesYet')}</p>
            ) : (
              <div className="space-y-3">
                {adminMessages.map((m) => {
                  const sender = users.find(u => u.uid === m.userId);
                  return (
                    <div key={m.id} className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
                      <div className="flex items-center gap-2 mb-2">
                        <img src={sender?.photoURL || ''} className="w-6 h-6 rounded-lg object-cover bg-slate-700" />
                        <span className="text-xs font-bold text-blue-400">{sender?.displayName || m.userDisplayName} · #{sender?.uin || m.userUIN || '?'}</span>
                        <span className="text-[10px] text-slate-500 ml-auto">{m.timestamp?.toDate ? format(m.timestamp.toDate(), 'dd.MM HH:mm') : ''}</span>
                      </div>
                      <p className="text-sm text-slate-200">{m.message}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'deleted' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <h2 className="text-lg font-black text-white mb-6">{t('adm.tabDeleted')}</h2>
            <p className="text-[10px] text-slate-500 font-bold mb-4">{t('adm.deletedDesc')}</p>
            {deletedMessages.length === 0 ? (
              <p className="text-slate-500 text-sm font-bold">{t('adm.noDeletedYet')}</p>
            ) : (
              <>
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <button
                  onClick={() => {
                    const all = deletedMessages.every(m => m.id && m.chatId && selectedKeys.has(msgKey(m.chatId, m.id)));
                    if (all) setSelectedKeys(new Set());
                    else setSelectedKeys(new Set(deletedMessages.map(m => (m.id && m.chatId) ? msgKey(m.chatId, m.id) : '').filter(Boolean)));
                  }}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-800 text-slate-300 hover:text-white transition-all"
                >
                  {t('adm.selectAll')}
                </button>
                {selectedKeys.size > 0 && (
                  <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
                    <span className="text-[10px] font-black text-blue-300">{t('adm.selectedN', { n: selectedKeys.size })}</span>
                    <button onClick={() => bulkDelete(deletedItems, deletedCleanup)} disabled={bulkBusy} className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-all flex items-center gap-1">
                      <Trash2 size={10} /> {t('adm.bulkDelete')}
                    </button>
                    <button onClick={() => bulkDownloadZip(deletedItems, t('adm.tabDeleted'), 'silinmis')} disabled={bulkBusy} className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white transition-all flex items-center gap-1">
                      <Download size={10} /> {bulkBusy ? '...' : 'ZIP'}
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {deletedMessages.map((m) => {
                  const sender = users.find(u => u.uid === m.senderId);
                  const selKey = (m.id && m.chatId) ? msgKey(m.chatId, m.id) : '';
                  const isSel = !!selKey && selectedKeys.has(selKey);
                  return (
                    <div key={m.id} className={cn(
                      "bg-slate-800 rounded-2xl p-4 border",
                      isSel ? "border-blue-500/60 ring-2 ring-blue-500/40" : "border-slate-700"
                    )}>
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => selKey && setSelectedKeys(prev => {
                            const next = new Set(prev);
                            if (next.has(selKey)) next.delete(selKey); else next.add(selKey);
                            return next;
                          })}
                          className="w-3.5 h-3.5 accent-blue-500 shrink-0 cursor-pointer"
                        />
                        <img src={sender?.photoURL || ''} className="w-6 h-6 rounded-lg object-cover bg-slate-700" />
                        <span className="text-xs font-bold text-blue-400">{sender?.displayName || m.senderId?.slice(0, 8)}</span>
                        <span className="text-[10px] text-slate-500">→</span>
                        <span className="text-xs font-bold text-slate-300">{m.chatId?.slice(0, 12)}...</span>
                        <span className="text-[10px] text-slate-500 ml-auto">{m.timestamp?.toDate ? format(m.timestamp.toDate(), 'dd.MM.yyyy HH:mm:ss') : ''}</span>
                      </div>
                      <div className="mb-3">
                        {m.type === 'text' && <p className="text-sm text-slate-200">{m.text}</p>}
                        {m.type === 'image' && <p className="text-sm text-blue-400">{t('adm.imageMsg')}</p>}
                        {m.type === 'video' && <p className="text-sm text-blue-400">{t('adm.videoMsg')}</p>}
                        {m.type === 'audio' && <p className="text-sm text-blue-400">{t('adm.audioMsg')}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (m.type === 'image' && m.imageUrl) {
                              const a = document.createElement('a');
                              a.href = m.imageUrl;
                              a.download = `image-${m.id}.jpg`;
                              a.click();
                            } else if (m.type === 'video' && m.videoUrl) {
                              const a = document.createElement('a');
                              a.href = m.videoUrl;
                              a.download = `video-${m.id}.webm`;
                              a.click();
                            } else if (m.type === 'audio' && m.audioUrl) {
                              const a = document.createElement('a');
                              a.href = m.audioUrl;
                              a.download = `audio-${m.id}.webm`;
                              a.click();
                            } else if (m.text) {
                              navigator.clipboard.writeText(m.text).catch(() => {});
                              addToast(t('adm.copied'), 'success');
                            }
                          }}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[10px] font-bold"
                        >
                          {t('adm.saveToPC')}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(m.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold"
                        >
                          {t('adm.confirmDelete')}
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await updateDoc(doc(db, 'chats', m.chatId, 'messages', m.id), { deletedBy: [] });
                              setDeletedMessages(prev => prev.filter(x => !(x.id === m.id && x.chatId === m.chatId)));
                              if (selKey) setSelectedKeys(prev => { const n = new Set(prev); n.delete(selKey); return n; });
                              addToast(t('adm.restored'), 'success');
                            } catch (e) {
                              console.error("Restore error:", e);
                            }
                          }}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[10px] font-bold"
                        >
                          {t('adm.restore')} 🔄
                        </button>
                      </div>
                      {confirmDeleteId === m.id && (
                        <div className="mt-3 p-3 bg-red-900/30 rounded-xl border border-red-800">
                          <p className="text-xs text-red-300 font-bold mb-2">{t('adm.deleteMsgConfirm')}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  await deleteDoc(doc(db, 'chats', m.chatId, 'messages', m.id));
                                  setConfirmDeleteId(null);
                                } catch (e) {
                                  console.error("Permanent delete error:", e);
                                }
                              }}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold"
                            >
                              {t('adm.yesDelete')}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[10px] font-bold"
                            >
                              {t('login.cancel')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>
        )}

        {tab === 'delete-requests' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <h2 className="text-lg font-black text-white mb-2">{t('adm.tabDeleteRequests')}</h2>
            <p className="text-[10px] text-slate-500 font-bold mb-6">{t('adm.deleteReqDesc')}</p>
            {deleteRequests.filter(r => r.status === 'pending').length === 0 ? (
              <p className="text-slate-500 text-sm font-bold">{t('adm.noPendingRequests')}</p>
            ) : (
              <div className="space-y-4">
                {deleteRequests.filter(r => r.status === 'pending').map((req) => {
                  const isGroupDelete = req.type === 'group-auto-delete';
                  const reqUser = users.find(u => u.uid === req.requestedBy);
                  
                  if (isGroupDelete) {
                    const msgCount = req.messages?.length || 0;
                    const chatInfo = req.chatData || {};
                    const participants = chatInfo.participants || [];
                    return (
                      <div key={req.id} className="bg-slate-800 rounded-2xl p-4 border border-red-700/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Trash2 size={14} className="text-red-500" />
                          <span className="text-xs font-bold text-red-400">{t('adm.groupAutoDeleted')}</span>
                          <span className="text-[10px] text-slate-500 ml-auto">{req.timestamp?.toDate ? format(req.timestamp.toDate(), 'dd.MM HH:mm') : ''}</span>
                        </div>
                        <div className="mb-3 space-y-1">
                          <p className="text-sm font-bold text-slate-200">{chatInfo.groupMetadata?.name || t('nc.anonymousGroup')}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{t('adm.reqStats', { msgs: msgCount, users: participants.length })}</p>
                          <p className="text-[10px] text-slate-500">{t('adm.groupId')} {req.chatId?.slice(0, 20)}...</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-xl p-3 mb-3 max-h-32 overflow-y-auto">
                          <p className="text-[9px] text-slate-500 font-bold mb-2">{t('adm.backedUp', { count: msgCount })}</p>
                          {req.messages?.slice(0, 10).map((msg: any, i: number) => (
                            <p key={i} className="text-[10px] text-slate-400 truncate border-b border-slate-700/50 py-1 last:border-0">
                              <span className="text-slate-500">{msg.senderId?.slice(0,6)}:</span> {msg.text || (msg.type === 'image' ? '📷' : msg.type === 'video' ? '🎥' : msg.type === 'audio' ? '🎤' : '📄')}
                            </p>
                          ))}
                          {msgCount > 10 && <p className="text-[10px] text-slate-600 pt-1">{t('adm.moreMsgs', { n: msgCount - 10 })}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'adminDeleteRequests', req.id), { status: 'approved' });
                                // Group data is already deleted, just mark as approved
                              } catch (e) { console.error(e); }
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold">
                            {t('adm.confirmDelete')} ✅
                          </button>
                          <button onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'adminDeleteRequests', req.id), { status: 'rejected' });
                              } catch (e) { console.error(e); }
                            }}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold">
                            {t('adm.rejectKeepData')}
                          </button>
                        </div>
                      </div>
                    );
                  }
                  
                  if (req.type === 'clear-history') {
                    return (
                      <div key={req.id} className="bg-slate-800 rounded-2xl p-4 border border-amber-700/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock size={14} className="text-amber-500" />
                          <span className="text-xs font-bold text-amber-400">{t('adm.clearReq')}</span>
                          <span className="text-[10px] text-slate-500 ml-auto">{req.timestamp?.toDate ? format(req.timestamp.toDate(), 'dd.MM HH:mm') : ''}</span>
                        </div>
                        <div className="mb-3 space-y-1">
                          <p className="text-sm font-bold text-slate-200">{req.chatName || t('adm.chatLabel')}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{reqUser?.displayName || req.requestedBy?.slice(0, 8)}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={async () => {
                              try {
                                const chatRef = doc(db, 'chats', req.chatId);
                                const chatSnap = await getDoc(chatRef);
                                const hiddenAt = chatSnap.data()?.historyHiddenAt;
                                const msgsSnap = await getDocs(collection(db, 'chats', req.chatId, 'messages'));
                                const toDelete = msgsSnap.docs.filter(d => {
                                  const ts = d.data()?.timestamp;
                                  if (!hiddenAt || !ts?.toDate) return !hiddenAt;
                                  return ts.toDate() <= hiddenAt.toDate();
                                });
                                await Promise.all(toDelete.map(d => deleteDoc(d.ref)));
                                await updateDoc(chatRef, { historyHidden: false });
                                await updateDoc(doc(db, 'adminDeleteRequests', req.id), { status: 'approved' });
                              } catch (e) { console.error(e); }
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold">
                            {t('adm.deletePermanently')} ✅
                          </button>
                          <button onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'chats', req.chatId), { historyHidden: false });
                                await updateDoc(doc(db, 'adminDeleteRequests', req.id), { status: 'rejected' });
                              } catch (e) { console.error(e); }
                            }}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[10px] font-bold">
                            {t('adm.restore')} 🔄
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (req.type === 'group-leave') {
                    return (
                      <div key={req.id} className="bg-slate-800 rounded-2xl p-4 border border-amber-700/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Shield size={14} className="text-amber-500" />
                          <span className="text-xs font-bold text-amber-400">{t('adm.leaveReq')}</span>
                          <span className="text-[10px] text-slate-500 ml-auto">{req.timestamp?.toDate ? format(req.timestamp.toDate(), 'dd.MM HH:mm') : ''}</span>
                        </div>
                        <div className="mb-3 space-y-1">
                          <p className="text-sm font-bold text-slate-200">{req.chatName || t('adm.chatLabel')}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{reqUser?.displayName || req.requestedBy?.slice(0, 8)}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={async () => {
                              try {
                                const chatRef = doc(db, 'chats', req.chatId);
                                const chatSnap = await getDoc(chatRef);
                                const data = chatSnap.data() || {};
                                const remaining = (data.participants || []).filter((p: string) => p !== req.requestedBy);
                                const updates: any = { participants: remaining };
                                if (data.groupMetadata?.adminId === req.requestedBy && remaining.length > 0) {
                                  updates['groupMetadata.adminId'] = remaining[0];
                                  const hist = data.groupMetadata?.adminHistory || [];
                                  if (!hist.includes(remaining[0])) updates['groupMetadata.adminHistory'] = [...hist, remaining[0]];
                                }
                                await updateDoc(chatRef, updates);
                                await updateDoc(doc(db, 'adminDeleteRequests', req.id), { status: 'approved' });
                              } catch (e) { console.error(e); }
                            }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold">
                            {t('adm.confirmDelete')} ✅
                          </button>
                          <button onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'adminDeleteRequests', req.id), { status: 'rejected' });
                              } catch (e) { console.error(e); }
                            }}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold">
                            {t('adm.rejectKeepData')}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // Regular message delete requests
                  const reqUserDisplay = users.find(u => u.uid === req.requestedBy);
                  return (
                    <div key={req.id} className="bg-slate-800 rounded-2xl p-4 border border-amber-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Trash2 size={14} className="text-amber-500" />
                        <span className="text-xs font-bold text-amber-400">{reqUserDisplay?.displayName || req.requestedBy?.slice(0, 8)}</span>
                        <span className="text-[10px] text-slate-500">{t('adm.deletedBy')}</span>
                        <span className="text-[10px] text-slate-500 ml-auto">{req.timestamp?.toDate ? format(req.timestamp.toDate(), 'dd.MM HH:mm') : ''}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] text-slate-400 font-bold">{t('adm.chatLabel')} {req.chatId?.slice(0, 12)}...</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={async () => {
                            try {
                              await deleteDoc(doc(db, 'chats', req.chatId, 'messages', req.msgId));
                              await updateDoc(doc(db, 'adminDeleteRequests', req.id), { status: 'approved' });
                            } catch (e) { console.error(e); }
                          }}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold">
                          {t('adm.deletePermanently')} ✅
                        </button>
                        <button onClick={async () => {
                            try {
                              await updateDoc(doc(db, 'chats', req.chatId, 'messages', req.msgId), { deletedBy: [] });
                              await updateDoc(doc(db, 'adminDeleteRequests', req.id), { status: 'rejected' });
                            } catch (e) { console.error(e); }
                          }}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[10px] font-bold">
                          {t('adm.restore')} 🔄
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Show approved/rejected history */}
            {deleteRequests.filter(r => r.status !== 'pending').length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-black text-slate-400 mb-4 uppercase tracking-wider">{t('adm.history')}</h3>
                <div className="space-y-2">
                  {deleteRequests.filter(r => r.status !== 'pending').slice(0, 10).map((req) => (
                    <div key={req.id} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700 flex items-center gap-3">
                      <div className={cn("w-2 h-2 rounded-full", req.status === 'approved' ? "bg-red-500" : "bg-green-500")} />
                      <span className="text-[10px] text-slate-400 font-bold flex-1">
                        {req.type === 'group-auto-delete' ? t('adm.groupDelete') : req.type === 'clear-history' ? t('adm.clearReq') : req.type === 'group-leave' ? t('adm.leaveReq') : t('adm.msgDelete')} - {req.status === 'approved' ? t('adm.approved') : t('adm.rejected')}
                      </span>
                      <span className="text-[9px] text-slate-600">{req.timestamp?.toDate ? format(req.timestamp.toDate(), 'dd.MM') : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'encrypted' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <h2 className="text-lg font-black text-white mb-2">{t('adm.encAuditTitle')}</h2>
            <p className="text-[10px] text-slate-500 font-bold mb-6">{t('adm.encAuditDesc')}</p>
            {encryptedMessages.length === 0 ? (
              <p className="text-slate-500 text-sm font-bold">{t('adm.noEncryptedYet')}</p>
            ) : (
              <div className="space-y-3">
                {encryptedMessages.map((m) => {
                  const sender = users.find(u => u.uid === m.senderId);
                  return (
                    <div key={m.id} className="bg-slate-800 rounded-2xl p-4 border border-purple-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">🔒</span>
                        <img src={sender?.photoURL || ''} className="w-6 h-6 rounded-lg object-cover bg-slate-700" />
                        <span className="text-xs font-bold text-purple-400">{sender?.displayName || m.senderId?.slice(0, 8)}</span>
                        <span className="text-[10px] text-slate-500 ml-auto">
                          {m.timestamp?.toDate ? format(m.timestamp.toDate(), 'dd.MM.yyyy HH:mm:ss') : ''}
                        </span>
                      </div>
                      <div className="mb-2">
                        {m.type === 'text' && <p className="text-sm text-slate-200 break-words">{m.text}</p>}
                        {m.type === 'image' && (m.imageUrl
                          ? <img src={m.imageUrl} alt="" className="max-h-48 rounded-lg object-contain bg-slate-900" />
                          : <p className="text-sm text-blue-400">{t('adm.encImage')}</p>)}
                        {m.type === 'video' && (m.videoUrl
                          ? <video src={m.videoUrl} controls className="max-h-48 rounded-lg bg-slate-900" />
                          : <p className="text-sm text-blue-400">{t('adm.encVideo')}</p>)}
                        {m.type === 'audio' && (m.audioUrl
                          ? <audio src={m.audioUrl} controls className="w-full" />
                          : <p className="text-sm text-blue-400">{t('adm.encAudio')}</p>)}
                        {!['text', 'image', 'video', 'audio'].includes(m.type) && (
                          <p className="text-sm text-slate-400 italic">{m.type}</p>
                        )}
                      </div>
                      <div className="bg-slate-900/50 rounded-xl p-3 border border-slate-700">
                        <p className="text-[9px] text-slate-500 font-bold text-center">
                          {t('adm.encOnlyOwner')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'emails' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <h2 className="text-lg font-black text-white mb-2 flex items-center gap-2">
              <Mail size={20} className="text-green-400" /> {t('adm.authorizedEmails')}
            </h2>
            <p className="text-[10px] text-slate-500 font-bold mb-6">{t('adm.emailsDesc')}</p>

            {/* Add new email */}
            <div className="flex items-center gap-2 mb-6">
              <input
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAdminEmail()}
                placeholder={t('adm.newEmailPlaceholder')}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-green-500/30 transition-all"
              />
              <button
                onClick={addAdminEmail}
                className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Plus size={14} /> {t('adm.add')}
              </button>
            </div>

            {/* Email list */}
            {adminEmails.length === 0 ? (
              <p className="text-slate-500 text-sm font-bold">{t('adm.noAuthorizedEmails')}</p>
            ) : (
              <div className="space-y-2">
                {adminEmails.map((email) => (
                  <div key={email} className="bg-slate-800 rounded-xl p-3 flex items-center gap-3 border border-slate-700">
                    <Mail size={16} className="text-slate-500 shrink-0" />
                    <span className="text-sm text-white font-bold flex-1">{email}</span>
                    <button
                      onClick={() => removeAdminEmail(email)}
                      className="p-1.5 hover:bg-red-600/20 rounded-lg text-slate-400 hover:text-red-400 transition-all"
                      title={t('adm.remove')}
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
