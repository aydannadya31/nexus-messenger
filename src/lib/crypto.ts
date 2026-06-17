const PBKDF2_SALT = new TextEncoder().encode('AFCB.Messenger.v1');
const PBKDF2_ITERATIONS = 100000;

async function deriveKey(password: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: PBKDF2_SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(plaintext: string, password: string): Promise<string> {
  const key = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  // Format: base64(iv):base64(ciphertext)
  return `${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ciphertext)))}`;
}

export async function decryptMessage(payload: string, password: string): Promise<string> {
  const parts = payload.split(':');
  if (parts.length !== 2) throw new Error('Geçersiz şifreli mesaj formatı');
  const iv = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  const key = await deriveKey(password);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
