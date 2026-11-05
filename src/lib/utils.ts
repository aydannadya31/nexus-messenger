import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const OFFLINE_STALE_MS = 30000;

export function getDisplayStatus(
  p: { onlineStatus?: string; statusUpdatedAt?: any } | null | undefined
): 'online' | 'away' | 'busy' | 'offline' {
  const status = (p?.onlineStatus || 'online') as 'online' | 'away' | 'busy' | 'offline';
  const updatedAt = p?.statusUpdatedAt;
  if (!updatedAt) return status;
  const ms =
    typeof updatedAt === 'object' && updatedAt !== null && typeof (updatedAt as any).toMillis === 'function'
      ? (updatedAt as any).toMillis()
      : Number(updatedAt);
  if (ms && Date.now() - ms > OFFLINE_STALE_MS) return 'offline';
  return status;
}
