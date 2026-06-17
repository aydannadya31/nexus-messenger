type MediaType = 'image' | 'video' | 'audio';

/**
 * Upload media to storage. On Spark plan, Storage is not available,
 * so we store base64 directly in Firestore (legacy-compatible).
 */
export async function uploadMedia(
  base64Data: string,
  _chatId: string,
  _msgId: string,
  _type: MediaType
): Promise<string> {
  return base64Data;
}

/**
 * Upload profile photo. Returns the base64 directly (no Firebase Storage).
 */
export async function uploadProfilePhoto(
  base64Data: string,
  _userId: string
): Promise<string> {
  return base64Data;
}

/**
 * Delete media from storage. No-op on Spark plan (base64 only).
 */
export async function deleteMedia(_storageUrl: string): Promise<void> {
  // base64 only — nothing to delete
}
