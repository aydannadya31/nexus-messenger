import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

describe('firestore rules', () => {
  it('rejects chats without the creator as a participant', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(db, 'chats', 'standalone'), {
        participants: ['bob'],
        type: 'private',
        updatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(
      setDoc(doc(db, 'chats', 'ok'), {
        participants: ['alice', 'bob'],
        type: 'private',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('rejects messages whose sender is not the signed-in user', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'chats', 'room'), {
        participants: ['alice', 'bob'],
        type: 'private',
        updatedAt: serverTimestamp(),
      });
    });
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'chats', 'room', 'messages', 'm1'), {
        senderId: 'alice',
        type: 'text',
        timestamp: serverTimestamp(),
      })
    );
    await assertFails(
      setDoc(doc(db, 'chats', 'room', 'messages', 'm2'), {
        senderId: 'bob',
        type: 'text',
        timestamp: serverTimestamp(),
      })
    );
  });

  it('rejects calls whose caller is not the signed-in user', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'calls', 'c1'), {
        participants: ['alice', 'bob'],
        chatId: 'room',
        callerId: 'alice',
        type: 'private',
        status: 'calling',
        createdAt: serverTimestamp(),
      })
    );
    await assertFails(
      setDoc(doc(db, 'calls', 'c2'), {
        participants: ['alice', 'bob'],
        chatId: 'room',
        callerId: 'bob',
        type: 'private',
        status: 'calling',
        createdAt: serverTimestamp(),
      })
    );
  });

  it('rejects signals that spoof their sender', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'calls', 'c1'), {
        participants: ['alice', 'bob'],
        chatId: 'room',
        callerId: 'alice',
        type: 'private',
        status: 'calling',
        createdAt: serverTimestamp(),
      });
    });
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'calls', 'c1', 'signals', 's1'), {
        from: 'alice',
        to: 'bob',
        type: 'offer',
        data: '{}',
        createdAt: serverTimestamp(),
      })
    );
    await assertFails(
      setDoc(doc(db, 'calls', 'c1', 'signals', 's2'), {
        from: 'bob',
        to: 'alice',
        type: 'offer',
        data: '{}',
        createdAt: serverTimestamp(),
      })
    );
  });

  it('hides admin config from regular users', async () => {
    const regular = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(regular, 'config', 'admin')));
    await assertSucceeds(getDoc(doc(regular, 'config', 'notifications')));
  });
});
